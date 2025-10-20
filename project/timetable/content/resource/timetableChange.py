import os.path as osPath
import sys
import time
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QFont
from PyQt5.QtWidgets import QApplication, QMainWindow, QLayout, QVBoxLayout, QHBoxLayout, QGridLayout, QWidget, QStackedWidget, QSplitter, QPushButton, QLabel

class date:
    def setTime(time: tuple[int, int, int]):
        """ Set time in proper range """
        y, m, d = time
        return (y, m, d)
    def shift(time, dayShift):
        """ shift date by day """
        return date.setTime((time[0], time[1], time[2] + dayShift))

def clean_layout(layout: QLayout, clean_widget: bool = False):
    """Clean a layout"""
    if clean_widget:
        while layout.count():
            item = layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()
            else:
                sub_layout = item.layout()
                if sub_layout:
                    clean_layout(sub_layout, True)
    else:  # BUG: 若Layout中无填充格式（透明），则透明图层有概率无法删除原有内容（若QWidget未被删除）
        while layout.count():
            item = layout.takeAt(0)
    if parent := layout.parentWidget():
        parent.update()
class TimetableGUI(QMainWindow):
    def __init__(self, dataPath: str):
        super().__init__()
        self.tableDay = 7
        self.setMinimumSize(1200, 800)
        mainSplit = QSplitter(self)
        mainSplit.setStyleSheet("""
            QSplitter::handle {
                background-color: #c0c0c0;
                width: 3px;
            }
            QSplitter::handle:hover {
                background-color: #a0a0a0;
            }
        """)
        mainSplit.setHandleWidth(3)
        mainSplit.setSizes([600, 600])
        self.infoPage = QStackedWidget(mainSplit)
        ## Start page
        startPage = QWidget(self.infoPage)
        startLayout = QVBoxLayout(startPage)
        startLayout.addStretch(10)
        startLabel = QLabel("要做什么更改？", startPage)
        startLabel.setFont(QFont("", 24))
        startLabel.setAlignment(Qt.AlignCenter)
        startLayout.addWidget(startLabel)
        startButtonLayout = QGridLayout()
        startAddButton = QPushButton("新建事件", startPage)
        startAddButton.pressed.connect(lambda: self.changeInfoPage(1))
        startButtonLayout.addWidget(startAddButton, 0, 0)
        startLayout.addStretch(1)
        startLayout.addLayout(startButtonLayout)
        startLayout.addStretch(10)
        self.infoPage.addWidget(startPage)
        ## Add page
        addPage = QWidget(self.infoPage)
        self.infoPage.addWidget(addPage)
        mainSplit.addWidget(self.infoPage)
        # timeTable part
        rightWidget = QWidget()
        rightLayout = QVBoxLayout(rightWidget)
        rightInfo = QHBoxLayout()
        timeButtonL = QPushButton("<")
        timeButtonR = QPushButton(">")
        rightInfo.addWidget(timeButtonL)
        rightInfo.addStretch(1)
        rightInfo.addWidget(timeButtonR)
        rightLayout.addLayout(rightInfo)
        self.timeTable = QGridLayout()
        r = QLabel(dataPath)
        self.timeTable.addWidget(r)
        rightLayout.addLayout(self.timeTable)
        mainSplit.addWidget(rightWidget)
        self.setCentralWidget(mainSplit)
        currentTime = time.localtime()
        self.startDay = date.setTime((currentTime.tm_year, currentTime.tm_mon, currentTime.tm_mday - currentTime.tm_wday))
        self.resetTabel()
    def resetTabel(self):
        """ Repaint table """
        clean_layout(self.timeTable, True)
        timeLabel = QLabel("时段")
        self.timeTable.addWidget(timeLabel, 0, 0)
        h = 1
        while h <= 24:
            if h in {2, 8, 12, 18, 22}:
                timeLabel = QLabel(f"{h}")
                timeLabel.setAlignment(Qt.AlignVCenter)
                self.timeTable.addWidget(timeLabel, h, 0, 2, 1)
                h += 2
            else:
                timeLabel = QLabel(f"")
                self.timeTable.addWidget(timeLabel, h, 0)
                h += 1
        for i in range(self.tableDay):
            day = date.shift(self.startDay, i)
            dayLabel = QLabel(f"{day[1]}/{day[2]}")
            self.timeTable.addWidget(dayLabel, 0, i + 1)
            for h in range(24):
                tLabel = QLabel(f"{h}")
                self.timeTable.addWidget(tLabel, h + 1, i + 1)
    def changeInfoPage(self, index: int):
        """ Change info page """
        self.infoPage.setCurrentIndex(index)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = TimetableGUI(osPath.dirname(osPath.dirname(__file__)))
    window.show()
    sys.exit(app.exec_())