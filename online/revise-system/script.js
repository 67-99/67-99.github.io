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

let currentSetName = '默认题库';   // 显示名称
let currentSetHash = '';          // 内容哈希
let currentQuestions = [];
let records = {};
let currentIndex = 0;
let pageQuestions = [];
let selectedAnswers = {};

// DOM 元素引用
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
const btnManage = document.getElementById('btn-manage');
const btnBackFromManage = document.getElementById('btn-back-from-manage');
const manageSetList = document.getElementById('manage-set-list');
const manageCacheList = document.getElementById('manage-cache-list');
const btnClearAllCache = document.getElementById('btn-clear-all-cache');
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

// ============ 哈希计算（稳定序列化） ============
function stableStringify(questions) {
    const sorted = questions.slice().sort((a, b) => a.id - b.id);
    return JSON.stringify(sorted, (key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const keys = Object.keys(value).sort();
            const obj = {};
            for (const k of keys) obj[k] = value[k];
            return obj;
        }
        return value;
    });
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

function computeQuestionsHash(questions) {
    const stable = stableStringify(questions);
    return hashCode(stable);
}

// ============ 校验题目数据结构 ============
function validateQuestions(questions, sourceName = '题库') {
    if (!Array.isArray(questions) || questions.length === 0) {
        return { valid: false, errors: [`❌ ${sourceName}：数据不是非空数组`] };
    }

    const errors = [];
    const idSet = new Set();
    const validTypes = ['single', 'multiple', 'fill', 'essay'];

    questions.forEach((q, index) => {
        const num = index + 1;

        if (!q.hasOwnProperty('id') || typeof q.id !== 'number' || isNaN(q.id)) {
            errors.push(`第 ${num} 题缺少有效的 id (必须为数字)`);
        } else if (idSet.has(q.id)) {
            errors.push(`第 ${num} 题 id=${q.id} 重复，请修改`);
        } else {
            idSet.add(q.id);
        }

        if (!q.type || !validTypes.includes(q.type)) {
            errors.push(`第 ${num} 题 type 无效 ("${q.type}")，须为 single / multiple / fill / essay`);
        }

        if (!q.hasOwnProperty('question') || typeof q.question !== 'string' || q.question.trim() === '') {
            errors.push(`第 ${num} 题缺少题目内容 (question)`);
        }

        if (q.type === 'single' || q.type === 'multiple') {
            if (!Array.isArray(q.options) || q.options.length === 0) {
                errors.push(`第 ${num} 题缺少选项 (options)`);
            } else {
                if (q.hasOwnProperty('option_explanations')) {
                    if (!Array.isArray(q.option_explanations)) {
                        errors.push(`第 ${num} 题 option_explanations 必须是数组`);
                    } else if (q.option_explanations.length !== q.options.length) {
                        errors.push(`第 ${num} 题 option_explanations 长度 (${q.option_explanations.length}) 与 options 长度 (${q.options.length}) 不一致`);
                    }
                }
            }

            if (q.type === 'single') {
                if (typeof q.answer !== 'string' || q.answer.trim() === '') {
                    errors.push(`第 ${num} 题 (单选) 缺少有效答案 (answer)`);
                } else if (Array.isArray(q.options) && !q.options.includes(q.answer)) {
                    errors.push(`第 ${num} 题 答案 "${q.answer}" 不在选项列表中`);
                }
            } else if (q.type === 'multiple') {
                if (!Array.isArray(q.answer) || q.answer.length === 0) {
                    errors.push(`第 ${num} 题 (多选) 缺少有效答案数组 (answer)`);
                } else if (Array.isArray(q.options)) {
                    const invalid = q.answer.filter(a => !q.options.includes(a));
                    if (invalid.length > 0) {
                        errors.push(`第 ${num} 题 答案中包含不在选项中的项: [${invalid.join(', ')}]`);
                    }
                }
            }
        } else if (q.type === 'fill') {
            const isValid = (typeof q.answer === 'string' && q.answer.trim() !== '') ||
                            (Array.isArray(q.answer) && q.answer.length > 0 && q.answer.every(a => typeof a === 'string' && a.trim() !== ''));
            if (!q.hasOwnProperty('answer') || !isValid) {
                errors.push(`第 ${num} 题 (填空) 缺少有效答案 (answer)，须为非空字符串或非空字符串数组`);
            }
        } else if (q.type === 'essay') {
            if (!q.hasOwnProperty('answer') || typeof q.answer !== 'string') {
                errors.push(`第 ${num} 题 (简答) 缺少答案字段 (answer)，可为空字符串`);
            }
        }
    });

    return { valid: errors.length === 0, errors };
}

