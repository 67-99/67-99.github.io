// ============ 默认题库 ============
const QUESTION_SETS = {
    '默认题库': {
        questions: [{
                "id": 1,
                "type": "single",
                "question": "Python 中用于输出内容的函数是？",
                "options": ["print()", "input()", "len()", "range()"],
                "answer": "print()",
                "explanation": "print() 是 Python 内置的输出函数。",
                "option_explanations": ["正确", "输入函数", "长度函数", "范围函数"]
            },
            {
                "id": 2,
                "type": "multiple",
                "question": "以下哪些是 Python 的容器类型？",
                "options": ["list", "dict", "int", "str"],
                "answer": ["list", "dict", "str"],
                "explanation": "int 是数字类型，不是容器。"
            },
            {
                "id": 3,
                "type": "fill",
                "question": "Python 中定义函数的关键字是 ____。",
                "answer": "def",
                "explanation": "使用 def 关键字定义函数。"
            },
            {
                "id": 4,
                "type": "essay",
                "question": "请简述 Python 中列表和元组的区别。",
                "answer": "列表是可变的，元组是不可变的。",
                "explanation": "列表支持增删改，元组创建后不能修改。"
            }
        ]
    }
};

let loadedRemoteSets = {};

let currentSetName = '默认题库';
let currentQuestions = [];
let records = {};
let currentIndex = 0;
let pageQuestions = [];
let selectedAnswers = {};

const pageTitle = document.getElementById('page-title');
const pageQuiz = document.getElementById('page-quiz');
const pageFinish = document.getElementById('page-finish');
const setCombo = document.getElementById('set-combo');
const btnStart = document.getElementById('btn-start');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnSubmit = document.getElementById('btn-submit');
const btnFinish = document.getElementById('btn-finish');
const btnRestart = document.getElementById('btn-restart');
const btnUpload = document.getElementById('btn-upload');
const btnClearCache = document.getElementById('btn-clear-cache');
const fileInput = document.getElementById('file-input');
const questionList = document.getElementById('question-list');
const questionContainer = document.getElementById('question-container');
const progressArea = document.getElementById('progress-area');
const progressLabel = document.getElementById('progress-label');
const progressBar = document.getElementById('progress-bar');
const statsText = document.getElementById('stats-text');
const wrongList = document.getElementById('wrong-list');
const essayList = document.getElementById('essay-list');
const defaultHint = document.getElementById('default-hint');
const loadStatus = document.getElementById('load-status');

