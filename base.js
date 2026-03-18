/**
 * 检查资源是否存在（最小化数据传输）
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

function setFavicon(src) {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = src;
}

document.addEventListener('DOMContentLoaded', async function() {
    // ---------- DOM 元素 ----------
    const navs = document.getElementsByClassName('nav-container');
    const navHTML = `
        <div class="logo">67-99</div>
        <ul class="nav-links">
            <li><a href="https://67-99.github.io/index.html">首页</a></li>
            <li class="dropdown">
                <a href="https://67-99.github.io/project/index.html">项目</a>
                <ul class="dropdown-menu">
                    <li><a href="https://67-99.github.io/project/index.html#online">在线项目</a></li>
                    <li><a href="https://67-99.github.io/project/index.html#offline">离线项目</a></li>
                </ul>
            </li>
            <li><a href="https://67-99.github.io/shade/index.html">画廊</a></li>
        </ul>
        <div class="mobile-menu">☰</div>
    `;

    [...navs].forEach(element => {
        element.innerHTML = navHTML;
    });
    setFavicon("https://67-99.github.io/icon/Shade/web-icon.png");
});

const originalTitle = document.title;
let timeoutId = null;
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        // 页面变为可见：启动 3 秒临时替换
        document.title = '欢迎回来！o(*≧▽≦)ブ';
        setFavicon('https://67-99.github.io/icon/Shade/icon.png');
        // 设定新定时器
        if(timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            document.title = originalTitle;
            setFavicon("https://67-99.github.io/icon/Shade/web-icon.png");
            timeoutId = null;
        }, 3000);
    } else {
        // 页面隐藏：如果定时器还在，取消后移除图标
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
            document.title = originalTitle;
        }
        const existingLink = document.querySelector("link[rel*='icon']");
        if(existingLink) existingLink.remove(); // 从DOM中彻底移除该标签
    }
});