// 工具函数

/**
 * 简单的转义函数，防止XSS (用于文件名/分类名)
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

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

/**
 * 根据文件类型返回对应的 FontAwesome 图标类 和 颜色修饰类
 */
function getFileIconInfo(type) {
    const lower = (type || '').toLowerCase();
    switch (lower) {
        case 'txt':  return { class: 'fa-solid fa-file-lines', colorClass: 'file-icon-txt' };
        case 'docx': return { class: 'fa-solid fa-file-word',   colorClass: 'file-icon-docx' };
        case 'xlsx': return { class: 'fa-solid fa-file-excel',  colorClass: 'file-icon-xlsx' };
        case 'pdf':  return { class: 'fa-solid fa-file-pdf',    colorClass: 'file-icon-pdf' };
        default:     return { class: 'fa-solid fa-file',        colorClass: 'file-icon-default' };
    }
}

/**
 * 加载 resource.json 并渲染卡片
 */
async function loadAllContent() {
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    try {
        // 显示加载中
        contentArea.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-pulse"></i> 正在加载资料清单...</div>';

        // 1. 获取资源数据 (与 index.html 同层的 resource.json)
        const response = await fetch('resource.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();  // 格式: { "计算机": [...], "数学": [...], ... }

        // 2. 构建页面内容
        let html = '<h1><i class="fa-solid fa-book-open" style="margin-right: 12px;"></i>学习资料库</h1>';

        // 遍历分类 (对象键值对)
        for (const [category, files] of Object.entries(data)) {
            if (!files || files.length === 0) continue; // 跳过空分类

            // 分类标题 + 文件计数
            html += `
                <div class="category-title">
                    <i class="fa-solid fa-folder-open"></i>
                    <span>${escapeHtml(category)}</span>
                    <span class="count">${files.length}项</span>
                </div>
                <div class="card-grid">
            `;

            // 遍历该分类下所有文件
            for (const file of files) {
                const fileName = file.name || '未命名';
                const fileSrc = file.src || '';
                const fileType = file.type? file.type: fileSrc.split('.').pop().toLowerCase();

                // 获取图标信息
                const icon = getFileIconInfo(fileType);

                // 构建下载链接 (注意中文编码)
                const encodedSrc = encodeURI(fileSrc);        // 编码路径部分
                const downloadUrl = `resource/${encodedSrc}`; // 统一放在 resource/ 下

                // 卡片 HTML (使用转义防止XSS)
                html += `
                    <div class="card">
                        <div class="card-header">
                            <i class="${icon.class} ${icon.colorClass}"></i>
                            <span class="file-name" title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</span>
                        </div>
                        <a href="${downloadUrl}" class="btn-download" download="${escapeHtml(fileSrc)}" title="下载 ${escapeHtml(fileName)}">
                            <i class="fa-solid fa-download"></i> 下载
                        </a>
                    </div>
                `;
            }

            html += '</div>'; // 关闭 card-grid
        }

        // 如果没有任何分类显示，给出提示
        if (Object.keys(data).length === 0) {
            html += '<div class="loading">📂 暂无资料</div>';
        }

        contentArea.innerHTML = html;

    } catch (error) {
        console.error('加载失败:', error);
        contentArea.innerHTML = `<div class="error-message"><i class="fa-solid fa-triangle-exclamation"></i> 加载失败: ${error.message}</div>`;
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 加载主内容
    loadAllContent();
});