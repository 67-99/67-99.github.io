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
let focusOnLocation = true; // 定位聚焦

const timetableCache = {};       // 时刻表数据缓存
let timetableUpdateTimer = null; // 定时器句柄

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
    /**
     * 在图层组中添加一条带白色半透明底衬的折线
     * @param {Array} latlngs - 经纬度数组 [[lat,lng], ...]
     * @param {string} color - 主线条颜色
     * @param {number} weight - 主线条粗细
     * @param {number} opacity - 主线条透明度
     * @param {number} bgWeight - 底衬线条粗细（通常比主线条大）
     * @param {number} bgOpacity - 底衬透明度（白色）
     */
    function addLineWithBg(latlngs, color, weight = 3, opacity = 0.9, bgWeight = UNIT * 111320, bgOpacity = 0.5) {
        // 先绘制白色半透明底衬
        const bgLine = L.polyline(latlngs, {
            color: 'rgba(255,255,255,' + bgOpacity + ')',
            weight: bgWeight,
            opacity: 1,
            interactive: false,
            smoothFactor: 1
        });
        trackLayer.addLayer(bgLine);
        // 再绘制主线条
        const mainLine = L.polyline(latlngs, {
            color: color,
            weight: weight,
            opacity: opacity,
            interactive: false,
            smoothFactor: 1
        });
        trackLayer.addLayer(mainLine);
    }

    // ---------- 收集绘制任务 ----------
    const drawTasks = [];
    for (const [id, info] of Object.entries(lineData)) {
        const color = info.color || '#808080';
        if (info.hasTrack) {
            // 主轨道上下行分段
            (info.trackMain[0] || []).forEach(seg => {
                if (seg.points.length >= 2) {
                    drawTasks.push({
                        type: 'line',
                        priority: seg.priority,
                        points: seg.points,
                        color: color
                    });
                }
            });
            (info.trackMain[1] || []).forEach(seg => {
                if (seg.points.length >= 2) {
                    drawTasks.push({
                        type: 'line',
                        priority: seg.priority,
                        points: seg.points,
                        color: color
                    });
                }
            });
            // 站台
            (info.trackStations || []).forEach(st => {
                if (st.rect && st.rect.length === 4) {
                    drawTasks.push({
                        type: 'stationRect',
                        priority: st.priority || 0,
                        rect: st.rect,
                        color: color
                    });
                }
                if (st.center) {
                    drawTasks.push({
                        type: 'stationLabel',
                        priority: st.priority || 0,
                        center: st.center,
                        name: st.n || '',
                        lineId: id
                    });
                }
            });
        } else {
            const stations = info.stations || [];
            const segments = info.segments || [];
            if (!segments.length) continue;
            // ---- 计算站台并收集任务 ----
            for (const st of stations) {
                const sl = st.sl;
                if (!sl || sl.length < 2) continue;
                // 寻找最佳位置
                let bestDist2 = Infinity;
                let bestProj = null;
                let bestDir = null;
                let expand = null;
                let bestPriority = null;
                segments.forEach(([priority, pts], idx) => {
                    for (let i = 0; i < pts.length - 1; i++) {
                        const a = pts[i];
                        const b = pts[i + 1];
                        const dx = b[0] - a[0];
                        const dy = b[1] - a[1];
                        const len2 = dx * dx + dy * dy;
                        if (len2 === 0) continue;
                        const t = ((sl[0] - a[0]) * dx + (sl[1] - a[1]) * dy) / len2;
                        // 真正的垂足（可能在线段外）
                        const projX = a[0] + t * dx;
                        const projY = a[1] + t * dy;
                        // 根据 t 确定线段上的最近点
                        let nearestX, nearestY;
                        if (t < 0) {
                            nearestX = a[0];
                            nearestY = a[1];
                        } else if (t > 1) {
                            nearestX = b[0];
                            nearestY = b[1];
                        } else {
                            nearestX = projX;
                            nearestY = projY;
                        }
                        const d2 = (sl[0] - nearestX) ** 2 + (sl[1] - nearestY) ** 2;
                        if (d2 < bestDist2) {
                            bestDist2 = d2;
                            bestProj = [projX, projY];
                            const len = Math.sqrt(len2);
                            bestDir = [dx / len, dy / len];
                            bestPriority = priority;
                            if(t < 0 || t > 1)
                                expand = [idx, i, t > 1];
                            else
                                expand = null;
                        }
                    }
                });
                if(!bestProj || !bestDir)
                    continue;
                // 若投影点在线段外，则在相应端点外扩一个点
                if (expand) {
                    const [segIdx, i, isAfterB] = expand;
                    let newX = bestProj[0];
                    let newY = bestProj[1];
                    if (isAfterB) {
                        newX += 6 * UNIT * bestDir[0];
                        newY += 6 * UNIT * bestDir[1];
                        segments[segIdx][1].splice(i + 2, 0, [newX, newY]);
                    } else {
                        newX -= 6 * UNIT * bestDir[0];
                        newY -= 6 * UNIT * bestDir[1];
                        segments[segIdx][1].splice(i, 0, [newX, newY]);
                    }
                }
                // 计算站台矩形
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
                // 收集站台任务
                drawTasks.push({
                    type: 'stationRect',
                    priority: bestPriority || 0,
                    rect: latlngs,
                    color: color
                });
                drawTasks.push({
                    type: 'stationLabel',
                    priority: bestPriority || 0,
                    center: [bestProj[0], bestProj[1]],
                    name: st.n || '',
                    lineId: id
                });
            }
            // 收集轨道任务 ----
            segments.forEach(([priority, pts]) => {
                if (pts.length < 2) return;
                const upPts = offsetPointsMeters(pts, trackOffsetMeters);
                const downPts = offsetPointsMeters(pts, -trackOffsetMeters);
                drawTasks.push({ type: 'line', priority: priority, points: upPts, color: color });
                drawTasks.push({ type: 'line', priority: priority, points: downPts, color: color });
            });
        }
    }
    // 按priority升序排序后绘制
    drawTasks.sort((a, b) => a.priority - b.priority);
    for (const task of drawTasks) {
        if (task.type === 'line') {
            addLineWithBg(task.points, task.color);
        } else if (task.type === 'stationRect') {
            L.polygon(task.rect, {
                color: task.color,
                weight: 1,
                fillColor: task.color,
                fillOpacity: 0.25,
                interactive: false
            }).addTo(trackLayer);
        } else if (task.type === 'stationLabel') {
            const w = (12 * task.name?.length || 0) + 20
            const h = 20.8
            const labelIcon = L.divIcon({
                className: 'station-label',
                html: `<span class="station-label-text" style="margin: ${h / 2}px ${w / 2}px">${task.name}</span>`,
                iconSize: [w, h]
            });
            const marker = L.marker(task.center, {
                icon: labelIcon,
                interactive: true,
                keyboard: false
            });
            marker.on('click', function () {
                loadAndShowTimetable(task.lineId, task.name);
            });
            marker.addTo(trackLayer);
        }
    }
}

