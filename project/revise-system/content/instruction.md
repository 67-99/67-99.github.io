### 使用方式

若要把某题库转为可使用的题库，将下文的`题库skill`与题库共同喂给AI，转换出的`json`文件即为题库。

题库中每题大致有以下性质：
| 字段           | 类型           | 必填 | 说明                                                                             |
|----------------|----------------|------|---------------------------------------------------------------------------------|
| id             | int 或 string  | 是   | 题目标识，可以是数字或非空字符串（如 "5a"），允许重复                               |
| type           | string         | 是   | 题型：`"single"`（单选）、`"multiple"`（多选）、`"fill"`（填空）、`"essay"`（简答） |
| question       | string         | 是   | 题目内容，可包含行内 LaTeX 公式（用 `$...$` 包裹）                                 |
| answer         | 根据题型而定    | 是   | 正确答案（详见各题型说明）                                                        |
| explanation    | string         | 否   | 全局解析，可包含 LaTeX                                                           |
| option_explanations|list[string]| 否   | **仅选择题可用** 各选项解析，按顺序给出解析                                        |

示例：
```json
{
  "id": 2,
  "type": "multiple",
  "question": "以下哪些是 Python 的不可变类型？",
  "options": ["int", "list", "tuple", "dict", "str"],
  "answer": ["int", "tuple", "str"],
  "explanation": "list 和 dict 是可变的。",
  "option_explanations": ["", "正确，左极限为0，右极限为0但函数值为0，实际连续？请核对。", ""]
}
```