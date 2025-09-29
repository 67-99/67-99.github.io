// 初始化mermaid
mermaid.initialize({
    startOnLoad: true,
    theme: 'default',
    securityLevel: 'loose'
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

// 页面内容配置
const pageConfig = {
    sections: [
        { id: 'intro', title: '项目介绍', file: 'content/intro.md' },
        { id: 'features', title: '主要功能', file: 'content/features.md' },
        { id: 'workflow', title: '工作流程', file: 'content/workflow.md' },
        { id: 'tech', title: '技术架构', file: 'content/tech.md' },
        { id: 'timeline', title: '项目时间线', file: 'content/timeline.md' },
        { id: 'team', title: '团队结构', file: 'content/team.md' },
        { id: 'results', title: '成果展示', file: 'content/results.md' }
    ]
};

// 加载所有内容
async function loadAllContent() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = '<div class="loading">正在加载内容...</div>';
    
    try {
        // 创建内容容器
        contentArea.innerHTML = '';
        
        // 并行加载所有内容
        const contentPromises = pageConfig.sections.map(section => 
            loadMarkdownContent(section.file, section.id)
        );
        
        const contents = await Promise.all(contentPromises);
        
        // 将内容添加到页面
        contents.forEach((content, index) => {
            if (content) {
                const section = document.createElement('section');
                section.className = 'section';
                section.id = pageConfig.sections[index].id;
                section.innerHTML = `<div class="markdown-content">${content}</div>`;
                contentArea.appendChild(section);
            }
        });
        
        // 初始化导航
        initNavigation();
        
        // 重新渲染mermaid图表
        mermaid.init(undefined, '.mermaid');
        
    } catch (error) {
        console.error('加载内容时出错:', error);
        contentArea.innerHTML = '<div class="loading">加载内容时出错，请刷新页面重试。</div>';
    }
}

// 加载Markdown内容
async function loadMarkdownContent(filePath, sectionId) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const markdown = await response.text();
        return marked.parse(markdown);
    } catch (error) {
        console.error(`加载 ${filePath} 时出错:`, error);
        return `<h2>${pageConfig.sections.find(s => s.id === sectionId).title}</h2>
                <p>无法加载此部分内容。</p>`;
    }
}

// 初始化导航
function initNavigation() {
    const sidebarNav = document.getElementById('sidebar-nav');
    sidebarNav.innerHTML = '';
    
    pageConfig.sections.forEach(section => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${section.id}`;
        a.textContent = section.title;
        a.setAttribute('data-section', section.id);
        
        // 默认激活第一个
        if (section.id === pageConfig.sections[0].id) {
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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    loadAllContent();
});