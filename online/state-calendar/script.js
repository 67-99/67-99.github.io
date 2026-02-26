document.addEventListener('DOMContentLoaded', function() {
    // ---------- DOM 元素 ----------
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    const yearMonthDisplay = document.getElementById('displayYearMonth');
    const calendarGrid = document.getElementById('calendarGrid');
    const selectedDateInfo = document.getElementById('selectedDateInfo');
    const extraContent = document.getElementById('extraContent');   // 右侧附加内容区

    // ---------- 状态 ----------
    let currentDate = new Date();                // 初始今天 (2026-02-26 但基于真实当前)
    let currentYear = currentDate.getFullYear();
    let currentMonth = currentDate.getMonth();   // 0-11
    let selectedDateStr = '';                    // 格式 'YYYY-MM-DD'

    // 辅助函数：格式化数字补零
    const padZero = (num) => (num < 10 ? '0' + num : num);

    // 根据年月获取当月天数
    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    // 更新右侧显示内容 (根据 selectedDateStr)
    function updateRightPanel() {
        if (!selectedDateStr) {
            // 无选中日期：显示占位提示
            selectedDateInfo.innerHTML = `<p class="placeholder">📌 请在左侧选择一个日期</p>`;
            extraContent.innerHTML = `<p>这里可以根据日期展示不同的备忘或信息</p>`;
            return;
        }

        // 解析选中日期
        const [year, month, day] = selectedDateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const weekdaysCN = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const weekday = weekdaysCN[dateObj.getDay()];

        // 构建右侧主要显示
        const formattedDisplay = `${year}年${month}月${day}日`;
        selectedDateInfo.innerHTML = `
            <span style="font-size:2rem; margin-right:8px;">📆</span>
            <span>${formattedDisplay} ${weekday}</span>
        `;

        // 附加内容：模拟不同日期显示不同文案 (展示“根据点击的日期改变”)
        let extraMsg = '';
        const dayOfMonth = day;
        if (dayOfMonth <= 10) {
            extraMsg = '✨ 上旬 · 宜制定计划';
        } else if (dayOfMonth <= 20) {
            extraMsg = '🚀 中旬 · 宜推进项目';
        } else {
            extraMsg = '🌙 下旬 · 宜复盘总结';
        }
        // 再加点随机细节（但基于日期固定，不会刷新乱变）
        if ((dayOfMonth % 2) === 0) {
            extraMsg += ' 🌟 双日幸运色：蓝色';
        } else {
            extraMsg += ' 🌿 单日幸运色：绿色';
        }
        extraContent.innerHTML = `<p>${extraMsg}</p>`;
    }

    // 渲染日历网格
    function renderCalendar() {
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

    // 附加小细节：若首次选中了今天，需要确保高亮 (render时根据selectedDateStr已处理)
    // 但注意由于render中通过循环添加active, 如果selectedDateStr有值，相应格子会加active。
    // 完美。

    // 确保年份月份显示与实际相符 (已包含在render)
});

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