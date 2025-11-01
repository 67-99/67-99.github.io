import os
import sys
from PyQt5.QtWidgets import QApplication, QMainWindow, QDialog, QFileDialog, QAction, \
                            QWidget, QSplitter, QStackedWidget, QScrollArea, QGroupBox, QTreeWidget, QTreeWidgetItem, QLabel, QTextBrowser, QCheckBox, QComboBox, QSpinBox, QDoubleSpinBox, QLineEdit, \
                            QVBoxLayout, QHBoxLayout, QFormLayout, QStyle
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QIcon, QImage, QPixmap
try:
    import signGenerator
    from signGenerator import Sign
    SIGN_TEMPLATES = True
except:
    SIGN_TEMPLATES = False
try:
    import signGeneral
    from signGeneral import Sign
    SIGN_GENERAL = True
except:
    SIGN_GENERAL = False
from copy import deepcopy
from json import loads
from PIL import Image, ImageDraw, ImageFont

def getFilePath(path: str):
    """ Return the path from the code file """
    return os.path.join(os.path.dirname(__file__), path)

class TrackableImageLabel(QLabel):
    """ Display image and mouse position """
    mouseMoved = pyqtSignal(int, int)  # send pos
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self.imgShape = None
    def setImage(self, img: Image.Image, scale: int = 1):
        """ Set image with origin args """
        self.imgShape = (img.width // scale, img.height // scale)
        qPix = QPixmap.fromImage(QImage(img.tobytes("raw", "RGBA"), img.width, img.height, QImage.Format_RGBA8888))
        self.setPixmap(qPix.scaled(self.width(), self.height(), Qt.KeepAspectRatio, Qt.SmoothTransformation))
    def mouseMoveEvent(self, event):
        """ Emit mouse position """
        if self.imgShape and (pixmap := self.pixmap()) and not pixmap.isNull():
            # 计算图片在QLabel中的实际显示区域
            pixmap_size = pixmap.size()
            x_offset = (self.width() - pixmap_size.width()) // 2
            y_offset = (self.height() - pixmap_size.height()) // 2
            # 检查鼠标是否在图片区域内
            mouse_pos = event.pos()
            if (x_offset <= mouse_pos.x() <= x_offset + pixmap_size.width() and
                y_offset <= mouse_pos.y() <= y_offset + pixmap_size.height()):
                scale_x = self.imgShape[0] / pixmap_size.width()
                scale_y = self.imgShape[1] / pixmap_size.height()
                img_x = int((mouse_pos.x() - x_offset) * scale_x)
                img_y = int((mouse_pos.y() - y_offset) * scale_y)
                img_x = max(0, min(img_x, self.imgShape[0] - 1))
                img_y = max(0, min(img_y, self.imgShape[1] - 1))
                self.mouseMoved.emit(img_x, img_y)
                return
        self.mouseMoved.emit(-1, -1)
        super().mouseMoveEvent(event)

class TextDialog(QDialog):
    """ Show the text on a single dialog """
    def __init__(self, parent = None, flags = Qt.WindowFlags(), title: str = "帮助", headText: str|None = None, text: str|None = None, isHTML = False):
        super().__init__(parent, flags)
        self.setWindowTitle(title)
        self.setWindowFlags(Qt.WindowCloseButtonHint)
        layout = QVBoxLayout()
        if headText is not None:
            headLabel = QLabel(headText)
            headLabel.setStyleSheet("font-size: 24px;")
            headLabel.setAlignment(Qt.AlignCenter)
            layout.addWidget(headLabel)
        rounding = QGroupBox()
        if isHTML:
            self.widget = QTextBrowser()
            self.widget.setText()
        else:
            self.widget = QLabel()
        if text is not None:
            self.widget.setText(text)
        layout_ = QVBoxLayout()
        layout_.addWidget(self.widget)
        rounding.setLayout(layout_)
        rounding.setStyleSheet("""
            QGroupBox{
                border: 2px solid black;
                border-radius: 5px;
                margin-top: 10px;
            }""")
        layout.addWidget(rounding)
        self.setLayout(layout)
    def setText(self, text: str):
        """ Set the text of the dialog """
        self.widget.setText(text)

class SignGeneratorGUI(QMainWindow):
    """ The GUI """
    info = {}
    """ The infomation of the sign """
    sign: Sign = None
    """ The sign """
    def __init__(self):
        super().__init__()
        self.setWindowTitle("路牌生成器")
        self.resize(1200, 800)
        # Setup selection tree
        self.tree = QTreeWidget()
        self.tree.setHeaderLabel("路牌目录")
        self.tree.itemClicked.connect(self.on_item_clicked)
        # Split window
        self.selection_splitter = QSplitter(self)
        self.selection_splitter.addWidget(self.tree)
        self.tutorial = QLabel("选择左侧路牌类型以开始设计。\n\n操作说明：\n1. 在树形目录中选择路牌类型\n2. 在参数面板调整路牌属性（使用\\n换行）\n3. 实时预览路牌效果")
        self.tutorial.setStyleSheet("font-size: 24px; margin-bottom: 15px;")
        self.tutorial.setAlignment(Qt.AlignCenter)
        self.stacked_widget = QStackedWidget()
        self.stacked_widget.addWidget(self.tutorial)
        self.selection_splitter.addWidget(self.stacked_widget)
        self.selection_splitter.setSizes([250, 950])
        self.setCentralWidget(self.selection_splitter)
        # Set the right splitter
        self.sign_splitter = QSplitter()
        self.sign_info = QScrollArea()
        self.sign_splitter.addWidget(self.sign_info)
        self.image_label = TrackableImageLabel()
        self.image_label.setAlignment(Qt.AlignCenter)
        self.image_label.mouseMoved.connect(self.updatePosDisplay)
        self.statusBar = self.statusBar()
        self.coord_label = QLabel("坐标: (-, -)")
        self.statusBar.addPermanentWidget(self.coord_label)
        self.sign_splitter.addWidget(self.image_label)
        self.stacked_widget.addWidget(self.sign_splitter)
        self.sign_splitter.setSizes([350, 600])
        # Add menu
        menuBar = self.menuBar()
        fileMenu = menuBar.addMenu("文件")
        saveAction = QAction("保存", self)
        saveAction.triggered.connect(self.save)
        fileMenu.addAction(saveAction)
        helpMenu = menuBar.addMenu("帮助")
        self.helpSharpDialog = TextDialog(headText="井号(#)参考表")
        self.helpSharpDialog.setText("#B : 带框文本\n#BC: 带框颜色（颜色见下）\n#C_: 设定颜色（默认颜色）\n  B:蓝色、G:绿色、R:红色\n  Y:黄色、O:橙色、b:棕色\n  W:白色、其他: 黑色\n#D_: 辅助方向\n#H_: 图像头名称\n#NH: 高速编号\n#NHH: 高速编号强制等高\n#NW: 道路编号\n#TT: 取消间隔\n#Tt: 设置同宽")
        sharpHelpAction = QAction("可用井号(#)列表", self)
        sharpHelpAction.triggered.connect(self.helpSharpDialog.show)
        helpMenu.addAction(sharpHelpAction)
        # Load data
        self.scale_factor = 10
        self.isGenerate = False
        self.generator: Generator = None
        self.sign_type: str = None
        self.noEn = False
        self.straightArrow = ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙", "↶", "↰", "↱"]
        self.curveArrow = ["↫", "↰", "↑", "↱"]
        self.selection = {}
        if SIGN_TEMPLATES:
            self.selection.update({
            "一般道路": {"路口预告": ["路口式", "环岛式", "堆叠式"],
                        "车道方向": ["分向行驶", "车道预告"]},
            "高速公路": {"入口": ["入口预告"],
                        "路中": [],
                        "出口": ["出口方向"]},
            "小型标牌": ["出口编号", "高速编号", "道路编号", "辅助标牌"], 
            })
        if SIGN_GENERAL:
            self.selection.update({"通用标牌": ["通用标牌"]})
        self.setWindowIcon(QIcon(getFilePath("icon/icon.png")))
        self.load_selection()
        self.stacked_widget.setCurrentIndex(0)
    def save(self):
        """ Save the current sign"""
        if self.sign:
            fileName, _ = QFileDialog.getSaveFileName(self, "保存文件", getFilePath(""), "PNG文件(*.png);;所有文件 (*)")
            if fileName:
                self.sign.save(fileName)
        else:
            print("No sign!")
    def load_selection(self):
        """ Load selection nodes """
        self.tree.clear()
        self._add_items(self.tree, self.selection)
        self.tree.expandAll()  # 默认展开所有节点
    def _add_items(self, parent, data):
        """ Add nodes """
        style = self.style()
        if isinstance(data, dict):
            folder_icon = style.standardIcon(QStyle.SP_DirIcon)
            for key, value in data.items():
                item = QTreeWidgetItem(parent, [key])
                item.setData(0, Qt.UserRole, key)
                item.setIcon(0, folder_icon)
                self._add_items(item, value)
        elif isinstance(data, list):
            for value in data:
                item = QTreeWidgetItem(parent, [value])
                item.setData(0, Qt.UserRole, value)
                item.setIcon(0, QIcon(getFilePath(f"icon/{value}.png")) if os.path.exists(getFilePath(f"icon/{value}.png")) 
                                else style.standardIcon(QStyle.SP_FileIcon))
        else:
            item = QTreeWidgetItem(parent, [str(data)])
            item.setData(0, Qt.UserRole, data)
            item.setIcon(0, style.standardIcon(QStyle.SP_FileIcon))
    def on_item_clicked(self, item: QTreeWidgetItem, column):
        """ Set sign pannel when clicked """
        if item.childCount() == 0:
            if self.sign_type != item.text(0):
                self.sign_type = item.text(0)
                if False:
                    pass
                elif self.sign_type == "环岛式":
                    self.sign = signGenerator.RoundaboutSign(self.scale_factor)
                elif self.sign_type == "堆叠式":
                    self.sign = signGenerator.StackedCrossingSign(self.scale_factor)
                elif self.sign_type == "分向行驶":
                    self.sign = signGenerator.LineSign(self.scale_factor)
                elif self.sign_type == "车道预告":
                    self.sign  = signGenerator.LinePlaceSign(self.scale_factor)
                elif self.sign_type == "入口预告":
                    self.sign = signGenerator.HighwayEnterSign(self.scale_factor)
                elif self.sign_type == "出口方向":
                    self.sign = signGenerator.HignwayExitDirection(self.scale_factor)
                elif self.sign_type == "出口编号":
                    self.sign = signGenerator.ExitSign(self.scale_factor)
                elif self.sign_type == "高速编号":
                    self.sign = signGenerator.HighwayNoSign(self.scale_factor)
                elif self.sign_type == "道路编号":
                    self.sign = signGenerator.RoadNoSign(self.scale_factor)
                elif self.sign_type == "辅助标牌":
                    self.sign = signGenerator.AidSign(self.scale_factor)
                elif self.sign_type == "通用标牌":
                    self.sign = signGeneral.SignGeneral(self.scale_factor)
                else:
                    return self.stacked_widget.setCurrentIndex(0)
                self.noEn = ("english scale" in self.sign.info and self.sign.info["english scale"] == 0)
                self.changeInfo()
                self.changeInfo()
                if self.isGenerate:
                    if self.generator is not None:
                        self.generator.deleteLater()
                    self.generator = Updator(self)
                else:
                    self.isGenerate = True
                    self.signRefresh()
                    '''self.loader = ImageLoader(self)
                    self.loader.refreshFunc.connect(self.signRefresh)
                    self.loader.start()'''
                    generator = Updator(self)
                    generator.finish.connect(self.signUpdateFinished)
                    generator.start()
            self.stacked_widget.setCurrentIndex(1)
    def changeInfo(self):
        """ Set the info boxes """
        if self.sign_info.widget():
            self.sign_info.widget().deleteLater()
        # Add new layout
        scroll_content = QWidget()
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setAlignment(Qt.AlignTop)
        title_label = QLabel(f"{self.sign_type}参数:")
        title_label.setStyleSheet("font-size: 24px; font-weight: bold; margin-bottom: 15px;")
        title_label.setAlignment(Qt.AlignCenter)
        scroll_layout.addWidget(title_label)
        # Add info layout
        form_layout = QFormLayout()
        form_layout.setSpacing(10)
        self.info_widgets: dict[str, QWidget | dict[str,]] = {}
        # Setup info list
        info = deepcopy(self.sign.info)
        for key in info:
            if key in self.sign.info:
                value = self.sign.info[key]
                if self.noEn and "En" in key:
                    continue
                if "line" in self.info and "name" in key and (self.info["line"] ^ ("L" in key or "R" in key)):
                    continue
                if key not in self.info:
                    self.info[key] = value
                else:
                    """if isinstance(self.info[key], str):
                        try:
                            self.info[key] = loads(self.info[key])
                        except Exception:
                            pass"""
                    if type(self.info[key]) == type(value):
                        if isinstance(value, dict):
                            self.info[key] = value
                        elif self.info[key] != value:
                            value = self.info[key]
                            self.sign.autoSet(key, self.info[key], False)
                    elif isinstance(self.info[key], list) and isinstance(value, str):
                        self.info[key] = ", ".join([num.split("#", 1)[0] for num in self.info[key] if num != ""])
                        if self.info[key] != value:
                            value = self.info[key]
                            self.sign.autoSet(key, self.info[key], False)
                    elif isinstance(self.info[key], str) and isinstance(value, list):
                        self.info[key] = [text for text in self.info[key].split(", ") if text != ""]
                        if self.info[key] != value:
                            value = self.info[key]
                            self.sign.autoSet(key, self.info[key], False)
                    else:
                        self.info[key] = value
                if isinstance(value, list):
                    value = str(value).replace("'", '"')
                if isinstance(value, dict):
                    # 字典 - 使用QGroupBox
                    widget = QGroupBox("")
                    widget.setStyleSheet(""" 
                        QGroupBox{
                            border: 1px solid black;
                            border-radius: 5px;
                        } """)
                    groupLayout = QFormLayout()
                    widgets_: dict[str,] = {}
                    for k, v in value.items():
                        if self.noEn and "En" in k:
                            continue
                        if hasattr(self.sign, f"{k}ComboList"):  # 使用下拉框
                            widget_ = QComboBox()
                            comboList = getattr(self.sign, f"{k}ComboList")
                            widget_.addItems(comboList)
                            if v in comboList:
                                widget_.setCurrentText(v)
                            widget_.currentIndexChanged.connect(self.signUpdate)
                        # 根据值类型创建不同的控件
                        elif isinstance(v, bool):
                            # 布尔值 - 使用复选框
                            widget_ = QCheckBox()
                            widget_.setChecked(v)
                            widget_.stateChanged.connect(self.signUpdate)
                        elif isinstance(v, int):
                            # 整数 - 使用微调框
                            widget_ = QSpinBox()
                            widget_.setRange(*getattr(self.sign, f"{k}Range", (0, 1000)))
                            widget_.setValue(v)
                            widget_.valueChanged.connect(self.signUpdate)
                        elif isinstance(v, float):
                            # 浮点数 - 使用双精度微调框
                            widget_ = QDoubleSpinBox()
                            widget_.setRange(0, 1)
                            widget_.setValue(v)
                            widget_.setSingleStep(0.2)
                            widget_.valueChanged.connect(self.signUpdate)
                        else:
                            # 默认 - 使用文本输入框
                            widget_ = QLineEdit(v)
                            widget_.textChanged.connect(self.signUpdate)
                        groupLayout.addRow(QLabel(k + ":"), widget_)
                        widgets_[k] = widget_
                    widget.setLayout(groupLayout)
                    form_layout.addRow(QLabel(key + ":"), widget)
                    self.info_widgets[key] = widgets_
                else:
                    if hasattr(self.sign, f"{key}ComboList"):  # 使用下拉框
                        widget = QComboBox()
                        comboList = getattr(self.sign, f"{key}ComboList")
                        widget.addItems(comboList)
                        if value in comboList:
                            widget.setCurrentText(value)
                        widget.currentIndexChanged.connect(self.signUpdate)
                    # 根据值类型创建不同的控件
                    elif isinstance(value, bool):
                        # 布尔值 - 使用复选框
                        widget = QCheckBox()
                        widget.setChecked(value)
                        widget.stateChanged.connect(self.signUpdate)
                    elif isinstance(value, int):
                        # 整数 - 使用微调框
                        widget = QSpinBox()
                        widget.setRange(*getattr(self.sign, f"{key}Range", (0, 1000)))
                        widget.setValue(value)
                        widget.valueChanged.connect(self.signUpdate)
                    elif isinstance(value, float):
                        # 浮点数 - 使用双精度微调框
                        widget = QDoubleSpinBox()
                        widget.setRange(0, 1)
                        widget.setValue(value)
                        widget.setSingleStep(0.2)
                        widget.valueChanged.connect(self.signUpdate)
                    else:
                        # 默认 - 使用文本输入框
                        widget = QLineEdit(value)
                        widget.textChanged.connect(self.signUpdate)
                    form_layout.addRow(QLabel(key + ":"), widget)
                    self.info_widgets[key] = widget
        scroll_layout.addLayout(form_layout)
        # Add buttons (if any)
        #button_layout = QHBoxLayout()
        # Set to sign_info
        self.sign_info.setWidget(scroll_content)
        self.sign_info.setWidgetResizable(True)
    def signUpdate(self):
        """ Update changing data to sign """
        if self.isGenerate:
            if self.generator is not None:
                self.generator.deleteLater()
            self.generator = Generator(self)
        else:
            self.isGenerate = True
            self.signRefresh()
            generator = Generator(self)
            '''self.loader = ImageLoader(self)
            self.loader.refreshFunc.connect(self.signRefresh)
            self.loader.start()'''
            generator.finish.connect(self.signUpdateFinished)
            generator.start()
    def signUpdateFinished(self, newInfo: dict[str,]|None = None, change: list[str]|None = None):
        """ Set the data for finished update """
        noEn = ("english scale" in self.sign.info and self.sign.info["english scale"] == 0)
        if newInfo is not None:
            if "line" in self.info and self.info["line"] != newInfo["line"]:
                self.info["line"] = newInfo["line"]
                self.info = newInfo
                if self.noEn != noEn:
                    self.noEn = noEn
                self.changeInfo()
                return self.signRefresh()
            self.info = newInfo
        if self.noEn != noEn:
            self.noEn = noEn
            self.changeInfo()
            return self.signRefresh()
        if self.generator is not None:
            generator = self.generator
            self.generator = None
            generator.finish.connect(self.signUpdateFinished)
            generator.start()
            return self.signRefresh()
        self.isGenerate = False
        if change is not None:
            for item in change:
                if item in {"num", "layers"} or "#ALL" in item:
                    if self.generator is None:
                        self.changeInfo()
                    return self.signRefresh()
            for key, widget in self.info_widgets.items():
                key = key.split("#", 1)[0]
                if key not in change and key in self.sign.info:
                    value = self.sign.info[key]
                    if isinstance(widget, QLineEdit):
                        if isinstance(value, list|dict):
                            value = str(value).replace("'", '"')
                        else:
                            value = str(value)
                        if widget.text() != value:
                            widget.setText(value)
                    elif isinstance(widget, QCheckBox):
                        widget.setChecked(bool(value))
                    elif isinstance(widget, QComboBox):
                        widget.setCurrentText(value)
                    elif isinstance(widget, dict):
                        for k, w in widget.items():
                            if f"{key}#{k}" in change or k not in value:
                                continue
                            v = value[k]
                            if isinstance(w, QLineEdit):
                                if isinstance(v, list|dict):
                                    v = str(v).replace("'", '"')
                                else:
                                    v = str(v)
                                if w.text() != v:
                                    w.setText(v)
                            elif isinstance(w, QCheckBox):
                                w.setChecked(bool(v))
                            elif isinstance(w, QComboBox):
                                w.setCurrentText(v)
                            else:
                                w.setValue(v)
                    else:
                        widget.setValue(value)
        self.signRefresh()
    def signRefresh(self, img: Image.Image|None = None):
        """ Refresh QLabel image """
        if img is None:
            if self.sign and self.sign.img:
                img = self.sign.img
        if img is not None:
            if self.isGenerate:
                # 创建半透明阴影层 (50% 不透明度)
                shadow = Image.new("RGBA", img.size, (0, 0, 0, 128))
                img = Image.alpha_composite(img, shadow)
                # 绘制文本
                draw = ImageDraw.Draw(img)
                width, height = img.size
                text_height = min(width / 10, height / 4)
                try:
                    self.font = ImageFont.truetype("simhei.ttf", text_height)  # 使用黑体
                except:
                    self.font = ImageFont.load_default()  # 备用默认字体
                text = "加载中……"
                text_width = draw.textlength(text, font=self.font)
                text_position = ((width - text_width) // 2, (height - text_height) // 2)
                draw.text(text_position, text, fill="white", font=self.font)
            self.image_label.setImage(img, self.sign.scale)
    def updatePosDisplay(self, x, y):
        """ Refresh pos bar display """
        if x >= 0 and y >= 0:
            self.coord_label.setText(f"坐标: ({x}, {y})")
        else:
            self.coord_label.setText("坐标: (-, -)")

r'''class ImageLoader(QThread):
    """ Add loading screen to image """
    refreshFunc = pyqtSignal(Image.Image)
    def __init__(self, parent: SignGeneratorGUI):
        super().__init__(parent)
        self.parent_ = parent
        # 绘制动态指示器 (旋转的圆弧)
        self.start_angle = 30  # 起始角度
        self.end_angle = 300   # 结束角度
    def run(self):
        self.image = None
        while self.parent_.isGenerate:
            if self.image is None and self.parent_.sign and self.parent_.sign.img:
                self.image = self.parent_.sign.img
                width, height = self.image.size
                # 创建半透明阴影层 (50% 不透明度)
                shadow = Image.new("RGBA", self.image.size, (0, 0, 0, 0))
                shadow_draw = ImageDraw.Draw(shadow)
                shadow_draw.rectangle([0, 0, width, height], fill=(0, 0, 0, 128))
                # 合并阴影层到原图
                self.image = Image.alpha_composite(self.image, shadow)
                # 创建绘图对象
                draw = ImageDraw.Draw(self.image)
                text_height = min(self.image.size) / 10
                # 加载字体 (使用默认字体，建议替换为中文字体文件)
                try:
                    self.font = ImageFont.truetype("simhei.ttf", text_height)  # 使用黑体
                except:
                    self.font = ImageFont.load_default()  # 备用默认字体
                # 绘制文本
                text = "加载中……"
                text_width = draw.textlength(text, font=self.font)
                text_position = ((width - text_width) // 2, height // 2 - text_height * 2)
                draw.text(text_position, text, fill="white", font=self.font)
                self.image = self.image.resize((width // 4, height // 4))
                text_height /= 4
            if self.image is not None:
                image = self.image.copy()
                width, height = image.size
                draw = ImageDraw.Draw(image)
                # 绘制加载动画圈
                circle_center = (width // 2, height // 2 + text_height)
                circle_radius = round(text_height)
                circle_thickness = round(text_height / 8)
                bbox = [circle_center[0] - circle_radius, circle_center[1] - circle_radius, circle_center[0] + circle_radius, circle_center[1] + circle_radius]
                # 绘制圆形轨道
                draw.arc(bbox, start=self.start_angle, end=self.end_angle, fill="white", width=circle_thickness)
                self.refreshFunc.emit(image)
                self.start_angle += 2
                self.end_angle += 2
                QThread.sleep(10)
            else:
                QThread.sleep(100)
        #self.parent_.signRefresh()
        self.quit()'''

class Updator(QThread):
    """ run sign.update method """
    finish = pyqtSignal()  # connect to finish
    def __init__(self, parent: SignGeneratorGUI):
        super().__init__(parent)
        self.parent_ = parent
    def run(self):
        self.parent_.sign.update()
        self.finish.emit()
        self.quit()

class Generator(QThread):
    """ run the generating sign.update method with change """
    finish = pyqtSignal(dict, list)  # connect to finish
    def __init__(self, parent: SignGeneratorGUI):
        super().__init__(parent)
        self.parent_ = parent
    def run(self):
        sign = self.parent_.sign
        info = self.parent_.info.copy()
        info_widgets = self.parent_.info_widgets
        change: list[str] = []
        for key, widget in info_widgets.items():
            if key in sign.info:
                value = None
                if isinstance(widget, dict):
                    value: dict[str,] = {}
                    for k, v in widget.items():
                        if isinstance(v, QCheckBox):
                            value[k] = v.isChecked()
                        elif isinstance(v, QSpinBox):
                            value[k] = v.value()
                        elif isinstance(v, QDoubleSpinBox):
                            value[k] = v.value()
                        elif isinstance(v, QComboBox):
                            value[k] = v.currentText()
                        elif isinstance(v, QLineEdit):
                            value[k] = v.text()
                elif isinstance(widget, QCheckBox):
                    value = widget.isChecked()
                elif isinstance(widget, QSpinBox):
                    value = widget.value()
                elif isinstance(widget, QDoubleSpinBox):
                    value = widget.value()
                elif isinstance(widget, QComboBox):
                    value = widget.currentText()
                elif isinstance(widget, QLineEdit):
                    value = widget.text()
                if key in info:
                    if isinstance(value, str) and isinstance(sign.info[key], list|dict):
                        try:
                            value = loads(value)
                        except Exception:
                            pass
                    if isinstance(value, dict):
                        if any([v != info[key][k] for k, v in value.items() if k in info[key]]):
                            change_ = []
                            for k, v in value.items():
                                if k in info[key] and v != info[key][k]:
                                    info[k] = v
                                    if k == "type":
                                        change.append(f"{key}#ALL")
                                        change_.insert(0, "break")
                                    change_.append(f"{key}#{k}")
                            sign.autoSet(key, value)
                            if len(change_) > 0 and change_[0] != "break":
                                change += change_
                    elif info[key] != value:
                        info[key] = value
                        change.append(key)
                        sign.autoSet(key, value)
                else:
                    info[key] = value
                    change.append(key)
                    if isinstance(sign.info[key], list|dict):
                        try:
                            value = loads(value)
                        except Exception:
                            print(f"Not json: {value}")
                    if key in sign.info and sign.info[key] != value:
                        sign.autoSet(key, value)
        self.finish.emit(info, change)
        self.quit()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = SignGeneratorGUI()
    window.show()
    sys.exit(app.exec_())