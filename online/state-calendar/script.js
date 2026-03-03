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

document.addEventListener('DOMContentLoaded', function() {
    // ---------- DOM 元素 ----------
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    const yearMonthDisplay = document.getElementById('displayYearMonth');
    const calendarGrid = document.getElementById('calendarGrid');
    const dateText = document.getElementById('dateText');
    const displayDate = document.getElementById('displayDate');
    const extraContent = document.getElementById('extraContent');   // 右侧附加内容区
    const editBtn = document.getElementById('editDataBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalDate = document.getElementById('modalDate');
    const modalValue = document.getElementById('modalValue');
    const modalDescription = document.getElementById('modalDescription');
    const modalCancel = document.getElementById('modalCancel');
    const modalSubmitBtn = document.getElementById('modalSubmit'); // 注意与 submit 事件区分
    const modalError = document.getElementById('modalError');
    const dataForm = document.getElementById('dataForm');
    const getInfo = checkResourceExists("https://workers.dev");

    // ---------- 状态 ----------
    let currentDate = new Date();                // 初始今天 (2026-02-26 但基于真实当前)
    let currentYear = currentDate.getFullYear();
    let currentMonth = currentDate.getMonth();   // 0-11
    let selectedDateStr = '';                    // 格式 'YYYY-MM-DD'
    /** @type{Record<string, {value: number, description: string}>} */
    let monthData = {};          // 缓存当前月份的数据 { "2026-03-01": { value, description }, ... }
    let isLoading = false;       // 可选：加载状态

    // 辅助函数：格式化数字补零
    const padZero = (num) => (num < 10 ? '0' + num : num);

    // 根据年月获取当月天数
    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    async function fetchMonthData(year, month) {
        // 月份从0开始，需要补零
        const start = `${year}-${padZero(month + 1)}-01`;
        const end = `${year}-${padZero(month + 1)}-${getDaysInMonth(year, month)}`;
        const url = `https://calendar-dataset.smart-li.workers.dev?start=${start}&end=${end}`;
        
        try {
            isLoading = true;
            const response = await fetch(url);
            if(!response.ok)
                throw new Error(`HTTP error ${response.status}`);
            const data = await response.json();
            monthData = data;   // 直接覆盖，因为月份变了
        } catch (error) {
            console.error('获取日历数据失败:', error);
            monthData = {};
        } finally {
            isLoading = false;
            // 重新刷新右侧显示（如果已有选中日期）
            if(selectedDateStr)
                updateRightPanel();
        }
    }

    // 更新右侧显示内容 (根据 selectedDateStr)
    async function updateRightPanel() {
        if (!selectedDateStr) {
            // 无选中日期：显示占位提示
            displayDate.textContent = "📅 选定日期";
            dateText.innerHTML = `<p class="placeholder">📌 请在左侧选择一个日期</p>`;
            extraContent.innerHTML = `<p>这里可以根据日期展示不同的备忘或信息</p>`;
            editBtn.style.display = 'none';
            return;
        }

        // 构建右侧主要显示
        const [year, month, day] = selectedDateStr.split('-').map(Number);
        const formattedDisplay = `${year}年${month}月${day}日`;
        if(await getInfo){
            displayDate.textContent = `📅 ${formattedDisplay}`;
            if(isLoading){
                dateText.textContent = "⏳ 数据加载中...";
                extraContent.textContent = "⏳ 数据加载中...";
            }
            else{
                const dayInfo = monthData[selectedDateStr];
                if(dayInfo && dayInfo["value"] >= -100 && dayInfo["description"]){
                    dateText.textContent = `心情：${dayInfo["value"]}`;
                    extraContent.textContent = dayInfo["description"];
                }
                else{
                    dateText.textContent = `心情：${0}`;
                    extraContent.textContent = "无数据，一切安好 °▽°";
                }
            }
            editBtn.style.display = 'inline-block';
        }
        else{
            const dateObj = new Date(year, month - 1, day);
            const weekdaysCN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
            const weekday = weekdaysCN[dateObj.getDay()];
            dateText.innerHTML = `
                <span style="font-size:2rem; margin-right:8px;">📆</span>
                <span>${formattedDisplay} ${weekday}</span>
            `;
            let extraMsg = `<p>⏳ 数据加载中...</p>`;
            if(!isLoading){
                // 附加内容：模拟不同日期显示不同文案 (展示“根据点击的日期改变”)
                const dayOfMonth = day;
                if(dayOfMonth <= 10)
                    extraMsg = '✨ 上旬 · 宜制定计划';
                else if(dayOfMonth <= 20)
                    extraMsg = '🚀 中旬 · 宜推进项目';
                else
                    extraMsg = '🌙 下旬 · 宜复盘总结';
                // 再加点随机细节（但基于日期固定，不会刷新乱变）
                if((dayOfMonth % 2) === 0)
                    extraMsg += ' 🌟 双日幸运色：蓝色';
                else
                    extraMsg += ' 🌿 单日幸运色：绿色';
            }
            extraContent.innerHTML = `<p>${extraMsg}</p>`;
            editBtn.style.display = 'none';
        }
    }

    // 渲染日历网格
    async function renderCalendar() {
        // 更新头部年月显示
        yearMonthDisplay.textContent = `${currentYear}年${currentMonth + 1}月`;

        // 获取当月第一天是星期几 (0=星期日)
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = getDaysInMonth(currentYear, currentMonth);

        // 清空网格
        calendarGrid.innerHTML = '';

        // 填充空白格子 (第一行前面的空白)
        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'empty-cell';
            calendarGrid.appendChild(emptyCell);
        }

        // 填充当月日期
        for (let d = 1; d <= daysInMonth; d++) {
            const dateCell = document.createElement('div');
            dateCell.className = 'calendar-date';
            dateCell.textContent = d;

            // 构造日期字符串 YYYY-MM-DD
            const dateStr = `${currentYear}-${padZero(currentMonth + 1)}-${padZero(d)}`;
            dateCell.dataset.date = dateStr;

            // 如果当前有选中日期且匹配，高亮
            if (selectedDateStr === dateStr) {
                dateCell.classList.add('active');
            }

            calendarGrid.appendChild(dateCell);
        }

        // 填充末尾空白（可选，为了美观让最后一行完整，但不强制）
        const totalCells = firstDay + daysInMonth;
        const remainder = totalCells % 7;
        if (remainder !== 0) {
            for (let i = 0; i < 7 - remainder; i++) {
                const emptyCell = document.createElement('div');
                emptyCell.className = 'empty-cell';
                calendarGrid.appendChild(emptyCell);
            }
        }

        // 检查选中的日期是否还在当前月份内，若不在则清空选中 (selectedDateStr可能已过期)
        if (selectedDateStr) {
            const [selYear, selMonth] = selectedDateStr.split('-').map(Number);
            if (selYear !== currentYear || selMonth !== currentMonth + 1) {
                // 选中的日期不在当前月份 → 清空选中
                selectedDateStr = '';
            }
        }
        // 渲染完成后获取当月数据
        const hasInfo = await getInfo;
        if(hasInfo)
            fetchMonthData(currentYear, currentMonth);
        // 根据最终selectedDateStr更新右侧 (可能清空，也可能保留)
        updateRightPanel();
    }

    // 处理日期点击 (事件委托)
    calendarGrid.addEventListener('click', (e) => {
        const target = e.target;
        // 只处理有日期数据的格子 (class 包含 calendar-date)
        if (!target.classList.contains('calendar-date')) return;

        const newDateStr = target.dataset.date;
        if (!newDateStr) return;

        // 如果点击的是已选中的日期，可以保持选中 (也可以不做特殊处理)
        if (selectedDateStr === newDateStr) {
            // 仍可更新右侧，但没必要，可忽略; 不过为了避免无反馈，也更新一下
            updateRightPanel();
            return;
        }

        // 移除其他所有格子的 active 类
        document.querySelectorAll('.calendar-date').forEach(cell => {
            cell.classList.remove('active');
        });

        // 为当前格子添加 active
        target.classList.add('active');
        // 更新选中状态
        selectedDateStr = newDateStr;
        // 更新右侧
        updateRightPanel();
    });

    // 月份切换：上一月
    prevBtn.addEventListener('click', () => {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear -= 1;
        } else {
            currentMonth -= 1;
        }
        // 切换月份后，一般情况下选中的日期可能不在本月，将在renderCalendar中自动清空
        renderCalendar();
    });

    // 月份切换：下一月
    nextBtn.addEventListener('click', () => {
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear += 1;
        } else {
            currentMonth += 1;
        }
        renderCalendar();
    });

    // ---------- 初始化 ----------
    // 首次加载: 判断今天是否在当前月(当前月是currentYear, currentMonth)，若是则选中今天
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    if (todayYear === currentYear && todayMonth === currentMonth) {
        // 今天在当前月内，选中今天
        selectedDateStr = `${currentYear}-${padZero(currentMonth + 1)}-${padZero(todayDate)}`;
    } else {
        // 否则无选中，右侧显示占位
        selectedDateStr = '';
    }

    // 渲染日历 (内部调用 updateRightPanel)
    renderCalendar();

    // 模态框打开函数
    function openModal() {
        if (!selectedDateStr) return; // 无选中不打开
        // 填充当前选中日期
        modalDate.value = selectedDateStr;
        modalValue.value = '';
        modalDescription.value = '';
        modalError.textContent = '';
        modalOverlay.style.display = 'flex';
    }

    // 提交表单处理 POST 请求
    async function handleFormSubmit(e) {
        e.preventDefault();
        const date = modalDate.value.trim();
        const value = parseFloat(modalValue.value);
        const description = modalDescription.value.trim();

        // 基本验证
        if (!date || isNaN(value) || value < -100 || value > 100 || !description) {
            modalError.textContent = '请填写完整且有效的数值';
            return;
        }
        // 日期格式验证
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            modalError.textContent = '日期格式应为 YYYY-MM-DD';
            return;
        }

        // 禁用提交按钮防止重复
        modalSubmitBtn.disabled = true;
        modalError.textContent = '';

        try {
            const response = await fetch(`https://calendar-dataset.smart-li.workers.dev/api/states`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, value, description })
            });

            const result = await response.json();

            if (!response.ok) {
                // 处理 409 或其他错误
                if (response.status === 409) {
                    throw new Error('该日期已有数据，无法重复添加（如需覆盖请先删除）');
                } else {
                    throw new Error(result.error || '提交失败');
                }
            }

            // 成功：关闭模态框，刷新当月数据
            modalOverlay.style.display = 'none';
            // 重新获取当月数据，确保右侧显示最新
            await fetchMonthData(currentYear, currentMonth);
            // 如果当前选中日期正好是刚修改的日期，更新右侧显示
            if (selectedDateStr === date) {
                // 因为 monthData 已更新，直接调用 updateRightPanel 即可
                updateRightPanel();
            }

        } catch (error) {
            modalError.textContent = error.message;
        } finally {
            modalSubmitBtn.disabled = false;
        }
    }

    // 绑定事件
    editBtn.addEventListener('click', openModal);
    modalCancel.addEventListener('click', () => modalOverlay.style.display = 'none');
    modalOverlay.addEventListener('click', (e) => {
        if(e.target === modalOverlay)
            modalOverlay.style.display = 'none';
    });
    dataForm.addEventListener('submit', handleFormSubmit);


    // 移动端菜单
    document.querySelector('.mobile-menu').addEventListener('click', () => {
        document.querySelector('.nav-links').classList.toggle('active');
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
});