// ---------- Markdown 渲染 ----------
function renderMarkdown(text) {
    if (!text) return '';
    let html = text;

    const codeBlocks = [];
    let codeIndex = 0;
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        const lang = match[1] || '';
        const code = match[2];
        const placeholder = `__CODEBLOCK_${codeIndex}__`;
        if (lang === 'mermaid') {
            codeBlocks.push({ type: 'mermaid', code, placeholder });
        } else {
            const escaped = escapeHtml(code);
            const rendered = `<pre><code class="language-${escapeHtml(lang)}">${escaped}</code></pre>`;
            codeBlocks.push({ type: 'code', rendered, placeholder });
        }
        html = html.replace(match[0], placeholder);
        codeIndex++;
    }

    const lines = html.split('\n');
    let inTable = false;
    let tableRows = [];
    const processedLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
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

    html = html.replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`);
    html = html.replace(/\n/g, '<br>');

    codeBlocks.forEach(block => {
        if (block.type === 'code') {
            html = html.replace(block.placeholder, block.rendered);
        } else if (block.type === 'mermaid') {
            html = html.replace(block.placeholder, `<div class="mermaid">${block.code}</div>`);
        }
    });

    return html;
}

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

function renderInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`);
    html = html.replace(/\n/g, '<br>');
    return html;
}

function handleMermaidFallback(container) {
    const mermaidDivs = container.querySelectorAll('.mermaid');
    mermaidDivs.forEach(div => {
        const code = div.textContent;
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
    // 为默认题库计算并附加哈希
    for (const [name, data] of Object.entries(QUESTION_SETS)) {
        if (!data._hash) {
            data._hash = computeQuestionsHash(data.questions);
        }
        if (!data._name) data._name = name;
    }
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
        const selected = e.target.options[e.target.selectedIndex];
        currentSetName = selected.dataset.name || selected.textContent;
        currentSetHash = selected.value;
        if (defaultHint) defaultHint.style.display = 'none';
    });
    btnUpload.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    btnManage.addEventListener('click', showManagePage);
    btnBackFromManage.addEventListener('click', () => showPage('title'));
    btnClearAllCache.addEventListener('click', clearAllCache);
}

