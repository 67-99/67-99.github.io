// ===========================
// 工具函数
// ===========================
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
// WGS84 转 GCJ-02 (火星坐标系)
function wgs84ToGcj02(wgsLat, wgsLon) {
    const a = 6378245.0;
    const ee = 0.00669342162296594323;
    const pi = 3.14159265358979324;
    function transformLat(x, y) {
        let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(y * pi) + 40.0 * Math.sin(y / 3.0 * pi)) * 2.0 / 3.0;
        ret += (160.0 * Math.sin(y / 12.0 * pi) + 320.0 * Math.sin(y * pi / 30.0)) * 2.0 / 3.0;
        return ret;
    }
    function transformLon(x, y) {
        let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(x * pi) + 40.0 * Math.sin(x / 3.0 * pi)) * 2.0 / 3.0;
        ret += (150.0 * Math.sin(x / 12.0 * pi) + 300.0 * Math.sin(x / 30.0 * pi)) * 2.0 / 3.0;
        return ret;
    }
    if(wgsLon < 72.004 || wgsLon > 137.8347 || wgsLat < 0.8293 || wgsLat > 55.8271)
        return { lat: wgsLat, lng: wgsLon };  // 判断是否在中国境外，境外不转换
    let dLat = transformLat(wgsLon - 105.0, wgsLat - 35.0);
    let dLon = transformLon(wgsLon - 105.0, wgsLat - 35.0);
    const radLat = wgsLat / 180.0 * pi;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * pi);
    dLon = (dLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * pi);
    const gcjLat = wgsLat + dLat;
    const gcjLon = wgsLon + dLon;
    return { lat: gcjLat, lng: gcjLon };
}

// ===========================
// 全局状态
// ===========================
let map;
let lineLayer;
let currentTileLayer = null; // 当前底图图层
let isSatellite = true; // 当前是否为卫星图

const lineData = {}; // { id: { name, bounds, group, layers, color } }
let locationMarker = null;
let locationCircle = null;
let watchId = null;
let firstTrack = true;

// ---- Debug 相关 ----
let debugLayer = null;          // 使用 canvas 渲染的图层组
let debugVisible = false;
let canvasRenderer = null;      // 共享 canvas 渲染器
let debugScaleControl = null; // 用于 debug 信息控件

// ===========================
// 地图初始化
// ===========================
function createTileLayer(satellite) {
    const style = satellite ? 6 : 7;
    return L.tileLayer(`https://wprd01.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&style=${style}&ltype=2`);
}

