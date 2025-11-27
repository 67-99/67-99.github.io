// 获取导航栏高度并设置section的scroll-margin-top
const navHeight = document.querySelector('nav').offsetHeight;
document.querySelectorAll('.section').forEach(section => {
    section.style.scrollMarginTop = `${navHeight + 10}px`;
});

// 初始化mermaid
mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose',
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' }
});

// HTML转义
function escapeHtml(encodedStr) {
    let result = '';
    let i = 0;
    
    while (i < encodedStr.length) {
        if (encodedStr[i] === '%') {
            if (i + 1 < encodedStr.length && encodedStr[i + 1] === 'u') {
                if (i + 5 < encodedStr.length) {
                    const hexCode = encodedStr.substring(i + 2, i + 6);
                    if (/^[0-9A-Fa-f]{4}$/.test(hexCode)) {
                        result += String.fromCharCode(parseInt(hexCode, 16));
                        i += 6;
                        continue;
                    }
                }
            } else {
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
        
        result += encodedStr[i];
        i++;
    }
    
    return result;
}

// 自定义markdown渲染器
const renderer = new marked.Renderer();
renderer.code = function(code, language, isEscaped) {
    if(typeof code !== 'string'){
        language = code.lang;
        code = code.text || String(code);
    }
    if (language === 'mermaid') {
        return `<div class="mermaid">${code}</div>`;
    }

    if (language) {
        return `<pre><code class="language-${language}">${isEscaped ? code : escapeHtml(code)}</code></pre>`;
    }

    return `<pre><code>${isEscaped ? code : escapeHtml(code)}</code></pre>`;
};

marked.setOptions({ renderer });

// 加载配置和内容
let pageConfig = [];
async function loadAllContent() {
    try {
        const config = await fetch('content/content.json');
        pageConfig = await config.json();
    } catch (e) {
        document.getElementById('content-area').innerHTML = '<div class="loading">加载配置失败</div>';
        return;
    }

    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<div class="loading">加载中...</div>';
    
    contentArea.innerHTML = '';
    for (const section of pageConfig) {
        const el = await loadSection(section);
        if (el)
            contentArea.appendChild(el);
    }
    
    initNavigation();
    mermaid.init(undefined, '.mermaid');
}

// 加载各类型内容
async function loadSection(section) {
    const el = document.createElement('section');
    el.className = 'section';
    el.id = section.id;
    
    switch (section.type) {
        case 'md':
        case 'markdown':
            const md = await loadMarkdown(section.src);
            el.innerHTML = md ? `<div class="markdown-content">${md}</div>` : `<h2>${section.title}</h2><p>加载失败</p>`;
            break;
        case 'image-gallery':
            el.innerHTML = createGallery(section);
            break;
        case 'image':
            el.innerHTML = createImage(section);
            break;
        case 'video':
            el.innerHTML = createVideo(section);
            break;
        case 'downloads':
            el.innerHTML = await createDownloads(section);
            break;
        case 'html':
            el.innerHTML = await createComponent(section);
            break;
        default:
            el.innerHTML = `<h2>${section.title}</h2><p>未知类型</p>`;
    }
    return el;
}

// 辅助函数
async function loadMarkdown(path) {
    try {
        const res = await fetch(`content/${path}`);
        return marked.parse(await res.text());
    } catch (e) {
        console.error(`加载 ${path} 失败:`, e);
        return null;
    }
}

function createGallery(section) {
    return `<h2>${section.title}</h2><div class="image-gallery">${
        section.images.map(img => `
            <div class="gallery-item">
                <img src="content/${img.src}" alt="${img.alt}" loading="lazy">
                <div class="image-caption">${img.caption}</div>
            </div>
        `).join('')
    }</div>`;
}

function createImage(section) {
    return `
        <div class="single-image-container">
            <img src="content/${section.src}" alt="${section.alt || ''}" loading="lazy" class="single-image">
            ${section.caption ? `<div class="image-caption">${section.caption}</div>` : ''}
        </div>
    `;
}

function createVideo(section) {
    return `
        <h2>${section.title}</h2>
        <div class="video-container">
            <video controls poster="content/${section.poster}" class="responsive-video">
                <source src="content/${section.src}" type="video/mp4">
                浏览器不支持视频
            </video>
            <div class="video-caption">${section.caption}</div>
        </div>
    `;
}

async function createDownloads(section) {
    let html = `<h2>${section.title}</h2><div class="downloads-list">`;
    for (const file of section.files) {
        const isExternal = file.src.startsWith('http://') || file.src.startsWith('https://');
        if (isExternal) {
            html += `
                <div class="download-item">
                    <div class="file-info">
                        <h3>${file.name}</h3>
                        <span class="file-name">${file.file || "网页文件"}</span>
                    </div>
                    <a href="${file.src}" class="access-button" target="_blank" rel="noopener">访问</a>
                </div>
            `;
        } else {
            const size = await getFileSize(`content/${file.src}`);
            html += `
                <div class="download-item">
                    <div class="file-info">
                        <h3>${file.name}</h3>
                        <span class="file-size">${size > 0 ? formatSize(size) : '大小未知'}</span>
                    </div>
                    <a href="content/${file.src}" class="download-button" download>下载</a>
                </div>
            `;
        }
    }
    return html + '</div>';
}

async function createComponent(section) {
    return `
        ${section.title ? `<h2><a href="content/${section.src}" target="_blank">${section.title}</a></h2>` : ''}
        ${section.description ? `<p class="component-description">${section.description}</p>` : ''}
        <div class="web-component-container" id="component-${section.id}">
            <div class="component-loading"><div class="loading-spinner"></div><p>加载中...</p></div>
            <iframe class="web-component-frame" src="content/${section.src}"
                ${section.height ? `style="height: ${section.height}px;"` : ''}
                ${section.sandbox || 'sandbox="allow-scripts allow-same-origin"'}
                loading="${section.loading || 'lazy'}"
                onload="handleIframeLoad('${section.id}', ${section.height || 'null'})"
                onerror="showComponentError('${section.id}')">
            </iframe>
            ${section.caption ? `<div class="component-caption">${section.caption}</div>` : ''}
        </div>
    `;
}

// 工具函数
function formatSize(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getFileSize(url) {
    try {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok ? parseInt(res.headers.get('content-length')) || 0 : 0;
    } catch (e) {
        return 0;
    }
}

function handleIframeLoad(id, fixedHeight) {
    const container = document.getElementById(`component-${id}`);
    const loading = container?.querySelector('.component-loading');
    const iframe = container?.querySelector('.web-component-frame');
    
    loading && (loading.style.display = 'none');
    if (!fixedHeight) adjustIframeHeight(iframe, id);
}

function adjustIframeHeight(iframe, id) {
    setTimeout(() => {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
            iframe.style.height = (height + 20) + 'px';
        } catch (e) {
            iframe.style.height = '800px';
        }
    }, 100);
}

function showComponentError(id) {
    const container = document.getElementById(`component-${id}`);
    const loading = container?.querySelector('.component-loading');
    loading && (loading.innerHTML = '<p style="color:red">加载失败</p>');
}

// 导航和事件
function initNavigation() {
    const nav = document.getElementById('sidebar-nav');
    nav.innerHTML = pageConfig
        .filter(s => s.showNav !== false)
        .map(s => `<li><a href="#${s.id}" data-section="${s.id}">${s.title}</a></li>`)
        .join('');
    
    document.querySelectorAll('.sidebar a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
            this.classList.add('active');
            
            const target = document.getElementById(this.getAttribute('href').substring(1));
            if (target) {
                window.scrollTo({
                    top: Math.max(0, target.offsetTop - navHeight - 10),
                    behavior: 'smooth'
                });
            }
        });
    });
    
    window.addEventListener('scroll', () => {
        const sections = document.querySelectorAll('.section');
        const links = document.querySelectorAll('.sidebar a');
        
        let current = '';
        sections.forEach(s => {
            if (s.showNav !== false && pageYOffset >= s.offsetTop - navHeight - 30)
                current = s.id;
        });
        
        links.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href').substring(1) === current);
        });
    });
}

// 移动端菜单
document.querySelector('.mobile-menu').addEventListener('click', () => {
    document.querySelector('.nav-links').classList.toggle('active');
});

document.querySelector('.mobile-nav-toggle').addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    sidebar.classList.toggle('active');
    if (overlay) {
        overlay.classList.toggle('active');
    }
});

document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggleBtn = document.querySelector('.mobile-nav-toggle');
    
    if (overlay && overlay.classList.contains('active') && !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    loadAllContent();
});