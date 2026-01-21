# “电脑”结构

### 图灵完备“电脑”
由于这个汇编器（其实是微处理器）是随着[图灵完备](https://store.steampowered.com/app/1444480/Turing_Complete/)游戏搭建的，所以搭建的整体思路是在规定的架构之上添加规定的功能。游戏中规定的架构为哈佛式、指令为`32bit`指令（格式为`Opcode in1 in2 out`，`WORD=8bit`），其中有一个可编写的`ROM`为程序，微处理器内部有多个寄存器，输入和输出总线均为`8bit`，内部ALU可计算`+`、`-`、`AND`、`OR`、`XOR`、`>>`、`<<`、`NOT`。其中要求实现的功能为规则跳转（分支语句）、推栈（变量推栈与函数推栈）、接入内部RAM。

根据这些要求，我扩展了原本的指令集、以实现不同上述功能，具体格式如下：

### [logisim](https://cburch.com/logisim/)电路
[logisim](https://cburch.com/logisim/)中的元件与图灵完备中提供的并不相同，如logisim中没有`dualReg`、`dualRAM`、`stack`。为了最大程度复刻但不添加过多新元器件，我决定放弃`dualRAM`并更改原指令集，移除`RAM`同时输入/输出的指令。但`dualReg`和`stack`会使用`regester`与`RAM`实现，具体实现方式如下：
|名称|实现逻辑|结构|
|:--:|:-----:|:--:|