function initMap() {
    map = L.map('map').setView([39.9, 116.4], 10);

    currentTileLayer = createTileLayer(true);
    currentTileLayer.addTo(map);

    map.attributionControl.setPrefix('');
    map.attributionControl.addAttribution('&copy; <a href="https://www.amap.com/">高德地图</a>');

    lineLayer = L.layerGroup().addTo(map);

    // 创建 canvas 渲染器（用于 debug 节点，提升性能）
    canvasRenderer = L.canvas({ padding: 0.5 });
    debugLayer = L.layerGroup().addTo(map); // 先添加到地图，但默认隐藏（通过控制 visible）
    map.removeLayer(debugLayer);  // 默认不显示 debug
    map.on('moveend', function() {
        if(debugVisible)
            updateDebugNodes();
    });
    // ===========================
    // 自定义比例尺控件
    // ===========================
    L.Control.LonLatScale = L.Control.Scale.extend({
        options: {
            position: 'bottomright',
            maxWidth: 150,
            metric: true,
            imperial: false
        },
        onAdd: function(map) {
            var container = L.DomUtil.create('div', 'leaflet-control-lonlat-scale');
            this._container = container;
            this._map = map;
            this._update();
            map.on('moveend zoomend', this._update, this);
            return container;
        },
        _update: function() {
            var map = this._map;
            if (!map)
                return;
            var center = map.getCenter();
            var lat = center.lat;
            var cosLat = Math.cos(lat * Math.PI / 180);
            // 获取当前视口经度跨度
            var bounds = map.getBounds();
            var sw = bounds.getSouthWest();
            var ne = bounds.getNorthEast();
            var pixelWidth = map.getSize().x;
            var lngDelta = ne.lng - sw.lng;
            if (lngDelta <= 0) return;
            var lngPerPixel = lngDelta / pixelWidth;
            // 预定义间隔（1e-n, 2e-n, 5e-n）
            var scales = [
                0.00001, 0.00002, 0.00005,
                0.0001,  0.0002,  0.0005,
                0.001,   0.002,   0.005,
                0.01,    0.02,    0.05,
                0.1,     0.2,     0.5,
                1,       2,       5,
                10,      20,      50,
                100,     200,     500
            ];
            // 选择一个间隔，使其像素宽度在 minPx~maxPx 之间，最接近 targetPx
            var targetPx = 50;
            var minPx = 30;
            var maxPx = 100;
            var chosen = scales[0];
            for (var i = 0; i < scales.length; i++) {
                var px = scales[i] / lngPerPixel;
                if (px >= minPx && px <= maxPx) {
                    chosen = scales[i];
                    break;
                }
                if (px > maxPx) {
                    // 如果当前已经超过 maxPx，则取前一个（如果前一个存在且更接近）
                    if (i > 0) {
                        var prevPx = scales[i-1] / lngPerPixel;
                        if(Math.abs(prevPx - targetPx) <= Math.abs(px - targetPx))
                            chosen = scales[i-1];
                        else
                            chosen = scales[i];
                    }
                    else {
                        chosen = scales[i];
                    }
                    break;
                }
                // 如果是最后一个，使用最后一个
                if (i === scales.length - 1) {
                    chosen = scales[i];
                }
            }
            // 计算该间隔对应的像素宽度与 实际距离（经度方向）
            var pxWidth = chosen / lngPerPixel;
            var lngDist = 111320 * cosLat * chosen; // 米
            // 构建 DOM
            var container = this._container;
            if (!container) return;
            container.innerHTML = '';
            var wrapper = L.DomUtil.create('div', 'leaflet-control-scale-wrapper', container);
            var inner = L.DomUtil.create('div', 'leaflet-control-scale-line', wrapper);
            var left = L.DomUtil.create('div', 'leaflet-control-scale-left', inner);
            var right = L.DomUtil.create('div', 'leaflet-control-scale-right', inner);
            var label = L.DomUtil.create('div', 'leaflet-control-scale-label', wrapper);
            inner.style.width = pxWidth + 'px';
            label.style.width = pxWidth + 'px';
            var degreeStr = chosen.toFixed(6).replace(/\.?0+$/, '') + '°';
            var distStr = lngDist >= 1000 ? (lngDist/1000).toFixed(1) + ' km' : lngDist.toFixed(1) + ' m';
            label.innerHTML = degreeStr;
        }
    });
    // 添加Debug比例尺
    var lonlatScale = new L.Control.LonLatScale({ position: 'bottomright', maxWidth: 150 });
    lonlatScale.addTo(map);
    lonlatScale._container.style.display = 'none';
    window._lonlatScale = lonlatScale;
}

// ===========================
// 地图类型切换
// ===========================
function toggleMapType() {
    isSatellite = !isSatellite;
    if(currentTileLayer)
        map.removeLayer(currentTileLayer);
    currentTileLayer = createTileLayer(isSatellite);
    currentTileLayer.addTo(map);
    // 更新按钮样式
    const btn = document.getElementById('map-type-btn');
    const icon = btn.querySelector('i');
    const span = btn.querySelector('span');
    if (isSatellite) {
        icon.className = 'fas fa-satellite';
        span.textContent = '卫星';
        btn.classList.add('active-type');
    } else {
        icon.className = 'fas fa-map';
        span.textContent = '路网';
        btn.classList.remove('active-type');
    }
    // 控制经纬度比例尺背景显示
    const mapContainer = map.getContainer();
    if(isSatellite)
        mapContainer.classList.remove('road-mode');
    else
        mapContainer.classList.add('road-mode');
    console.log(isSatellite, mapContainer.classList);
    window._lonlatScale._update(); // 更新数值
}

// ===========================
// Debug 功能
// ===========================
// 缓存所有节点数据（用于视口裁剪）
let debugNodesData = [];

function buildDebugNodes() {
    debugNodesData = [];  // 清空缓存
    debugLayer.clearLayers();
    const lineIds = Object.keys(lineData);
    if(lineIds.length === 0)
        return;

    for(const [id, info] of Object.entries(lineData)) {
        const color = info.color || '#808080';
        const segments = info.segments;
        segments.forEach(([priority, pts], segIdx) => {
            if (!pts || pts.length < 2)
                return; // 跳过无效段
            // 遍历该段内的每个点
            pts.forEach((latlng, pointIdx) => {
                debugNodesData.push({
                    latlng: latlng,
                    lineId: id,
                    segmentIdx: segIdx,    // 段索引
                    pointIdx: pointIdx,    // 点索引
                    color: color
                });
            });
        });
    }
    // 首次构建时，根据当前视口添加可见节点
    updateDebugNodes();
}