/**
 * 单条配线加载
 * @param {string} id 线路编号（对应加载json名称）
 * @returns 获取的json结果
 */
async function loadTrackFile(id) {
    const url = `./resource/track/${id}.json`;
    try {
        const res = await fetch(url);
        if(!res.ok)
            throw new Error('Track not found');
        const data = await res.json();
        if(!lineData[id])
            lineData[id] = { name: id, color: '#808080' };
        lineData[id].trackMain = data.main;          // [[上行分段], [下行分段]]
        lineData[id].trackStations = data.stations;  // 含 rect、center
        lineData[id].hasTrack = true;
        if (data.color) lineData[id].color = data.color;
        return id;
    } catch(e) {
        return null;
    }
}

/**
 * 单条线路加载
 * @param {string} id 线路编号（对应加载json名称）
 * @returns 获取的json结果
 */
async function loadLineFile(id){
    const url = `./resource/baseline/${id}.json`;
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
                stations: data.stations || [],
                hasTrack: false
            };

            lineLayer.addLayer(group);
            return id;
        })
        .catch(err => console.error(err));
}

/** 加载全部线路 */
function loadAllbaseline() {
    fetch('./resource/baseline/lines.json')
        .then(res => {
            if(!res.ok)
                throw new Error('baseline 不存在');
            return res.json();
        })
        .then(ids => Promise.all(ids.map(id => loadLineFile(id))).then(() => ids))
        .then(ids => Promise.all(ids.map(id => loadTrackFile(id))))
        .then(() => {
            buildtrackLayer();       // 生成配线图
            updateLineVisibility();  // 根据当前缩放决定是否显示
            if(debugVisible)
                refreshDebug();
        })
        .catch((e) => {
            console.warn('未找到 baseline，使用默认线路', e);
            const ids = ['M1', 'M2'];
            Promise.all(ids.map(id => loadLineFile(id))).then(() => {
                if(debugVisible)
                    refreshDebug();
            });
        });
}

