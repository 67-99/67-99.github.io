// 画廊应用主逻辑
document.addEventListener('DOMContentLoaded', function() {
    // 全局变量
    let artworks = [];
    let filteredArtworks = [];
    let currentYear = null;
    let currentFilter = 'all';
    let currentPage = 1;
    const itemsPerPage = 12;
    let currentModalIndex = 0;
    
    // DOM元素
    const masonryContainer = document.getElementById('masonry-container');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const loadMoreContainer = document.getElementById('load-more-container');
    const emptyState = document.getElementById('empty-state');
    const imageCount = document.getElementById('image-count');
    const currentYearDisplay = document.getElementById('current-year');
    const startYearDisplay = document.getElementById('start-year');
    const endYearDisplay = document.getElementById('end-year');
    const timelineProgress = document.getElementById('timeline-progress');
    const timelineCursor = document.getElementById('timeline-cursor');
    const timelineTrack = document.querySelector('.timeline-track');
    const yearSelector = document.querySelector('.year-selector');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const imageModal = document.getElementById('image-modal');
    const modalClose = document.getElementById('modal-close');
    const modalImage = document.getElementById('modal-image');
    const modalTitle = document.getElementById('modal-title');
    const modalStart = document.getElementById('modal-start');
    const modalEnd = document.getElementById('modal-end');
    const modalPrev = document.getElementById('modal-prev');
    const modalNext = document.getElementById('modal-next');
    
    // 加载数据
    async function loadArtworks() {
        try {
            // 显示加载状态
            loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载中...';
            loadMoreBtn.disabled = true;
            
            // 模拟从JSON文件加载数据
            // 实际使用时，请将下面的URL替换为您的images.json文件路径
            const response = await fetch('images.json');
            artworks = await response.json();
            
            // 解析日期并添加年份属性
            artworks.forEach(artwork => {
                if (artwork.start) {
                    artwork.year = new Date(artwork.start).getFullYear();
                } else if (artwork.end) {
                    artwork.year = new Date(artwork.end).getFullYear();
                } else {
                    artwork.year = new Date().getFullYear();
                }
            });
            
            // 按年份排序
            artworks.sort((a, b) => new Date(b.start || b.end) - new Date(a.start || a.end));
            
            // 初始化年份数据
            initYearData();
            
            // 默认显示最新年份
            const latestYear = getLatestYear();
            selectYear(latestYear);
            
            // 初始化时间轴
            initTimeline();
            
        } catch (error) {
            console.error('加载作品数据失败:', error);
            emptyState.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <h3>加载失败</h3>
                <p>无法加载作品数据，请检查网络连接或数据文件</p>
                <button class="load-more-btn" onclick="loadArtworks()" style="margin-top: 20px;">重试</button>
            `;
            emptyState.style.display = 'block';
        } finally {
            loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载更多';
            loadMoreBtn.disabled = false;
        }
    }
    
    // 获取年份范围
    function getYearRange() {
        if (artworks.length === 0) return { min: new Date().getFullYear(), max: new Date().getFullYear() };
        
        const years = artworks.map(art => art.year);
        return {
            min: Math.min(...years),
            max: Math.max(...years)
        };
    }
    
    // 获取最新年份
    function getLatestYear() {
        const yearRange = getYearRange();
        return yearRange.max;
    }
    
    // 初始化年份数据
    function initYearData() {
        const yearRange = getYearRange();
        startYearDisplay.textContent = yearRange.min;
        endYearDisplay.textContent = yearRange.max;
    }
    
    // 初始化时间轴
    function initTimeline() {
        const yearRange = getYearRange();
        const totalYears = yearRange.max - yearRange.min + 1;
        
        // 清空年份标记
        const existingMarkers = document.querySelectorAll('.year-marker');
        existingMarkers.forEach(marker => marker.remove());
        
        // 创建年份标记
        for (let year = yearRange.min; year <= yearRange.max; year++) {
            const yearArtworks = artworks.filter(art => art.year === year);
            if (yearArtworks.length > 0) {
                createYearMarker(year, year === currentYear);
            }
        }
        
        // 创建年份按钮
        createYearButtons();
        
        // 更新时间轴进度
        updateTimelineProgress();
        
        // 添加时间轴拖动功能
        initTimelineDrag();
    }
    
    // 创建年份标记
    function createYearMarker(year, isActive = false) {
        const yearRange = getYearRange();
        const totalYears = yearRange.max - yearRange.min + 1;
        const yearIndex = year - yearRange.min;
        const position = (yearIndex / (totalYears - 1)) * 100;
        
        const marker = document.createElement('div');
        marker.className = `year-marker ${isActive ? 'active' : ''}`;
        marker.style.left = `${position}%`;
        marker.dataset.year = year;
        
        const dot = document.createElement('div');
        dot.className = 'year-dot';
        
        const label = document.createElement('div');
        label.className = 'year-label';
        label.textContent = year;
        
        marker.appendChild(dot);
        marker.appendChild(label);
        
        marker.addEventListener('click', () => selectYear(year));
        
        timelineTrack.parentElement.appendChild(marker);
    }
    
    // 创建年份按钮
    function createYearButtons() {
        yearSelector.innerHTML = '';
        
        const yearRange = getYearRange();
        const years = [];
        
        for (let year = yearRange.max; year >= yearRange.min; year--) {
            const yearArtworks = artworks.filter(art => art.year === year);
            if (yearArtworks.length > 0) {
                years.push(year);
            }
        }
        
        // 最多显示9个年份按钮
        const displayYears = years.slice(0, 9);
        
        displayYears.forEach(year => {
            const button = document.createElement('button');
            button.className = `year-btn ${year === currentYear ? 'active' : ''}`;
            button.textContent = year;
            button.dataset.year = year;
            
            button.addEventListener('click', () => selectYear(year));
            
            yearSelector.appendChild(button);
        });
    }
    
    // 初始化时间轴拖动功能
    function initTimelineDrag() {
        let isDragging = false;
        
        timelineCursor.addEventListener('mousedown', startDrag);
        timelineCursor.addEventListener('touchstart', startDrag);
        
        function startDrag(e) {
            e.preventDefault();
            isDragging = true;
            document.addEventListener('mousemove', drag);
            document.addEventListener('touchmove', drag);
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }
        
        function drag(e) {
            if (!isDragging) return;
            
            let clientX;
            if (e.type.includes('touch')) {
                clientX = e.touches[0].clientX;
            } else {
                clientX = e.clientX;
            }
            
            const trackRect = timelineTrack.getBoundingClientRect();
            let position = (clientX - trackRect.left) / trackRect.width;
            position = Math.max(0, Math.min(1, position));
            
            const yearRange = getYearRange();
            const totalYears = yearRange.max - yearRange.min + 1;
            const yearIndex = Math.round(position * (totalYears - 1));
            const year = yearRange.min + yearIndex;
            
            // 检查该年份是否有作品
            const yearArtworks = artworks.filter(art => art.year === year);
            if (yearArtworks.length > 0) {
                selectYear(year);
            }
        }
        
        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('touchmove', drag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
        }
    }
    
    // 更新时间轴进度
    function updateTimelineProgress() {
        if (!currentYear) return;
        
        const yearRange = getYearRange();
        const totalYears = yearRange.max - yearRange.min + 1;
        const yearIndex = currentYear - yearRange.min;
        const progress = (yearIndex / (totalYears - 1)) * 100;
        
        timelineProgress.style.width = `${progress}%`;
        timelineCursor.style.left = `${progress}%`;
    }
    
    // 选择年份
    function selectYear(year) {
        currentYear = year;
        currentPage = 1;
        
        // 更新显示
        currentYearDisplay.textContent = year;
        
        // 更新活跃状态
        document.querySelectorAll('.year-marker').forEach(marker => {
            marker.classList.toggle('active', parseInt(marker.dataset.year) === year);
        });
        
        document.querySelectorAll('.year-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.year) === year);
        });
        
        // 更新时间轴进度
        updateTimelineProgress();
        
        // 过滤并显示作品
        filterArtworks();
    }
    
    // 过滤作品
    function filterArtworks() {
        // 根据年份过滤
        let result = artworks.filter(art => art.year === currentYear);
        
        // 根据筛选器过滤
        if (currentFilter === 'recent') {
            // 显示最近一年的作品（已经是）
        } else if (currentFilter === 'favorite') {
            // 这里可以添加收藏逻辑，目前随机显示一些
            result = result.filter((_, index) => index % 3 === 0);
        }
        // 'all' 显示全部
        
        filteredArtworks = result;
        
        // 更新作品数量
        imageCount.textContent = filteredArtworks.length;
        
        // 渲染作品
        renderArtworks();
    }
    
    // 渲染作品
    function renderArtworks() {
        // 清空容器
        masonryContainer.innerHTML = '';
        
        if (filteredArtworks.length === 0) {
            emptyState.style.display = 'block';
            loadMoreContainer.style.display = 'none';
            return;
        }
        
        emptyState.style.display = 'none';
        
        // 计算当前页显示的作品
        const startIndex = 0;
        const endIndex = Math.min(currentPage * itemsPerPage, filteredArtworks.length);
        const currentArtworks = filteredArtworks.slice(startIndex, endIndex);
        
        // 创建瀑布流列
        const columns = 3;
        const columnElements = [];
        
        for (let i = 0; i < columns; i++) {
            const column = document.createElement('div');
            column.className = 'masonry-column';
            masonryContainer.appendChild(column);
            columnElements.push(column);
        }
        
        // 分配作品到各列
        currentArtworks.forEach((artwork, index) => {
            const columnIndex = index % columns;
            const artworkElement = createArtworkElement(artwork);
            columnElements[columnIndex].appendChild(artworkElement);
        });
        
        // 显示/隐藏加载更多按钮
        if (endIndex < filteredArtworks.length) {
            loadMoreContainer.style.display = 'block';
        } else {
            loadMoreContainer.style.display = 'none';
        }
    }
    
    // 创建作品元素
    function createArtworkElement(artwork) {
        const item = document.createElement('div');
        item.className = 'masonry-item';
        item.dataset.index = artworks.indexOf(artwork);
        
        // 年份徽章
        const yearBadge = document.createElement('div');
        yearBadge.className = 'year-badge';
        yearBadge.textContent = artwork.year;
        
        // 图片容器
        const imageContainer = document.createElement('div');
        imageContainer.className = 'image-container';
        
        const img = document.createElement('img');
        img.className = 'work-img';
        img.src = artwork.src;
        img.alt = artwork.title;
        img.loading = 'lazy';
        
        // 如果图片加载失败，显示占位符
        img.onerror = function() {
            this.src = 'https://via.placeholder.com/400x300/333/FFF000?text=Artwork+Image';
        };
        
        imageContainer.appendChild(img);
        
        // 内容区域
        const content = document.createElement('div');
        content.className = 'work-content';
        
        const title = document.createElement('h3');
        title.textContent = artwork.title;
        
        const dates = document.createElement('p');
        dates.textContent = `${artwork.start || '未知'} - ${artwork.end || '至今'}`;
        
        const link = document.createElement('a');
        link.className = 'work-link';
        link.href = '#';
        link.innerHTML = '查看详情 <i class="fas fa-arrow-right"></i>';
        
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openImageModal(artworks.indexOf(artwork));
        });
        
        content.appendChild(title);
        content.appendChild(dates);
        content.appendChild(link);
        
        item.appendChild(yearBadge);
        item.appendChild(imageContainer);
        item.appendChild(content);
        
        return item;
    }
    
    // 打开图片模态框
    function openImageModal(index) {
        if (index < 0 || index >= artworks.length) return;
        
        currentModalIndex = index;
        const artwork = artworks[index];
        
        modalImage.src = artwork.src;
        modalTitle.textContent = artwork.title;
        modalStart.textContent = artwork.start || '未知';
        modalEnd.textContent = artwork.end || '至今';
        
        imageModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    // 关闭图片模态框
    function closeImageModal() {
        imageModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    
    // 显示上一张图片
    function showPrevImage() {
        let prevIndex = currentModalIndex - 1;
        
        // 如果已经是第一张，则显示最后一张
        if (prevIndex < 0) {
            prevIndex = artworks.length - 1;
        }
        
        openImageModal(prevIndex);
    }
    
    // 显示下一张图片
    function showNextImage() {
        let nextIndex = currentModalIndex + 1;
        
        // 如果已经是最后一张，则显示第一张
        if (nextIndex >= artworks.length) {
            nextIndex = 0;
        }
        
        openImageModal(nextIndex);
    }
    
    // 加载更多作品
    function loadMoreArtworks() {
        currentPage++;
        renderArtworks();
    }
    
    // 事件监听器
    loadMoreBtn.addEventListener('click', loadMoreArtworks);
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // 更新活跃状态
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // 更新筛选器
            currentFilter = this.dataset.filter;
            currentPage = 1;
            
            // 重新过滤和渲染
            filterArtworks();
        });
    });
    
    // 模态框事件
    modalClose.addEventListener('click', closeImageModal);
    
    modalPrev.addEventListener('click', showPrevImage);
    
    modalNext.addEventListener('click', showNextImage);
    
    // 点击模态框背景关闭
    imageModal.addEventListener('click', function(e) {
        if (e.target === this) {
            closeImageModal();
        }
    });
    
    // 键盘导航
    document.addEventListener('keydown', function(e) {
        if (imageModal.style.display === 'flex') {
            if (e.key === 'Escape') {
                closeImageModal();
            } else if (e.key === 'ArrowLeft') {
                showPrevImage();
            } else if (e.key === 'ArrowRight') {
                showNextImage();
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
                // 显示移动菜单
                navLinks.style.display = 'block';
                navLinks.style.position = 'absolute';
                navLinks.style.top = '100%';
                navLinks.style.left = '0';
                navLinks.style.right = '0';
                navLinks.style.backgroundColor = 'var(--bg-card)';
                navLinks.style.flexDirection = 'column';
                navLinks.style.padding = '20px';
                navLinks.style.boxShadow = '0 10px 20px rgba(0,0,0,0.3)';
                
                // 调整下拉菜单
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
                // 隐藏移动菜单
                navLinks.style.display = 'none';
            }
        });
    }
    
    // 初始化
    loadArtworks();
    
    // 窗口大小改变时重新布局
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            renderArtworks();
        }, 250);
    });
});