// ============ 刷新题库下拉列表 ============
function refreshSetCombo() {
    const allSets = { ...QUESTION_SETS, ...loadedRemoteSets };
    // 构建 name -> [{hash, data}] 映射，用于检测同名冲突
    const nameMap = {};
    for (const [key, data] of Object.entries(allSets)) {
        const displayName = data._name || key;
        const hash = data._hash || computeQuestionsHash(data.questions);
        if (!nameMap[displayName]) nameMap[displayName] = [];
        nameMap[displayName].push({ hash, data });
    }

    setCombo.innerHTML = '';
    for (const [name, items] of Object.entries(nameMap)) {
        if (items.length === 1) {
            const opt = document.createElement('option');
            opt.value = items[0].hash;
            opt.textContent = name;
            opt.dataset.name = name;
            setCombo.appendChild(opt);
        } else {
            // 同名冲突，附加哈希后缀
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.hash;
                const suffix = item.hash.slice(0, 6);
                opt.textContent = `${name} [${suffix}]`;
                opt.dataset.name = name;
                setCombo.appendChild(opt);
            });
        }
    }

    // 恢复当前选中（若当前 hash 存在）
    if (currentSetHash && [...setCombo.options].some(o => o.value === currentSetHash)) {
        setCombo.value = currentSetHash;
    } else if (setCombo.options.length > 0) {
        setCombo.value = setCombo.options[0].value;
        const selected = setCombo.options[setCombo.selectedIndex];
        currentSetName = selected.dataset.name || selected.textContent;
        currentSetHash = selected.value;
    }

    // 控制默认提示
    const hasRemote = Object.keys(loadedRemoteSets).length > 0;
    if (defaultHint) {
        const onlyDefault = !hasRemote && Object.keys(nameMap).length === 1 && nameMap['默认题库'];
        defaultHint.style.display = onlyDefault ? 'block' : 'none';
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
                const validation = validateQuestions(questions, fileName);
                if (!validation.valid) {
                    console.warn(`⚠️ 跳过 ${fileName}，原因：`, validation.errors.join('; '));
                    if (loadStatus) loadStatus.textContent = `⚠️ 跳过无效题库：${fileName}`;
                    continue;
                }
                const setName = fileName.replace(/\.[^/.]+$/, '');
                const hash = computeQuestionsHash(questions);
                // 存储时统一结构
                loadedRemoteSets[setName] = {
                    _name: setName,
                    _hash: hash,
                    questions: questions
                };
                loadedCount++;
            } catch (e) {
                console.warn(`加载 ${fileName} 出错:`, e);
            }
        }
        refreshSetCombo();
        if (loadedCount > 0) {
            if (statusEl) statusEl.textContent = `✅ 成功加载 ${loadedCount} 个远程题库`;
        } else {
            if (statusEl) statusEl.textContent = 'ℹ️ 未加载到远程题库，使用本地题库';
        }
    } catch (e) {
        console.warn('加载远程题库失败:', e);
        if (statusEl) statusEl.textContent = 'ℹ️ 远程题库不可用，使用本地题库';
        refreshSetCombo();
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
                alert('❌ JSON 格式错误：需要包含 questions 数组或直接是题目数组');
                return;
            }

            const validation = validateQuestions(questions, file.name);
            if (!validation.valid) {
                alert(`⚠️ 上传的题库存在以下问题，请修正后重新上传：\n\n${validation.errors.join('\n')}`);
                return;
            }

            const baseName = file.name.replace(/\.[^/.]+$/, '');
            const hash = computeQuestionsHash(questions);
            // 如果已存在同名不同hash，则给用户提示，但允许添加（会附加后缀）
            // 但我们直接以 baseName 作为显示名，并存储
            const displayName = baseName;
            // 避免覆盖已有同名条目（但loadedRemoteSets是对象，键可能冲突，我们使用 baseName + hash 作为键？）
            // 但为了管理方便，我们仍用 baseName 作为键，但若已存在，则加上后缀
            let key = baseName;
            let counter = 1;
            while (loadedRemoteSets[key] && loadedRemoteSets[key]._hash !== hash) {
                key = `${baseName} (${counter})`;
                counter++;
            }
            loadedRemoteSets[key] = {
                _name: baseName,
                _hash: hash,
                questions: questions
            };
            refreshSetCombo();
            // 自动选中新上传的题库
            setCombo.value = hash;
            const selected = setCombo.options[setCombo.selectedIndex];
            currentSetName = selected.dataset.name || selected.textContent;
            currentSetHash = selected.value;
            if (loadStatus) loadStatus.textContent = `✅ 已上传题库：${key}`;
            if (defaultHint) defaultHint.style.display = 'none';
        } catch (err) {
            alert('❌ 解析 JSON 失败：' + err.message);
        }
    };
    reader.readAsText(file);
    fileInput.value = '';
}

