document.addEventListener('DOMContentLoaded', function() {
    // 全局变量
    let artworks = [];
    let timeMarkers = [];
    let currentTimeIndex = 0;
    
    // DOM元素
    const imagesContainer = document.getElementById('images-container');
    const emptyState = document.getElementById('empty-state');
    const currentDateRange = document.getElementById('current-date-range');
    const timelineCursor = document.getElementById('timeline-cursor');
    const timelineTrack = document.querySelector('.timeline-track');
    const yearLabelsContainer = document.querySelector('.year-labels');
    const timelinePrevBtn = document.getElementById('timeline-prev');
    const timelineNextBtn = document.getElementById('timeline-next');
    const pdfModal = document.getElementById('pdf-modal');
    const pdfModalClose = document.getElementById('pdf-modal-close');
    const pdfViewer = document.getElementById('pdf-viewer');
    const pdfModalTitle = document.getElementById('pdf-modal-title');
    const pdfStartDate = document.getElementById('pdf-start-date');
    const pdfEndDate = document.getElementById('pdf-end-date');
    const pdfDownloadBtn = document.getElementById('pdf-download-btn');
    
    // 加载数据
    async function loadArtworks() {
        try {
            // 从JSON文件加载数据
            const response = await fetch('images.json');
            artworks = await response.json();
            
            // 处理日期并排序（最新的在前面）
            artworks.forEach(artwork => {
                // 解析日期
                if (artwork.start) {
                    artwork.startDate = new Date(artwork.start);
                    artwork.startYear = artwork.startDate.getFullYear();
                    artwork.startMonth = artwork.startDate.getMonth() + 1;
                }
                
                if (artwork.end) {
                    artwork.endDate = new Date(artwork.end);
                    artwork.endYear = artwork.endDate.getFullYear();
                    artwork.endMonth = artwork.endDate.getMonth() + 1;
                } else {
                    // 如果没有结束日期，使用开始日期
                    artwork.endDate = artwork.startDate;
                    artwork.endYear = artwork.startYear;
                    artwork.endMonth = artwork.startMonth;
                }
                
                // 计算中间日期用于时间轴定位
                if (artwork.startDate && artwork.endDate) {
                    const timeDiff = artwork.endDate.getTime() - artwork.startDate.getTime();
                    artwork.midDate = new Date(artwork.startDate.getTime() + timeDiff / 2);
                } else if (artwork.startDate) {
                    artwork.midDate = artwork.startDate;
                } else {
                    artwork.midDate = new Date();
                }
            });
            
            // 按开始日期排序（最新的在前面）
            artworks.sort((a, b) => {
                const dateA = a.midDate || new Date(a.start) || new Date();
                const dateB = b.midDate || new Date(b.start) || new Date();
                return dateB - dateA;
            });
            
            // 初始化时间轴
            initTimeline();
            
            // 渲染所有作品
            renderArtworks();
            
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
        
        // 清空时间轴
        const existingMarkers = document.querySelectorAll('.time-marker');
        existingMarkers.forEach(marker => marker.remove());
        
        yearLabelsContainer.innerHTML = '';
        timeMarkers = [];
        
        // 获取时间范围
        const dates = artworks.map(art => art.midDate.getTime());
        const minTime = Math.min(...dates);
        const maxTime = Math.max(...dates);
        const timeRange = maxTime - minTime;
        
        // 获取年份范围
        const years = artworks.map(art => art.startYear || art.midDate.getFullYear());
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        
        // 创建年份标签
        createYearLabels(minYear, maxYear);
        
        // 创建时间点标记
        artworks.forEach((artwork, index) => {
            createTimeMarker(artwork, index, minTime, timeRange);
        });
        
        // 设置初始游标位置（最新作品，在时间轴顶部）
        if (artworks.length > 0) {
            setCursorPosition(0);
        }
        
        // 添加游标拖动功能
        initCursorDrag(minTime, timeRange);
    }
    
    // 创建年份标签
    function createYearLabels(minYear, maxYear) {
        const yearRange = maxYear - minYear + 1;
        
        // 创建年份标签（只显示开始、结束和中间几个年份）
        const displayYears = [];
        
        // 开始年份（最上面，最新）
        displayYears.push({
            year: maxYear,
            position: 0,
            isFirst: true
        });
        
        // 如果年份范围较大，添加中间年份
        if (yearRange > 3) {
            const middleYear = Math.floor((minYear + maxYear) / 2);
            displayYears.push({
                year: middleYear,
                position: 0.5,
                isMiddle: true
            });
        }
        
        // 结束年份（最下面，最早）
        displayYears.push({
            year: minYear,
            position: 1,
            isLast: true
        });
        
        // 创建标签
        displayYears.forEach(yearInfo => {
            const yearLabel = document.createElement('div');
            yearLabel.className = `year-label ${yearInfo.isFirst ? 'first' : ''} ${yearInfo.isLast ? 'last' : ''}`;
            yearLabel.style.top = `${yearInfo.position * 100}%`;
            
            const yearText = document.createElement('span');
            yearText.className = 'year-text';
            yearText.textContent = yearInfo.year;
            
            const yearMarker = document.createElement('div');
            yearMarker.className = 'year-marker';
            
            yearLabel.appendChild(yearText);
            yearLabel.appendChild(yearMarker);
            yearLabelsContainer.appendChild(yearLabel);
        });
    }
    
    // 创建时间点标记
    function createTimeMarker(artwork, index, minTime, timeRange) {
        // 计算时间点在时间轴上的位置（0到1之间）
        const artworkTime = artwork.midDate.getTime();
        const position = 1 - (artworkTime - minTime) / timeRange; // 1- 因为最新的在上面
        
        // 创建标记元素
        const marker = document.createElement('div');
        marker.className = 'time-marker has-work';
        marker.style.top = `${position * 100}%`;
        marker.dataset.index = index;
        
        // 点
        const dot = document.createElement('div');
        dot.className = 'time-dot';
        
        marker.appendChild(dot);
        
        // 点击事件
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            setCursorPosition(index);
            scrollToImage(index);
        });
        
        timelineTrack.parentElement.appendChild(marker);
        timeMarkers.push({
            element: marker,
            index: index,
            position: position
        });
    }
    
    // 初始化游标拖动
    function initCursorDrag(minTime, timeRange) {
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
            
            const trackRect = timelineTrack.getBoundingClientRect();
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
            
            const trackRect = timelineTrack.getBoundingClientRect();
            const deltaY = clientY - startY;
            const trackHeight = trackRect.height;
            
            // 计算新位置
            let newTop = startTop + (deltaY / trackHeight * 100);
            newTop = Math.max(0, Math.min(100, newTop));
            
            // 更新游标位置
            timelineCursor.style.top = `${newTop}%`;
            
            // 计算对应的时间
            const position = newTop / 100;
            const time = minTime + (1 - position) * timeRange; // 1- 因为最新的在上面
            
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
        
        // 点击时间轴轨道也可以移动游标
        timelineTrack.addEventListener('click', (e) => {
            const trackRect = timelineTrack.getBoundingClientRect();
            const clickY = e.clientY - trackRect.top;
            const position = clickY / trackRect.height;
            
            const time = minTime + (1 - position) * timeRange;
            findNearestArtwork(time);
        });
    }
    
    // 找到最近的作品
    function findNearestArtwork(targetTime) {
        if (artworks.length === 0) return;
        
        // 找到时间最接近的作品
        let nearestIndex = 0;
        let minDiff = Math.abs(artworks[0].midDate.getTime() - targetTime);
        
        for (let i = 1; i < artworks.length; i++) {
            const diff = Math.abs(artworks[i].midDate.getTime() - targetTime);
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
        const dates = artworks.map(art => art.midDate.getTime());
        const minTime = Math.min(...dates);
        const maxTime = Math.max(...dates);
        const timeRange = maxTime - minTime;
        
        const artworkTime = artwork.midDate.getTime();
        const position = 1 - (artworkTime - minTime) / timeRange;
        
        // 更新游标位置（确保游标在轴上，与最顶端的图片重叠）
        timelineCursor.style.top = `${position * 100}%`;
        
        // 更新日期范围显示
        let rangeText = '';
        if (artwork.start && artwork.end) {
            const startDate = new Date(artwork.start);
            const endDate = new Date(artwork.end);
            rangeText = `${startDate.getFullYear()}.${startDate.getMonth() + 1}.${startDate.getDate()}~${endDate.getFullYear()}.${endDate.getMonth() + 1}.${endDate.getDate()}`;
        } else if (artwork.start) {
            const date = new Date(artwork.start);
            rangeText = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
        }
        
        currentDateRange.textContent = rangeText;
        
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
    
    // 创建作品元素
    function createArtworkElement(artwork, index) {
        const item = document.createElement('div');
        item.className = 'image-item';
        item.dataset.index = index;
        
        // 预览区域
        const preview = document.createElement('div');
        preview.className = 'image-preview';
        
        // 如果是PDF，显示PDF图标
        if (artwork.src.toLowerCase().endsWith('.pdf')) {
            const pdfIcon = document.createElement('i');
            pdfIcon.className = 'fas fa-file-pdf pdf-icon';
            preview.appendChild(pdfIcon);
        } else {
            // 如果是图片，显示图片
            const img = document.createElement('img');
            img.src = artwork.src;
            img.alt = artwork.title;
            img.loading = 'lazy';
            img.onerror = function() {
                // 如果图片加载失败，显示PDF图标
                this.style.display = 'none';
                const pdfIcon = document.createElement('i');
                pdfIcon.className = 'fas fa-file-pdf pdf-icon';
                preview.appendChild(pdfIcon);
            };
            preview.appendChild(img);
        }
        
        // 信息区域
        const info = document.createElement('div');
        info.className = 'image-info';
        
        // 标题（只有存在时才显示）
        if (artwork.title && artwork.title.trim() !== '') {
            const title = document.createElement('h3');
            title.className = 'image-title';
            title.textContent = artwork.title;
            info.appendChild(title);
        }
        
        // 日期
        const dates = document.createElement('div');
        dates.className = 'image-dates';
        
        let datesText = '';
        if (artwork.start && artwork.end) {
            const startDate = new Date(artwork.start);
            const endDate = new Date(artwork.end);
            datesText = `${startDate.getFullYear()}.${startDate.getMonth() + 1}.${startDate.getDate()} ~ ${endDate.getFullYear()}.${endDate.getMonth() + 1}.${endDate.getDate()}`;
        } else if (artwork.start) {
            const date = new Date(artwork.start);
            datesText = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
        }
        
        if (datesText) {
            dates.innerHTML = `<i class="far fa-calendar-alt"></i> ${datesText}`;
            info.appendChild(dates);
        }
        
        item.appendChild(preview);
        item.appendChild(info);
        
        // 点击打开预览
        item.addEventListener('click', (e) => {
            e.preventDefault();
            openPDFModal(artwork);
        });
        
        return item;
    }
    
    // 打开PDF预览模态框
    function openPDFModal(artwork) {
        pdfModalTitle.textContent = artwork.title || '作品';
        
        let startText = '';
        if (artwork.start) {
            const date = new Date(artwork.start);
            startText = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
        } else {
            startText = '未知';
        }
        
        let endText = '';
        if (artwork.end) {
            const date = new Date(artwork.end);
            endText = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
        } else {
            endText = '至今';
        }
        
        pdfStartDate.textContent = startText;
        pdfEndDate.textContent = endText;
        
        // 设置PDF查看器
        if (artwork.src.toLowerCase().endsWith('.pdf')) {
            // 使用Google Docs Viewer预览PDF
            pdfViewer.src = `https://docs.google.com/viewer?url=${encodeURIComponent(artwork.src)}&embedded=true`;
        } else {
            // 如果是图片，直接显示
            pdfViewer.src = artwork.src;
        }
        
        // 设置下载链接
        pdfDownloadBtn.href = artwork.src;
        pdfDownloadBtn.download = artwork.title + (artwork.src.toLowerCase().endsWith('.pdf') ? '.pdf' : '');
        
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
    
    // 上一个时间点
    function prevTimePoint() {
        if (currentTimeIndex > 0) {
            setCursorPosition(currentTimeIndex - 1);
            scrollToImage(currentTimeIndex);
        }
    }
    
    // 下一个时间点
    function nextTimePoint() {
        if (currentTimeIndex < artworks.length - 1) {
            setCursorPosition(currentTimeIndex + 1);
            scrollToImage(currentTimeIndex);
        }
    }
    
    // 事件监听器
    timelinePrevBtn.addEventListener('click', prevTimePoint);
    
    timelineNextBtn.addEventListener('click', nextTimePoint);
    
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
        } else {
            if (e.key === 'ArrowUp') {
                prevTimePoint();
            } else if (e.key === 'ArrowDown') {
                nextTimePoint();
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
    
    // 初始化
    loadArtworks();
});