// ============ 工具函数 ============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---------- Markdown 渲染 ----------
function renderMarkdown(text) {
    if (!text) return '';
    let html = text;

    // 1. 提取代码块（包括 mermaid）
    const codeBlocks = [];
    let codeIndex = 0;
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        const lang = match[1] || '';
        const code = match[2];
        const placeholder = `__CODEBLOCK_${codeIndex}__`;
        if (lang === 'mermaid') {
            // 保留原始内容，稍后放入 div.mermaid
            codeBlocks.push({ type: 'mermaid', code, placeholder });
        } else {
            const escaped = escapeHtml(code);
            const rendered = `<pre><code class="language-${escapeHtml(lang)}">${escaped}</code></pre>`;
            codeBlocks.push({ type: 'code', rendered, placeholder });
        }
        html = html.replace(match[0], placeholder);
        codeIndex++;
    }

    // 2. 处理表格（Markdown 表格 → HTML table）
    const lines = html.split('\n');
    let inTable = false;
    let tableRows = [];
    const processedLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        // 判断是否为表格行：以 | 开头和结尾，且至少含两个 |
        if (/^\|.*\|$/.test(trimmed) && (trimmed.match(/\|/g) || []).length >= 3) {
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            tableRows.push(trimmed);
        } else {
            if (inTable) {
                processedLines.push(renderTable(tableRows));
                inTable = false;
                tableRows = [];
            }
            processedLines.push(line);
        }
    }
    if (inTable) {
        processedLines.push(renderTable(tableRows));
    }
    html = processedLines.join('\n');

    // 3. 行内代码
    html = html.replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`);

    // 4. 换行 → <br>（但代码块占位符和表格已被保护，不会受影响）
    html = html.replace(/\n/g, '<br>');

    // 5. 替换代码块占位符
    codeBlocks.forEach(block => {
        if (block.type === 'code') {
            html = html.replace(block.placeholder, block.rendered);
        } else if (block.type === 'mermaid') {
            // 放入 div.mermaid，后续由 mermaid.run 处理
            html = html.replace(block.placeholder, `<div class="mermaid">${block.code}</div>`);
        }
    });

    return html;
}

// 渲染表格（辅助函数）
function renderTable(rows) {
    if (rows.length < 2) return rows.join('\n');
    const headerCells = rows[0].split('|').filter(c => c.trim() !== '');
    const alignRow = rows[1];
    const alignCells = alignRow.split('|').filter(c => c.trim() !== '');
    const aligns = alignCells.map(cell => {
        const trimmed = cell.trim();
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
        if (trimmed.endsWith(':')) return 'right';
        return 'left';
    });

    let html = '<table>';
    html += '<thead><tr>';
    headerCells.forEach((cell, i) => {
        const align = aligns[i] || 'left';
        html += `<th style="text-align:${align}">${renderInlineMarkdown(cell.trim())}</th>`;
    });
    html += '</tr></thead>';

    html += '<tbody>';
    for (let i = 2; i < rows.length; i++) {
        const cells = rows[i].split('|').filter(c => c.trim() !== '');
        html += '<tr>';
        cells.forEach((cell, j) => {
            const align = aligns[j] || 'left';
            html += `<td style="text-align:${align}">${renderInlineMarkdown(cell.trim())}</td>`;
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

// 内联渲染（用于表格单元格，只处理行内代码和换行）
function renderInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`);
    html = html.replace(/\n/g, '<br>');
    return html;
}

// ---------- Mermaid 降级 ----------
function handleMermaidFallback(container) {
    const mermaidDivs = container.querySelectorAll('.mermaid');
    mermaidDivs.forEach(div => {
        const code = div.textContent;
        // 生成备选
        const encoded = encodeURIComponent(code);
        const imgUrl = `https://mermaid.ink/img/${encoded}`;
        const liveUrl = `https://mermaid.live/edit#pako:${btoa(unescape(encodeURIComponent(code)))}`;
        const fallbackHtml = `
            <div class="mermaid-fallback">
                <p>⚠️ Mermaid 渲染失败，请点击查看：</p>
                <a href="${imgUrl}" target="_blank">查看图表</a> |
                <a href="${liveUrl}" target="_blank">在 Mermaid Live 中编辑</a>
                <pre><code>${escapeHtml(code)}</code></pre>
            </div>
        `;
        div.outerHTML = fallbackHtml;
    });
}

// ============ 初始化 ============
async function init() {
    loadRecords();
    refreshSetCombo();
    try {
        await loadRemoteSets();
    } catch (e) {}

    btnStart.addEventListener('click', startQuiz);
    btnPrev.addEventListener('click', goPrev);
    btnNext.addEventListener('click', goNext);
    btnSubmit.addEventListener('click', submitAnswer);
    btnFinish.addEventListener('click', finishQuiz);
    btnRestart.addEventListener('click', restart);
    setCombo.addEventListener('change', (e) => {
        currentSetName = e.target.value;
        if (defaultHint) defaultHint.style.display = 'none';
    });
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    btnClearCache.addEventListener('click', clearCache);
}

function refreshSetCombo() {
    const allSets = { ...QUESTION_SETS, ...loadedRemoteSets };
    const names = Object.keys(allSets);
    setCombo.innerHTML = '';
    names.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        setCombo.appendChild(opt);
    });
    if (names.includes(currentSetName)) {
        setCombo.value = currentSetName;
    } else if (names.length > 0) {
        setCombo.value = names[0];
        currentSetName = names[0];
    }
}