// ============ 记录管理（使用 名称+哈希 作为键前缀） ============
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
function getRecordKey(setName, hash, qid) {
    return `${setName}_${hash}_${qid}`;
}
function getRecord(setName, hash, qid) {
    const key = getRecordKey(setName, hash, qid);
    const rec = records[key];
    if (rec) {
        // 可选：增加版本检查，但这里依靠 hash 已足够
        return rec;
    }
    return null;
}
function setRecord(setName, hash, qid, userAnswer, correct) {
    const key = getRecordKey(setName, hash, qid);
    records[key] = { userAnswer, correct, timestamp: new Date().toISOString() };
    saveRecords();
}
// 清理旧格式（可选，在 init 中调用一次）
function cleanOldRecords() {
    const toDelete = [];
    for (const key in records) {
        // 如果键只有两个下划线分隔（旧格式），则删除
        const parts = key.split('_');
        if (parts.length === 2) {
            toDelete.push(key);
        }
    }
    if (toDelete.length > 0) {
        toDelete.forEach(k => delete records[k]);
        saveRecords();
    }
}

// ============ 管理页面 ============
function showManagePage() {
    showPage('manage');
    renderManagePage();
}

function renderManagePage() {
    // ----- 左侧题库列表 -----
    const allSets = { ...QUESTION_SETS, ...loadedRemoteSets };
    const setEntries = Object.entries(allSets);
    manageSetList.innerHTML = '';
    if (setEntries.length === 0) {
        manageSetList.innerHTML = '<div class="manage-empty">暂无题库</div>';
    } else {
        setEntries.forEach(([key, data]) => {
            const displayName = data._name || key;
            const hash = data._hash || computeQuestionsHash(data.questions);
            const isDefault = QUESTION_SETS.hasOwnProperty(key);
            const isUpload = loadedRemoteSets.hasOwnProperty(key);
            const div = document.createElement('div');
            div.className = 'set-item';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'set-name';
            nameSpan.textContent = displayName + (isDefault ? '' : ` [${hash.slice(0,6)}]`);
            const tag = document.createElement('span');
            tag.className = 'set-tag' + (isDefault ? ' default' : ' upload');
            tag.textContent = isDefault ? '默认' : '上传';
            nameSpan.appendChild(tag);
            div.appendChild(nameSpan);

            if (isUpload) {
                const delBtn = document.createElement('button');
                delBtn.className = 'btn-del-set';
                delBtn.textContent = '✕';
                delBtn.title = '删除该题库';
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`确定要删除题库“${displayName}”吗？此操作不可撤销。`)) {
                        delete loadedRemoteSets[key];
                        refreshSetCombo();
                        if (currentSetHash === hash) {
                            const allSetsNow = { ...QUESTION_SETS, ...loadedRemoteSets };
                            const first = Object.values(allSetsNow)[0];
                            if (first) {
                                const firstHash = first._hash || computeQuestionsHash(first.questions);
                                setCombo.value = firstHash;
                                const selected = setCombo.options[setCombo.selectedIndex];
                                currentSetName = selected.dataset.name || selected.textContent;
                                currentSetHash = selected.value;
                            }
                        }
                        renderManagePage();
                    }
                });
                div.appendChild(delBtn);
            } else {
                const dummy = document.createElement('span');
                dummy.style.width = '1.5rem';
                div.appendChild(dummy);
            }
            manageSetList.appendChild(div);
        });
    }

    // ----- 右侧缓存列表 -----
    const cacheGroups = getCacheGrouped();
    manageCacheList.innerHTML = '';
    if (Object.keys(cacheGroups).length === 0) {
        manageCacheList.innerHTML = '<div class="manage-empty">暂无缓存记录</div>';
    } else {
        Object.keys(cacheGroups).forEach(groupKey => {
            const count = cacheGroups[groupKey];
            const div = document.createElement('div');
            div.className = 'cache-item';
            const nameSpan = document.createElement('span');
            nameSpan.className = 'cache-name';
            nameSpan.textContent = groupKey;
            const countSpan = document.createElement('span');
            countSpan.className = 'cache-count';
            countSpan.textContent = `${count} 题`;
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-del-cache';
            delBtn.textContent = '清除';
            delBtn.addEventListener('click', () => {
                if (confirm(`确定要清除题库“${groupKey}”的所有缓存答案吗？`)) {
                    clearCacheForSet(groupKey);
                    renderManagePage();
                }
            });
            div.appendChild(nameSpan);
            div.appendChild(countSpan);
            div.appendChild(delBtn);
            manageCacheList.appendChild(div);
        });
    }
}

