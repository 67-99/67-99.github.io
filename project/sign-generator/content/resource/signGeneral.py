from signTemplate import Color, Sign
from PIL import Image

class SignGeneral(Sign):
    """ A general sign with position setting """
    def __init__(self, scale, text_height: int = 50):
        super().__init__(scale)
        self.text_height = text_height
        self.info = {"background": "GW", "BGwidth": 640, "BGheight": 480, "layers": 0}
        self.num = 0
        self.bgcolor = Color.GREEN
        self.bglinecolor = (255)
        self.typeTrans = {
            "text": {"text": "", "height": text_height, "textType": "A", "gap": 0.1}, 
            "textC": {"text": "", "height": text_height, "textType": "A", "gap": 0.1}, 
            "arc": {"endX": 0, "endY": 0, "lineWidth": text_height * 0.4},
            "roundRect": {"width": text_height, "height": text_height, "rad": text_height * 0.1, "color": "G"}, 
            "arrowS": {"arrowS": "↑", "width": text_height, "height": text_height}
            }
        self.typeComboList = self.typeTrans.keys()
        self.textTypeComboList = ["A", "B", "C"]
        self.arrowSComboList = ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙", "↶", "↰", "↱"]
    def update(self):
        self.img = Image.new("RGBA", (round(self.info["BGwidth"] * self.scale), round(self.info["BGheight"] * self.scale)), (255, 255, 255, 0))
        self.drawTriRoundRect(None, self.text_height * 0.1, self.bgcolor, self.bglinecolor)
        for i in range(self.num):
            key = f"layer{i + 1}"
            if key not in self.info:
                continue
            layerInfo: dict[str,] = self.info[key]
            pos = (layerInfo.get("x", 0), layerInfo.get("y", 0))
            try:
                if layerInfo["type"] == "text":
                    self.putAutoText(layerInfo["text"], pos, layerInfo.get("height", self.text_height), layerInfo.get("textType", "A"), layerInfo.get("gap", 0.1))
                elif layerInfo["type"] == "textC":
                    self.putAutoCentralText(layerInfo["text"], pos, layerInfo.get("height", self.text_height), layerInfo.get("textType", "A"), layerInfo.get("gap", 0.1))
                elif layerInfo["type"] == "arc":
                    self.drawArc(pos, (layerInfo.get("endX", 0), layerInfo.get("endY", 0)), layerInfo.get("lineWidth", self.text_height * 0.4))
                elif layerInfo["type"] == "roundRect":
                    x2 = pos[0] + layerInfo["width"]
                    y2 = pos[1] + layerInfo["height"]
                    colorList = Color.getDefaultColor(layerInfo.get("color", "G"))
                    self.drawRoundRect((*pos, x2, y2), layerInfo.get("rad", self.text_height * 0.1), colorList[0] if len(colorList) >= 1 else Color.GREEN)
                elif layerInfo["type"] == "arrowS":
                    self.drawAutoStraightArrow(layerInfo["arrowS"], pos, layerInfo.get("width", self.text_height), layerInfo.get("height", None))
            except:
                print("Error:", f"Cannot draw {key} ({layerInfo["type"]})")
    def setLayer(self, key: str, value: dict[str,], refresh = True):
        """ Change the setting of a layer """
        oldDict = self.info.get(key, {})
        layerType = value.get("type", "text")
        if layerType not in self.typeTrans:
            layerType = "text"
        if oldDict.get("type", "") != layerType:
            newDict = {"x": value.get("x", 0), "y": value.get("y", 0), "type": layerType}
            newDict.update(self.typeTrans[layerType])
            self.info[key] = newDict
        else:
            for k, v in value.items():
                if k in self.info[key] and self.info[key][k] != v:
                    break
            else:
                return
            self.info[key] = value
        if refresh:
            self.update()
    def setNum(self, num: int, refresh = True):
        """ Set the number of lines """
        if num >= 0:
            self.info["layers"] = num
            if self.num < num:
                while self.num < num:
                    self.num += 1
                    self.info[f"layer{self.num}"] = {}
                    self.setLayer(f"layer{self.num}", {"type": "text"}, False)
                if refresh:
                    self.update()
            elif self.num > num:
                while self.num > num:
                    if f"layer{self.num}" in self.info:
                        self.info.pop(f"layer{self.num}")
                    self.num -= 1
                if refresh:
                    self.update()
    def autoSet(self, key: str, value, refresh = True):
        """ Set data based on infomation """
        if key == "background":
            bgcolor = Color.getDefaultColor(value)
            self.bgcolor = bgcolor[0] if len(bgcolor) > 0 else Color.GREEN
            self.bglinecolor = bgcolor[1] if len(bgcolor) > 1 else (255)
            if(refresh):
                self.update()
        elif key == "layers":
            self.setNum(value, refresh)
        elif len(key) > 5 and key[:5] == "layer" and key[5:].isdigit():
            self.setLayer(key, value, refresh)
        else:
            super().autoSet(key, value, refresh)