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
    /*
    if(wgsLon < 72.004 || wgsLon > 137.8347 || wgsLat < 0.8293 || wgsLat > 55.8271)
        return { lat: wgsLat, lng: wgsLon };  // 判断是否在中国境外，境外不转换
    */
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

/**
 * 显示提示
 * @param {string} message 提示文本
 * @param {int|float} duration 消失时间
 */
function showToast(message, duration = 0) {
    const popup = L.popup({ closeOnClick: false })
        .setLatLng(map.getCenter())
        .setContent(message)
        .openOn(map);
    if(duration > 0)
        setTimeout(() => map.closePopup(popup), duration);
}

// ===========================
// 全局状态
// ===========================
const UNIT = 0.0001;  // 配线图单位宽度 (°)

let map;                 // 全局地图，各脚本共享
let lineLayer;           // 在大视图下的地铁图
let trackLayer = null;   // 在小视图下的配线图
let tileLayer = null;    // 地图底图图层
let isSatellite = true;  // 当前是否为卫星图

const lineData = {};        // 线路信息
let locationMarker = null;  // 定位标志
let locationCircle = null;  // 定位范围
let watchId = null;         // 定位追踪watcher

// ===========================
// 地图初始化
// ===========================
/**
 * 创建底图
 * @param {boolean} satellite 是否为卫星图
 * @returns leaflet图层
 */
function createTileLayer(satellite) {
    const style = satellite ? 6 : 7;
    return L.tileLayer(`https://wprd01.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&style=${style}&ltype=2`);
}

/** 地图类型切换 */
function toggleMapType() {
    isSatellite = !isSatellite;
    if(tileLayer)
        map.removeLayer(tileLayer);
    tileLayer = createTileLayer(isSatellite).addTo(map);
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
    if(debugVisible)
        window._lonlatScale._update(); // 更新debug比例尺
}

// ===========================
// 线路加载
// ===========================
/** 更新线路图/配线图显示 */
function updateLineVisibility() {
    if(!trackLayer)
        return;
    if (map.getZoom() > 12) {
        // 显示配线图，隐藏线路
        if (!map.hasLayer(trackLayer)) map.addLayer(trackLayer);
        if (map.hasLayer(lineLayer)) map.removeLayer(lineLayer);
    } else {
        // 显示线路，隐藏配线图
        if (map.hasLayer(trackLayer)) map.removeLayer(trackLayer);
        if (!map.hasLayer(lineLayer)) map.addLayer(lineLayer);
    }
}

