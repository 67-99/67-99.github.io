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

let trainLayer = null;        // 列车图层
let trainPosData = {};        // 缓存各线路的车次数据
let trainUpdateTimer = null;  // 列车位置更新定时器

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

/** 加载指示器 */
const LoadingIndicator = {
    element: null,
    textSpan: null,
    textList: [],

    // 创建 DOM 元素（页面加载后调用一次）
    init() {
        if (this.element) return;
        const div = document.createElement('div');
        div.id = 'loading-indicator';
        div.innerHTML = `
            <i class="fas fa-circle-notch fa-spin"></i>
            <span class="loading-text">加载中...</span>
        `;
        document.body.appendChild(div);
        this.element = div;
        this.textSpan = div.querySelector('.loading-text');
    },

    // 显示加载指示器，可指定文本
    show(text) {
        this.init();
        this.textList.push(text || "加载中...");
        this.textSpan.textContent = this.textList[this.textList.length - 1];
        this.element.classList.add('show');
    },

    // 隐藏（计数器减一，归零时隐藏）
    hide(text = null) {
        if(text === undefined || text === null)
            this.textList.pop();
        else
            this.textList = this.textList.filter(item => item !== text);
        this.textSpan.textContent = this.textList[this.textList.length - 1];
        if(this.textList.length === 0 && this.element)
            this.element.classList.remove('show');
    },

    // 更新文本
    setText(text) {
        if(this.textList.length === 0 || !text)
            return;
        this.textList[this.textList.length - 1] = text;
        if (this.textSpan) this.textSpan.textContent = text;
    },

    clear(){
        this.textList = [];
        if(this.element)
            this.element.classList.remove('show');
    }
};

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

/** 添加配线图图层 */
function buildtrackLayer() {
    LoadingIndicator.show(`绘制配线中...`);
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
    LoadingIndicator.hide();
}

/**
 * 单条配线加载
 * @param {string} id 线路编号（对应加载json名称）
 * @returns 获取的json结果
 */
async function loadTrackFile(id) {
    LoadingIndicator.show(`加载${id}配线数据...`);
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
        LoadingIndicator.hide();
        return id;
    } catch(e) {
        LoadingIndicator.hide();
        return null;
    }
}

/**
 * 单条线路加载
 * @param {string} id 线路编号（对应加载json名称）
 * @returns 获取的json结果
 */
async function loadLineFile(id){
    LoadingIndicator.show(`加载${id}线路数据...`);
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

            LoadingIndicator.show(`绘制${id}线路...`);
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
            LoadingIndicator.hide();

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
            LoadingIndicator.hide();
            return id;
        })
        .catch(err => {
            console.error(err);
            LoadingIndicator.hide();
        });
}