// 获取按 “名称_哈希” 分组的缓存条目数
function getCacheGrouped() {
    const groups = {};
    for (const key in records) {
        // 新格式：名称_哈希_题号
        const parts = key.split('_');
        if (parts.length >= 3) {
            const groupKey = parts.slice(0, 2).join('_'); // 取前两部分
            if (!groups[groupKey]) groups[groupKey] = 0;
            groups[groupKey]++;
        }
    }
    return groups;
}

// 清除某个题库（按 groupKey）的所有缓存
function clearCacheForSet(groupKey) {
    const prefix = groupKey + '_';
    for (const key in records) {
        if (key.startsWith(prefix)) {
            delete records[key];
        }
    }
    saveRecords();
    if (pageQuiz.classList.contains('active')) {
        showQuestion(currentIndex);
        pageQuestions.forEach((q, idx) => updateListItemMark(idx));
    }
}

// 清空所有缓存
function clearAllCache() {
    if (!confirm('确定要清空所有缓存答案吗？此操作不可撤销。')) return;
    records = {};
    saveRecords();
    if (pageQuiz.classList.contains('active')) {
        showQuestion(currentIndex);
        pageQuestions.forEach((q, idx) => updateListItemMark(idx));
    }
    renderManagePage();
    if (loadStatus) {
        loadStatus.textContent = '🗑️ 所有缓存已清除';
        setTimeout(() => { if (loadStatus) loadStatus.textContent = ''; }, 3000);
    }
}

// ============ 开始答题 ============
function startQuiz() {
    const allSets = { ...QUESTION_SETS, ...loadedRemoteSets };
    // 根据当前 hash 查找题库
    let setData = null;
    for (const [key, data] of Object.entries(allSets)) {
        const hash = data._hash || computeQuestionsHash(data.questions);
        if (hash === currentSetHash) {
            setData = data;
            break;
        }
    }
    if (!setData) {
        alert('未找到该题库，请重新选择。');
        return;
    }
    currentQuestions = setData.questions.slice();
    pageQuestions = currentQuestions;

    questionList.innerHTML = '';
    questionContainer.innerHTML = '';

    if (progressArea) {
        progressArea.style.display = 'block';
        if (progressLabel) progressLabel.textContent = '正在加载题目... 0%';
        if (progressBar) progressBar.style.width = '0%';
    }

    const total = currentQuestions.length;
    let rendered = 0;
    const BATCH_SIZE = 20;

    function renderBatch() {
        const start = rendered;
        const end = Math.min(rendered + BATCH_SIZE, total);
        const fragment = document.createDocumentFragment();
        for (let i = start; i < end; i++) {
            const q = currentQuestions[i];
            const li = document.createElement('li');
            let text = `第${q.id}题  ${typeShort(q.type)}`;
            const record = getRecord(currentSetName, currentSetHash, q.id);
            if (record) {
                if (record.correct === true) text += ' ✔';
                else if (record.correct === false) text += ' ✘';
                else if (record.correct === null) text += ' ?';
            }
            li.textContent = text;
            li.dataset.index = i;
            li.addEventListener('click', () => {
                saveCurrentAnswer();
                showQuestion(i);
            });
            fragment.appendChild(li);
        }
        questionList.appendChild(fragment);

        rendered = end;
        const percent = Math.round((rendered / total) * 100);
        if (progressBar) progressBar.style.width = percent + '%';
        if (progressLabel) progressLabel.textContent = `正在加载题目... ${percent}%`;

        if (rendered < total) {
            setTimeout(renderBatch, 0);
        } else {
            if (progressArea) progressArea.style.display = 'none';
            showPage('quiz');
            showQuestion(0);
            updateListActive(0);
        }
    }

    renderBatch();
}

function showPage(page) {
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    if (page === 'title') pageTitle.classList.add('active');
    else if (page === 'quiz') pageQuiz.classList.add('active');
    else if (page === 'finish') pageFinish.classList.add('active');
    else if (page === 'manage') document.getElementById('page-manage').classList.add('active');
}