/** 添加线路图/配线图图层 */
function buildtrackLayer() {
    if (trackLayer) {
        if (map.hasLayer(trackLayer)) map.removeLayer(trackLayer);
        trackLayer.clearLayers();
    } else {
        trackLayer = L.layerGroup();
    }
    // 默认参数
    const platformLengthMeters = 12 * UNIT * 111320; // 站台长 ~134m
    const platformWidthMeters = 2 * UNIT * 111320;   // 站台宽 ~22m
    const trackOffsetMeters = 1.5 * UNIT * 111320;
    const halfLen = platformLengthMeters / 2;
    const halfWid = platformWidthMeters / 2;
    const endLineLength = 6;  // 端点横线长度（米）
    const crs = L.CRS.EPSG3857;
    /**
     * 将经纬度转换为投影平面坐标
     * @param {*} latlng leaflet经纬度
     * @returns 投影平面坐标
     */
    function project(latlng) {
        return crs.project(L.latLng(latlng));
    }
    /**
     * 将投影平面坐标转换为经纬度
     * @param {*} point 投影平面坐标
     * @returns leaflet经纬度
     */
    function unproject(point) {
        return crs.unproject(point);
    }
    /**
     * 计算偏移折线
     * @param {*} points 偏移前折线
     * @param {*} offsetMeters 偏移值
     * @returns 偏移后的折线
     */
    function offsetPointsMeters(points, offsetMeters) {
        if(offsetMeters === 0)
            return points.slice();
        const n = points.length;
        if(n < 2)
            return points.slice();
        const projectedPoints = []
        points.forEach(point => {
            projectedPoints.push(project(point));
        });
        projectedPoints.unshift(projectedPoints[0]);
        projectedPoints.push(projectedPoints[projectedPoints.length - 1]);
        const result = [];
        for (let i = 1; i <= n; i++) {
            let dx = projectedPoints[i + 1].x - projectedPoints[i - 1].x;
            let dy = projectedPoints[i + 1].y - projectedPoints[i - 1].y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-10) {
                if (i > 0 && result.length > 0) {
                    dx = projectedPoints[i].x - projectedPoints[i - 1].x;
                    dy = projectedPoints[i].y - projectedPoints[i - 1].y;
                    const l = Math.sqrt(dx * dx + dy * dy);
                    if (l > 1e-10) { dx /= l; dy /= l; } else { dx = 1; dy = 0; }
                } else {
                    dx = 1; dy = 0;
                }
            } else {
                dx /= len; dy /= len;
            }
            const newX = projectedPoints[i].x - offsetMeters * dy;
            const newY = projectedPoints[i].y + offsetMeters * dx;
            const newLatLng = unproject({ x: newX, y: newY });
            result.push([newLatLng.lat, newLatLng.lng]);
        }
        return result;
    }

    for (const [id, info] of Object.entries(lineData)) {
        const stations = info.stations || [];
        const segments = info.segments || [];
        const color = info.color || '#808080';
        if (!segments.length) continue;
        // 绘制轨道
        segments.forEach(([priority, pts]) => {
            if(pts.length < 2)
                return;
            // 上/下行轨道
            const upPts = offsetPointsMeters(pts, trackOffsetMeters);
            const downPts = offsetPointsMeters(pts, -trackOffsetMeters);
            const upLine = L.polyline(upPts, {
                color: color,
                weight: 3,
                opacity: 0.8,
                interactive: false
            });
            const downLine = L.polyline(downPts, {
                color: color,
                weight: 3,
                opacity: 0.8,
                interactive: false
            });
            trackLayer.addLayer(upLine);
            trackLayer.addLayer(downLine);
            /**
             * 绘制端点横线（垂直于轨道）
             * @param {*} ptLatLng 
             * @param {*} dirLatLng 
             * @param {*} offsetMeters 
             * @param {*} lengthMeters 
             * @returns 
             */
            function addEndLine(ptLatLng, dirLatLng, offsetMeters, lengthMeters) {
                const pt = project(ptLatLng);
                const dirPt = project(dirLatLng);
                let dx = dirPt.x - pt.x;
                let dy = dirPt.y - pt.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 1e-10) return;
                dx /= len;
                dy /= len;
                const nx = -dy;  // 法向量（垂直于轨道）
                const ny = dx;
                // 横线中心在偏移后的端点位置
                const centerX = pt.x + offsetMeters * nx;
                const centerY = pt.y + offsetMeters * ny;
                const half = lengthMeters / 2;
                // 横线两端沿法向量方向延伸
                const startX = centerX - half * nx;
                const startY = centerY - half * ny;
                const endX = centerX + half * nx;
                const endY = centerY + half * ny;
                const startLatLng = unproject({ x: startX, y: startY });
                const endLatLng = unproject({ x: endX, y: endY });
                const line = L.polyline(
                    [
                        [startLatLng.lat, startLatLng.lng],
                        [endLatLng.lat, endLatLng.lng]
                    ],
                    {
                        color: color,
                        weight: 2,
                        opacity: 1,
                        interactive: false
                    }
                );
                trackLayer.addLayer(line);
            }
            // 添加轨道端点
            addEndLine(pts[0], pts[1], trackOffsetMeters, endLineLength);
            addEndLine(pts[0], pts[1], -trackOffsetMeters, endLineLength);
            addEndLine(pts[pts.length - 1], pts[pts.length - 2], trackOffsetMeters, endLineLength);
            addEndLine(pts[pts.length - 1], pts[pts.length - 2], -trackOffsetMeters, endLineLength);
        });
        // ---- 绘制站台 ----
        const segPoints = [];
        segments.forEach(([priority, pts]) => {
            for(let i = 0; i < pts.length - 1; i++)
                segPoints.push({ a: pts[i], b: pts[i + 1] });
        });
        if (segPoints.length === 0) continue;
        for (const st of stations) {
            const sl = st.sl;
            if (!sl || sl.length < 2) continue;
            // 寻找最佳位置
            let bestDist2 = Infinity;
            let bestProj = null;
            let bestDir = null;
            for (const seg of segPoints) {
                const a = seg.a;
                const b = seg.b;
                const dx = b[0] - a[0];
                const dy = b[1] - a[1];
                const len2 = dx * dx + dy * dy;
                if (len2 === 0) continue;
                let t = ((sl[0] - a[0]) * dx + (sl[1] - a[1]) * dy) / len2;
                t = Math.max(0, Math.min(1, t));
                const projX = a[0] + t * dx;
                const projY = a[1] + t * dy;
                const d2 = (sl[0] - projX) ** 2 + (sl[1] - projY) ** 2;
                if (d2 < bestDist2) {
                    bestDist2 = d2;
                    bestProj = [projX, projY];
                    const len = Math.sqrt(len2);
                    bestDir = [dx / len, dy / len];
                }
            }
            if (!bestProj || !bestDir) continue;
            // 计算站台形状
            const centerLatLng = L.latLng(bestProj[0], bestProj[1]);
            st._labelPos = centerLatLng;
            const centerPt = project(centerLatLng);
            const dirPt = project(L.latLng(centerLatLng.lat + bestDir[0], centerLatLng.lng + bestDir[1]));
            let dx = dirPt.x - centerPt.x;
            let dy = dirPt.y - centerPt.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-10) continue;
            dx /= len;
            dy /= len;
            const nx = -dy;
            const ny = dx;
            // 绘制站台
            const corners = [
                { x: centerPt.x + halfLen * dx + halfWid * nx, y: centerPt.y + halfLen * dy + halfWid * ny },
                { x: centerPt.x + halfLen * dx - halfWid * nx, y: centerPt.y + halfLen * dy - halfWid * ny },
                { x: centerPt.x - halfLen * dx - halfWid * nx, y: centerPt.y - halfLen * dy - halfWid * ny },
                { x: centerPt.x - halfLen * dx + halfWid * nx, y: centerPt.y - halfLen * dy + halfWid * ny }
            ];
            const latlngs = corners.map(p => unproject(p));
            const rect = L.polygon(latlngs, {
                color: color,
                weight: 1,
                fillColor: color,
                fillOpacity: 0.25,
                interactive: false
            });
            trackLayer.addLayer(rect);
            const labelIcon = L.divIcon({
                className: 'station-label',
                html: `<span class="station-label-text">${st.n || ''}</span>`,
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            });
            const labelMarker = L.marker(centerLatLng, {
                icon: labelIcon,
                interactive: false
            });
            trackLayer.addLayer(labelMarker);
        }
    }
}