// ============ 加载远程题库 ============
async function loadRemoteSets() {
    const statusEl = loadStatus;
    try {
        if (statusEl) statusEl.textContent = '⏳ 正在加载远程题库列表...';
        const response = await fetch('./questions.json');
        if (!response.ok) {
            if (statusEl) statusEl.textContent = 'ℹ️ 远程题库列表不可用，使用本地题库';
            console.warn('远程题库列表不可用');
            return;
        }
        const fileList = await response.json();
        if (!Array.isArray(fileList) || fileList.length === 0) {
            if (statusEl) statusEl.textContent = 'ℹ️ 远程题库列表为空';
            return;
        }
        let loadedCount = 0;
        for (const fileName of fileList) {
            try {
                const fileUrl = `./questions/${fileName}`;
                const fileResp = await fetch(fileUrl);
                if (!fileResp.ok) {
                    console.warn(`无法加载 ${fileName}`);
                    continue;
                }
                const data = await fileResp.json();
                let questions = null;
                if (Array.isArray(data)) {
                    questions = data;
                } else if (data && Array.isArray(data.questions)) {
                    questions = data.questions;
                } else {
                    console.warn(`文件 ${fileName} 格式不正确，需要包含 questions 数组`);
                    continue;
                }
                const setName = fileName.replace(/\.[^/.]+$/, '');
                loadedRemoteSets[setName] = { questions: questions };
                loadedCount++;
            } catch (e) {
                console.warn(`加载 ${fileName} 出错:`, e);
            }
        }
        if (loadedCount > 0) {
            if (statusEl) statusEl.textContent = `✅ 成功加载 ${loadedCount} 个远程题库`;
            refreshSetCombo();
        } else {
            if (statusEl) statusEl.textContent = 'ℹ️ 未加载到远程题库，使用本地题库';
        }
    } catch (e) {
        console.warn('加载远程题库失败:', e);
        if (statusEl) statusEl.textContent = 'ℹ️ 远程题库不可用，使用本地题库';
    }
}

// ============ 上传 JSON ============
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const data = JSON.parse(ev.target.result);
            let questions = null;
            if (Array.isArray(data)) {
                questions = data;
            } else if (data && Array.isArray(data.questions)) {
                questions = data.questions;
            } else {
                alert('JSON 格式错误：需要包含 questions 数组或直接是题目数组');
                return;
            }
            const setName = file.name.replace(/\.[^/.]+$/, '') + '(上传)';
            let finalName = setName;
            let idx = 1;
            while (loadedRemoteSets[finalName] || QUESTION_SETS[finalName]) {
                finalName = setName + ` (${idx})`;
                idx++;
            }
            loadedRemoteSets[finalName] = { questions: questions };
            refreshSetCombo();
            setCombo.value = finalName;
            currentSetName = finalName;
            if (loadStatus) loadStatus.textContent = `✅ 已上传题库：${finalName}`;
            if (defaultHint) defaultHint.style.display = 'none';
        } catch (err) {
            alert('解析 JSON 失败：' + err.message);
        }
    };
    reader.readAsText(file);
    fileInput.value = '';
}

// ============ 清除缓存 ============
function clearCache() {
    if (confirm('确定要清除所有答题记录吗？此操作不可撤销。')) {
        localStorage.removeItem('quiz_records');
        records = {};
        if (pageQuiz.classList.contains('active')) {
            showQuestion(currentIndex);
            pageQuestions.forEach((q, idx) => updateListItemMark(idx));
        }
        if (loadStatus) {
            loadStatus.textContent = '🗑️ 答案缓存已清除';
            setTimeout(() => { if (loadStatus) loadStatus.textContent = ''; }, 3000);
        }
    }
}

