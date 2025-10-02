// 初始化mermaid
mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis'
    }
});

// 配置marked选项
marked.setOptions({
    highlight: function(code, lang) {
        // 在实际项目中，可以集成highlight.js等语法高亮库
        return code;
    },
    breaks: true,
    gfm: true
});

// 创建自定义渲染器
const renderer = new marked.Renderer();

// 重写代码块渲染方法
renderer.code = function(code, language, isEscaped) {
    if(typeof code !== 'string'){
        language = code.lang;
    }
    // 如果是mermaid代码块，则使用mermaid的div包装
    if (language === 'mermaid') {
        return `<div class="mermaid">${typeof code === 'string'? code: code.text || String(code)}</div>`;
    }

    // HTML转义函数
    const escapeHtml = (text) => {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
    // 否则使用默认的代码块渲染
    if (language) {
        return `<pre><code class="language-${language}">${code}</code></pre>`;
    }

    return `<pre><code>${isEscaped ? code : escape(code)}</code></pre>`;
};

// 设置marked使用自定义渲染器
marked.setOptions({ renderer });

// 加载页面配置
let pageConfig = [];

// 加载所有内容
async function loadAllContent() {
    // 先加载页面配置
    try {
        const configResponse = await fetch('content/content.json');
        if (!configResponse.ok) {
            throw new Error(`HTTP error! status: ${configResponse.status}`);
        }
        pageConfig = await configResponse.json();
    } catch (error) {
        console.error('加载页面配置时出错:', error);
        document.getElementById('content-area').innerHTML = 
            '<div class="loading">加载页面配置时出错，请刷新页面重试。</div>';
        return;
    }
    
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<div class="loading">正在加载内容...</div>';
    
    try {
        // 创建内容容器
        contentArea.innerHTML = '';
        
        // 按顺序加载所有内容
        for (const section of pageConfig) {
            const sectionElement = await loadSectionContent(section);
            if (sectionElement) {
                contentArea.appendChild(sectionElement);
            }
        }
        
        // 初始化导航
        initNavigation();
        
        // 重新渲染mermaid图表
        mermaid.init(undefined, '.mermaid');
        
    } catch (error) {
        console.error('加载内容时出错:', error);
        contentArea.innerHTML = '<div class="loading">加载内容时出错，请刷新页面重试。</div>';
    }
}

// 根据配置加载不同类型的内容
async function loadSectionContent(section) {
    const sectionElement = document.createElement('section');
    sectionElement.className = 'section';
    sectionElement.id = section.id;
    
    switch (section.type) {
        case 'md':
            const content = await loadMarkdownContent(section.file, section.id);
            if (content) {
                sectionElement.innerHTML = `<div class="markdown-content">${content}</div>`;
            } else {
                sectionElement.innerHTML = `<h2>${section.title}</h2><p>无法加载此部分内容。</p>`;
            }
            break;
            
        case 'image-gallery':
            sectionElement.innerHTML = createImageGallery(section);
            break;
            
        case 'video':
            sectionElement.innerHTML = createVideoSection(section);
            break;
            
        case 'downloads':
            sectionElement.innerHTML = createDownloadsSection(section);
            break;
            
        default:
            sectionElement.innerHTML = `<h2>${section.title}</h2><p>未知的内容类型。</p>`;
    }
    
    return sectionElement;
}

// 加载Markdown内容
async function loadMarkdownContent(filePath, sectionId) {
    try {
        const response = await fetch(`content/${filePath}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const markdown = await response.text();
        return marked.parse(markdown);
    } catch (error) {
        console.error(`加载 ${filePath} 时出错:`, error);
        return null;
    }
}

// 创建图片画廊
function createImageGallery(section) {
    let html = `<h2>${section.title}</h2>`;
    html += '<div class="image-gallery">';
    
    section.images.forEach(image => {
        html += `
            <div class="gallery-item">
                <img src="content/${image.src}" alt="${image.alt}" loading="lazy">
                <div class="image-caption">${image.caption}</div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// 创建视频部分
function createVideoSection(section) {
    return `
        <h2>${section.title}</h2>
        <div class="video-container">
            <video controls poster="content/${section.poster}" class="responsive-video">
                <source src="content/${section.src}" type="video/mp4">
                您的浏览器不支持视频播放。
            </video>
            <div class="video-caption">${section.caption}</div>
        </div>
    `;
}

// 创建下载部分
function createDownloadsSection(section) {
    let html = `<h2>${section.title}</h2>`;
    html += '<div class="downloads-list">';
    
    section.files.forEach(file => {
        html += `
            <div class="download-item">
                <div class="file-info">
                    <h3>${file.name}</h3>
                    <span class="file-size">${file.size}</span>
                </div>
                <a href="content/${file.url}" class="download-button" download>下载</a>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// 初始化导航
function initNavigation() {
    const sidebarNav = document.getElementById('sidebar-nav');
    sidebarNav.innerHTML = '';
    
    pageConfig.forEach(section => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${section.id}`;
        a.textContent = section.title;
        a.setAttribute('data-section', section.id);
        
        // 默认激活第一个
        if (section.id === pageConfig[0].id) {
            a.classList.add('active');
        }
        
        li.appendChild(a);
        sidebarNav.appendChild(li);
    });
    
    // 添加导航点击事件
    document.querySelectorAll('.sidebar a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 移除所有active类
            document.querySelectorAll('.sidebar a').forEach(item => {
                item.classList.remove('active');
            });
            
            // 为当前点击的链接添加active类
            this.classList.add('active');
            
            // 滚动到对应部分
            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth' });
            }
            
            // 在移动设备上点击后关闭导航
            if (window.innerWidth <= 768) {
                document.querySelector('.nav-links').classList.remove('active');
            }
        });
    });
    
    // 滚动时更新导航状态
    window.addEventListener('scroll', function() {
        const sections = document.querySelectorAll('.section');
        const navLinks = document.querySelectorAll('.sidebar a');
        
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (pageYOffset >= sectionTop - 100) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').substring(1) === current) {
                link.classList.add('active');
            }
        });
    });
}

// 移动端菜单切换
document.querySelector('.mobile-menu').addEventListener('click', function() {
    document.querySelector('.nav-links').classList.toggle('active');
});

// 移动端导航切换
document.querySelector('.mobile-nav-toggle').addEventListener('click', function() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.toggle('active');
    if (overlay) {
        overlay.classList.toggle('active');
    }
});

// 点击遮罩层关闭导航
document.addEventListener('click', function(e) {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggleBtn = document.querySelector('.mobile-nav-toggle');
    
    if (overlay && overlay.classList.contains('active') && 
        !sidebar.contains(e.target) && 
        !toggleBtn.contains(e.target)) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    
    loadAllContent();
});