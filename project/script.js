// 获取导航栏高度
const navHeight = document.querySelector('nav').offsetHeight;

// 更新所有section的scroll-margin-top
document.querySelectorAll('.section').forEach(section => {
    section.style.scrollMarginTop = `${navHeight + 10}px`; // 导航栏高度 + 额外空间
});

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

// HTML转义函数
function escapeHtml(encodedStr) {
    let result = '';
    let i = 0;
    
    while (i < encodedStr.length) {
        if (encodedStr[i] === '%') {
            // 处理编码序列
            if (i + 1 < encodedStr.length && encodedStr[i + 1] === 'u') {
                // 处理 %uXXXX 格式
                if (i + 5 < encodedStr.length) {
                    const hexCode = encodedStr.substring(i + 2, i + 6);
                    if (/^[0-9A-Fa-f]{4}$/.test(hexCode)) {
                        result += String.fromCharCode(parseInt(hexCode, 16));
                        i += 6;
                        continue;
                    }
                }
            } else {
                // 处理 %XX 格式
                if (i + 2 < encodedStr.length) {
                    const hexCode = encodedStr.substring(i + 1, i + 3);
                    if (/^[0-9A-Fa-f]{2}$/.test(hexCode)) {
                        result += String.fromCharCode(parseInt(hexCode, 16));
                        i += 3;
                        continue;
                    }
                }
            }
        }
        
        // 如果不是有效的编码，直接添加字符
        result += encodedStr[i];
        i++;
    }
    
    return result;
}

// 创建自定义渲染器
const renderer = new marked.Renderer();

// 重写代码块渲染方法
renderer.code = function(code, language, isEscaped) {
    if(typeof code !== 'string'){
        language = code.lang;
        code = code.text || String(code);
    }
    // 如果是mermaid代码块，则使用mermaid的div包装
    if (language === 'mermaid') {
        return `<div class="mermaid">${code}</div>`;
    }

    // 否则使用默认的代码块渲染
    if (language) {
        return `<pre><code class="language-${language}">${isEscaped ? code : escapeHtml(code)}</code></pre>`;
    }

    return `<pre><code>${isEscaped ? code : escapeHtml(code)}</code></pre>`;
};

// 设置marked使用自定义渲染器
marked.setOptions({ renderer });

// 加载页面配置
let pageConfig = [];

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 获取文件大小
async function getFileSize(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok) {
            const size = response.headers.get('content-length');
            return size ? parseInt(size) : 0;
        }
        return 0;
    } catch (error) {
        console.error(`获取文件大小失败: ${url}`, error);
        return 0;
    }
}

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
        case "markdown":
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
            
        case 'image':
            sectionElement.innerHTML = createImageSection(section);
            break;
            
        case 'video':
            sectionElement.innerHTML = createVideoSection(section);
            break;
            
        case 'downloads':
            sectionElement.innerHTML = await createDownloadsSection(section)
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

// 创建单张图片部分
function createImageSection(section) {
    return `
        <div class="single-image-container">
            <img src="content/${section.src}" alt="${section.alt || ''}" loading="lazy" class="single-image">
            ${section.caption ? `<div class="image-caption">${section.caption}</div>` : ''}
        </div>
    `;
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
async function createDownloadsSection(section) {
    let html = `<h2>${section.title}</h2>`;
    html += '<div class="downloads-list">';
    
    // 为每个文件获取大小
    for (const file of section.files) {
        const fileSize = await getFileSize(`content/${file.url}`);
        const formattedSize = fileSize > 0 ? formatFileSize(fileSize) : '大小未知';
        html += `
            <div class="download-item">
                <div class="file-info">
                    <h3>${file.name}</h3>
                    <span class="file-size">${formattedSize}</span>
                </div>
                <a href="content/${file.url}" class="download-button" download>下载</a>
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

// 初始化导航
function initNavigation() {
    const sidebarNav = document.getElementById('sidebar-nav');
    sidebarNav.innerHTML = '';
    
    pageConfig.forEach(section => {
        // 跳过不在导航中显示的部分（如图片类型）
        if (section.showInNav === false) {
            return;
        }
        
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
            if (pageYOffset >= sectionTop - navHeight) {
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