/**
 * 单条线路加载
 * @param {string} id 线路编号（对应加载json名称）
 * @returns 获取的json结果
 */
async function loadLineFile(id){
    const url = `./resource/lines/${id}.json`;
    return fetch(url)
        .then(res => {
            if(!res.ok)
                throw new Error(`加载 ${id} 失败 (${res.status})`);
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
                segments: segments,
                stations: data.stations || []
            };

            lineLayer.addLayer(group);
            return id;
        })
        .catch(err => console.error(err));
}

/** 加载全部线路 */
function loadAllLines() {
    fetch('./resource/lines/lines.json')
        .then(res => {
            if(!res.ok)
                throw new Error('lines 不存在');
            return res.json();
        })
        .then(ids => Promise.all(ids.map(id => loadLineFile(id))))
        .then(() => {
            buildtrackLayer();       // 生成配线图
            updateLineVisibility();  // 根据当前缩放决定是否显示
            if(debugVisible)  // 如果 debug 已开启，刷新节点
                refreshDebug();
        })
        .catch((e) => {
            console.warn('未找到 lines，使用默认线路', e);
            const ids = ['M1', 'M2'];
            Promise.all(ids.map(id => loadLineFile(id))).then(() => {
                if(debugVisible)
                    refreshDebug();
            });
        });
}

