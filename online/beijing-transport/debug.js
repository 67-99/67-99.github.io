// ===========================
// 全局状态
// ===========================
let debugVisible = false;      // 是否为debug模式
let debugLayer = null;         // 使用canvas渲染的图层组
let canvasRenderer = null;     // 共享canvas渲染器
let debugScaleControl = null;  // 经纬度比例尺
let debugNodesData = [];       // 当前视口所有节点数据
let debugNodeGroup = null;     // 当前视口路径节点子组
let debugStationGroup = null;  // 站点标记子组

/** 构建站点标记 */
function buildDebugStations() {
    if (!debugStationGroup) return;
    debugStationGroup.clearLayers();
    for (const [id, info] of Object.entries(lineData)) {
        const stations = info.stations || [];
        const color = info.color || '#ff0000';
        stations.forEach(st => {
            const sl = st.sl;                 // 原始坐标 [lat, lng]
            const labelPos = st._labelPos;    // 站名标签位置
            if (!sl || sl.length < 2 || !labelPos) return;
            // 原始坐标点（小圆点）
            const marker = L.circleMarker(sl, {
                radius: 4,
                color: color,
                weight: 2,
                fillColor: '#aaa',
                fillOpacity: 1,
                interactive: false
            });
            debugStationGroup.addLayer(marker);
            // 虚线连线到标签位置
            const line = L.polyline(
                [sl, [labelPos.lat, labelPos.lng]],
                {
                    color: color,
                    weight: 1,
                    dashArray: '4,4',
                    opacity: 0.5,
                    interactive: false
                }
            );
            debugStationGroup.addLayer(line);
        });
    }
}

/** 构建路径节点缓存 */
function buildDebugNodes() {
    debugNodesData = [];
    debugNodeGroup.clearLayers();   // 清空路径节点
    // 重建站点标记
    buildDebugStations();
    const lineIds = Object.keys(lineData);
    if (lineIds.length === 0) return;
    for (const [id, info] of Object.entries(lineData)) {
        const color = info.color || '#808080';
        const segments = info.segments;
        segments.forEach(([priority, pts], segIdx) => {
            if (!pts || pts.length < 2) return;
            pts.forEach((latlng, pointIdx) => {
                debugNodesData.push({
                    latlng: latlng,
                    lineId: id,
                    segmentIdx: segIdx,
                    pointIdx: pointIdx,
                    color: color
                });
            });
        });
    }
    // 根据当前视口更新路径节点显示
    updateDebugNodes();
}

/** 根据当前视口更新路径节点 */
function updateDebugNodes() {
    if (!debugVisible || !map) return;
    debugNodeGroup.clearLayers();
    // 对节点进行采样
    const bounds = map.getBounds();
    const MAX_VISIBLE = Math.min(Math.max(400 - 20 * map.getZoom(), 50), 200);
    let visibleNodes = [];
    for (const node of debugNodesData)
        if (bounds.contains(node.latlng)) visibleNodes.push(node);
    let displayNodes = visibleNodes;
    if (visibleNodes.length > MAX_VISIBLE) {
        const step = Math.ceil(visibleNodes.length / MAX_VISIBLE);
        const sampled = [];
        for(let i = 0; i < visibleNodes.length; i += step)
            sampled.push(visibleNodes[i]);
        displayNodes = sampled;
    }
    // 构建并显示
    for (const node of displayNodes) {
        const circle = L.circleMarker(node.latlng, {
            radius: 5,
            color: node.color,
            weight: 2,
            fillColor: '#ffffff',
            fillOpacity: 0.95,
            renderer: canvasRenderer,
            interactive: false
        });
        // 添加 tooltip 显示节点编号
        const label = `${node.lineId}-${node.segmentIdx}-${node.pointIdx}`;
        const tooltip = L.tooltip({
            permanent: true,
            direction: 'center',
            className: 'debug-tooltip',
            offset: map.getZoom() > 12 ? [1.6 * map.getZoom(), -map.getZoom()] : [0, 0]
        }).setContent(label);
        circle.bindTooltip(tooltip);
        debugNodeGroup.addLayer(circle);
    }
}

/** 切换 Debug 模式 */
function toggleDebug() {
    debugVisible = !debugVisible;
    const btn = document.getElementById('debug-btn');
    if (debugVisible) {
        if(debugNodesData.length === 0)
            buildDebugNodes();  // 首次启用或数据为空时构建全部
        else
            updateDebugNodes();  // 已有节点数据，更新节点
        if(!map.hasLayer(debugLayer))
            map.addLayer(debugLayer);
        if(window._lonlatScale){
            window._lonlatScale._container.style.display = 'block';
            window._lonlatScale._update();
        }
        btn.classList.add('debug-active');
    } else {
        if(map.hasLayer(debugLayer))
            map.removeLayer(debugLayer);
        if(window._lonlatScale)
            window._lonlatScale._container.style.display = 'none';
        btn.classList.remove('debug-active');
    }
    // 关闭所有 popup
    map.eachLayer(layer => {
        if(layer instanceof L.Popup)
            map.removeLayer(layer);
    });
}

/** 刷新debug图层 */
function refreshDebug() {
    if (debugVisible) {
        buildDebugNodes();  // 重建缓存和站点标记
        if (!map.hasLayer(debugLayer)) {
            map.addLayer(debugLayer);
        }
    }
}

function initDebug() {
    canvasRenderer = L.canvas({ padding: 0.5 });  // 创建 canvas 渲染器（用于路径节点，提升性能）
    // 创建图层组
    debugNodeGroup = L.layerGroup();
    debugStationGroup = L.layerGroup();
    debugLayer = L.layerGroup([debugNodeGroup, debugStationGroup]);
    // 监听地图移动/缩放结束，更新路径节点
    map.on('moveend', function() {
        if (debugVisible) {
            updateDebugNodes();
        }
    });
    // ===========================
    // 自定义经纬度比例尺控件
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
            if (lngDelta <= 0)
                return;
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
                    else
                        chosen = scales[i];
                    break;
                }
                // 如果是最后一个，使用最后一个
                if (i === scales.length - 1)
                    chosen = scales[i];
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
    // 添加比例尺控件
    var lonlatScale = new L.Control.LonLatScale({ position: 'bottomright', maxWidth: 150 });
    lonlatScale.addTo(map);
    lonlatScale._container.style.display = 'none';
    window._lonlatScale = lonlatScale;
    // 右键显示坐标
    map.on('contextmenu', function(e) {
        if (debugVisible) {
            if (e.originalEvent) e.originalEvent.preventDefault();
            const latlng = e.latlng;
            const content = `(${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)})`;
            L.popup({ closeButton: true })
                .setLatLng(latlng)
                .setContent(content)
                .openOn(map);
        }
    });
}