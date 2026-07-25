// ===================== 在 DOM 就绪后执行 =====================
document.addEventListener('DOMContentLoaded', function() {
    // ---- 地图初始化 ----
    var map = L.map('map').setView([39.9, 116.4], 10);
    var satellite = true;
    L.tileLayer(`https://wprd01.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&lang=zh_cn&style=${satellite ? 6 : 7}&ltype=2`).addTo(map);
    var attribution = map.attributionControl;
    attribution.setPrefix('');
    attribution.addAttribution('&copy; <a href="https://www.amap.com/">高德地图</a>');


    // ---- 线路存储 ----
    var lineLayer = L.layerGroup().addTo(map);
    var lineData = {};  // { id: { name, bounds, group, layers: [] } }

    // ---- 加载单个线路 ----
    function loadLineFile(id) {
        const url = `./resource/lines/${id}.json`;
        return fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`加载 ${id} 失败 (${res.status})`);
                return res.json();
            })
            .then(data => {
                const segments = data.points; // 期望结构: [[priority, [(lat,lng), ...]], ...]
                if (!segments || segments.length === 0) {
                    console.warn('线路无有效段', id);
                    return;
                }

                // 颜色：优先使用 data.color，否则默认灰色
                const color = data.color || '#808080';

                // 创建一个 FeatureGroup 来容纳所有子折线
                const group = L.featureGroup();
                const layers = [];

                // 遍历每个段
                segments.forEach(([priority, pts]) => {
                    if (!pts || pts.length < 2) return; // 至少需要两个点
                    // 创建 polyline
                    const polyline = L.polyline(pts, {
                        color: color,
                        weight: 4,
                        opacity: 0.8,
                        smoothFactor: 1,
                        // 可以保留 priority 作为自定义属性，以备后用
                        priority: priority
                    });
                    group.addLayer(polyline);
                    layers.push(polyline);
                });

                // 如果没有任何有效段，跳过
                if (layers.length === 0) {
                    console.warn('线路无有效折线段', id);
                    return;
                }

                // 计算整体边界
                const bounds = group.getBounds();

                // 存储信息
                lineData[id] = {
                    name: data.name || id,
                    bounds: bounds,
                    group: group,
                    layers: layers
                };

                // 添加到地图
                lineLayer.addLayer(group);
                return id;
            })
            .catch(err => console.error(err));
    }

    // ---- 加载所有线路 ----
    function loadAllLines() {
        fetch('./resource/lines/lines.json')
            .then(res => {
                if (!res.ok) throw new Error('lines 不存在');
                return res.json();
            })
            .then(ids => {
                return Promise.all(ids.map(id => loadLineFile(id)));
            })
            .then(() => {
                populateDrawer();
            })
            .catch(err => {
                console.warn('未找到 lines');
                const ids = ['M1', "M1E", 'M2'];
                Promise.all(ids.map(id => loadLineFile(id))).then(populateDrawer);
            });
    }

    // ---- 填充底部面板 ----
    function populateDrawer() {
        const ul = document.getElementById('lineList');
        ul.innerHTML = '';
        for (const [id, info] of Object.entries(lineData)) {
            const li = document.createElement('li');
            li.innerHTML = `<span>${info.name}</span><span class="badge">${id}</span>`;
            li.addEventListener('click', function() {
                // 缩放至该线路整体范围
                if (info.bounds && info.bounds.isValid()) {
                    map.fitBounds(info.bounds, { padding: [30, 30] });
                }
                // 高亮所有子折线（临时变色）
                info.layers.forEach(layer => {
                    layer.setStyle({ color: '#ff7800', weight: 6 });
                });
                setTimeout(() => {
                    info.layers.forEach(layer => {
                        layer.setStyle({ color: dataColor || '#808080', weight: 4 });
                    });
                }, 1000);
            });
            ul.appendChild(li);
        }
    }

    // ===================== 抽屉拖拽交互 =====================
    const drawer = document.getElementById('drawer');
    const handle = document.getElementById('drawerHandle');
    let isDragging = false;
    let startY = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', function(e) {
        isDragging = true;
        startY = e.clientY;
        startHeight = drawer.offsetHeight;
        document.body.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const diff = startY - e.clientY; // 向上拖拽增加高度
        let newHeight = Math.min(window.innerHeight * 0.6, Math.max(40, startHeight + diff));
        drawer.style.height = newHeight + 'px';
        drawer.classList.toggle('open', newHeight > 60);
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = '';
            // 如果高度小于阈值则自动收起
            if (drawer.offsetHeight < 80) {
                drawer.style.height = '40px';
                drawer.classList.remove('open');
            }
        }
    });

    // 触摸支持
    handle.addEventListener('touchstart', function(e) {
        const touch = e.touches[0];
        isDragging = true;
        startY = touch.clientY;
        startHeight = drawer.offsetHeight;
    });

    document.addEventListener('touchmove', function(e) {
        if (!isDragging) return;
        const touch = e.touches[0];
        const diff = startY - touch.clientY;
        let newHeight = Math.min(window.innerHeight * 0.6, Math.max(40, startHeight + diff));
        drawer.style.height = newHeight + 'px';
        drawer.classList.toggle('open', newHeight > 60);
    });

    document.addEventListener('touchend', function() {
        if (isDragging) {
            isDragging = false;
            if (drawer.offsetHeight < 80) {
                drawer.style.height = '40px';
                drawer.classList.remove('open');
            }
        }
    });

    // ===================== 定位相关 =====================
    var locationMarker = null;      // 当前位置标记
    var locationCircle = null;      // 精度圈
    var lastLocation = null;
    var watchId = null;

    // 定位成功回调
    function onLocationFound(latlng, accuracy) {
        if (!locationMarker) {
            // 首次定位：创建标记和精度圈
            locationMarker = L.marker(latlng, {
                icon: L.divIcon({
                    className: 'location-marker',
                    html: '<i class="fas fa-location-dot" style="font-size:28px;color:#ff4d4f;text-shadow:0 0 4px rgba(255,255,255,0.8);"></i>',
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                })
            }).addTo(map);

            locationCircle = L.circle(latlng, {
                radius: accuracy || 50,
                color: '#4d8aff',
                fillColor: '#4d8aff',
                fillOpacity: 0.15,
                weight: 1,
                dashArray: '5,5'
            }).addTo(map);

            // 首次定位后，缩放至当前位置（级别15）
            map.setView(latlng, 15);
        } else {
            // 更新标记位置和精度圈
            locationMarker.setLatLng(latlng);
            if (locationCircle) {
                locationCircle.setLatLng(latlng);
                if (accuracy) {
                    locationCircle.setRadius(accuracy);
                }
            }
        }
        lastLocation = latlng;
    }

    // 定位失败回调
    function onLocationError(error) {
        console.warn('定位失败:', error.message);
        // 可在地图上显示提示
        var popup = L.popup({ closeOnClick: false })
            .setLatLng(map.getCenter())
            .setContent('无法获取当前位置，请检查GPS或网络权限')
            .openOn(map);
        // 3秒后自动关闭
        setTimeout(function() {
            map.closePopup(popup);
        }, 3000);
    }

    // 启动定位
    function startLocationTracking() {
        if (!navigator.geolocation) {
            console.warn('浏览器不支持地理定位');
            return;
        }

        // watchPosition 选项：
        // enableHighAccuracy: true 使用GPS（移动端更准）
        // timeout: 10000 10秒超时
        // maximumAge: 30000 允许使用30秒内的缓存位置，即每30秒强制刷新一次
        var options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000   // 关键：每30秒更新一次
        };

        watchId = navigator.geolocation.watchPosition(
            function(pos) {
                var latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
                var accuracy = pos.coords.accuracy;
                onLocationFound(latlng, accuracy);
            },
            onLocationError,
            options
        );
    }

    // 停止定位（可选，例如页面卸载时）
    function stopLocationTracking() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    }

    // 页面关闭时停止定位（可选）
    window.addEventListener('beforeunload', function() {
        stopLocationTracking();
    });

    // ---- 启动 ----
    loadAllLines();
    startLocationTracking();  // 启动定位
});