// ============ 记录管理 ============
function loadRecords() {
    const stored = localStorage.getItem('quiz_records');
    if (stored) {
        try { records = JSON.parse(stored); } catch (e) { records = {}; }
    } else {
        records = {};
    }
}
function saveRecords() {
    localStorage.setItem('quiz_records', JSON.stringify(records));
}
function getRecordKey(setName, qid) { return `${setName}_${qid}`; }
function getRecord(setName, qid) {
    const key = getRecordKey(setName, qid);
    return records[key] || null;
}
function setRecord(setName, qid, userAnswer, correct) {
    const key = getRecordKey(setName, qid);
    records[key] = { userAnswer, correct, timestamp: new Date().toISOString() };
    saveRecords();
}

// ============ 开始答题 ============
function startQuiz() {
    const allSets = { ...QUESTION_SETS, ...loadedRemoteSets };
    const setData = allSets[currentSetName];
    if (!setData) {
        alert('未找到该题库，请重新选择。');
        return;
    }
    currentQuestions = setData.questions.slice();
    pageQuestions = currentQuestions;
    selectedAnswers = {};

    if (progressArea) {
        progressArea.style.display = 'block';
        if (progressLabel) progressLabel.textContent = '正在加载题目...';
        if (progressBar) progressBar.style.width = '0%';
    }

    let loaded = 0;
    const total = currentQuestions.length;
    const interval = setInterval(() => {
        loaded++;
        const pct = (loaded / total) * 100;
        if (progressBar) progressBar.style.width = Math.min(pct, 100) + '%';
        if (progressLabel) progressLabel.textContent = `已加载 ${loaded}/${total} 题...`;
        if (loaded >= total) {
            clearInterval(interval);
            if (progressArea) progressArea.style.display = 'none';
            showPage('quiz');
            renderQuestionList();
            showQuestion(0);
        }
    }, 50);
}

function showPage(page) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    if (page === 'title') pageTitle.classList.add('active');
    else if (page === 'quiz') pageQuiz.classList.add('active');
    else if (page === 'finish') pageFinish.classList.add('active');
}

// ============ 渲染题目列表 ============
function renderQuestionList() {
    questionList.innerHTML = '';
    pageQuestions.forEach((q, idx) => {
        const li = document.createElement('li');
        li.textContent = `第${q.id}题  ${typeShort(q.type)}`;
        const record = getRecord(currentSetName, q.id);
        if (record) {
            if (record.correct === true) li.textContent += ' ✔';
            else if (record.correct === false) li.textContent += ' ✘';
            else if (record.correct === null) li.textContent += ' ?';
        }
        li.dataset.index = idx;
        li.addEventListener('click', () => {
            saveCurrentAnswer();
            showQuestion(idx);
        });
        questionList.appendChild(li);
    });
    updateListActive(0);
}

function updateListActive(index) {
    const items = questionList.querySelectorAll('li');
    items.forEach((li, i) => {
        li.classList.toggle('active', i === index);
    });
}

// ============ 显示题目 ============
function showQuestion(index) {
    if (index < 0 || index >= pageQuestions.length) return;
    currentIndex = index;
    const q = pageQuestions[index];
    const record = getRecord(currentSetName, q.id);

    let html = `<div class="question-title">第${q.id}题  [${typeShort(q.type)}]  ${renderMarkdown(q.question)}</div>`;

    const userAns = (record && record.userAnswer !== undefined) ? record.userAnswer : (selectedAnswers[q.id] || null);
    if (q.type === 'single') {
        html += renderSingleChoice(q, userAns);
    } else if (q.type === 'multiple') {
        html += renderMultipleChoice(q, userAns);
    } else if (q.type === 'fill') {
        html += renderFill(q, userAns);
    } else if (q.type === 'essay') {
        html += renderEssay(q, userAns);
    }

    if (record) {
        const correct = record.correct;
        const expl = q.explanation || '';
        let resultText = '';
        if (q.type === 'essay') {
            resultText = `📝 简答题需自行对照参考答案。<br>参考答案：${renderMarkdown(q.answer)}`;
        } else {
            resultText = correct ? '✅ 回答正确！' : '❌ 回答错误。';
            if (expl) resultText += `<br>解析：${renderMarkdown(expl)}`;
        }
        html += `<div class="result-box ${correct ? 'correct' : 'wrong'}">${resultText}</div>`;
    }

    questionContainer.innerHTML = html;
    bindEvents(q, userAns);
    updateNavButtons();
    updateListActive(index);

    if (record) {
        markOptions(q, userAns);
    }

    // 渲染 LaTeX
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([questionContainer]).catch(() => {});
    }
    // 渲染 Mermaid
    if (window.mermaid) {
        mermaid.run({ nodes: questionContainer.querySelectorAll('.mermaid') })
            .catch(() => handleMermaidFallback(questionContainer));
    } else {
        // 未加载 mermaid，直接降级
        handleMermaidFallback(questionContainer);
    }
}