/** 加载全部线路 */
function loadAllbaseline() {
    LoadingIndicator.show('加载线路列表...');
    fetch('./resource/baseline/lines.json')
        .then(res => {
            if(!res.ok){
                LoadingIndicator.hide();
                throw new Error('baseline 不存在');
            }
            LoadingIndicator.hide();
            return res.json();
        })
        .then(ids => Promise.all(ids.map(id => loadLineFile(id))).then(() => ids))
        .then(ids => Promise.all(ids.map(id => loadTrackFile(id))))
        .then(() => {
            buildtrackLayer();       // 生成配线图
            updateLineVisibility();  // 根据当前缩放决定是否显示
            if(debugVisible)
                refreshDebug();
            initTrainDisplay();      // 加载列车数据并开始实时显示
        })
        .then(() => {
            LoadingIndicator.hide();  // 所有加载完成，隐藏指示器
        })
        .catch((e) => {
            console.warn('未找到 baseline，使用默认线路', e);
            LoadingIndicator.hide();
            const ids = ['M1', 'M2'];
            Promise.all(ids.map(id => loadLineFile(id))).then(() => {
                if(debugVisible)
                    refreshDebug();
                initTrainDisplay();
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
    const currentMinutes = (now.getHours() <= 3) * 1440 + now.getHours() * 60 + now.getMinutes();
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
        times = times.filter(t => typeof t === 'number' && t >= 200 && t < 1660);
        times = [...new Set(times)];      // 去除重复车次（部分线路数据存在重复）
        if(times.length === 0)
            continue;
        times.sort((a, b) => a - b);
        const firstTime = times[0];
        // 分组（按“今天”的服务日）：默认显示当前时间前后 1 小时（循环时间，可跨天），更早/更晚只取今天服务日内的时间
        let defaultTimes = [];
        let earlierTimes = [];
        let laterTimes = [];
        if (currentMinutes < firstTime - 60 || times[times.length - 1] + 60 < currentMinutes) {
            // 服务尚未开始（凌晨）：首班 1 小时为默认，其余为更晚
            times = dirData.weekday || dirData.weekend || [];
            if(now.getDay() == 4 && dirData.friday)
                times = dirData.friday;
            if((now.getDay() == 5 || now.getDay() == 6) && dirData.weekend)
                times = dirData.weekend;
            defaultTimes = times.filter(t => t - firstTime <= 60);
            laterTimes = times.filter(t => t - firstTime > 60);
        } else {
            for (const t of times) {
                const diff = getCircularDiff(t, currentMinutes);
                if (diff >= -60 && diff <= 60)
                    defaultTimes.push(t);      // 前后 1 小时内（含跨天时刻）
                else if (t < currentMinutes - 60)
                    earlierTimes.push(t);      // 今天已过
                else if (t > currentMinutes + 60)
                    laterTimes.push(t);        // 今天未到
            }
        }
        earlierTimes.sort((a, b) => a - b);
        defaultTimes.sort((a, b) => a - b);
        laterTimes.sort((a, b) => a - b);
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
    // 列车纵向时刻表：随时间更新“已通过”站点变灰（跨天车次按自身时间轴对齐）
    const trainRows = document.querySelectorAll('.train-schedule-row[data-time]');
    for (const row of trainRows) {
        const t = parseInt(row.dataset.time, 10);
        if (isNaN(t)) continue;
        const firstT = parseInt(row.dataset.first, 10);
        const lastT = parseInt(row.dataset.last, 10);
        let aligned = currentMinutes;
        if (!isNaN(lastT) && lastT > 1440 && (currentMinutes <= lastT - 1440 || currentMinutes < firstT))
            aligned = currentMinutes + 1440;
        row.classList.toggle('passed', t + TRAIN_DWELL_MIN <= aligned);
    }
}

// ===========================
// 列车显示
// ===========================
// 列车数据位于 ./resource/train/{id}.json，顶层为 [上行, 下行]；
// 每个方向含 weekday / weekend 两组车次，每趟车记录各站进站时间（分钟，0 点起）。
// track 文件中的 main 同为 [上行, 下行] 两段轨道，列车沿对应方向轨道折线前进。
const TRAIN_DWELL_MIN = 45 / 60;  // 停站时长（分钟）
const trainGeoData = {};          // 各线路轨道几何缓存 {polylines, cumDists, stationDist}
const trainMarkers = {};          // 实时列车标记缓存 {key: marker}
const TrainIcon = L.DivIcon.extend({
    options: { trainColor: '#ff5722' },
    createIcon: function (oldIcon) {
        const div = L.DivIcon.prototype.createIcon.call(this, oldIcon);
        div.style.background = this.options.trainColor;
        return div;
    }
});

/** 加载线路列车数据 */
async function loadTrainData(lineId) {
    LoadingIndicator.show(`加载${lineId}列车数据...`);
    const url = `./resource/train/${lineId}.json`;
    try {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error('Train not found');
        const data = await res.json();
        trainPosData[lineId] = data;
        LoadingIndicator.hide();
        return data;
    } catch (e) {
        // 部分线路没有列车数据，属正常情况
        if (!/not found/i.test(e && e.message || ''))
            console.warn('加载列车数据失败:', lineId, e);
        LoadingIndicator.hide();
        return null;
    }
}

/** 计算折线各点的累计距离 */
function buildCumulativeDistances(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
        const dx = points[i][0] - points[i - 1][0];
        const dy = points[i][1] - points[i - 1][1];
        cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    return cum;
}

/** 将点投影到折线上，返回沿折线的距离 */
function projectToPolyline(point, points, cum) {
    let bestIdx = 0, bestT = 0, bestDist2 = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        let t = len2 > 1e-14 ? ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const px = a[0] + t * dx, py = a[1] + t * dy;
        const d2 = (point[0] - px) ** 2 + (point[1] - py) ** 2;
        if (d2 < bestDist2) {
            bestDist2 = d2;
            bestIdx = i;
            bestT = t;
        }
    }
    return cum[bestIdx] + bestT * (cum[bestIdx + 1] - cum[bestIdx]);
}

/** 取折线上指定距离处的坐标 */
function pointAtDistance(points, cum, dist) {
    const total = cum[cum.length - 1];
    if (dist <= 0) return points[0];
    if (dist >= total) return points[points.length - 1];
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < dist) i++;
    const segLen = cum[i + 1] - cum[i];
    const t = segLen > 1e-12 ? (dist - cum[i]) / segLen : 0;
    return [
        points[i][0] + t * (points[i + 1][0] - points[i][0]),
        points[i][1] + t * (points[i + 1][1] - points[i][1])
    ];
}

/**
 * 为线路构建列车定位几何
 * 每个方向：完整轨道折线 + 各站在折线上的距离；
 * 若折线方向与列车运行方向相反（部分线路 main 与车次方向不一致），自动反转折线。
 */
function prepareTrainGeometry(lineId) {
    const info = lineData[lineId];
    if (!info || !info.hasTrack) return false;
    const main = info.trackMain;
    if (!Array.isArray(main) || main.length < 2) return false;
    LoadingIndicator.show(`绘制${lineId}列车中...`);
    const trackStations = info.trackStations || [];
    const geo = { polylines: [[], []], cumDists: [[], []], stationDist: [{}, {}] };
    for (let d = 0; d < 2; d++) {
        const segs = main[d];
        if (!Array.isArray(segs)){
            LoadingIndicator.hide();
            return false;
        }
        let points = [];
        for (const seg of segs) {
            if (seg && Array.isArray(seg.points) && seg.points.length >= 2)
                for (const p of seg.points) points.push([p[0], p[1]]);
        }
        if (points.length < 2){
            LoadingIndicator.hide();
            return false;
        }
        let cum = buildCumulativeDistances(points);
        // 站点投影（按站名去重）
        const distMap = {};
        const seen = new Set();
        for (const st of trackStations) {
            if (!st || !st.n || seen.has(st.n)) continue;
            seen.add(st.n);
            distMap[st.n] = projectToPolyline(st.center, points, cum);
        }
        // 以覆盖站点最多的列车为方向参照
        const data = trainPosData[lineId];
        let ref = null;
        if (data && data[d]) {
            const list = (data[d].weekday && data[d].weekday.length) ? data[d].weekday : (data[d].weekend || []);
            for (const tr of list) {
                if (tr.stations && tr.stations.length >= 2 &&
                    (!ref || tr.stations.length > ref.stations.length))
                    ref = tr;
            }
        }
        if (ref) {
            const first = ref.stations[0].station;
            const last = ref.stations[ref.stations.length - 1].station;
            const dFirst = distMap[first], dLast = distMap[last];
            if (typeof dFirst === 'number' && typeof dLast === 'number' && dFirst > dLast) {
                points = points.slice().reverse();      // 反转折线
                cum = buildCumulativeDistances(points);
                const total = cum[cum.length - 1];
                for (const key of Object.keys(distMap)) // 镜像站点距离
                    distMap[key] = total - distMap[key];
            }
        }
        geo.polylines[d] = points;
        geo.cumDists[d] = cum;
        geo.stationDist[d] = distMap;
    }
    trainGeoData[lineId] = geo;
    LoadingIndicator.hide();
    return true;
}

/**
 * 计算列车当前沿轨道的距离位置
 * 到站时刻进站，停 45s 后发车；不在时刻表运行区间内返回 null（不显示）
 * @param {*} geo 线路轨道几何
 * @param {number} dirIdx 方向索引（0 上行 / 1 下行）
 */
function computeTrainPosition(geo, dirIdx, train, nowMin) {
    const sts = train.stations;
    if (!sts || sts.length < 2) return null;
    const stationDist = geo.stationDist[dirIdx];
    const matched = [];  // 只保留能在轨道上定位的站点
    for (const s of sts) {
        const dist = stationDist[s.station];
        if (dist !== undefined) matched.push({ time: s.time, dist: dist });
    }
    if (matched.length < 2) return null;
    const firstArrival = matched[0].time;
    const lastDeparture = matched[matched.length - 1].time + TRAIN_DWELL_MIN;
    if (nowMin < firstArrival || nowMin >= lastDeparture) return null;  // 未在时刻表内
    for (let i = 0; i < matched.length; i++) {
        const arrive = matched[i].time;
        const depart = arrive + TRAIN_DWELL_MIN;
        if (nowMin >= arrive && nowMin <= depart)       // 停站中
            return { dist: matched[i].dist };
        if (i < matched.length - 1 && nowMin > depart && nowMin < matched[i + 1].time) {
            const travel = matched[i + 1].time - depart;
            const f = travel > 1e-9 ? (nowMin - depart) / travel : 0;
            return { dist: matched[i].dist + f * (matched[i + 1].dist - matched[i].dist) };
        }
    }
    return null;
}

/** 更新所有列车位置（定时调用） */
function updateTrainPositions() {
    if (!map || !trainLayer) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const day = now.getDay();
    const kind = (day === 0 || day === 6) ? 'weekend' : 'weekday';
    const active = new Set();
    for (const [lineId, data] of Object.entries(trainPosData)) {
        const geo = trainGeoData[lineId];
        if (!geo) continue;
        const color = (lineData[lineId] && lineData[lineId].color) || '#808080';
        for (let d = 0; d < 2; d++) {
            const dir = data[d];
            if (!dir || !Array.isArray(dir[kind])) continue;
            const points = geo.polylines[d];
            const cum = geo.cumDists[d];
            for (const tr of dir[kind]) {
                const pos = computeTrainPosition(geo, d, tr, nowMin);
                if (!pos) continue;
                const key = `${lineId}-${d}-${tr.id}`;
                active.add(key);
                const latlng = L.latLng(pointAtDistance(points, cum, pos.dist));
                let marker = trainMarkers[key];
                if (marker) {
                    marker.setLatLng(latlng);
                } else {
                    marker = L.marker(latlng, {
                        icon: new TrainIcon({
                            className: 'train-icon',
                            html: '<i class="fas fa-train-subway"></i>',
                            iconSize: [20, 20],
                            iconAnchor: [10, 10],
                            trainColor: color
                        }),
                        interactive: true,
                        keyboard: false
                    });
                    marker.on('click', function () {
                        showTrainSchedule(lineId, d, tr);
                    });
                    marker.addTo(trainLayer);
                    trainMarkers[key] = marker;
                }
            }
        }
    }
    // 移除已不在时刻表上的列车
    for (const key of Object.keys(trainMarkers)) {
        if (!active.has(key)) {
            trainLayer.removeLayer(trainMarkers[key]);
            delete trainMarkers[key];
        }
    }
}

/**
 * 显示列车的纵向时刻表（点击列车时调用，与点击站点行为一致）
 * 每行显示进站时间 + 站点；已通过（发车）的站点变灰
 */
function showTrainSchedule(lineId, dirIdx, train) {
    const sts = train.stations || [];
    if (!sts.length) return;
    const lineInfo = lineData[lineId];
    const lineName = lineInfo ? lineInfo.name : lineId;
    const dirLabel = dirIdx === 0 ? '上行' : '下行';
    const first = sts[0].station;
    const last = sts[sts.length - 1].station;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    // 跨天对齐：末站时刻 > 1440（次日凌晨）的车次，凌晨时按自身时间轴对齐
    const firstTime = sts[0].time;
    const lastTime = sts[sts.length - 1].time;
    let alignedNow = nowMin;
    if (lastTime > 1440 && (nowMin <= lastTime - 1440 || nowMin < firstTime))
        alignedNow = nowMin + 1440;
    let html = `<h3>${lineName} · ${dirLabel}（${first} → ${last}）</h3>`;
    html += `<p class="train-schedule-meta">车次 ${train.id} · 已通过站点为灰色</p>`;
    html += '<div class="train-schedule">';
    for (const st of sts) {
        const passed = st.time + TRAIN_DWELL_MIN <= alignedNow;  // 已发车即已通过
        html += `<div class="train-schedule-row${passed ? ' passed' : ''}" data-time="${st.time}" data-first="${firstTime}" data-last="${lastTime}">`;
        html += `<span class="train-schedule-time">${minutesToHHMM(st.time)}</span>`;
        html += `<span class="train-schedule-station">${st.station}</span>`;
        html += '</div>';
    }
    html += '</div>';
    updateDrawerContent(html);
}

/** 初始化列车显示：加载各线路列车数据并定时更新位置 */
async function initTrainDisplay() {
    for (const id of Object.keys(lineData)) {
        const info = lineData[id];
        if (!info || !info.hasTrack) continue;
        const data = await loadTrainData(id);
        if (data)
            prepareTrainGeometry(id);
    }
    if (trainUpdateTimer)
        clearInterval(trainUpdateTimer);
    trainUpdateTimer = setInterval(updateTrainPositions, 1000);
    updateTrainPositions();
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
async function startLocationTracking() {
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
// 天气模块
// ===========================
const WEATHER_CACHE_KEY = 'beijing_weather_cache';

/** 获取当天日期的字符串，用于判断缓存是否过期 */
function getTodayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * 根据过敏指数等级和花粉等级生成过敏信息
 * @param {object} allergy - 过敏指数对象 { level, brief, advice }
 * @param {object} pollen - 花粉指数对象 { level, brief, advice }
 * @returns {object} { level: string, advice: string, color: string }
 */
function getAllergyInfo(allergy, pollen) {
    if (!allergy) {
        console.log(allergy, pollen);
        return {
            level: '未知',
            advice: '无过敏指数',
            color: 'gray'
        };
    }
    // 根据过敏等级和花粉等级综合判断
    const levelMap = {
        '低':    { label: '低',    color: '#43A047' },  // 鲜绿
        '较低':  { label: '低',    color: '#43A047' },
        '不易':  { label: '低',    color: '#43A047' },
        '中':    { label: '中',    color: '#FFA000' },  // 亮琥珀黄
        '中等':  { label: '中',    color: '#FFA000' },
        '较易':  { label: '中',    color: '#FFA000' },
        '较高':  { label: '较高',  color: '#E65100' },  // 亮橙
        '偏高':  { label: '较高',  color: '#E65100' },
        '易':    { label: '较高',  color: '#E65100' },
        '高':    { label: '高',    color: '#B71C1C' },  // 深红
        '很高':  { label: '高',    color: '#B71C1C' },
        '极高':  { label: '高',    color: '#B71C1C' },
        '极易':  { label: '高',    color: '#B71C1C' }
    };
    // 优先级数值（越大风险越高）
    const priorityMap = { '低': 1, '中': 2, '较高': 3, '高': 4 };
    const reverseMap = { 1: '低', 2: '中', 3: '较高', 4: '高' };
    const rawLevel = allergy.level;
    if (!rawLevel || !levelMap[rawLevel]) {
        console.log(allergy, pollen);
        return {
            level: rawLevel || '未知',   // 保留原始值，若没有则显示"未知"
            advice: '未知等级',
            color: 'gray'
        };
    }
    const baseInfo = levelMap[rawLevel];
    let finalPriority = priorityMap[baseInfo.label]; // 初始为过敏等级
    // 如果花粉指数存在且等级较高，提升过敏等级
    if (pollen && pollen.level) {
        const pollenRaw = pollen.level;
        // 花粉可能的等级文本也映射到统一标签
        const pollenMap = {
            '很低': '低', '低': '低', '较低': '低',
            '中': '中', '中等': '中',
            '较高': '较高', '偏高': '较高',
            '高': '高', '很高': '高', '极高': '高'
        };
        const pollenLabel = pollenMap[pollenRaw];
        if (pollenLabel) {
            const pollenPriority = priorityMap[pollenLabel];
            if (pollenPriority > finalPriority) {
                finalPriority = pollenPriority;
            }
        }
    }
    const finalLabel = reverseMap[finalPriority] || '中';
    const finalColor = levelMap[Object.keys(levelMap).find(k => levelMap[k].label === finalLabel)]?.color || '#FF9800';
    // 生成建议文案
    let advice = allergy.advice || '注意天气变化';
    if (pollen && pollen.brief)
        advice += `，花粉浓度${pollen.brief}`;
    else if (pollen && pollen.level) {
        // 若没有 brief，尝试从 pollen.level 生成描述
        const pollenDesc = pollen.level; // 直接使用原始值
        advice += `，花粉浓度${pollenDesc}`;
    }
    return {
        level: finalLabel,
        advice: advice,
        color: finalColor
    };
}

/** 获取并显示天气 */
async function fetchAndDisplayWeather() {
    /** 获取缓存的天气数据（按天缓存） */
    function getCachedWeather() {
        try {
            const cached = localStorage.getItem(WEATHER_CACHE_KEY);
            if (!cached) return null;
            const data = JSON.parse(cached);
            // 检查缓存日期是否为今天
            if (data.cacheDate !== getTodayDateStr()) {
                localStorage.removeItem(WEATHER_CACHE_KEY);
                return null;
            }
            return data.weather;
        } catch {
            return null;
        }
    }
    // 尝试读取缓存
    const cached = getCachedWeather();
    if (cached) {
        updateWeatherUI(cached);
        return;
    }
    // 缓存失效或无缓存，发起网络请求
    const weatherContainer = document.getElementById('weather-display');
    if (weatherContainer)
        weatherContainer.innerHTML = '<span class="weather-loading">⏳ 加载中...</span>';
    try {
        // 不传 city 参数，API 自动根据客户端 IP 定位
        const url = 'https://uapis.cn/api/v1/misc/weather?indices=true&extended=true&forecast=true';
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        // 检查是否有错误码
        if (data.code)
            throw new Error(data.message || 'API返回错误');
        // 提取今日预报（forecast 数组的第一条）
        const todayForecast = data.forecast && data.forecast.length > 0 ? data.forecast[0] : {};
        // 提取生活指数
        const lifeIndices = data.life_indices || {};
        const allergy = lifeIndices.allergy || null;   // 过敏指数
        const pollen = lifeIndices.pollen || null;     // 花粉指数
        const weatherInfo = {
            city: data.city || '未知',                          // 城市名
            district: data.district || '',                     // 区县
            weather: data.weather || '--',                     // 天气状况
            tempMax: todayForecast.temp_max || data.temp_max || '--', // 当日最高温
            tempMin: todayForecast.temp_min || data.temp_min || '--', // 当日最低温
            humidity: `${data.humidity}%` || '--%',                  // 湿度
            aqi: data.aqi || '--',                             // AQI
            aqiCategory: data.aqi_category || '--',            // AQI等级描述
            pm25: data.air_pollutants?.pm25 || '--',           // PM2.5
            reportTime: data.report_time || '',                // 数据更新时间
            allergy: getAllergyInfo(allergy, pollen),          // 过敏信息（含花粉综合）
            // 保留原始指数供扩展
            _raw: { allergy, pollen }
        };
        // 缓存数据
        try {
            localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
                weather: weatherInfo,
                cacheDate: getTodayDateStr()
            }));
        } catch (e) {
            console.warn('缓存天气数据失败:', e);
        }
        // 更新UI
        updateWeatherUI(weatherInfo);
    } catch (error) {
        console.error('获取天气失败:', error);
        const container = document.getElementById('weather-display');
        if (container) {
            container.innerHTML = `
                <span class="weather-error" title="${error.message}">
                    ⚠️ 天气加载失败
                </span>
            `;
        }
    }
}

/** 更新天气UI（显示在左上角） */
function updateWeatherUI(info) {
    const container = document.getElementById('weather-display');
    if (!container) return;
    const allergy = info.allergy;
    const tempRange = `${info.tempMin}~${info.tempMax}°C`;
    container.innerHTML = `
        <div class="weather-widget">
            <div class="weather-main">
                <span class="weather-city">${info.city}</span>
                <span class="weather-temp">${tempRange}</span>
                <span class="weather-type">${info.weather}</span>
            </div>
            <div class="weather-detail">
                <span class="weather-humidity">💧 ${info.humidity}</span>
                <span class="weather-aqi">AQI ${info.aqi}</span>
                <span class="weather-pm">PM${info.pm25}</span>
                <span>· ${info.aqiCategory}</span>
            </div>
            <div class="weather-allergy">
                <span class="allergy-dot" style="background:${allergy.color}"></span>
                <span class="allergy-label">过敏 ${allergy.level}</span>
                <span class="allergy-advice" title="${allergy.advice}">${allergy.advice}</span>
            </div>
            <div class="weather-update">更新 ${info.reportTime}</div>
        </div>
    `;
    // 将更新时间放到 title 属性中（鼠标悬停可见）
    container.title = `数据更新于 ${info.reportTime}`;
}

// 创建天气显示DOM元素（注入到左上角）
function initWeather() {
    // 检查是否已存在
    if (document.getElementById('weather-display'))
        return;
    const widget = document.createElement('div');
    widget.id = 'weather-display';
    widget.className = 'weather-widget-container';
    // 插入到地图容器左上角（在map容器内）
    const mapContainer = document.getElementById('map');
    if(mapContainer)
        mapContainer.appendChild(widget);
    else
        document.body.appendChild(widget);
    fetchAndDisplayWeather();
}

// ===========================
// 启动入口与启动函数
// ===========================
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([39.9, 116.4], 10);
    tileLayer = createTileLayer(true).addTo(map);
    lineLayer = L.layerGroup().addTo(map);
    trainLayer = L.layerGroup().addTo(map);
    // 设置copyright
    map.attributionControl.setPrefix('');
    map.attributionControl.addAttribution('&copy; <a href="https://www.amap.com/">高德地图</a>');
    map.on('zoomend', updateLineVisibility);
}

document.addEventListener('DOMContentLoaded', function() {
    initMap();
    if(typeof initDebug === 'function')
        initDebug();
    initWeather();  // 创建天气组件并加载数据
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