// ---------------------------
// 时刻表加载与展示
// ---------------------------

/** 加载时刻表 JSON */
async function loadTimetable(lineId) {
    if(timetableCache[lineId])
        return timetableCache[lineId];
    const url = `./resource/timetable/${lineId}.json`;
    try {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error('Timetable not found');
        const data = await res.json();
        timetableCache[lineId] = data;
        // 辅助函数：判断是否为普通对象（字典）
        function isPlainObject(obj) {
            return Object.prototype.toString.call(obj) === '[object Object]';
        }
        if(data.stations)
            data.stations.forEach(item => {
                ['up', 'down'].forEach(prop => {
                    const obj = item[prop];
                    if (obj && typeof obj === 'object') {
                        Object.keys(obj).forEach(key => {
                            const sub = obj[key];
                            if(sub && typeof sub === 'object' && !Array.isArray(sub)) {
                                const values = Object.values(sub);
                                if(values.every(Array.isArray))
                                    obj[key] = [].concat(...values);
                            }
                        });
                    }
                });
            });
        return data;
    } catch (e) {
        console.warn('加载时刻表失败:', lineId, e);
        return null;
    }
}

/** 加载并显示时刻表（点击站标时调用） */
async function loadAndShowTimetable(lineId, stationName) {
    let html = `<h3>${lineId} · ${stationName}</h3><p><strong>加载数据错误</strong></p>`;
    const data = await loadTimetable(lineId);
    if(data){
        const lineInfo = lineData[lineId];
        const lineName = lineInfo? lineInfo.name : lineId;
        html = getTimetableHtml(stationName, lineName, data);
    }
    updateDrawerContent(html);
}

// ===========================
// 抽屉面板
// ===========================
function initDrawerDrag() {
    const drawer = document.getElementById('drawer');
    const handle = document.getElementById('drawerHandle');
    let isDragging = false;
    let startPos = 0;
    let startSize = 0;
    let isVertical = true;
    // 判断当前拖拽方向
    function updateDirection() {
        isVertical = window.innerWidth < 768;
        handle.style.cursor = isVertical ? 'grab' : 'ew-resize';
    }
    function onDragStart(e) {
        const ev = e.type === 'touchstart' ? e.touches[0] : e;
        isDragging = true;
        updateDirection();

        if (isVertical) {
            startPos = ev.clientY;
            startSize = drawer.offsetHeight;
            document.body.style.cursor = 'grabbing';
        } else {
            startPos = ev.clientX;
            startSize = drawer.offsetWidth;
            document.body.style.cursor = 'ew-resize';
        }
        document.body.style.userSelect = 'none';
        e.preventDefault?.();
    }
    function onDragMove(e) {
        if (!isDragging) return;
        const ev = e.type === 'touchmove' ? e.touches[0] : e;
        if (isVertical) {
            const diff = startPos - ev.clientY;
            const maxH = Math.min(window.innerHeight * 0.6, 420);
            let newH = Math.min(maxH, Math.max(20, startSize + diff));
            drawer.style.height = newH + 'px';
            drawer.classList.toggle('open', newH > 60);
        } else {
            const diff = startPos - ev.clientX;
            const maxW = Math.min(window.innerWidth * 0.45, 480);
            let newW = Math.min(maxW, Math.max(20, startSize + diff));
            drawer.style.width = newW + 'px';
            drawer.classList.toggle('open', newW > 60);
        }
        e.preventDefault?.();
    }
    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if(isVertical){
            if (drawer.offsetHeight < 80){
                drawer.style.height = '20px';
                drawer.classList.remove('open');
            }
        } else if (drawer.offsetWidth < 80) {
            drawer.style.width = '20px';
            drawer.classList.remove('open');
        }

        if (!drawer.classList.contains('open')) {
            if (timetableUpdateTimer) {
                clearInterval(timetableUpdateTimer);
                timetableUpdateTimer = null;
            }
        }
    }
    // 窗口尺寸变化时更新方向
    window.addEventListener('resize', () => {
        updateDirection();
        // 切换布局时重置为收缩状态，避免尺寸错乱
        if (isVertical) {
            drawer.style.width = '';
            drawer.style.height = '20px';
        } else {
            drawer.style.height = '';
            drawer.style.width = '20px';
        }
        drawer.classList.remove('open');
        if (timetableUpdateTimer) {
            clearInterval(timetableUpdateTimer);
            timetableUpdateTimer = null;
        }
    });
    // 鼠标事件
    handle.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    // 触摸事件
    handle.addEventListener('touchstart', onDragStart);
    document.addEventListener('touchmove', onDragMove);
    document.addEventListener('touchend', onDragEnd);
    // 初始化方向
    updateDirection();
}