// ============ 渲染各类题型 ============
function typeShort(t) {
    return { single: '单选', multiple: '多选', fill: '填空', essay: '简答' } [t] || t;
}

function renderSingleChoice(q, userAns) {
    let html = '<div class="options-group">';
    q.options.forEach((opt, idx) => {
        const checked = (userAns === opt) ? 'selected' : '';
        const expl = (q.option_explanations && q.option_explanations[idx]) ? q.option_explanations[idx] : '';
        html += `<div class="option-item ${checked}" data-optindex="${idx}" data-value="${escapeHtml(opt)}">${renderMarkdown(opt)}`;
        if (expl) html += `<div class="option-explain">${renderMarkdown(expl)}</div>`;
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function renderMultipleChoice(q, userAns) {
    let html = '<div class="options-group">';
    const selectedSet = new Set(Array.isArray(userAns) ? userAns : []);
    q.options.forEach((opt, idx) => {
        const checked = selectedSet.has(opt) ? 'selected' : '';
        const expl = (q.option_explanations && q.option_explanations[idx]) ? q.option_explanations[idx] : '';
        html += `<div class="option-item ${checked}" data-optindex="${idx}" data-value="${escapeHtml(opt)}">${renderMarkdown(opt)}`;
        if (expl) html += `<div class="option-explain">${renderMarkdown(expl)}</div>`;
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function renderFill(q, userAns) {
    const val = userAns || '';
    return `<input type="text" class="fill-input" id="fill-input" value="${escapeHtml(val)}" placeholder="请输入答案" />`;
}

function renderEssay(q, userAns) {
    const val = userAns || '';
    return `<textarea class="essay-text" id="essay-text" placeholder="请输入你的答案...">${escapeHtml(val)}</textarea>`;
}

// ============ 事件绑定 ============
function bindEvents(q, userAns) {
    const optionItems = questionContainer.querySelectorAll('.option-item');
    optionItems.forEach(el => {
        el.addEventListener('click', function() {
            const record = getRecord(currentSetName, q.id);
            if (record) return;
            const value = this.dataset.value;
            if (q.type === 'single') {
                optionItems.forEach(opt => opt.classList.remove('selected'));
                this.classList.add('selected');
                selectedAnswers[q.id] = value;
                saveCurrentAnswer();
            } else if (q.type === 'multiple') {
                this.classList.toggle('selected');
                const selected = [];
                optionItems.forEach(opt => {
                    if (opt.classList.contains('selected')) selected.push(opt.dataset.value);
                });
                selectedAnswers[q.id] = selected;
                saveCurrentAnswer();
            }
        });
    });

    const fillInput = document.getElementById('fill-input');
    if (fillInput) {
        fillInput.addEventListener('input', function() {
            if (getRecord(currentSetName, q.id)) return;
            selectedAnswers[q.id] = this.value.trim();
            saveCurrentAnswer();
        });
    }
    const essayText = document.getElementById('essay-text');
    if (essayText) {
        essayText.addEventListener('input', function() {
            if (getRecord(currentSetName, q.id)) return;
            selectedAnswers[q.id] = this.value.trim();
            saveCurrentAnswer();
        });
    }
}

function saveCurrentAnswer() {
    const q = pageQuestions[currentIndex];
    if (!q) return;
    const record = getRecord(currentSetName, q.id);
    if (record) return;
    if (q.type === 'single' || q.type === 'multiple') {
        const items = questionContainer.querySelectorAll('.option-item');
        if (q.type === 'single') {
            let selected = null;
            items.forEach(el => {
                if (el.classList.contains('selected')) selected = el.dataset.value;
            });
            if (selected !== null) selectedAnswers[q.id] = selected;
        } else {
            const selected = [];
            items.forEach(el => {
                if (el.classList.contains('selected')) selected.push(el.dataset.value);
            });
            selectedAnswers[q.id] = selected;
        }
    } else if (q.type === 'fill') {
        const inp = document.getElementById('fill-input');
        if (inp) selectedAnswers[q.id] = inp.value.trim();
    } else if (q.type === 'essay') {
        const ta = document.getElementById('essay-text');
        if (ta) selectedAnswers[q.id] = ta.value.trim();
    }
}

// ============ 提交答案 ============
function submitAnswer() {
    const q = pageQuestions[currentIndex];
    if (!q) return;
    const record = getRecord(currentSetName, q.id);
    if (record) {
        alert('本题已提交，不能重复提交。');
        return;
    }
    let userAns = selectedAnswers[q.id];
    if (userAns === undefined || userAns === null || userAns === '') {
        alert('请先作答再提交。');
        return;
    }
    if (q.type === 'single' && userAns === null) {
        alert('请选择一个选项。');
        return;
    }
    if (q.type === 'multiple' && Array.isArray(userAns) && userAns.length === 0) {
        alert('请至少选择一个选项。');
        return;
    }

    const correct = checkAnswer(q, userAns);
    setRecord(currentSetName, q.id, userAns, correct);
    showQuestion(currentIndex);
    updateListItemMark(currentIndex);
    btnSubmit.style.display = 'none';
    if (currentIndex < pageQuestions.length - 1) {
        btnNext.style.display = 'inline-block';
    } else {
        btnNext.style.display = 'none';
    }
}

function checkAnswer(q, userAns) {
    const correctAns = q.answer;
    if (q.type === 'single') {
        return userAns === correctAns;
    } else if (q.type === 'multiple') {
        if (!Array.isArray(userAns)) return false;
        const sortedUser = userAns.slice().sort();
        const sortedCorrect = correctAns.slice().sort();
        return JSON.stringify(sortedUser) === JSON.stringify(sortedCorrect);
    } else if (q.type === 'fill') {
        const checkOne = (item, input) => {
            input = input.trim();
            if (typeof item === 'string' && item.startsWith('regex:')) {
                try {
                    return new RegExp(item.slice(6)).test(input);
                } catch (e) { return false; }
            }
            return input.toLowerCase() === String(item).toLowerCase();
        };
        if (Array.isArray(correctAns)) {
            return correctAns.some(item => checkOne(item, userAns));
        } else {
            return checkOne(correctAns, userAns);
        }
    } else if (q.type === 'essay') {
        return null;
    }
    return false;
}

// ============ 标记选项 ============
function markOptions(q, userAns) {
    const items = questionContainer.querySelectorAll('.option-item');
    const correctAns = q.answer;
    let correctSet;
    if (q.type === 'single') {
        correctSet = new Set([correctAns]);
    } else if (q.type === 'multiple') {
        correctSet = new Set(correctAns);
    } else return;

    const userSet = new Set(Array.isArray(userAns) ? userAns : [userAns]);

    items.forEach(el => {
        const val = el.dataset.value;
        const isCorrect = correctSet.has(val);
        const isUser = userSet.has(val);
        el.classList.remove('selected', 'correct', 'wrong', 'missed');
        if (isCorrect && isUser) {
            el.classList.add('correct');
        } else if (isCorrect && !isUser) {
            el.classList.add('missed');
        } else if (!isCorrect && isUser) {
            el.classList.add('wrong');
        }
    });
}

// ============ 更新列表项标记 ============
function updateListItemMark(index) {
    const q = pageQuestions[index];
    if (!q) return;
    const record = getRecord(currentSetName, q.id);
    const items = questionList.querySelectorAll('li');
    if (items[index]) {
        let text = `第${q.id}题  ${typeShort(q.type)}`;
        if (record) {
            if (record.correct === true) text += ' ✔';
            else if (record.correct === false) text += ' ✘';
            else if (record.correct === null) text += ' ?';
        }
        items[index].textContent = text;
    }
}

// ============ 导航 ============
function goPrev() {
    if (currentIndex > 0) {
        saveCurrentAnswer();
        showQuestion(currentIndex - 1);
    }
}

function goNext() {
    if (currentIndex < pageQuestions.length - 1) {
        saveCurrentAnswer();
        showQuestion(currentIndex + 1);
    }
}

function updateNavButtons() {
    btnPrev.disabled = (currentIndex === 0);
    btnNext.style.display = (currentIndex < pageQuestions.length - 1) ? 'inline-block' : 'none';
    const q = pageQuestions[currentIndex];
    if (q) {
        const record = getRecord(currentSetName, q.id);
        btnSubmit.style.display = record ? 'none' : 'inline-block';
        if (record) {
            if (currentIndex < pageQuestions.length - 1) {
                btnNext.style.display = 'inline-block';
            } else {
                btnNext.style.display = 'none';
            }
        } else {
            btnNext.style.display = 'none';
        }
    }
}

// ============ 结束答题 ============
function finishQuiz() {
    const total = pageQuestions.length;
    let answered = 0,
        correct = 0,
        wrong = 0,
        essay = 0;
    const wrongItems = [];
    const essayItems = [];

    pageQuestions.forEach(q => {
        const rec = getRecord(currentSetName, q.id);
        if (rec) {
            answered++;
            if (rec.correct === true) {
                correct++;
            } else if (rec.correct === false) {
                wrong++;
                wrongItems.push({ question: q, userAnswer: rec.userAnswer });
            } else if (rec.correct === null) {
                essay++;
                essayItems.push({ question: q, userAnswer: rec.userAnswer });
            }
        }
    });

    const unanswered = total - answered;
    const objCount = answered - essay;
    let stats = `📊 总题数：${total} ｜ 已答：${answered} ｜ 未答：${unanswered}\n`;
    stats += `✅ 正确：${correct} ｜ ❌ 错误：${wrong} ｜ 📝 简答：${essay}`;
    if (objCount > 0) {
        const acc = (correct / objCount) * 100;
        stats += `\n🎯 客观题正确率：${acc.toFixed(1)}%`;
    } else if (objCount === 0 && answered > 0) {
        stats += `\n📌 全部为简答题，请自行对照参考答案评分。`;
    } else {
        stats += `\n📌 暂未作答任何题目。`;
    }
    statsText.textContent = stats;

    if (wrongItems.length === 0) {
        wrongList.innerHTML = `<div class="empty-hint">🎉 没有错题，继续加油！</div>`;
    } else {
        wrongList.innerHTML = '';
        wrongItems.forEach(item => {
            const card = createReviewCard(item.question, item.userAnswer, 'wrong');
            wrongList.appendChild(card);
        });
    }

    if (essayItems.length === 0) {
        essayList.innerHTML = `<div class="empty-hint">📭 暂无简答题记录</div>`;
    } else {
        essayList.innerHTML = '';
        essayItems.forEach(item => {
            const card = createReviewCard(item.question, item.userAnswer, 'essay');
            essayList.appendChild(card);
        });
    }

    showPage('finish');

    // 渲染 LaTeX 和 Mermaid
    if (window.MathJax && MathJax.typesetPromise) {
        requestAnimationFrame(() => {
            MathJax.typesetPromise([document.getElementById('review-container'), document.getElementById('stats-text')])
                .catch(() => {});
        });
    }
    if (window.mermaid) {
        mermaid.run({ nodes: document.querySelectorAll('#review-container .mermaid') })
            .catch(() => handleMermaidFallback(document.getElementById('review-container')));
    } else {
        handleMermaidFallback(document.getElementById('review-container'));
    }
}

// ============ 创建回顾卡片 ============
function createReviewCard(q, userAnswer, type) {
    const card = document.createElement('div');
    card.className = `review-card ${type === 'wrong' ? 'wrong-card' : 'essay-card'}`;

    const header = document.createElement('div');
    header.className = 'review-card-header';
    const qidSpan = document.createElement('span');
    qidSpan.className = 'qid';
    qidSpan.textContent = `第${q.id}题`;
    const qtypeSpan = document.createElement('span');
    qtypeSpan.className = 'qtype';
    qtypeSpan.textContent = `[${typeShort(q.type)}]`;
    header.appendChild(qidSpan);
    header.appendChild(qtypeSpan);
    card.appendChild(header);

    const qDiv = document.createElement('div');
    qDiv.className = 'review-question';
    qDiv.innerHTML = renderMarkdown(q.question);
    card.appendChild(qDiv);

    const userAnsDiv = document.createElement('div');
    userAnsDiv.className = 'review-answer';
    const userLabel = document.createElement('span');
    userLabel.className = 'label';
    userLabel.textContent = '你的答案：';
    const userVal = document.createElement('span');
    userVal.className = 'value user-value';
    userVal.innerHTML = renderMarkdown(formatAnswerDisplay(q, userAnswer));
    userAnsDiv.appendChild(userLabel);
    userAnsDiv.appendChild(userVal);
    card.appendChild(userAnsDiv);

    if (type === 'wrong') {
        const correctDiv = document.createElement('div');
        correctDiv.className = 'review-answer';
        const corrLabel = document.createElement('span');
        corrLabel.className = 'label';
        corrLabel.textContent = '正确答案：';
        const corrVal = document.createElement('span');
        corrVal.className = 'value correct-value';
        corrVal.innerHTML = renderMarkdown(formatAnswerDisplay(q, q.answer));
        correctDiv.appendChild(corrLabel);
        correctDiv.appendChild(corrVal);
        card.appendChild(correctDiv);

        if (q.explanation) {
            const explDiv = document.createElement('div');
            explDiv.className = 'review-explanation';
            explDiv.innerHTML = `<strong>解析：</strong>${renderMarkdown(q.explanation)}`;
            card.appendChild(explDiv);
        }
    } else {
        const refDiv = document.createElement('div');
        refDiv.className = 'review-answer';
        const refLabel = document.createElement('span');
        refLabel.className = 'label';
        refLabel.textContent = '参考答案：';
        const refVal = document.createElement('span');
        refVal.className = 'value ref-value';
        refVal.innerHTML = renderMarkdown(q.answer || '（无参考答案）');
        refDiv.appendChild(refLabel);
        refDiv.appendChild(refVal);
        card.appendChild(refDiv);

        const note = document.createElement('div');
        note.className = 'review-note';
        note.textContent = '📌 简答题请自行对照参考答案评判。';
        card.appendChild(note);
    }

    return card;
}

// ============ 格式化答案显示 ============
function formatAnswerDisplay(q, ans) {
    if (ans === undefined || ans === null || ans === '') return '（未作答）';
    if (q.type === 'single') {
        return String(ans);
    } else if (q.type === 'multiple') {
        if (Array.isArray(ans)) {
            return ans.length ? ans.join(' ｜ ') : '（未选择）';
        }
        return String(ans);
    } else if (q.type === 'fill') {
        if (Array.isArray(ans)) {
            return ans.map(a => String(a)).join(' 或 ');
        }
        return String(ans);
    } else if (q.type === 'essay') {
        return String(ans) || '（未作答）';
    }
    return String(ans);
}

// ============ 重新开始 ============
function restart() {
    const setKey = currentSetName;
    Object.keys(records).forEach(key => {
        if (key.startsWith(setKey + '_')) delete records[key];
    });
    saveRecords();
    selectedAnswers = {};
    showPage('title');
    questionList.innerHTML = '';
    questionContainer.innerHTML = '';
    btnNext.style.display = 'none';
    wrongList.innerHTML = '';
    essayList.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', init);