// ============ 渲染题目列表（用于重新加载） ============
function renderQuestionList() {
    questionList.innerHTML = '';
    pageQuestions.forEach((q, idx) => {
        const li = document.createElement('li');
        let text = `第${q.id}题  ${typeShort(q.type)}`;
        const record = getRecord(currentSetName, currentSetHash, q.id);
        if (record) {
            if (record.correct === true) text += ' ✔';
            else if (record.correct === false) text += ' ✘';
            else if (record.correct === null) text += ' ?';
        }
        li.textContent = text;
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
    const record = getRecord(currentSetName, currentSetHash, q.id);

    const showExplanations = !!record;

    let html = `<div class="question-title">第${q.id}题  [${typeShort(q.type)}]  ${renderMarkdown(q.question)}</div>`;

    const userAns = (record && record.userAnswer !== undefined) ? record.userAnswer : (selectedAnswers[q.id] || null);
    if (q.type === 'single') {
        html += renderSingleChoice(q, userAns, showExplanations);
    } else if (q.type === 'multiple') {
        html += renderMultipleChoice(q, userAns, showExplanations);
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

    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([questionContainer]).catch(() => {});
    }
    if (window.mermaid) {
        mermaid.run({ nodes: questionContainer.querySelectorAll('.mermaid') })
            .catch(() => handleMermaidFallback(questionContainer));
    } else {
        handleMermaidFallback(questionContainer);
    }
}

// ============ 渲染各类题型 ============
function typeShort(t) {
    return { single: '单选', multiple: '多选', fill: '填空', essay: '简答' } [t] || t;
}

function renderSingleChoice(q, userAns, showExplanations = false) {
    let html = '<div class="options-group">';
    q.options.forEach((opt, idx) => {
        const checked = (userAns === opt) ? 'selected' : '';
        const expl = (showExplanations && q.option_explanations && q.option_explanations[idx]) ? q.option_explanations[idx] : '';
        html += `<div class="option-item ${checked}" data-optindex="${idx}" data-value="${escapeHtml(opt)}">${renderMarkdown(opt)}`;
        if (expl) html += `<div class="option-explain">${renderMarkdown(expl)}</div>`;
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function renderMultipleChoice(q, userAns, showExplanations = false) {
    let html = '<div class="options-group">';
    const selectedSet = new Set(Array.isArray(userAns) ? userAns : []);
    q.options.forEach((opt, idx) => {
        const checked = selectedSet.has(opt) ? 'selected' : '';
        const expl = (showExplanations && q.option_explanations && q.option_explanations[idx]) ? q.option_explanations[idx] : '';
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
            const record = getRecord(currentSetName, currentSetHash, q.id);
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
            if (getRecord(currentSetName, currentSetHash, q.id)) return;
            selectedAnswers[q.id] = this.value.trim();
            saveCurrentAnswer();
        });
    }
    const essayText = document.getElementById('essay-text');
    if (essayText) {
        essayText.addEventListener('input', function() {
            if (getRecord(currentSetName, currentSetHash, q.id)) return;
            selectedAnswers[q.id] = this.value.trim();
            saveCurrentAnswer();
        });
    }
}

function saveCurrentAnswer() {
    const q = pageQuestions[currentIndex];
    if (!q) return;
    const record = getRecord(currentSetName, currentSetHash, q.id);
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
    const record = getRecord(currentSetName, currentSetHash, q.id);
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
    setRecord(currentSetName, currentSetHash, q.id, userAns, correct);
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
    const record = getRecord(currentSetName, currentSetHash, q.id);
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
        const record = getRecord(currentSetName, currentSetHash, q.id);
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
        const rec = getRecord(currentSetName, currentSetHash, q.id);
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
    selectedAnswers = {};
    showPage('title');
    questionList.innerHTML = '';
    questionContainer.innerHTML = '';
    btnNext.style.display = 'none';
    wrongList.innerHTML = '';
    essayList.innerHTML = '';
}

// 初始化时清理旧格式缓存
document.addEventListener('DOMContentLoaded', () => {
    cleanOldRecords();
    init();
});