// ===========================
// 抽屉面板（预留，暂不使用）
// ===========================
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
/**
 * 显示/更新定位
 * @param {*} latlng leaflet经纬度
 * @param {*} accuracy leaflet精准度
 */
function onLocationFound(latlng, accuracy) {
    // 转换坐标
    const gcj = wgs84ToGcj02(latlng.lat, latlng.lng);
    const gcjLatLng = L.latLng(gcj.lat, gcj.lng);
    // 添加/更新标签
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
    } else {
        locationMarker.setLatLng(gcjLatLng);
        if(locationCircle){
            locationCircle.setLatLng(gcjLatLng);
            if(accuracy)
                locationCircle.setRadius(accuracy);
        }
    }
    map.setView(gcjLatLng, 14);
}

/** 开始位置检测 */
function startLocationTracking() {
    if (!navigator.geolocation) {
        showToast('浏览器不支持地理定位', 3000);
        return;
    }
    // 高精度/低精度参数
    const options = {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 30000
    };
    const lowOptions = {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000
    };
    // 尝试获取位置
    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
            onLocationFound(latlng, pos.coords.accuracy);
        },
        (error) => {
            // 高精度失败则降级
            if (error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) {
                console.warn('高精度定位失败，尝试低精度...');
                if (watchId) navigator.geolocation.clearWatch(watchId);
                watchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
                        onLocationFound(latlng, pos.coords.accuracy);
                    },
                    (err) => {
                        console.warn('定位失败:', err.message);
                        showToast('无法获取当前位置，请检查GPS或网络权限', 3000);
                    },
                    lowOptions
                );
            }
            else
                showToast('定位权限被拒绝，请在设置中允许', 3000);
        },
        options
    );
}

/** 停止位置检测 */
function stopLocationTracking() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

// ===========================
// 启动入口与启动函数
// ===========================
function initMap() {
    map = L.map('map').setView([39.9, 116.4], 10);
    tileLayer = createTileLayer(true).addTo(map);
    lineLayer = L.layerGroup().addTo(map);
    // 设置copyright
    map.attributionControl.setPrefix('');
    map.attributionControl.addAttribution('&copy; <a href="https://www.amap.com/">高德地图</a>');
    map.on('zoomend', updateLineVisibility);
}

document.addEventListener('DOMContentLoaded', function() {
    initMap();
    if(typeof initDebug === 'function')
        initDebug();
    initDrawerDrag();
    loadAllLines();
    // ---- 浮动按钮事件 ----
    document.getElementById('map-type-btn').addEventListener('click', toggleMapType);
    document.getElementById('map-type-btn').classList.add('active-type'); // 初始卫星
    // 设置debug按钮
    const debugBtn = document.getElementById('debug-btn');
    if (typeof toggleDebug === 'function') {
        // debug.js 已成功加载，显示按钮并绑定事件
        debugBtn.style.display = '';
        debugBtn.addEventListener('click', toggleDebug);
    } else {
        // debug.js 未加载或加载失败，隐藏按钮
        debugBtn.style.display = 'none';
    }
    // 定位按钮
    document.getElementById('locate-btn').addEventListener('click', function() {
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