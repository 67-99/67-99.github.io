# 设计初衷
此项目是玩完[图灵完备 (Turing complete)](https://store.steampowered.com/app/1444480/Turing_Complete/)后的一个次生产物。

在[图灵完备](https://store.steampowered.com/app/1444480/Turing_Complete/)中，要求从门电路开始设计一台图灵完备的“电脑”，并编写相应的汇编代码。在玩完后，我发现了[logisim](https://cburch.com/logisim/)可以模拟整个“电脑”，就编写了对应电路和汇编器。
![图灵完备的“电脑”](content/resource/turing-complete.png)

到了大二，随着计算机系统2A的开设，我们系统性的学习了微处理器与汇编。在课程中有一项小组作业要求编写[Manchester Baby](https://en.wikipedia.org/wiki/Manchester_Baby)的汇编器与模拟器，于是我便提出了开发图灵完备中的“电脑”配套的logisim电路与汇编器。

> 注：由于目前学业压力，logisim电路已实现（差栈与Dul-RAM的实现），汇编器并未编写，准备在寒假实现。