function updateDebugNodes() {
    if (!debugVisible || !map) return;
    // 清空已有节点（不破坏缓存数据）
    debugLayer.clearLayers();
    const bounds = map.getBounds();
    const MAX_VISIBLE = Math.min(Math.max(400 - 20 * map.getZoom(), 50), 200); // 上限
    let visibleNodes = [];
    for(const node of debugNodesData)
        if(bounds.contains(node.latlng))
            visibleNodes.push(node);
    // 如果超过上限，均匀采样
    let displayNodes = visibleNodes;
    if(visibleNodes.length > MAX_VISIBLE){
        const step = Math.ceil(visibleNodes.length / MAX_VISIBLE);
        const sampled = [];
        for(let i = 0; i < visibleNodes.length; i += step)
            sampled.push(visibleNodes[i]);
        displayNodes = sampled;
    }

    for (const node of displayNodes) {
        if (bounds.contains(node.latlng)) {
            const circle = L.circleMarker(node.latlng, {
                radius: 5,
                color: node.color,
                weight: 2,
                fillColor: '#ffffff',
                fillOpacity: 0.95,
                renderer: canvasRenderer
            });
            const label = `${node.lineId}-${node.segmentIdx}-${node.pointIdx}`;
            const tooltip = L.tooltip({
                permanent: true,
                direction: 'center',
                className: 'debug-tooltip',
                offset: map.getZoom() > 12? [1.6 * map.getZoom(), -map.getZoom()]: [0, 0]
            }).setContent(label);
            circle.bindTooltip(tooltip);
            debugLayer.addLayer(circle);
        }
    }
}

function toggleDebug() {
    debugVisible = !debugVisible;
    const btn = document.getElementById('debug-btn');
    if (debugVisible) {
        if(debugNodesData.length === 0)
            buildDebugNodes();  // 首次构建缓存
        else
            updateDebugNodes();  // 已有缓存，直接刷新
        if(!map.hasLayer(debugLayer))
            debugLayer.addTo(map);
        if (window._lonlatScale) {
            window._lonlatScale._container.style.display = 'block';
            window._lonlatScale._update(); // 立即更新数值
        }
        btn.classList.add('debug-active');
    } else {  // 隐藏
        if(map.hasLayer(debugLayer))
            map.removeLayer(debugLayer);
        if (window._lonlatScale)
            window._lonlatScale._container.style.display = 'none';
        btn.classList.remove('debug-active');
    }
}

// 当线路数据更新时，如果 debug 已开启，刷新节点
function refreshDebugIfNeeded(){
    if(debugVisible)
        buildDebugNodes();  // 重建缓存，内部会调用 updateDebugNodes
}

// ===========================
// 线路加载
// ===========================
function loadLineFile(id) {
    const url = `./resource/lines/${id}.json`;
    return fetch(url)
        .then(res => {
            if (!res.ok) throw new Error(`加载 ${id} 失败 (${res.status})`);
            return res.json();
        })
        .then(data => {
            const segments = data.points;
            if (!segments || segments.length === 0) {
                console.warn('线路无有效段', id);
                return;
            }

            const color = data.color || '#808080';
            const group = L.featureGroup();
            const layers = [];

            segments.forEach(([priority, pts]) => {
                if (!pts || pts.length < 2) return;
                const polyline = L.polyline(pts, {
                    color: color,
                    weight: 4,
                    opacity: 0.8,
                    smoothFactor: 1,
                    priority: priority
                });
                group.addLayer(polyline);
                layers.push(polyline);
            });

            if (layers.length === 0) {
                console.warn('线路无有效折线段', id);
                return;
            }

            const bounds = group.getBounds();
            lineData[id] = {
                name: data.name || id,
                bounds: bounds,
                group: group,
                layers: layers,
                color: color,
                segments: segments
            };

            lineLayer.addLayer(group);
            return id;
        })
        .catch(err => console.error(err));
}

function loadAllLines() {
    fetch('./resource/lines/lines.json')
        .then(res => {
            if (!res.ok) throw new Error('lines 不存在');
            return res.json();
        })
        .then(ids => Promise.all(ids.map(id => loadLineFile(id))))
        .then(() => {
            populateDrawer();
            // 如果 debug 已开启，刷新节点
            refreshDebugIfNeeded();
        })
        .catch(() => {
            console.warn('未找到 lines，使用默认线路');
            const ids = ['M1', 'M1E', 'M2'];
            Promise.all(ids.map(id => loadLineFile(id))).then(() => {
                populateDrawer();
                refreshDebugIfNeeded();
            });
        });
}

