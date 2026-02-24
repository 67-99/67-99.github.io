import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs';

/**
 * 检查资源是否存在
 * @param {string} url - 要检查的资源URL
 * @param {number} timeout - 超时时间（毫秒），默认3000ms
 * @returns {Promise<boolean>} - 资源是否存在
 */
async function checkResourceExists(url, timeout = 3000){
    if(!url)
        return false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if(url.startsWith('http://') || url.startsWith('https://')) {
        // 外部链接：进行简化检查（避免跨域限制）
        try {
            // 对于外部资源，使用no-cors模式避免CORS限制
            // 注意：no-cors模式下无法读取响应状态
            await fetch(url, {method: 'HEAD', mode: 'no-cors', signal: controller.signal, cache: 'no-store'});
            clearTimeout(timeoutId);
            // no-cors模式下，只要请求能发出（网络可达）就认为存在
            // 注意：这无法区分404和200，但能判断网络可达性
            return true;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                console.warn(`外部资源检查超时: ${url}`);
                return false;
            }
            console.warn(`外部资源检查失败: ${url}`, error);
            return false;
        }
    }
    // 内部资源：使用HEAD方法（只获取头部，不下载内容）
    try {
        // 使用HEAD方法，只获取响应头，不下载内容主体
        const response = await fetch(url, {method: 'HEAD', signal: controller.signal, cache: 'no-store', headers: {
                                    'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache'}});
        clearTimeout(timeoutId);
        // 对于内部资源，我们可以精确判断状态码
        // 200-299: 资源存在且正常
        // 304: 资源存在且未修改（缓存有效）
        // 401/403: 资源存在但无权访问（也算存在）
        // 404: 资源不存在
        // 其他4xx/5xx: 视为不存在
        return response.ok || response.status === 304 || 
               response.status === 401 || response.status === 403;
    } catch (error) {
        clearTimeout(timeoutId);
        // 根据不同错误类型处理
        if (error.name === 'AbortError') {
            console.warn(`资源检查超时: ${url}`);
            return false; // 超时视为不可用
        }
        console.warn(`资源检查失败: ${url}`, error);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // 全局变量
    /** @type {Array<{startDate: Date, endDate: Date} & Object.<string, string>>} */
    let artworks = [];
    let timeMarkers = [];
    let currentTimeIndex = 0;
    
    // DOM元素
    const imagesContainer = document.getElementById('images-container');
    const emptyState = document.getElementById('empty-state');
    const timelineCursor = document.getElementById('timeline-cursor');
    const timeMarkersContainer = document.querySelector('.time-markers-container');
    const cursorDate = document.getElementById('cursor-date');
    const pdfModal = document.getElementById('pdf-modal');
    const pdfModalClose = document.getElementById('pdf-modal-close');
    const pdfViewer = document.getElementById('pdf-viewer');
    const pdfModalTitle = document.getElementById('pdf-modal-title');
    const pdfStartDate = document.getElementById('pdf-start-date');
    const pdfEndDate = document.getElementById('pdf-end-date');
    
    /**
     * 格式化日期
     * @param {Date} date 
     * @returns {string}
     */
    function formatDate(date) {
        return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    }

    // 加载数据
    async function loadArtworks() {
        try {
            // 从JSON文件加载数据
            const response = await fetch('images.json');
            artworks = await response.json();
            // 处理日期并排序
            artworks.forEach(artwork => {
                // 解析起始日期
                artwork.startDate = (artwork.start && artwork.start !== "old")? new Date(artwork.start): new Date();
                artwork.endDate = artwork.end? new Date(artwork.end): artwork.startDate;  // 如果没有结束日期，使用开始日期
            });
            // 按开始日期排序（最新的在前面）
            artworks.sort((a, b) => {
                const dateA = new Date(a.end) || 0;
                const dateB = new Date(b.end) || 0;
                return dateB - dateA;
            });
            // 获取时间范围
            const dates = artworks.map(art => art.startDate.getTime());
            const years = artworks.map(art => art.startDate.getFullYear());
            const Dates = {
                MIN_TIME: Math.min(...dates),
                MAX_TIME: Date.now(),
                TIME_RANGE: Math.max(Date.now() - Math.min(...dates), 1),
                MIN_YEAR: Math.min(...years),
                MAX_YEAR: new Date().getFullYear()
            };
            (window || global).Dates = Object.freeze(Dates);
            artworks.forEach(artwork => {
                // 处理无日期数据
                if(artwork.start == "old")
                    artwork.startDate = artwork.endDate = new Date(Dates.MIN_TIME);
            });
            // 初始化时间轴
            initTimeline();
            
            // 渲染所有作品
            renderArtworks();
            
            // 添加滚动监听
            addScrollListener();
        } catch (error) {
            console.error('加载作品数据失败:', error);
            emptyState.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <h3>加载失败</h3>
                <p>无法加载作品数据，请检查网络连接或数据文件</p>
                <button class="pdf-view-btn" onclick="location.reload()" style="margin-top: 20px;">重试</button>
            `;
            emptyState.style.display = 'block';
        }
    }
    
    // 初始化时间轴
    function initTimeline() {
        if (artworks.length === 0) return;
        // 清空时间点标记
        timeMarkersContainer.innerHTML = '';
        timeMarkers = [];
        // 更新年份显示
        const timeline = document.querySelector('.timeline-ascii');
        let html = '';
        for (let year = Dates.MAX_YEAR; year > Dates.MIN_YEAR; year--) {
            const pos = (Dates.MAX_TIME - (new Date(year, 0, 1).getTime())) / Dates.TIME_RANGE;
            html += `
                <div class="year-label" style="top: ${pos * 100}%;">
                    <span class="year-text">${year}</span>
                    <div class="line-horizontal"></div>
                </div>
            `;
        }
        timeline.innerHTML = html;
        // 创建时间点标记
        artworks.forEach((artwork, index) => {
            createTimeMarker(artwork, index);
        });
        if(artworks.length > 0)  // 设置初始游标位置（最新作品）
            setCursorPosition(0);
        // 添加游标拖动功能
        initCursorDrag();
    }
    
    // 创建时间点标记
    function createTimeMarker(artwork, index) {
        // 创建标记元素
        const position = (Dates.MAX_TIME - artwork.endDate.getTime()) / Dates.TIME_RANGE;
        const marker = document.createElement('div');
        marker.className = 'time-marker has-work';
        marker.style.top = `${position * 100}%`;
        marker.dataset.index = index;
        // 构建点
        const dot = document.createElement('div');
        dot.className = 'time-dot';
        dot.title = artwork.end ? formatDate(new Date(artwork.end)) : '';
        marker.appendChild(dot);
        timeMarkersContainer.appendChild(marker);
        timeMarkers.push({
            element: marker,
            index: index,
            position: position,
            topPosition: position * timeMarkersContainer.offsetHeight
        });
        // 点击事件
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            setCursorPosition(index);
            scrollToImage(index);
        });
    }
    
    // 初始化游标拖动
    function initCursorDrag() {
        let isDragging = false;
        let startY = 0;
        let startTop = 0;
        
        timelineCursor.addEventListener('mousedown', startDrag);
        timelineCursor.addEventListener('touchstart', startDrag);
        
        function startDrag(e) {
            e.preventDefault();
            isDragging = true;
            
            if (e.type === 'mousedown') {
                startY = e.clientY;
            } else {
                startY = e.touches[0].clientY;
            }
            
            const containerRect = timeMarkersContainer.getBoundingClientRect();
            startTop = parseInt(timelineCursor.style.top) || 0;
            
            document.addEventListener('mousemove', drag);
            document.addEventListener('touchmove', drag);
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }
        
        function drag(e) {
            if (!isDragging) return;
            
            let clientY;
            if (e.type === 'mousemove') {
                clientY = e.clientY;
            } else {
                clientY = e.touches[0].clientY;
            }
            
            const containerRect = timeMarkersContainer.getBoundingClientRect();
            const deltaY = clientY - startY;
            const containerHeight = containerRect.height;
            
            let newTop = startTop + deltaY;
            newTop = Math.max(0, Math.min(containerHeight, newTop));
            
            // 更新游标位置
            timelineCursor.style.top = `${newTop}px`;
            
            // 计算对应的时间
            const position = newTop / containerHeight;
            const time = Dates.MAX_TIME - position * Dates.TIME_RANGE;
            
            // 找到最近的作品
            findNearestArtwork(time);
        }
        
        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('touchmove', drag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
        }
        
        // 点击时间轴也可以移动游标
        timeMarkersContainer.addEventListener('click', (e) => {
            const containerRect = timeMarkersContainer.getBoundingClientRect();
            const clickY = e.clientY - containerRect.top;
            
            const position = clickY / containerRect.height;
            const time = Dates.MAX_TIME - position * Dates.TIME_RANGE;
            findNearestArtwork(time);
        });
    }
    
    // 找到最近的作品
    function findNearestArtwork(targetTime) {
        if (artworks.length === 0) return;
        
        // 找到时间最接近的作品
        let nearestIndex = 0;
        let minDiff = Math.abs(artworks[0].endDate.getTime() - targetTime);
        
        for (let i = 1; i < artworks.length; i++) {
            const diff = Math.abs(artworks[i].endDate.getTime() - targetTime);
            if (diff < minDiff) {
                minDiff = diff;
                nearestIndex = i;
            }
        }
        
        setCursorPosition(nearestIndex);
        scrollToImage(nearestIndex);
    }
    
    // 设置游标位置
    function setCursorPosition(index) {
        if (index < 0 || index >= artworks.length) return;
        
        currentTimeIndex = index;
        const artwork = artworks[index];
        
        // 计算位置
        const artworkTime = artwork.endDate.getTime();
        const position = (Dates.MAX_TIME - artworkTime) / Dates.TIME_RANGE;
        
        // 计算相对于时间轴容器的高度
        const containerHeight = timeMarkersContainer.offsetHeight;
        const topPosition = position * containerHeight;
        
        // 更新游标位置
        timelineCursor.style.top = `${topPosition}px`;
        
        // 更新游标日期显示
        let dateText = "未知";
        if (artwork.end) {
            dateText = formatDate(new Date(artwork.end));
        }
        cursorDate.textContent = dateText;
        
        // 更新时间点标记的活跃状态
        document.querySelectorAll('.time-marker').forEach(marker => {
            marker.classList.remove('active');
        });
        
        if (timeMarkers[index]) {
            timeMarkers[index].element.classList.add('active');
        }
    }
    
    // 滚动到指定图片
    function scrollToImage(index) {
        const imageElements = document.querySelectorAll('.image-item');
        if (imageElements[index]) {
            imageElements[index].scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }
    
    // 添加滚动监听
    function addScrollListener() {
        let scrollTimeout;
        
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                updateCursorBasedOnScroll();
            }, 100);
        });
    }
    
    // 根据滚动位置更新游标
    function updateCursorBasedOnScroll() {
        if (artworks.length === 0) return;
        
        const imageElements = document.querySelectorAll('.image-item');
        const viewportHeight = window.innerHeight;
        const scrollTop = window.scrollY;
        
        let bestIndex = 0;
        let minDistance = Infinity;
        
        // 找到最接近视口中部的图片
        imageElements.forEach((element, index) => {
            const rect = element.getBoundingClientRect();
            const elementTop = rect.top + scrollTop;
            const elementCenter = elementTop + rect.height / 2;
            const viewportCenter = scrollTop + viewportHeight / 2;
            const distance = Math.abs(elementCenter - viewportCenter);
            
            if (distance < minDistance) {
                minDistance = distance;
                bestIndex = index;
            }
        });
        
        // 更新游标位置
        if (bestIndex !== currentTimeIndex) {
            setCursorPosition(bestIndex);
        }
    }
    
    // 渲染作品
    function renderArtworks() {
        // 清空容器
        imagesContainer.innerHTML = '';
        if (artworks.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        emptyState.style.display = 'none';
        // 创建所有作品元素
        artworks.forEach((artwork, index) => {
            const artworkElement = createArtworkElement(artwork, index);
            imagesContainer.appendChild(artworkElement);
        });
    }
    
    async function loadPDFWithPDFJS(pdfUrl, canvas, fallbackIcon, loader) {
        try {
            // 显示加载指示器
            loader.style.display = 'flex';
            fallbackIcon.style.display = 'none';
            canvas.style.display = 'none';
            // 加载PDF文档
            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            // 设置canvas尺寸为PDF页面原始尺寸
            const viewport = page.getViewport({ scale: (isMobile ? 0.25 : 0.5) });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            // 渲染PDF页面
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);
            const renderContext = {
                canvasContext: context,
                viewport: viewport,
                transform: [1, 0, 0, 1, 0, 0]
            };
            await page.render(renderContext).promise;
            // 显示canvas，隐藏加载器和图标
            canvas.style.display = 'block';
            loader.style.display = 'none';
            fallbackIcon.style.display = 'none';
            pdf.destroy();  // 清理内存
        }
        catch (error){  // 加载失败，显示PDF图标
            canvas.style.display = 'none';
            loader.style.display = 'none';
            fallbackIcon.style.display = 'block';
        }
    }


    /**
     * 创建作品元素
     * @param {{startDate: Date, endDate: Date} & Object.<string, string>} artwork 
     * @param {number} index 
     * @returns {HTMLDivElement} 生成的`<div class=image-item>`元素
     */
    function createArtworkElement(artwork, index) {
        const item = document.createElement('div');
        item.className = 'image-item';
        item.dataset.index = index;
        // 预览区域
        const preview = document.createElement('div');
        preview.className = 'image-preview';
        // 显示预览
        function loadSrc(src, onerror = undefined){
            if(!src){
                if(onerror)
                    onerror();
                return;
            }
            // 如果是PDF，显示PDF
            if(src.toLowerCase().endsWith('.pdf')){
                // 创建PDF显示容器
                const pdfContainer = document.createElement('div');
                pdfContainer.className = 'pdf-preview lazy-pdf';
                const pdfCanvas = document.createElement('canvas');
                pdfCanvas.className = 'pdf-canvas';
                const pdfIcon = document.createElement('i');  // 创建PDF图标作为fallback
                pdfIcon.className = 'fas fa-file-pdf pdf-icon pdf-fallback-icon';
                const loader = document.createElement('div');  // 创建加载指示器
                loader.className = 'pdf-loader';
                loader.innerHTML = '<span>加载中...</span>';
                pdfContainer.appendChild(pdfCanvas);
                pdfContainer.appendChild(pdfIcon);
                pdfContainer.appendChild(loader);
                pdfContainer.dataset.src = src;
                pdfContainer.dataset.index = index;
                lazyPDFObserver.observe(pdfContainer);
                preview.appendChild(pdfContainer);
            }
            else{
                // 如果是图片，显示图片
                const img = document.createElement('img');
                img.src = src;
                img.alt = artwork.title || '';
                img.loading = 'lazy';
                img.onerror = onerror || function() {
                    // 如果图片加载失败，显示PDF图标
                    this.style.display = 'none';
                    this.remove();
                    const pdfIcon = document.createElement('i');
                    pdfIcon.className = 'fas fa-file-pdf pdf-icon pdf-fallback-icon';
                    preview.appendChild(pdfIcon);
                };
                preview.appendChild(img);
            }
        }
        imgSrc = artwork.src? artwork.src.replace(/\.[^./]+$/, '.png'): "";
        checkResourceExists(imgSrc).then((imgExists) => {
            if(imgExists)
                loadSrc(imgSrc, () => loadSrc(artwork.src));
            else
                loadSrc(artwork.src);
        });
        // 信息区域
        const info = document.createElement('div');
        info.className = 'image-info';
        if(artwork.title && artwork.title.trim() !== ''){  // 标题（只有存在时才显示）
            const title = document.createElement('h3');
            title.className = 'image-title';
            title.textContent = artwork.title;
            info.appendChild(title);
        }
        // 日期
        if(artwork.start){
            const dates = document.createElement('div');
            dates.className = 'image-dates';
            let datesText = artwork.start !== "old"? formatDate(new Date(artwork.start)):  "未知";
            if(artwork.end)
                datesText += ` ~ ${formatDate(new Date(artwork.end))}`;
            dates.innerHTML = `<i class="far fa-calendar-alt"></i> ${datesText}`;
            info.appendChild(dates);
        }
        item.appendChild(preview);
        item.appendChild(info);
        
        // 点击打开预览
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.pdf-view-btn')) {
                e.preventDefault();
                openPDFModal(artwork);
            }
        });
        
        return item;
    }
    
    /**
     * 打开PDF预览模态框
     * @param {{startDate: Date, endDate: Date} & Object.<string, string>} artwork 
     */
    function openPDFModal(artwork){
        // 生成标题、日期
        pdfModalTitle.textContent = (artwork.start && artwork.start !== "old")? artwork.start: "纸绘";
        if(artwork.end)
            pdfModalTitle.textContent += " ~ " + formatDate(new Date(artwork.end));
        pdfStartDate.textContent = (artwork.start && artwork.start !== "old")? formatDate(new Date(artwork.start)): '未知';
        pdfEndDate.textContent = artwork.end? formatDate(new Date(artwork.end)): '未知';
        // 设置查看器
        if (artwork.src.toLowerCase().endsWith('.pdf'))
            pdfViewer.src = `${artwork.src}#page=1&toolbar=0`;
        else
            pdfViewer.src = artwork.src;
        // 显示模态框
        pdfModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    // 关闭PDF预览模态框
    function closePDFModal() {
        pdfModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        pdfViewer.src = '';
    }
    
    // 事件监听器
    // 模态框事件
    pdfModalClose.addEventListener('click', closePDFModal);
    
    // 点击模态框背景关闭
    pdfModal.addEventListener('click', function(e) {
        if (e.target === this) {
            closePDFModal();
        }
    });
    
    // 键盘导航
    document.addEventListener('keydown', function(e) {
        if (pdfModal.style.display === 'flex') {
            if (e.key === 'Escape') {
                closePDFModal();
            }
        }
    });
    
    // 移动端菜单
    const mobileMenu = document.querySelector('.mobile-menu');
    const navLinks = document.querySelector('.nav-links');
    
    if (mobileMenu) {
        mobileMenu.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            
            if (navLinks.classList.contains('active')) {
                navLinks.style.display = 'block';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '100%';
                navLinks.style.left = '0';
                navLinks.style.right = '0';
                navLinks.style.backgroundColor = 'var(--bg-card)';
                navLinks.style.flexDirection = 'column';
                navLinks.style.padding = '20px';
                navLinks.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
                
                const dropdowns = navLinks.querySelectorAll('.dropdown-menu');
                dropdowns.forEach(dropdown => {
                    dropdown.style.position = 'static';
                    dropdown.style.opacity = '1';
                    dropdown.style.visibility = 'visible';
                    dropdown.style.transform = 'none';
                    dropdown.style.boxShadow = 'none';
                    dropdown.style.borderTop = 'none';
                    dropdown.style.paddingLeft = '20px';
                });
            } else {
                navLinks.style.display = 'none';
            }
        });
    }
    
    // 窗口大小改变时重新计算位置
    window.addEventListener('resize', () => {
        // 重新计算时间点位置
        if (artworks.length > 0) {
            initTimeline();
            // 恢复游标位置
            setCursorPosition(currentTimeIndex);
        }
    });
    
    // PDF加载监测器
    const lazyPDFObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const container = entry.target;
                const canvas = container.querySelector('.pdf-canvas');
                if (container.dataset.src && canvas && !canvas.dataset.rendered) {
                    canvas.dataset.rendered = 'true';  // 标记已渲染，避免重复
                    const icon = container.querySelector('.pdf-fallback-icon');
                    const loader = container.querySelector('.pdf-loader');
                    loadPDFWithPDFJS(container.dataset.src, canvas, icon, loader);  // 调用渲染函数
                    observer.unobserve(container);  // 渲染后可以停止观察
                }
            }
        });
    }, {
        rootMargin: '200px 0px',
        threshold: 0.01
    });

    // 初始化
    const isMobile = window.innerWidth < 768;
    loadArtworks();
});