/** 分钟数 → HH:mm（忽略 >1440） */
function minutesToHHMM(minutes) {
    if (minutes > 1440)
        minutes %= 1440;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 计算两个分钟数的循环时间差（返回 -720 ~ 720 之间的值） */
function getCircularDiff(minutes, currentMinutes) {
    let diff = (minutes - currentMinutes) % 1440;
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    return diff;
}

/** 更新抽屉中内容 */
function updateDrawerContent(html) {
    const drawer = document.getElementById('drawer');
    const content = document.getElementById('drawerContent');
    content.innerHTML = html;
    drawer.classList.add('open');
    if (window.innerWidth < 768)
        drawer.style.height = '40vh';
    else
        drawer.style.width = '380px';
    // 绑定更早/更晚折叠按钮
    content.querySelectorAll('.toggle-earlier, .toggle-later').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const container = this.closest('.dir-container');
            if (!container) return;
            // 判断是更早还是更晚
            let targetList;
            if(this.classList.contains('toggle-earlier'))
                targetList = container.querySelector('.earlier-list');
            else
                targetList = container.querySelector('.later-list');
            if (!targetList) return;
            const isHidden = targetList.style.display === 'none';
            targetList.style.display = isHidden ? '' : 'none';
            // 旋转图标
            const icon = this.querySelector('i');
            if(icon){
                if (this.classList.contains('toggle-earlier'))
                    icon.className = isHidden ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
                else
                    icon.className = isHidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
            }
        });
    });
    updateHighlights();  // 立即更新一次
    // 清除旧定时器并启动高亮定时器
    if (timetableUpdateTimer) {
        clearInterval(timetableUpdateTimer);
        timetableUpdateTimer = null;
    }
    timetableUpdateTimer = setInterval(updateHighlights, 5000);
}

