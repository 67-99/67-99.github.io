# “电脑”结构

### 图灵完备“电脑”
由于这个汇编器（其实是微处理器）是随着[图灵完备](https://store.steampowered.com/app/1444480/Turing_Complete/)游戏搭建的，所以搭建的整体思路是在规定的架构之上添加规定的功能。游戏中规定的架构为哈佛式、指令为`32bit`指令（格式为`Opcode in1 in2 out`，`WORD=8bit`），其中有一个可编写的`ROM`为程序，微处理器内部有多个寄存器，输入和输出总线均为`8bit`，内部ALU可计算`+`、`-`、`AND`、`OR`、`XOR`、`>>`、`<<`、`NOT`。其中要求实现的功能为规则跳转（分支语句）、推栈（变量推栈与函数推栈）、接入内部RAM。

根据这些要求，我扩展了原本的指令集、以实现不同上述功能，具体格式如下：
|立即数(`2bit`)|模式(`3bits`)|具体行为(`3bits`)|
|:--:|:--:|:---:|
|bit 7: 立即数1<br>bit 6: 立即数2|bits 5-3|bits 2-0|
> **注意**：采用大端序，bit7为最高有效位

<table>
  <thead>
    <tr><th colspan="4" style="text-align: center;">
        <strong>OPcode 模式与动作编码表</strong></th>
    </tr>
    <tr><th>模式编码</th><th>模式名称</th><th>动作编码</th><th>动作描述</th></tr>
  </thead>
  <tbody>
    <tr>
      <td rowspan="8">0x00<br>0x10</td>
      <td rowspan="8"><strong>Calc</strong><br>算术运算</td>
    <td>0x0</td><td>+ (加法)</td></tr>
    <tr><td>0x1</td><td>- (减法)</td></tr>
    <tr><td>0x2</td><td>AND (与运算)</td></tr>
    <tr><td>0x3</td><td>OR (或运算)</td></tr>
    <tr><td>0x4</td><td>NOT (非运算)</td></tr>
    <tr><td>0x5</td><td>XOR (异或运算)</td></tr>
    <tr><td>0x6</td><td><< (左移)</td></tr>
    <tr><td>0x7</td><td>>> (右移)</td></tr>
    <tr>
      <td rowspan="6">0x08</td>
      <td rowspan="6"><strong>RAM</strong><br>内存访问</td>
    <td>0x0</td><td>读 Operand1 & Operand2</td></tr>
    <tr><td>0x1</td><td>读 Operand1</td></tr>
    <tr><td>0x2</td><td>读 Operand2、写</td></tr>
    <tr><td>0x3</td><td>只写</td></tr>
    <tr><td>0x4</td><td>读 (单tic)</td></tr>
    <tr><td>0x7</td><td>写 (单tic)</td></tr>
    <tr>
      <td rowspan="6">0x20</td>
      <td rowspan="6"><strong>If/JUMP</strong><br>条件跳转/比较</td>
    <td>0x0</td><td>= (等于)</td></tr>
    <tr><td>0x1</td><td>≠ (不等于)</td></tr>
    <tr><td>0x2</td><td>&lt; (小于)</td></tr>
    <tr><td>0x3</td><td>≤ (小于等于)</td></tr>
    <tr><td>0x4</td><td>> (大于)</td></tr>
    <tr><td>0x5</td><td>≥ (大于等于)</td></tr>
    <tr><td>0x30</td><td><strong>call</strong><br>函数调用</td>
      <td colspan="2" style="text-align: center;">PC（代码位置）压栈</td></tr>
    <tr><td>0x38</td><td><strong>ret</strong><br>函数返回</td>
      <td colspan="2" style="text-align: center;">PC（代码位置）弹栈</td></tr>
  </tbody>
</table>

> 注：所有动作编码均按升序排列，RAM模式中单tic标志位于bit3(0x4)

### [logisim](https://cburch.com/logisim/)电路
[logisim](https://cburch.com/logisim/)中的元件与图灵完备中提供的并不相同，如logisim中没有`dualReg`、`dualRAM`、`stack`。为了最大程度复刻但不添加过多新元器件，我决定放弃`dualRAM`，移除`RAM`同时输入/输出的指令。但`dualReg`和`stack`会使用`regester`与`RAM`实现，具体实现方式如下：
|名称|实现逻辑|结构|
|:--:|:-----:|:--:|
|dualReg|在基础寄存器上添加输出控制线缆|![Out[i]=Ctrl[i]*Data(Q)](content/resource/dualReg.png)|
|stack|使用一个寄存器记录栈顶，使用一个`RAM`存储数据<br>栈无数据时输出`0xFF`|![stack[top++]=in`<br>`out=stack[--top]](content/resource/stack.png)|