// ===========================
// 抽屉面板
// ===========================
function populateDrawer() {
    const ul = document.getElementById('lineList');
    ul.innerHTML = '';
    for (const [id, info] of Object.entries(lineData)) {
        const li = document.createElement('li');
        li.innerHTML = `<span>${info.name}</span><span class="badge">${id}</span>`;
        li.addEventListener('click', function() {
            if (info.bounds && info.bounds.isValid()) {
                map.fitBounds(info.bounds, { padding: [30, 30] });
            }
            // 高亮
            info.layers.forEach(layer => {
                layer.setStyle({ color: '#ff7800', weight: 6 });
            });
            // 恢复原色
            setTimeout(() => {
                info.layers.forEach(layer => {
                    layer.setStyle({ color: info.color, weight: 4 });
                });
            }, 1000);
        });
        ul.appendChild(li);
    }
}

function initDrawerDrag() {
    const drawer = document.getElementById('drawer');
    const handle = document.getElementById('drawerHandle');
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    function onDragStart(e) {
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        isDragging = true;
        startY = clientY;
        startHeight = drawer.offsetHeight;
        document.body.style.cursor = 'grabbing';
    }

    function onDragMove(e) {
        if (!isDragging) return;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        const diff = startY - clientY;
        let newHeight = Math.min(window.innerHeight * 0.6, Math.max(40, startHeight + diff));
        drawer.style.height = newHeight + 'px';
        drawer.classList.toggle('open', newHeight > 60);
    }

    function onDragEnd() {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            if (drawer.offsetHeight < 80) {
                drawer.style.height = '40px';
                drawer.classList.remove('open');
            }
        }
    }

    // 鼠标事件
    handle.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    // 触摸事件
    handle.addEventListener('touchstart', onDragStart);
    document.addEventListener('touchmove', onDragMove);
    document.addEventListener('touchend', onDragEnd);
}

// ===========================
// 定位功能
// ===========================
function onLocationFound(latlng, accuracy) {
    // 转换坐标
    const gcj = wgs84ToGcj02(latlng.lat, latlng.lng);
    const gcjLatLng = L.latLng(gcj.lat, gcj.lng);

    if (!locationMarker) {
        locationMarker = L.marker(gcjLatLng, {
            icon: L.divIcon({
                className: 'location-marker',
                html: '<i class="fas fa-location-dot"></i>',
                iconAnchor: [12, 30]
            })
        }).addTo(map);

        locationCircle = L.circle(gcjLatLng, {
            radius: accuracy || 50,
            color: '#4d8aff',
            fillColor: '#4d8aff',
            fillOpacity: 0.15,
            weight: 1,
            dashArray: '5,5'
        }).addTo(map);

        map.setView(gcjLatLng, 14);
    } else {
        locationMarker.setLatLng(gcjLatLng);
        if (locationCircle) {
            locationCircle.setLatLng(gcjLatLng);
            if (accuracy) locationCircle.setRadius(accuracy);
        }
    }
}

function showToast(message, duration = 3000) {
    const popup = L.popup({ closeOnClick: false })
        .setLatLng(map.getCenter())
        .setContent(message)
        .openOn(map);
    setTimeout(() => map.closePopup(popup), duration);
}

function startLocationTracking() {
    if (!navigator.geolocation) {
        showToast('浏览器不支持地理定位');
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 30000
    };

    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
            onLocationFound(latlng, pos.coords.accuracy);
            firstTrack = false;
        },
        (error) => {
            // 高精度失败则降级
            if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
                console.warn('高精度定位失败，尝试低精度...');
                if (watchId) navigator.geolocation.clearWatch(watchId);
                const lowOptions = {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 60000
                };
                watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
                        onLocationFound(latlng, pos.coords.accuracy);
                        firstTrack = false;
                    },
                    (err) => {
                        console.warn('定位失败:', err.message);
                        showToast('无法获取当前位置，请检查GPS或网络权限');
                        firstTrack = false;
                    },
                    lowOptions
                );
            } else {
                if (firstTrack && isIOS())
                    showToast('IOS端请手动加载位置');
                else
                    showToast('定位权限被拒绝，请在设置中允许');
                firstTrack = false;
            }
        },
        options
    );
}

function stopLocationTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

// ===========================
// 启动入口
// ===========================
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    initDrawerDrag();
    loadAllLines();

    // ---- 浮动按钮事件 ----
    document.getElementById('map-type-btn').addEventListener('click', toggleMapType);
    document.getElementById('map-type-btn').classList.add('active-type'); // 初始卫星

    document.getElementById('debug-btn').addEventListener('click', toggleDebug);

    // 定位按钮
    document.getElementById('locate-btn').addEventListener('click', function() {
        if (!navigator.geolocation) {
            showToast('浏览器不支持地理定位');
            return;
        }
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        startLocationTracking();
    });

    startLocationTracking();

    // 页面卸载时停止定位
    window.addEventListener('beforeunload', stopLocationTracking);
});