/** 渲染时刻表 */
function getTimetableHtml(stationName, lineName, data) {
    let html = `<h3>${lineName} · ${stationName}</h3>`;
    const stationData = data.stations.find(s => s.station_name === stationName);
    if (!stationData) {
        html += '<p>未找到该站时刻表</p>';
        return html;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const directions = [
        { key: 'up', label: data.up || '上行' },
        { key: 'down', label: data.down || '下行' }
    ];

    for (const dir of directions) {
        const dirData = stationData[dir.key];
        if (!dirData) continue;
        let times = dirData.weekday || dirData.weekend || [];
        if(now.getDay() == 5 && dirData.friday)
            times = dirData.friday;
        if(now.getDay() > 5 && dirData.weekend)
            times = dirData.weekend;
        times = times.filter(t => t <= 1440);
        if(times.length === 0)
            continue;
        times.sort((a, b) => a - b);
        // 分组：默认显示当前时间前后1小时，若为空则显示首班1小时
        let defaultTimes = [];
        let earlierTimes = [];
        let laterTimes = [];
        for (const t of times) {
            const diff = getCircularDiff(t, currentMinutes);
            if (diff >= -60 && diff <= 60)
                defaultTimes.push(t);      // 前后 1 小时内
            else if (diff < -60)
                earlierTimes.push(t);      // 更早（已过超过 1 小时）
            else
                laterTimes.push(t);        // 更晚（未来超过 1 小时）
        }
        // 如果没有“附近”的车次，则默认显示首班车
        if (defaultTimes.length === 0 && times.length > 0) {
            let first = times.find(t => t > 200);
            if(first === undefined)
                first = times[0];
            defaultTimes = times.filter(t => getCircularDiff(t, first) >= 0 && getCircularDiff(t, first) <= 60);
            earlierTimes = [];
            laterTimes = times.filter(t => getCircularDiff(t, first) > 60);
        }
        const byCircular = (a, b) => getCircularDiff(a, currentMinutes) - getCircularDiff(b, currentMinutes);
        earlierTimes.sort(byCircular);
        defaultTimes.sort(byCircular);
        laterTimes.sort(byCircular);
        html += `<div class="dir-container" data-dir="${dir.key}">`;
        html += `<strong>${dir.label}方向</strong>`;
        // 更早（上箭头）
        if (earlierTimes.length > 0) {
            html += `<span class="time-list earlier-list" style="display:none;">`;
            for (const t of earlierTimes) {
                const timeStr = minutesToHHMM(t);
                if (timeStr) html += `<span class="time-item" data-minutes="${t}">${timeStr}</span>`;
            }
            html += `</span>`;
            html += `<button class="toggle-earlier" data-dir="${dir.key}">更早 <i class="fas fa-chevron-up"></i></button>`;
        }
        // 默认显示（始终可见）
        html += `<span class="time-list near-list">`;
        for (const t of defaultTimes) {
            const timeStr = minutesToHHMM(t);
            if (timeStr) html += `<span class="time-item" data-minutes="${t}">${timeStr}</span>`;
        }
        html += `</span>`;
        // 更晚（下箭头）
        if (laterTimes.length > 0) {
            html += `<button class="toggle-later" data-dir="${dir.key}">更晚 <i class="fas fa-chevron-down"></i></button>`;
            html += `<span class="time-list later-list" style="display:none;">`;
            for (const t of laterTimes) {
                const timeStr = minutesToHHMM(t);
                if (timeStr) html += `<span class="time-item" data-minutes="${t}">${timeStr}</span>`;
            }
            html += `</span>`;
        }
        html += `</div>`;
    }
    return html;
}

/** 高亮本次列车和下一列车 */
function updateHighlights() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const lists = document.querySelectorAll(".dir-container");
    for(const listDom of lists){
        const items = listDom.querySelectorAll('.time-item[data-minutes]');
        if (!items.length) return;
        // 收集所有时间，找未来最近和过去最近
        let futureBest = null; // { minutes, diff }
        let pastBest = null;   // { minutes, diff }
        for (const el of items) {
            const minutes = parseInt(el.dataset.minutes, 10);
            const diff = getCircularDiff(minutes, currentMinutes);
            if(0 <= diff && diff <= 30)
                if(!futureBest || diff < futureBest.diff)
                    futureBest = { minutes, diff };
            if(-1 <= diff && diff <= 0)
                if(!pastBest || Math.abs(diff) < Math.abs(pastBest.diff))
                    pastBest = { minutes, diff };
        }
        // 应用高亮
        for (const el of items) {
            const minutes = parseInt(el.dataset.minutes, 10);
            el.classList.remove('next-train', 'arrive-train');
            if (pastBest && minutes === pastBest.minutes)
                el.classList.add('arrive-train');
            else if (futureBest && minutes === futureBest.minutes)
                el.classList.add('next-train');
        }
    }
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
    if (focusOnLocation) {
        map.setView(gcjLatLng, 14);
        focusOnLocation = false; // 后续更新不再自动聚焦
    }
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
    // 天气获取，详见https://www.sojson.com/api/weather.html
    // fetch("http://t.weather.itboy.net/api/weather/city/101010100")
    //     .then(res => {
    //         if(!res.ok)
    //             throw new Error(`加载 ${id} 失败 (${res.status})`);
    //         return res.json();
    //     })
    //     .then(data => console.log(data));
    initMap();
    if(typeof initDebug === 'function')
        initDebug();
    initDrawerDrag();
    loadAllbaseline();
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
        focusOnLocation = true;
        startLocationTracking();
    });
    startLocationTracking();
    // 页面卸载时停止定位
    window.addEventListener('beforeunload', stopLocationTracking);
});