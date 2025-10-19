import os.path as osPath
import sys
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QFont
from PyQt5.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QGridLayout, QWidget, QStackedWidget, QSplitter, QPushButton, QLabel

class TimetableGUI(QMainWindow):
    def __init__(self, dataPath: str):
        super().__init__()
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
        startPage = QWidget(self.infoPage)
        startLayout = QVBoxLayout(startPage)
        startLabel = QLabel("要做什么更改？", startPage)
        startLabel.setFont(QFont("", 24))
        startLabel.setAlignment(Qt.AlignCenter)
        startLayout.addWidget(startLabel)
        startButtonLayout = QGridLayout()
        startAddButton = QPushButton("新建事件", startPage)
        startAddButton.pressed.connect(lambda: self.changeInfoPage(0))
        startButtonLayout.addWidget(startAddButton)
        startLayout.addLayout(startButtonLayout)
        self.infoPage.addWidget(startPage)
        mainSplit.addWidget(self.infoPage)
        r = QLabel(dataPath)
        mainSplit.addWidget(r)
        self.setCentralWidget(mainSplit)
    def changeInfoPage(self, index: int):
        """ Change info page """
        self.infoPage.setCurrentIndex(index)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = TimetableGUI(osPath.dirname(osPath.dirname(__file__)))
    window.show()
    sys.exit(app.exec_())