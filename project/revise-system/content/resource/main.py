#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PyQt6 做题程序（支持多套题，cases 环境分开渲染，按钮降级 Unicode，支持部分 Markdown）
新增：行内代码 `code`、Markdown 表格（含对齐）
交互优化：提交前不显示“下一题”，提交后才显示
适配：支持字符串 ID（如 "5a"），内部使用 _index 索引，记录存储结构改为嵌套对象
"""

import sys, os, re, json, base64
from datetime import datetime
from pathlib import Path
from io import BytesIO

from PyQt6.QtWidgets import *
from PyQt6.QtCore import *
from PyQt6.QtGui import *

try:
    # import mermaid_rs
    raise ImportError  #未找到合适本地渲染库，暂时短路
    MERMAID_AVAILABLE = True
except ImportError:
    MERMAID_AVAILABLE = False
    # print("提示：安装 mermaid-rs 可支持本地Mermaid图表 (pip install mermaid-rs==0.1.3)")
    mermaid_rs = None

# ---------- matplotlib 配置 ----------
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    matplotlib.rcParams['figure.max_open_warning'] = 0
    matplotlib.rcParams['text.usetex'] = False
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False

# ---------- 路径常量 ----------
QUESTION_SETS_DIR = "questions"
RECORDS_DIR = "records"

def getFilePath(path: str):
    return os.path.join(os.path.dirname(__file__), path)

def ensure_dir(path: str):
    Path(path).mkdir(parents=True, exist_ok=True)

# ---------- LaTeX 预处理器 ----------
class LatexPreprocessor:
    @staticmethod
    def process(formula: str) -> str:
        # 分数简写 \frac13 → \frac{1}{3}
        formula = re.sub(r'\\frac([^\s\{])([^\s\{])', r'\\frac{\1}{\2}', formula)
        # 不等号
        formula = re.sub(r'\\le(?![a-zA-Z])', r'\\leq', formula)
        formula = re.sub(r'\\ge(?![a-zA-Z])', r'\\geq', formula)
        # \text{...} → \mathrm{...}
        formula = re.sub(r'\\text\{([^}]*)\}', r'\\mathrm{\1}', formula)
        # \xrightarrow → \rightarrow
        formula = re.sub(r'\\xrightarrow\{.*?\}', r'\\rightarrow', formula)
        # \binom → C_{a}^{b}
        formula = re.sub(r'\\binom\{(.*?)\}\{(.*?)\}', r'C_{\1}^{\2}', formula)
        return formula.strip()

# ---------- LaTeX 渲染缓存 ----------
class LatexCache:
    def __init__(self):
        self._cache = {}

    def render(self, formula, color='black', fontsize=14, dpi=100):
        key = (formula, color, fontsize)
        if key in self._cache:
            return self._cache[key]
        if not MATPLOTLIB_AVAILABLE:
            return None

        processed = LatexPreprocessor.process(formula)
        try:
            plt.close('all')
            fig, ax = plt.subplots(figsize=(0.01, 0.01))
            text = ax.text(0, 0, f"${processed}$", fontsize=fontsize, color=color, ha='left', va='bottom')
            ax.axis('off')
            ax.margins(0)
            fig.canvas.draw()
            bbox = text.get_window_extent(renderer=fig.canvas.get_renderer())
            w, h = bbox.width / fig.dpi, bbox.height / fig.dpi
            plt.close(fig)
            if w <= 0 or h <= 0:
                return None

            fig, ax = plt.subplots(figsize=(w, h), dpi=dpi)
            fig.patch.set_alpha(0)
            ax.patch.set_alpha(0)
            ax.text(0, 0, f"${processed}$", fontsize=fontsize, color=color, ha='left', va='bottom')
            ax.axis('off')
            ax.set_xlim(0, w * dpi)
            ax.set_ylim(0, h * dpi)
            ax.margins(0)
            fig.subplots_adjust(left=0, right=1, bottom=0, top=1)
            fig.canvas.draw()

            buf = BytesIO()
            fig.savefig(buf, format='png', transparent=True, dpi=dpi, bbox_inches='tight', pad_inches=0)
            plt.close(fig)
            plt.close('all')
            buf.seek(0)
            b64 = base64.b64encode(buf.read()).decode('utf-8')
            self._cache[key] = b64
            return b64
        except Exception:
            plt.close('all')
            return None

    def clear(self):
        self._cache.clear()
        plt.close('all')

LATEX_CACHE = LatexCache()

# ---------- LaTeX 转可读 Unicode (用于按钮降级) ----------
def latex_to_readable_text(text: str) -> str:
    symbol_map = {
        r'\sum': '∑', r'\int': '∫',r'\prod': '∏',  r'\infty': '∞',
        r'\cup': '∪', r'\cap': '∩', r'\subset': '⊂', r'\subseteq': '⊆',
        r'\supset': '⊃', r'\supseteq': '⊇', r'\in': '∈', r'\notin': '∉',
        r'\emptyset': '∅', r'\forall': '∀', r'\exists': '∃', r'\to': '→',
        r'\rightarrow': '→', r'\leftarrow': '←',
        r'\alpha': 'α', r'\beta': 'β', r'\gamma': 'γ', r'\delta': 'δ',
        r'\epsilon': 'ε', r'\zeta': 'ζ', r'\eta': 'η', r'\theta': 'θ',
        r'\iota': 'ι', r'\kappa': 'κ', r'\lambda': 'λ', r'\mu': 'μ',
        r'\nu': 'ν', r'\xi': 'ξ', r'\pi': 'π', r'\rho': 'ρ', r'\sigma': 'σ',
        r'\tau': 'τ', r'\upsilon': 'υ', r'\phi': 'φ', r'\chi': 'χ',
        r'\psi': 'ψ', r'\omega': 'ω',
        r'\ldots': '…', r'\cdots': '⋯', r'\vdots': '⋮', r'\ddots': '⋱',
        r'\sqrt': '√',r'\leq': '≤', r'\le': '≤', 
        r'\geq': '≥', r'\ge': '≥', r'\ne': '≠', r'\neq': '≠',
        r'\approx': '≈', r'\times': '×', r'\cdot': '·', r'\pm': '±',
        r'\mp': '∓', r'\div': '÷', r'\circ': '∘', r'\bullet': '•',
    }

    def convert_fraction(m):
        num = m.group(1).strip()
        den = m.group(2).strip()
        unicode_fractions = {
            ('1','2'): '½', ('1','3'): '⅓', ('2','3'): '⅔',
            ('1','4'): '¼', ('3','4'): '¾', ('1','5'): '⅕',
            ('2','5'): '⅖', ('3','5'): '⅗', ('4','5'): '⅘',
            ('1','6'): '⅙', ('5','6'): '⅚', ('1','8'): '⅛',
            ('3','8'): '⅜', ('5','8'): '⅝', ('7','8'): '⅞',
        }
        key = (num, den)
        if key in unicode_fractions:
            return unicode_fractions[key]
        else:
            return f"{num}/{den}"

    def convert_inside(match):
        inner = match.group(1)
        inner = re.sub(r'\\frac\{([^{}]*)\}\{([^{}]*)\}', convert_fraction, inner)
        for cmd, sym in symbol_map.items():
            inner = inner.replace(cmd, sym)
        inner = re.sub(r'\\([a-zA-Z]+)', r'\1', inner)
        inner = re.sub(r'\{([^{}]*)\}', r'\1', inner)
        return inner

    result = re.sub(r'\$([^$]+)\$', convert_inside, text)
    result = result.replace('$', '')
    return result

# ---------- 辅助函数：渲染不含 cases 的单个公式为 <img> ----------
def _render_single_formula(formula: str, color: str, fontsize: int) -> str:
    if not formula:
        return ""
    b64 = LATEX_CACHE.render(formula, color=color, fontsize=fontsize)
    if b64:
        return f'<img src="data:image/png;base64,{b64}"style="vertical-align: middle;">'
    else:
        readable = latex_to_readable_text(f"${formula}$")
        return readable.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

# ---------- 将 cases 环境渲染为 HTML 表格 + Unicode 大括号 ----------
def render_cases_to_html(cases_body: str, color: str, fontsize: int) -> str:
    lines = [line.strip() for line in cases_body.split(r'\\') if line.strip()]
    rows = []
    for line in lines:
        parts = line.split('&')
        value = parts[0].strip()
        condition = parts[1].strip() if len(parts) > 1 else ''
        rows.append((value, condition))

    if not rows:
        return ""

    row_html = []
    for value, condition in rows:
        value_img = _render_single_formula(value, color, fontsize)
        cond_img = _render_single_formula(condition, color, fontsize) if condition else ''
        row_html.append(f"""
        <tr>
            <td style="text-align: right; padding-right: 10px;">{value_img}</td>
            <td style="text-align: left;">{cond_img}</td>
        </tr>
        """)

    n = len(rows)
    if n == 1:
        brace_html = f"<span style='font-size: 200%;'>{'{'}</span>"
    else:
        brace_lines = []
        for i in range(n):
            if i == 0:
                brace_lines.append("⎧")
            elif i == n-1:
                brace_lines.append("⎩")
            else:
                brace_lines.append("⎨")
        brace_html = '<div style="display: inline-block; text-align: center;">' + \
                     '<br>'.join(f'<span style="font-size: 200%;">{ch}</span>' for ch in brace_lines) + \
                     '</div>'

    html = f"""
    <table style="display: inline-table; border-collapse: collapse;">
        <tr>
            <td style="vertical-align: middle;">{brace_html}</td>
            <td style="vertical-align: middle;">
                <table style="border-collapse: collapse;">
                    {''.join(row_html)}
                </table>
            </td>
        </tr>
    </table>
    """
    return html

# ---------- 系统文字颜色 ----------
def get_system_text_color():
    palette = QApplication.palette()
    fg = palette.color(QPalette.ColorRole.Text)
    return 'white' if fg.lightness() > 128 else 'black'

# ---------- Markdown 表格解析辅助函数 ----------
def _parse_table_row(row: str):
    """解析一行表格，返回去除首尾 | 后的列列表（已 strip）"""
    stripped = row.strip()
    if not stripped.startswith('|') or not stripped.endswith('|'):
        return []
    inner = stripped[1:-1]
    cols = [col.strip() for col in inner.split('|')]
    return cols

def _parse_align(sep_row: str):
    """解析分隔行，返回每列的对齐方式列表"""
    cols = _parse_table_row(sep_row)
    aligns = []
    for col in cols:
        col = col.strip()
        if col.startswith(':') and col.endswith(':'):
            aligns.append('center')
        elif col.endswith(':'):
            aligns.append('right')
        else:
            aligns.append('left')
    return aligns

def _generate_table_html(header, aligns, data_rows):
    """生成完整的表格 HTML"""
    if not header:
        return ''
    if len(aligns) < len(header):
        aligns.extend(['left'] * (len(header) - len(aligns)))
    elif len(aligns) > len(header):
        aligns = aligns[:len(header)]

    thead = '<thead><tr>'
    for col, align in zip(header, aligns):
        thead += f'<th style="text-align: {align}; border: 1px solid #ccc; padding: 6px;">{col}</th>'
    thead += '</tr></thead>'

    tbody = '<tbody>'
    for row in data_rows:
        if len(row) < len(header):
            row += [''] * (len(header) - len(row))
        elif len(row) > len(header):
            row = row[:len(header)]
        tbody += '<tr>'
        for col, align in zip(row, aligns):
            tbody += f'<td style="text-align: {align}; border: 1px solid #ccc; padding: 6px;">{col}</td>'
        tbody += '</tr>'
    tbody += '</tbody>'

    return f'<table style="border-collapse: collapse; margin: 10px 0;">{thead}{tbody}</table>'

def _convert_markdown_tables(text: str) -> str:
    """将文本中的 Markdown 表格转换为 HTML 表格"""
    lines = text.splitlines(True)
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if stripped.startswith('|') and stripped.endswith('|'):
            table_lines = []
            while i < len(lines):
                sl = lines[i].strip()
                if sl.startswith('|') and sl.endswith('|'):
                    table_lines.append(lines[i].rstrip('\n'))
                    i += 1
                else:
                    break
            if len(table_lines) >= 2 and '---' in table_lines[1]:
                header = _parse_table_row(table_lines[0])
                align = _parse_align(table_lines[1])
                data_rows = [_parse_table_row(row) for row in table_lines[2:]]
                html_table = _generate_table_html(header, align, data_rows)
                new_lines.append(html_table + '\n')
            else:
                new_lines.extend([line + '\n' for line in table_lines])
        else:
            new_lines.append(lines[i])
            i += 1
    return ''.join(new_lines)

def protect_mermaid_text(code: str) -> str:
    """ 对 Mermaid 代码中所有可见文本应用尖括号替换，同时保留箭头语法。"""
    def replace_text(text):
        return text.replace("<<", "«").replace(">>", "»").replace("<", "‹").replace(">", "›")

    def repl_quotes(m):
        return m.group(1) + replace_text(m.group(2)) + m.group(1)
    code = re.sub(r'(["\'])((?:(?!\1).)*)\1', repl_quotes, code, flags=re.DOTALL)

    arrow_patterns = [
        r'<\|-+', r'-+\|>',
        r'\*-+', r'-+\*',
        r'o-+', r'-+o',
        r'<\|\.+', r'\.+\|>',
        r'<\.+', r'\.+>',
        r'\.+',
        r'<<?-\.+-', r'-\.+->>?',
        r'<<?=+', r'=+>>?',
        r'<<?-+', r'-+>>?',
        r'=+',
        r'-+',
        r'\.+',
        r'<=+>?',
        r'<-+>?',
    ]
    arrow_re = '|'.join(arrow_patterns)
    arrow_re = r'(?<![_])(?:' + arrow_re + r')(?![_])'
    arrows = {}
    def save_arrow(m):
        token = f"__ARROW_{len(arrows)}__"
        arrows[token] = m.group(0)
        return token
    code = re.sub(arrow_re, save_arrow, code)

    def repl_pipe(m):
        return '|' + replace_text(m.group(1)) + '|'
    code = re.sub(r'\|([^|\n]*)\|', repl_pipe, code)

    def repl_brackets(m):
        open_br = m.group(1)
        close_br = m.group(3)
        inner = m.group(2)
        if '<' in inner or '>' in inner:
            return open_br + replace_text(inner) + close_br
        return m.group(0)
    code = re.sub(r'([\(\{\[])([^)]*?)([\)\}\]]])', repl_brackets, code)

    code = code.replace("<<", "«").replace(">>", "»")
    code = code.replace("<", "‹").replace(">", "›")

    for token, arrow in arrows.items():
        code = code.replace(token, arrow)

    return code

def _fallback_mermaid(code: str) -> str:
    """生成 Mermaid 备选显示：mermaid.ink 图片 + 代码块 + Mermaid Live 链接"""
    b64 = base64.b64encode(code.encode('utf-8')).decode('utf-8')
    b64 = b64.replace('+', '-').replace('/', '_').rstrip('=')
    url = f"https://mermaid.ink/img/{b64}"
    safe_code = code.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    html = f'''
    <div style="margin: 10px 0; padding: 10px; border: 1px dashed #ff9800; border-radius: 6px; background: rgba(255,152,0,0.1);">
        <p>
            <a href="{url}" target="_blank" style="color: #4fc3f7; text-decoration: underline;">查看图表 (mermaid.ink)</a>
            &nbsp;|&nbsp;
            <a href="https://mermaid.live/" target="_blank" style="color: #4fc3f7; text-decoration: underline;">在 Mermaid Live 中编辑</a>
        </p>
        <pre style="background-color: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.9em; font-family: monospace;"><code>{safe_code}</code></pre>
    </div>
    '''
    return html

# ---------- 主要 LaTeX + Markdown 转 HTML 函数 ----------
def latex_text_to_html(text, color=None, fontsize=14):
    if color is None:
        color = get_system_text_color()

    code_block_map = {}
    def replace_code_block(match):
        idx = len(code_block_map)
        lang = match.group(1).strip()
        content = match.group(2).strip('\n')
        code_block_map[idx] = (lang, content)
        return f"__BLOCK_CODE_{idx}__"

    pattern = r'\n?```([^\n]*)\n(.*?)\n```\n?'
    text = re.sub(pattern, replace_code_block, text, flags=re.DOTALL)

    code_map = {}
    def replace_inline_code(match):
        idx = len(code_map)
        code_map[idx] = match.group(1)
        return f"__INLINE_CODE_{idx}__"
    text = re.sub(r'`([^`]+)`', replace_inline_code, text)

    text = _convert_markdown_tables(text)

    parts = re.split(r'(\$[^$]+\$)', text)
    html_parts = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if part.startswith('$') and part.endswith('$'):
            formula = part[1:-1]
            cases_match = re.search(r'\\begin\{cases\}(.*?)\\end\{cases\}', formula, re.DOTALL)
            if cases_match:
                cases_body = cases_match.group(1)
                before = formula[:cases_match.start()]
                after = formula[cases_match.end():]
                cases_html = render_cases_to_html(cases_body, color, fontsize)
                before_html = _render_single_formula(before, color, fontsize) if before else ''
                after_html = _render_single_formula(after, color, fontsize) if after else ''
                combined = f"{before_html}{cases_html}{after_html}"
                html_parts.append(combined)
            else:
                b64 = LATEX_CACHE.render(formula, color=color, fontsize=fontsize)
                if b64:
                    html_parts.append(f'<img src="data:image/png;base64,{b64}"style="vertical-align: middle;">')
                else:
                    readable = latex_to_readable_text(part)
                    html_parts.append(readable.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;'))
        else:
            escaped = part.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
            escaped = escaped.replace('\n', '<br>')
            if escaped:
                if escaped[0].isalpha():
                    escaped = f" {escaped}"
                if escaped[-1].isalpha():
                    escaped = f"{escaped} "
            html_parts.append(escaped)

    result = ''.join(html_parts)

    for idx, code_content in code_map.items():
        safe_code = code_content.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        placeholder = f"__INLINE_CODE_{idx}__"
        result = result.replace(placeholder, f'<code>{safe_code}</code>')

    for idx, (lang, block_content) in code_block_map.items():
        placeholder = f"__BLOCK_CODE_{idx}__"
        if lang.lower() == 'mermaid':
            block_content = protect_mermaid_text(block_content)
            if MERMAID_AVAILABLE:
                try:
                    svg = mermaid_rs.render(block_content)
                    import base64
                    svg_b64 = base64.b64encode(svg.encode('utf-8')).decode('ascii')
                    html_block = f'''
                    <div style="margin: 10px 0; max-width: 100%; overflow-x: auto;">
                        <img src="data:image/svg+xml;base64,{svg_b64}" style="max-width:100%;">
                    </div>
                    '''
                except Exception as e:
                    html_block = _fallback_mermaid(block_content)
            else:
                html_block = _fallback_mermaid(block_content)
        else:
            safe_block = block_content.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
            html_block = f'<pre style="background-color: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 0.9em; font-family: monospace;"><code>{safe_block}</code></pre>'
        result = result.replace(placeholder, html_block)

    return result

# ---------- 题目数据管理 ----------
class QuestionManager:
    def __init__(self, filepath):
        self.filepath = Path(filepath)
        self.questions = []
        self.load()

    def load(self):
        if not self.filepath.exists():
            self._create_default()
        with open(self.filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            self.questions = data.get("questions", [])
        # 为每个题目分配内部索引 _index（按顺序）
        for idx, q in enumerate(self.questions):
            q['_index'] = idx

    def _create_default(self):
        default_questions = {
            "questions": [
                {"id": 1, "type": "single", "question": "Python 中用于输出内容的函数是？",
                 "options": ["print()", "input()", "len()", "range()"], "answer": "print()",
                 "explanation": "print() 是 Python 内置的输出函数。",
                 "option_explanations": ["正确", "输入函数", "长度函数", "范围函数"]},
                {"id": 2, "type": "multiple", "question": "以下哪些是 Python 的容器类型？",
                 "options": ["list", "dict", "int", "str"], "answer": ["list", "dict", "str"],
                 "explanation": "int 是数字类型，不是容器。"},
                {"id": 3, "type": "fill", "question": "Python 中定义函数的关键字是 ____。",
                 "answer": "def", "explanation": "使用 def 关键字定义函数。"},
                {"id": 4, "type": "essay", "question": "请简述 Python 中列表和元组的区别。",
                 "answer": "列表是可变的，元组是不可变的。", "explanation": "列表支持增删改，元组创建后不能修改。"}
            ]
        }
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(default_questions, f, ensure_ascii=False, indent=2)

class RecordManager:
    def __init__(self, filepath, questions=None):
        self.filepath = Path(filepath)
        self.records = {}          # 新格式：键为 str(_index)，值为记录 dict
        self.load(questions)       # 传入 questions 用于迁移

    def load(self, questions=None):
        if self.filepath.exists():
            with open(self.filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                # 检测旧格式（列表）
                if isinstance(data, list):
                    # 标记为旧格式，待迁移
                    self._old_records = data
                    self.records = {}
                    if questions is not None:
                        self._migrate(questions)
                elif isinstance(data, dict):
                    self.records = data
                    self._old_records = None
                else:
                    self.records = {}
                    self._old_records = None
        else:
            self.records = {}
            self._old_records = None

    def _migrate(self, questions):
        """将旧格式（列表）迁移到新格式（对象），使用题库列表映射 id->_index"""
        if self._old_records is None:
            return
        new_records = {}
        # 建立 id -> _index 映射（注意 id 可能为 int 或 str）
        id_to_idx = {}
        for q in questions:
            id_to_idx[q["id"]] = q["_index"]
        for old in self._old_records:
            qid = old.get("question_id")
            if qid in id_to_idx:
                idx = str(id_to_idx[qid])
                new_records[idx] = {
                    "user_answer": old.get("user_answer"),
                    "correct": old.get("correct"),
                    "timestamp": old.get("timestamp", "")
                }
        self.records = new_records
        self._old_records = None
        self.save()   # 保存为新格式

    def add_record(self, index, ans, correct):
        """index 为整数或字符串"""
        self.records[str(index)] = {
            "user_answer": ans,
            "correct": correct,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        self.save()

    def get_record(self, index):
        return self.records.get(str(index), None)

    def clear(self):
        self.records = {}
        self.save()

    def save(self):
        self.filepath.parent.mkdir(parents=True, exist_ok=True)
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(self.records, f, ensure_ascii=False, indent=2)

    def get_all_records(self):
        return self.records.values()

def get_question_sets():
    sets_dir = getFilePath(QUESTION_SETS_DIR)
    ensure_dir(sets_dir)
    sets = []
    for f in Path(sets_dir).glob("*.json"):
        sets.append((f.stem, str(f)))
    if not sets:
        default_path = Path(sets_dir) / "默认题库.json"
        QuestionManager(default_path)
        sets.append(("默认题库", str(default_path)))
    return sets

# ---------- 题目控件 ----------
class SingleChoiceWidget(QWidget):
    answerChanged = pyqtSignal()

    def __init__(self, options, explanations=None, parent=None):
        super().__init__(parent)
        self.options = options
        if explanations is None:
            explanations = [""] * len(options)
        elif len(explanations) < len(options):
            explanations = list(explanations) + [""] * (len(options) - len(explanations))
        self.explanations = explanations
        self.buttons = []
        self.exp_labels = []
        layout = QVBoxLayout(self)
        layout.setSpacing(4)
        self.group = QButtonGroup(self)
        for idx, opt in enumerate(options):
            btn = QPushButton()
            btn.setCheckable(True)
            btn.setMinimumHeight(44)
            btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
            font = btn.font()
            font.setPointSize(11)
            btn.setFont(font)
            html = latex_text_to_html(opt, color=get_system_text_color(), fontsize=11)
            btn.setText(html)
            try:
                btn.setTextFormat(Qt.TextFormat.RichText)
            except AttributeError:
                readable = latex_to_readable_text(opt)
                btn.setText(readable)
            btn.setProperty("original_text", opt)
            self.group.addButton(btn)
            layout.addWidget(btn)
            self.buttons.append(btn)

            exp_label = QLabel()
            exp_label.setWordWrap(True)
            exp_label.setVisible(False)
            exp_label.setStyleSheet("margin-left: 20px;")
            layout.addWidget(exp_label)
            self.exp_labels.append(exp_label)

            btn.toggled.connect(lambda checked, b=btn: self.answerChanged.emit())
        layout.addStretch()
        self._apply_base_style()

    def _base_style_template(self):
        palette = QApplication.palette()
        highlight = palette.color(QPalette.ColorRole.Highlight).name()
        highlighted_text = palette.color(QPalette.ColorRole.HighlightedText).name()
        text_color = palette.color(QPalette.ColorRole.Text).name()
        return (
            "QPushButton {"
            f"    color: {text_color};"
            "    border: 1px solid gray;"
            "    border-radius: 6px;"
            "    padding: 10px;"
            "    min-height: 44px;"
            "    text-align: left;"
            "}"
            "QPushButton:checked {"
            f"    background-color: {highlight};"
            f"    color: {highlighted_text};"
            f"    border: 2px solid {highlight};"
            "}"
            "QPushButton:hover {"
            "    background-color: palette(highlight);"
            "    color: palette(highlighted-text);"
            "}"
        )

    def _apply_base_style(self):
        style = self._base_style_template()
        for btn in self.buttons:
            btn.setStyleSheet(style)

    def get_answer(self):
        checked = self.group.checkedButton()
        return checked.property("original_text") if checked else None

    def set_answer(self, text):
        for btn in self.buttons:
            if btn.property("original_text") == text:
                btn.setChecked(True)
                return

    def clear_answer(self):
        self.group.setExclusive(False)
        for btn in self.buttons:
            btn.setChecked(False)
        self.group.setExclusive(True)
        for lbl in self.exp_labels:
            lbl.setVisible(False)
        self._apply_base_style()

    def mark_result(self, correct_answer, user_answer):
        for idx, btn in enumerate(self.buttons):
            opt = btn.property("original_text")
            if opt == correct_answer:
                style = (
                    "QPushButton {"
                    "    background-color: #2e7d32;"
                    "    color: white;"
                    "    border: 2px solid #4caf50;"
                    "    border-radius: 6px;"
                    "    padding: 10px;"
                    "    min-height: 44px;"
                    "    text-align: left;"
                    "}"
                )
            elif opt == user_answer:
                style = (
                    "QPushButton {"
                    "    background-color: #c62828;"
                    "    color: white;"
                    "    border: 2px solid #f44336;"
                    "    border-radius: 6px;"
                    "    padding: 10px;"
                    "    min-height: 44px;"
                    "    text-align: left;"
                    "}"
                )
            else:
                style = self._base_style_template()
            btn.setStyleSheet(style)

            if self.explanations[idx]:
                explanation_html = latex_text_to_html(self.explanations[idx], color='#aaa', fontsize=10)
                self.exp_labels[idx].setText(f'<div style="color: #aaa; font-size: 10pt;">{explanation_html}</div>')
                self.exp_labels[idx].setVisible(True)
            else:
                self.exp_labels[idx].setVisible(False)
    
    def clear_mark(self):
        self._apply_base_style()
        for lbl in self.exp_labels:
            lbl.setVisible(False)


class MultipleChoiceWidget(QWidget):
    answerChanged = pyqtSignal()

    def __init__(self, options, explanations=None, parent=None):
        super().__init__(parent)
        self.options = options
        if explanations is None:
            explanations = [""] * len(options)
        elif len(explanations) < len(options):
            explanations = list(explanations) + [""] * (len(options) - len(explanations))
        self.explanations = explanations
        self.buttons = []
        self.exp_labels = []

        layout = QVBoxLayout(self)
        layout.setSpacing(6)

        for idx, opt in enumerate(options):
            btn = QPushButton()
            btn.setCheckable(True)
            btn.setMinimumHeight(44)
            btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
            font = btn.font()
            font.setPointSize(11)
            btn.setFont(font)
            html = latex_text_to_html(opt, color=get_system_text_color(), fontsize=11)
            btn.setText(html)
            try:
                btn.setTextFormat(Qt.TextFormat.RichText)
            except AttributeError:
                readable = latex_to_readable_text(opt)
                btn.setText(readable)
            btn.setProperty("original_text", opt)
            layout.addWidget(btn)
            self.buttons.append(btn)
            btn.clicked.connect(lambda: self.answerChanged.emit())

            exp_label = QLabel()
            exp_label.setWordWrap(True)
            exp_label.setVisible(False)
            exp_label.setStyleSheet("margin-left: 20px;")
            layout.addWidget(exp_label)
            self.exp_labels.append(exp_label)

        layout.addStretch()
        self._apply_base_style()

    def _base_style_template(self):
        palette = QApplication.palette()
        highlight = palette.color(QPalette.ColorRole.Highlight).name()
        highlighted_text = palette.color(QPalette.ColorRole.HighlightedText).name()
        text_color = palette.color(QPalette.ColorRole.Text).name()
        return (
            "QPushButton {"
            f"    color: {text_color};"
            "    border: 1px solid gray;"
            "    border-radius: 6px;"
            "    padding: 10px;"
            "    min-height: 44px;"
            "    text-align: left;"
            "}"
            "QPushButton:checked {"
            f"    background-color: {highlight};"
            f"    color: {highlighted_text};"
            f"    border: 2px solid {highlight};"
            "}"
            "QPushButton:hover {"
            "    background-color: palette(highlight);"
            "    color: palette(highlighted-text);"
            "}"
        )

    def _orange_style(self):
        palette = QApplication.palette()
        text_color = palette.color(QPalette.ColorRole.Text).name()
        return (
            "QPushButton {"
            f"    color: {text_color};"
            "    background-color: #b98000;"
            "    border: 2px solid #ff9800;"
            "    border-radius: 6px;"
            "    padding: 10px;"
            "    min-height: 44px;"
            "    text-align: left;"
            "}"
        )

    def _apply_base_style(self):
        style = self._base_style_template()
        for btn in self.buttons:
            btn.setStyleSheet(style)

    def get_answer(self):
        selected = [btn.property("original_text") for btn in self.buttons if btn.isChecked()]
        return selected if selected else None

    def set_answer(self, answer_list):
        for btn in self.buttons:
            btn.setChecked(btn.property("original_text") in answer_list)

    def clear_answer(self):
        for btn in self.buttons:
            btn.setChecked(False)
        for lbl in self.exp_labels:
            lbl.setVisible(False)
        self._apply_base_style()

    def mark_result(self, correct, user):
        for idx, btn in enumerate(self.buttons):
            opt = btn.property("original_text")
            if opt in correct:
                if opt in user:
                    style = (
                        "QPushButton {"
                        "    background-color: #2e7d32;"
                        "    color: white;"
                        "    border: 2px solid #4caf50;"
                        "    border-radius: 6px;"
                        "    padding: 10px;"
                        "    min-height: 44px;"
                        "    text-align: left;"
                        "}"
                    )
                else:
                    style = self._orange_style()
            elif opt in user:
                style = (
                    "QPushButton {"
                    "    background-color: #c62828;"
                    "    color: white;"
                    "    border: 2px solid #f44336;"
                    "    border-radius: 6px;"
                    "    padding: 10px;"
                    "    min-height: 44px;"
                    "    text-align: left;"
                    "}"
                )
            else:
                style = self._base_style_template()
            btn.setStyleSheet(style)

            if self.explanations[idx]:
                explanation_html = latex_text_to_html(self.explanations[idx], color='#aaa', fontsize=10)
                self.exp_labels[idx].setText(f'<div style="color: #aaa; font-size: 10pt;">{explanation_html}</div>')
                self.exp_labels[idx].setVisible(True)
            else:
                self.exp_labels[idx].setVisible(False)
        
    def clear_mark(self):
        self._apply_base_style()
        for lbl in self.exp_labels:
            lbl.setVisible(False)


class FillBlankWidget(QWidget):
    answerChanged = pyqtSignal()
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        self.edit = QLineEdit()
        self.edit.setPlaceholderText("请输入答案")
        layout.addWidget(self.edit)
        layout.addStretch()
        self.edit.textChanged.connect(lambda: self.answerChanged.emit())
    def get_answer(self):
        text = self.edit.text().strip()
        return text if text else None
    def set_answer(self, text):
        self.edit.setText(text)
    def clear_answer(self):
        self.edit.clear()

class EssayWidget(QWidget):
    answerChanged = pyqtSignal()
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        self.edit = QTextEdit()
        self.edit.setPlaceholderText("请输入你的答案...")
        self.edit.setMinimumHeight(150)
        layout.addWidget(self.edit)
        self.edit.textChanged.connect(lambda: self.answerChanged.emit())
    def get_answer(self):
        text = self.edit.toPlainText().strip()
        return text if text else None
    def set_answer(self, text):
        self.edit.setPlainText(text)
    def clear_answer(self):
        self.edit.clear()

# ---------- 题目页面 ----------
class QuestionPage(QWidget):
    def __init__(self, question, parent=None):
        super().__init__(parent)
        self.question = question
        self.answer_widget = None
        self.result_browser = QTextBrowser()
        self.result_browser.setOpenExternalLinks(True)
        self.result_browser.setStyleSheet("border: none; background: transparent;")

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)

        splitter = QSplitter(Qt.Orientation.Vertical)
        self.splitter = splitter

        top_widget = QWidget()
        top_layout = QVBoxLayout(top_widget)
        top_layout.setContentsMargins(0, 0, 0, 0)

        q_text = f"第{question['id']}题  [{self._type_name()}]  {question['question']}"
        self.title_browser = QTextBrowser()
        self.title_browser.setOpenExternalLinks(True)
        self.title_browser.setHtml(f"<div style='font-size:13pt;'>{latex_text_to_html(q_text, fontsize=13)}</div>")
        self.title_browser.setStyleSheet("border: none; background: transparent;")
        self.title_browser.setMinimumWidth(0)
        self.title_browser.setMinimumHeight(50)
        top_layout.addWidget(self.title_browser)
        splitter.addWidget(top_widget)

        bottom_widget = QWidget()
        bottom_layout = QVBoxLayout(bottom_widget)
        bottom_layout.setContentsMargins(0, 0, 0, 0)

        q_type = question["type"]
        if q_type == "single":
            explanations = question.get("option_explanations")
            self.answer_widget = SingleChoiceWidget(question["options"], explanations)
        elif q_type == "multiple":
            explanations = question.get("option_explanations")
            self.answer_widget = MultipleChoiceWidget(question["options"], explanations)
        elif q_type == "fill":
            self.answer_widget = FillBlankWidget()
        elif q_type == "essay":
            self.answer_widget = EssayWidget()

        if self.answer_widget:
            bottom_layout.addWidget(self.answer_widget)
            self.answer_widget.answerChanged.connect(self._clear_result)

        bottom_layout.addWidget(self.result_browser, 1)
        splitter.addWidget(bottom_widget)

        splitter.setStretchFactor(0, 0)
        splitter.setStretchFactor(1, 1)

        main_layout.addWidget(splitter)

        self._splitter_sizes_set = False

    def _type_name(self):
        names = {"single": "单选", "multiple": "多选", "fill": "填空", "essay": "简答"}
        return names.get(self.question["type"], "")

    def _clear_result(self):
        self.result_browser.clear()
        if hasattr(self.answer_widget, 'clear_mark'):
            self.answer_widget.clear_mark()

    def get_user_answer(self):
        return self.answer_widget.get_answer() if self.answer_widget else None

    def set_user_answer(self, answer):
        if self.answer_widget and answer is not None:
            self.answer_widget.set_answer(answer)

    def clear_answer(self):
        if self.answer_widget:
            self.answer_widget.clear_answer()
        self.result_browser.clear()

    def check_answer(self, user_answer):
        q_type = self.question["type"]
        correct_answer = self.question["answer"]
        if q_type == "single":
            return user_answer == correct_answer
        elif q_type == "multiple":
            return sorted(user_answer) == sorted(correct_answer)
        elif q_type == "fill":
            def is_match(answer_item, user_input):
                user_input = user_input.strip()
                if isinstance(answer_item, str) and answer_item.startswith("regex:"):
                    pattern = answer_item[6:]
                    try:
                        return re.fullmatch(pattern, user_input) is not None
                    except re.error:
                        return False
                else:
                    return user_input.lower() == str(answer_item).lower()

            if isinstance(correct_answer, list):
                return any(is_match(item, user_answer) for item in correct_answer)
            else:
                return is_match(correct_answer, user_answer)
        elif q_type == "essay":
            return None
        return False

    def show_result(self, user_answer):
        correct = self.check_answer(user_answer)
        explanation = self.question.get("explanation", "")
        if self.question["type"] == "essay":
            result_text = "📝 简答题需自行对照参考答案。\n"
            result_text += f"参考答案：{self.question['answer']}"
        else:
            if correct:
                result_text = "✅ 回答正确！"
            else:
                result_text = "❌ 回答错误。"
            if self.answer_widget and hasattr(self.answer_widget, 'mark_result'):
                self.answer_widget.mark_result(self.question["answer"], user_answer)
        if explanation:
            result_text += f"\n解析：{explanation}"
        html = f"<div style='font-size:12pt; color: white;'>{latex_text_to_html(result_text, color='white', fontsize=12)}</div>"
        self.result_browser.setHtml(html)
        return correct

    def apply_record(self, record):
        if record is None:
            return
        user_answer = record["user_answer"]
        self.set_user_answer(user_answer)
        self.show_result(user_answer)

    def showEvent(self, event):
        super().showEvent(event)
        if not self._splitter_sizes_set:
            self._adjust_splitter_sizes()
            self._splitter_sizes_set = True

    def _adjust_splitter_sizes(self):
        title_height = self._get_title_content_height()
        desired = min(title_height, 200)
        desired = max(desired, 50)
        self.splitter.setSizes([desired, 10000])

    def _get_title_content_height(self):
        doc = self.title_browser.document()
        viewport_width = self.title_browser.viewport().width()
        if viewport_width > 0:
            doc.setTextWidth(viewport_width)
        doc_height = doc.size().height()
        margins = (self.title_browser.contentsMargins().top() + self.title_browser.contentsMargins().bottom())
        padding = 8
        return int(doc_height) + margins + padding

# ---------- 饼图 ----------
class PieChart(QWidget):
    def __init__(self, data, parent=None):
        super().__init__(parent)
        self.data = data
        self.setMinimumSize(250,250)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
    def paintEvent(self, event):
        if not self.data:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        total = sum(count for _,count,_ in self.data)
        if total==0:
            return
        rect = QRectF(10,10,self.width()-20,self.height()-20)
        side = min(rect.width(),rect.height())
        pie_rect = QRectF(0,0,side,side)
        pie_rect.moveCenter(rect.center())
        start_angle = 90
        for label,count,color in self.data:
            if count==0:
                continue
            span_angle = (count/total)*360*16
            painter.setBrush(QColor(color))
            painter.setPen(QPen(QApplication.palette().color(QPalette.ColorRole.Window),2))
            painter.drawPie(pie_rect,int(start_angle),int(span_angle))
            start_angle += span_angle
        text_color = QApplication.palette().color(QPalette.ColorRole.Text)
        painter.setPen(text_color)
        font = painter.font()
        font.setPointSize(10)
        painter.setFont(font)
        legend_x = int(pie_rect.right()+20)
        legend_y = int(pie_rect.top()+20)
        for label,count,color in self.data:
            painter.setBrush(QColor(color))
            painter.drawRect(legend_x,legend_y,15,15)
            painter.drawText(legend_x+20,legend_y+12,f"{label} ({count})")
            legend_y += 25

# ---------- 主窗口 ----------
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("PyQt6 做题程序")
        self.resize(900,650)
        self.current_set_name = None
        self.current_set_file = None
        self.qm = None
        self.rm = None
        self.pages = []
        self.current_index = -1
        self._init_ui()
        self._load_question_sets()
        self.stacked.setCurrentIndex(0)

    def _init_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        self.stacked = QStackedWidget()
        main_layout = QVBoxLayout(central)
        main_layout.addWidget(self.stacked)
        # 标题页
        self.title_page = QWidget()
        title_layout = QVBoxLayout(self.title_page)
        title_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label = QLabel("欢迎使用答题系统")
        title_label.setFont(QFont("Arial",28,QFont.Weight.Bold))
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_layout.addWidget(title_label)
        title_layout.addSpacing(20)
        set_select_layout = QHBoxLayout()
        set_select_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        set_select_layout.addWidget(QLabel("选择题目集："))
        self.set_combo = QComboBox()
        self.set_combo.setFixedWidth(200)
        self.set_combo.currentIndexChanged.connect(self._on_set_changed)
        set_select_layout.addWidget(self.set_combo)
        title_layout.addLayout(set_select_layout)
        title_layout.addSpacing(10)
        self.progress_bar = QProgressBar()
        self.progress_bar.setFixedWidth(400)
        self.progress_bar.setRange(0,0)
        self.progress_bar.setVisible(False)
        self.progress_label = QLabel("")
        self.progress_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_layout.addWidget(self.progress_label)
        title_layout.addWidget(self.progress_bar,0,Qt.AlignmentFlag.AlignCenter)
        title_layout.addSpacing(10)
        start_btn = QPushButton("开始答题")
        start_btn.setFixedSize(200,60)
        start_btn.setFont(QFont("Arial",14))
        start_btn.clicked.connect(self._start_quiz)
        title_layout.addWidget(start_btn,0,Qt.AlignmentFlag.AlignCenter)
        self.stacked.addWidget(self.title_page)
        # 答题页
        self.quiz_page = QWidget()
        quiz_layout = QHBoxLayout(self.quiz_page)
        quiz_layout.setContentsMargins(0,0,0,0)
        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(5,5,5,5)
        self.list_widget = QListWidget()
        self.list_widget.currentRowChanged.connect(self._on_select)
        left_layout.addWidget(QLabel("题目列表"))
        left_layout.addWidget(self.list_widget)
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        self.stacked_quiz = QStackedWidget()
        right_layout.addWidget(self.stacked_quiz)
        btn_layout = QHBoxLayout()
        self.prev_btn = QPushButton("上一题")
        self.submit_btn = QPushButton("提交答案")
        self.next_btn = QPushButton("下一题")
        self.finish_btn = QPushButton("结束答题")
        self.next_btn.setVisible(False)

        self.prev_btn.clicked.connect(self._go_prev)
        self.submit_btn.clicked.connect(self._submit)
        self.next_btn.clicked.connect(self._go_next)
        self.finish_btn.clicked.connect(self._finish_quiz)
        btn_layout.addWidget(self.prev_btn)
        btn_layout.addStretch()
        btn_layout.addWidget(self.submit_btn)
        btn_layout.addWidget(self.next_btn)
        btn_layout.addWidget(self.finish_btn)
        right_layout.addLayout(btn_layout)
        splitter = QSplitter(Qt.Orientation.Horizontal)
        left_widget.setMinimumWidth(50)
        right_widget.setMinimumWidth(0)
        splitter.addWidget(left_widget)
        splitter.addWidget(right_widget)
        splitter.setStretchFactor(0,1)
        splitter.setStretchFactor(1,3)
        quiz_layout.addWidget(splitter)
        self.stacked.addWidget(self.quiz_page)
        # 完成页
        self.finish_page = QWidget()
        finish_layout = QVBoxLayout(self.finish_page)
        finish_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.stats_label = QLabel()
        self.stats_label.setFont(QFont("Arial",13))
        self.stats_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        finish_layout.addWidget(self.stats_label)
        self.chart = PieChart([])
        finish_layout.addWidget(self.chart,1)
        restart_btn = QPushButton("重新开始")
        restart_btn.setFixedSize(150,50)
        restart_btn.clicked.connect(self._restart)
        finish_layout.addWidget(restart_btn,0,Qt.AlignmentFlag.AlignCenter)
        self.stacked.addWidget(self.finish_page)

    def _load_question_sets(self):
        sets = get_question_sets()
        self.set_combo.clear()
        for name,path in sets:
            self.set_combo.addItem(name,path)
        if self.set_combo.count()>0:
            self.set_combo.setCurrentIndex(0)

    def _on_set_changed(self,index):
        if index>=0:
            self.current_set_name = self.set_combo.currentText()
            self.current_set_file = self.set_combo.currentData()
            self.qm = None
            self.rm = None

    def _start_quiz(self):
        if not self.current_set_file:
            QMessageBox.warning(self,"提示","没有可用的题目集，请检查 question_sets 文件夹。")
            return
        self.progress_bar.setVisible(True)
        self.progress_label.setText("正在加载题目...")
        QApplication.processEvents()
        self.qm = QuestionManager(self.current_set_file)
        record_filename = f"{self.current_set_name}.json"
        record_path = getFilePath(os.path.join(RECORDS_DIR, record_filename))
        ensure_dir(getFilePath(RECORDS_DIR))
        # 传入题库列表以便迁移旧记录
        self.rm = RecordManager(record_path, questions=self.qm.questions)
        LATEX_CACHE.clear()
        self._load_questions_with_progress()
        self.stacked.setCurrentIndex(1)

    def _load_questions_with_progress(self):
        self.pages.clear()
        self.list_widget.clear()
        while self.stacked_quiz.count():
            self.stacked_quiz.removeWidget(self.stacked_quiz.widget(0))
        total = len(self.qm.questions)
        for i, q in enumerate(self.qm.questions):
            page = QuestionPage(q)
            self.pages.append(page)
            self.stacked_quiz.addWidget(page)
            record = self.rm.get_record(q['_index'])
            text = f"第{q['id']}题  {self._type_short(q['type'])}"
            if record:
                if record["correct"] is True:
                    text += " ✔"
                elif record["correct"] is False:
                    text += " ✘"
                else:
                    text += " ?"
            self.list_widget.addItem(QListWidgetItem(text))
            self.progress_bar.setValue(i + 1)
            self.progress_bar.setRange(0, total)
            self.progress_label.setText(f"已加载 {i+1}/{total} 题...")
            QApplication.processEvents()
        self.progress_bar.setVisible(False)
        self.progress_label.setText("")
        if self.pages:
            self.list_widget.setCurrentRow(0)

    def _update_list_item_mark(self, index):
        if index < 0 or index >= len(self.pages):
            return
        q = self.pages[index].question
        record = self.rm.get_record(q['_index'])
        text = f"第{q['id']}题  {self._type_short(q['type'])}"
        if record:
            if record["correct"] is True:
                text += " ✔"
            elif record["correct"] is False:
                text += " ✘"
            else:
                text += " ?"
        self.list_widget.item(index).setText(text)

    def _finish_quiz(self):
        records = list(self.rm.get_all_records())
        total = len(self.qm.questions)
        answered = len(records)
        correct_cnt = sum(1 for r in records if r["correct"] is True)
        wrong_cnt = sum(1 for r in records if r["correct"] is False)
        essay_cnt = sum(1 for r in records if r["correct"] is None)
        unanswered = total - answered
        stats = f"总题数：{total}　　已答题数：{answered}　　未答题数：{unanswered}\n"
        stats += f"正确：{correct_cnt}　　错误：{wrong_cnt}　　简答：{essay_cnt}"
        if answered - essay_cnt > 0:
            acc = correct_cnt / (answered - essay_cnt) * 100
            stats += f"\n客观题正确率：{acc:.1f}%"
        self.stats_label.setText(stats)
        chart_data = [("正确",correct_cnt,"#4caf50"),("错误",wrong_cnt,"#f44336"),("简答",essay_cnt,"#2196f3"),("未答",unanswered,"#9e9e9e")]
        self.chart.data = chart_data
        self.chart.update()
        self.stacked.setCurrentIndex(2)

    def _restart(self):
        if self.rm:
            self.rm.clear()
        self.stacked.setCurrentIndex(0)

    def _type_short(self,t):
        return {"single":"单选","multiple":"多选","fill":"填空","essay":"简答"}.get(t,t)

    def _on_select(self,index):
        if index<0 or index>=len(self.pages):
            return
        self.current_index = index
        self.stacked_quiz.setCurrentIndex(index)
        self._update_nav_buttons()
        page = self.pages[index]
        record = self.rm.get_record(page.question['_index'])

        if record is not None:
            has_next = index < len(self.pages) - 1
            self.next_btn.setVisible(has_next)
        else:
            self.next_btn.setVisible(False)

        if record:
            page.apply_record(record)

    def _go_prev(self):
        if self.current_index>0:
            self.list_widget.setCurrentRow(self.current_index-1)

    def _go_next(self):
        if self.current_index<len(self.pages)-1:
            self.list_widget.setCurrentRow(self.current_index+1)

    def _update_nav_buttons(self):
        self.prev_btn.setEnabled(self.current_index>0)
        self.next_btn.setEnabled(self.current_index < len(self.pages) - 1)

    def _submit(self):
        if self.current_index<0:
            return
        page = self.pages[self.current_index]
        user_answer = page.get_user_answer()
        if user_answer is None or (isinstance(user_answer,list) and len(user_answer)==0):
            QMessageBox.warning(self,"提示","请先作答再提交。")
            return
        correct = page.show_result(user_answer)
        self.rm.add_record(page.question['_index'], user_answer, correct)
        self._update_list_item_mark(self.current_index)

        if self.current_index < len(self.pages) - 1:
            self.next_btn.setVisible(True)
        else:
            self.next_btn.setVisible(False)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    if not MATPLOTLIB_AVAILABLE:
        print("提示：安装 matplotlib 可显示数学公式 (pip install matplotlib)")
    win = MainWindow()
    win.show()
    sys.exit(app.exec())