from signTemplate import Color, Sign
from textGenerator import placeText, fontLen
from PIL import Image, ImageDraw
from pypinyin import slug as toPinyin
import os

def getFilePath(path: str):
    """ Return the path from the code file """
    return os.path.join(os.path.dirname(__file__), path)

def isAlpha(string: str):
    return all(["A"<= char <= "z" and char.isalpha() for char in string])

def isHighway(name: str):
    if "#N" in name:
        return "#NH" in name
    name = name.split("#", 1)[0]
    if name == "":
        return False
    if len(name) == 1:
        return isAlpha(name)
    if len(name) == 2:
        return isAlpha(name[0]) and name[1].isdigit()
    if len(name) == 4:
        return isAlpha(name[:2]) and name[1:].isdigit()
    if len(name) == 3 and isAlpha(name[:2]) and name[1:].isdigit():
        return True
    return isAlpha(name[0]) and name[1:].isdigit()

def getAutoSharp(numNo: str|list[str]):
    """ Add type to the end of the number-sign(s) """
    if isinstance(numNo, str):
        return numNo if "#" in numNo else numNo + ("#NH" if isHighway(numNo) else "#NW")
    return [num if "#" in num else num + ("#NH" if isHighway(num) else "#NW") for num in numNo]

def splitSharp(string: str):
    """ Split string to text and sharp infomation """
    aid = ""
    if "#" in string:
        string, aid = string.split("#", 1)
        aid = "#" + aid
    return (string, aid)

def getSharpText(aidStr: str, getType: str):
    """ Get the infomation of the aidStr """
    if getType == "BC":
        if "#BC" in aidStr:
            colorStr = aidStr[aidStr.find("#BC") + 2:].split("#", 1)[0][1:]
            return [Color.getRGBAColor(color) for color in Color.getDefaultColor(colorStr)]
        return []
    if getType == "C":
        if "#C" in aidStr:
            colorStr = aidStr[aidStr.find("#C") + 1:].split("#", 1)[0][1:]
            return [Color.getRGBAColor(color) for color in Color.getDefaultColor(colorStr)]
        return []
    if getType == "D":
        if "#D" in aidStr:
            aid = aidStr[aidStr.find("#D") + 2:]
            if aid != "":
                return aid[0]
        return ""
    if getType == "H":
        if "#H" in aidStr:
            return aidStr[aidStr.find("#H") + 2:].split("#")[0]
        return ""

def chToEn(ch: str):
    """ Translate from Chinese to English """
    if ch == "":
        return ""
    ch = ch.split("#", 1)[0]
    start = {"避险车道": "Truck Escape Ramp", "下一出口": "Next Exit", "爬坡车道": "Climbing Lane", "超限检测站": "Weight Station"}
    end = {"道路交通信息": "Traffic Information", "城区": "Urban", "收费站": "Toll Station", "隧道": "Tunnel", "入口": "Entrance", "出口": "Exit", "收费": "Toll", "服务区": "Service Area", "停车区": "Rest Area", "服务站": "Service Area", "停车点": "Rest Area", "起点": "Begin", "结束": "end", "方向": "Direction", 
           "桥": "Bridge", "站": "Station", "地铁": "Subway", "火车": "Railway", "高铁": "Highspeed Railway", "河": "River", "公园": "Park", "森林": "Forest", "飞机场": "Airport", "机场": "Airport", "港": "Port", "国际": "International", "环路": "Ring Rd.", "环": "Ring Rd.", "高速": "Highway", "线": "Highway", "路": "Rd.", "街": "St.", "大道": "Ave.", "大街": "Ave.", 
           "一": "1st", "二": "2nd", "三": "3rd", "四": "4th", "五": "5th", "六": "6th", "七": "7th", "八": "8th", "九": "9th", "东": "East", "西": "West", "南": "South", "北": "North", "中": "Middle"}
    enList = []
    for line in ch.split("\\n"):
        if "#N" in line:
            enList.append("")
        else:
            startEn = ""
            for chStr, enStr in start.items():
                if len(line) >= len(chStr) and line[:len(chStr)] == chStr:
                    line = line[len(chStr):]
                    startEn += enStr + " "
            endEn = ""
            for chStr, enStr in end.items():
                if len(line) >= len(chStr) and line[-len(chStr):] == chStr:
                    line = line[:-len(chStr)]
                    endEn = " " + enStr + endEn
            enList.append(startEn + toPinyin(line, separator="").capitalize() + endEn)
    return "\\n".join(enList)

class RoundaboutSign(Sign):
    """ A preview sign for roundabout """
    def __init__(self, scale: int, text_height: int = 30, english_scale: float|None = None, /, info: dict[str,]|None = None):
        super().__init__(scale)
        self.text_height = text_height
        self.english_scale = english_scale
        self.info = {"english scale": 0.0 if english_scale is None else english_scale, "direction": "", "crossing name": "", "num": 0}
        if info:
            self.info.update(info)
        self.num = self.info["num"]
        self.directionComboList = ("", "北", "东", "南", "西")
        self.headingRange = (-8, 8)
        self.update()
    def update(self):
        bboxList = [self.getDirectionBbox(self.info[f"direction{i + 1}"], self.text_height, 2.4) for i in range(self.num) if f"direction{i + 1}" in self.info] + [(-0.8 * self.text_height, -0.8 * self.text_height, 0.8 * self.text_height, 0.8 * self.text_height)]
        bbox = [min([bbox[0] for bbox in bboxList]), min([bbox[1] for bbox in bboxList]), max([bbox[2] for bbox in bboxList]), max([bbox[3] for bbox in bboxList])]
        if self.info["direction"] != "":
            directionSE = [bbox[0] + 0.9 * self.text_height, bbox[1] + 0.9 * self.text_height]
            for i in range(len(bboxList)):
                bboxWN = bboxList[i][:2]
                if bboxWN[0] < directionSE[0]:
                    shift = directionSE[0] - bboxWN[0]
                    directionSE[0] -= shift
                    bbox[0] -= shift
                if bboxWN[1] < directionSE[1]:
                    shift = directionSE[1] - bboxWN[1]
                    directionSE[1] -= shift
                    bbox[1] -= shift
        width = max(1.6 * self.text_height, bbox[2] - bbox[0]) + self.text_height
        height = max(0.4 * self.text_height, -bbox[1]) + max((1.6 if self.info["crossing name"] == "" else 2.2) * self.text_height, bbox[3]) + self.text_height
        self.img = Image.new("RGBA", (round(width * self.scale), round(height * self.scale)), (0, 0, 0, 0))
        self.drawTriRoundRect(None, 0.1 * self.text_height, Color.BLUE, (255))
        draw = ImageDraw.Draw(self.img)
        if self.info["direction"] != "":
            draw.rectangle([pos * self.scale for pos in (0.2 * self.text_height, 0.2 * self.text_height, 1.1 * self.text_height, 1.1 * self.text_height)], fill= Color.getRGBAColor((255)))
            self.putCentralString(self.info["direction"], (0.6 * self.text_height, 0.2 * self.text_height), "A", 0.8 * self.text_height, Color.BLUE)
        x = 0.5 * self.text_height - bbox[0]
        y = 0.5 * self.text_height - bbox[1]
        for i in range(self.num):
            if f"direction{i + 1}" in self.info:
                self.putDirection(self.info[f"direction{i + 1}"], (x, y), self.text_height, 2.4) 
        draw.circle([x * self.scale, y * self.scale], 0.8 * self.text_height * self.scale, Color.getRGBAColor(255))
        draw.circle([x * self.scale, y * self.scale], 0.4 * self.text_height * self.scale, Color.getRGBAColor(Color.BLUE))
        draw.polygon([pos * self.scale for pos in (x, y, x - 0.5 * self.text_height, y + 0.8 * self.text_height, x - self.text_height, y + 0.8 * self.text_height)], Color.getRGBAColor(Color.BLUE))
        if self.info["crossing name"] == "":
            draw.rectangle([pos * self.scale for pos in (x - 0.2 * self.text_height, y + 0.6 * self.text_height, x + 0.2 * self.text_height, height - 0.5 * self.text_height)], Color.getRGBAColor(255))
        else:
            draw.rectangle([pos * self.scale for pos in (x - 0.2 * self.text_height, y + 0.6 * self.text_height, x + 0.2 * self.text_height, height - 1.4 * self.text_height)], Color.getRGBAColor(255))
            self.putCentralString(self.info["crossing name"], (x, height - (0.5 + 2/3) * self.text_height), "A", round(2/3 * self.text_height), maxLen=min(3 * self.text_height, 2 * -bbox[0], 2 * bbox[2]))
    def setNum(self, num: int, refresh = True):
        """ Set the number of lines """
        if num >= 0:
            self.info["num"] = num
            if self.num < num:
                while self.num < num:
                    self.num += 1
                    self.info[f"direction{self.num}"] = {"heading": 0, "text": "", "textEn": "", "next": ""}
                if refresh:
                    self.update()
            elif self.num > num:
                while self.num > num:
                    if f"direction{self.num}" in self.info:
                        self.info.pop(f"direction{self.num}")
                    self.num -= 1
                if refresh:
                    self.update()
    def autoSet(self, key: str, value, refresh=True):
        """ Set data based on infomation """
        if key == "english scale":
            self.info["english scale"] = value
            self.english_scale = float(value)
            if self.english_scale == 0:
                self.english_scale = None
            if refresh:
                self.update()
        elif key == "num":
            self.setNum(value, refresh)
        elif key in {"direction", "crossing name"}:
            super().autoSet(key, value, refresh)
        elif "direction" in key and isinstance(value, dict):
            if key in self.info:
                for k, v in value.items():
                    if self.info[key][k] != v:
                        self.info[key][k] = v
                if refresh:
                    self.update()

class StackedCrossingSign(Sign):
    """ A stacked preview sign of the crossing """
    def __init__(self, scale: int, text_height: int = 30, english_scale: float|None = None, /, info: dict[str,]|None = None):
        super().__init__(scale)
        self.text_height = text_height
        self.english_scale = english_scale
        self.info = {"english scale": 0.0 if english_scale is None else english_scale, "direction": "", "num": 0}
        if info:
            self.info.update(info)
        self.num = self.info["num"]
        self.arrowComboList = ("↶", "←", "↖", "↑", "↗", "→")
        self.update()
    def update(self):
        width = max([3 * self.text_height] + [(3 if self.info[f"direction{i + 1}"]["arrow"] in {"←", "→"} else 2.6) * self.text_height + self.getAutoLen(self.info[f"direction{i + 1}"]["text"], self.text_height, "A", 0.2) for i in range(self.num) if f"direction{i + 1}" in self.info])
        self.img = Image.new("RGBA", (round(width * self.scale), round((0.3 * self.text_height + sum([Sign.getAutoHeight(self.info[f"direction{i + 1}"]["text"], self.text_height, self.english_scale, 0.2) + 0.9 * self.text_height for i in range(self.num) if f"direction{i + 1}" in self.info]) if self.num > 0 else 0.8 * self.text_height) * self.scale)), (0, 0, 0, 0))
        self.drawTriRoundRect(None, 0.1 * self.text_height, Color.BLUE, (255))
        draw = ImageDraw.Draw(self.img)
        y = 0.6 * self.text_height
        for i in range(self.num):
            if f"direction{i + 1}" in self.info:
                x0 = 2 * self.text_height
                x1 = width - 0.6 * self.text_height
                arrowY = y + Sign.getAutoHeight(self.info[f"direction{i + 1}"]["text"], self.text_height, self.english_scale, 0.2) / 2 - self.text_height / 2
                if self.info[f"direction{i + 1}"]["arrow"] == "↶":
                    self.drawUTurnArrow((0.5 * self.text_height, arrowY - 0.2 * self.text_height, 1.7 * self.text_height, arrowY + 1.2 * self.text_height))
                elif self.info[f"direction{i + 1}"]["arrow"] == "←":
                    self.drawLeftArrow((0.5 * self.text_height, arrowY, 2 * self.text_height, arrowY + self.text_height))
                    x0 = 2.4 * self.text_height
                elif self.info[f"direction{i + 1}"]["arrow"] == "↖":
                    self.drawUpLeftArrow((0.5 * self.text_height, arrowY - 0.1 * self.text_height), 1.2 * self.text_height)
                elif self.info[f"direction{i + 1}"]["arrow"] == "↑":
                    self.drawUpArrow((0.6 * self.text_height, arrowY - 0.2 * self.text_height, 1.6 * self.text_height, arrowY + 1.2 * self.text_height))
                elif self.info[f"direction{i + 1}"]["arrow"] == "↗":
                    self.drawUpRightArrow((width - 1.7 * self.text_height, arrowY - 0.1 * self.text_height), 1.2 * self.text_height)
                    x0 = 0.6 * self.text_height
                    x1 = width - 2 * self.text_height
                elif self.info[f"direction{i + 1}"]["arrow"] == "→":
                    self.drawRightArrow((width - 2 * self.text_height, arrowY, width - 0.5 * self.text_height, arrowY + self.text_height))
                    x0 = 0.6 * self.text_height
                    x1 = width - 2.4 * self.text_height
                self.putAutoCentralText(self.info[f"direction{i + 1}"]["text"], ((x0 + x1) / 2, y), self.text_height, "A", 0.2, maxLen=width - (2.9 if self.info[f"direction{i + 1}"]["arrow"] in {"←", "→"} else 2.6) * self.text_height)
                y += Sign.getAutoHeight(self.info[f"direction{i + 1}"]["text"], self.text_height)
                if self.english_scale is not None:
                    y += 0.2 * self.text_height
                    self.putCentralString(self.info[f"direction{i + 1}"]["textEn"], ((x0 + x1) / 2, y), "A", self.text_height * self.english_scale, maxLen=width - (2.9 if self.info[f"direction{i + 1}"]["arrow"] in {"←", "→"} else 2.6) * self.text_height)
                    y += Sign.getAutoEnHeight(self.info[f"direction{i + 1}"]["textEn"] + " ", self.text_height, self.english_scale, 0)
                y += 0.4 * self.text_height
                if i + 1 < self.info["num"]:
                    draw.rectangle([pos * self.scale for pos in (0.2 * self.text_height, y, width - 0.2 * self.text_height, y + 0.1 * self.text_height)], Color.getRGBAColor(255))
                y += 0.5 * self.text_height
    def setNum(self, num: int, refresh = True):
        """ Set the number of lines """
        if num >= 0:
            self.info["num"] = num
            if self.num < num:
                while self.num < num:
                    self.num += 1
                    self.info[f"direction{self.num}"] = {"arrow": "↑", "text": "", "textEn": ""}
                if refresh:
                    self.update()
            elif self.num > num:
                while self.num > num:
                    if f"direction{self.num}" in self.info:
                        self.info.pop(f"direction{self.num}")
                    self.num -= 1
                if refresh:
                    self.update()
    def autoSet(self, key: str, value, refresh=True):
        """ Set data based on infomation """
        if key == "english scale":
            self.info["english scale"] = value
            self.english_scale = float(value)
            if self.english_scale == 0:
                self.english_scale = None
            if refresh:
                self.update()
        elif key == "num":
            self.setNum(value, refresh)
        elif "direction" in key and isinstance(value, dict):
            if key in self.info:
                for k, v in value.items():
                    if self.info[key][k] != v:
                        self.info[key][k] = v
                if refresh:
                    self.update()

class LineSign(Sign):
    """ A sign to show the directions of the lines """
    def __init__(self, scale: int, height: int = 150, /, info: dict[str,]|None = None):
        super().__init__(scale)
        self.height = height
        self.info = {"num": 0}
        if info:
            self.info.update(info)
        self.num = self.info["num"]
        self.arrowComboList = ("↶", "↰", "↑", "↱")
        self.update()
    def update(self):
        self.img = Image.new("RGBA", ((75 * self.num + 25) * self.scale, self.height * self.scale), (0, 0, 0, 0))
        self.drawTriRoundRect(None, 2.5, Color.BLUE, (255))
        draw = ImageDraw.Draw(self.img)
        x = 10
        draw.rectangle([pos * self.scale for pos in (x, 10, x + 5, self.height - 10)], Color.getRGBAColor((255)))
        for i in range(self.num):
            x += 5
            if f"line{i + 1}" in self.info:
                x0 = x + 33 if self.info[f"line{i + 1}"]["↰"] or self.info[f"line{i + 1}"]["↶"] else x + 10
                x1 = x + 37 if self.info[f"line{i + 1}"]["↱"] else x + 60
                y = 0.1 * self.height
                if self.info[f"line{i + 1}"]["↑"]:
                    if(self.info[f"line{i + 1}"]["↰"] or self.info[f"line{i + 1}"]["↶"]):
                        if self.info[f"line{i + 1}"]["↱"]:
                            self.drawUpArrow((x + 25, y, x + 45, self.height * 0.9))
                        else:
                            self.drawUpArrow((x + 30, y, x + 60, self.height * 0.9))
                            x1 = x + 50
                    else:
                        if self.info[f"line{i + 1}"]["↱"]:
                            self.drawUpArrow((x + 10, y, x + 40, self.height * 0.9))
                            x0 = x + 20
                        else:
                            self.drawUpArrow((x + 20, y, x + 50, self.height * 0.9))
                    y += 0.2 * self.height
                y += 0.05 * self.height
                if self.info[f"line{i + 1}"]["↱"]:
                    self.drawRightTurnArrow((x0, y, x + 62, self.height * 0.9))
                if self.info[f"line{i + 1}"]["↰"]:
                    self.drawLeftTurnArrow((x + 8, y, x1, self.height * 0.9))
                if self.info[f"line{i + 1}"]["↶"]:
                    self.drawUTurnArrow((x + 8, y + 0.25 * self.height if self.info[f"line{i + 1}"]["↰"] or self.info[f"line{i + 1}"]["↱"] else y, x1, self.height * 0.9))
            x += 70
            y = 15
            while y < self.height - 25:
                draw.rectangle([pos * self.scale for pos in (x, y, x + 5, y + 15)], Color.getRGBAColor((255)))
                y += 26
        draw.rectangle([pos * self.scale for pos in (x, 10, x + 5, self.height - 10)], Color.getRGBAColor((255)))
    def autoSet(self, key: str, value, refresh=True):
        """ Set data based on infomation """
        if key == "num":
            if value >= 0:
                self.info["num"] = value
                if self.num < value:
                    while self.num < value:
                        self.num += 1
                        newLine = {}
                        for arrow in self.arrowComboList:
                            newLine[arrow] = False
                        self.info[f"line{self.num}"] = newLine
                    if refresh:
                        self.update()
                elif self.num > value:
                    while self.num > value:
                        if f"line{self.num}" in self.info:
                            self.info.pop(f"line{self.num}")
                        self.num -= 1
                    if refresh:
                        self.update()
        else:
            super().autoSet(key, value, refresh)

class LinePlaceSign(Sign):
    """ A sign to show the directions and destinations """
    def __init__(self, scale: int, height: int = 180, english_scale: float|None = None, /, info: dict[str,]|None = None):
        super().__init__(scale)
        self.height = max(150, height)
        self.english_scale = english_scale
        self.info = {"english scale": 0.0 if english_scale is None else english_scale, "num": 0}
        if info:
            self.info.update(info)
        self.num = self.info["num"]
        self.arrowComboList = ("↶", "↰", "↑", "↱", "text", "textEn")
        self.update()
    def update(self):
        self.img = Image.new("RGBA", ((75 * self.num + 25) * self.scale, self.height * self.scale), (0, 0, 0, 0))
        self.drawTriRoundRect(None, 2.5, Color.BLUE, (255))
        draw = ImageDraw.Draw(self.img)
        x = 10
        draw.rectangle([pos * self.scale for pos in (x, 10, x + 5, self.height - 10)], Color.getRGBAColor((255)))
        for i in range(self.num):
            x += 5
            if f"line{i + 1}" in self.info:
                if self.english_scale is None:
                    y = 20
                    self.putCentralString(self.info[f"line{i + 1}"]["text"], (x + 35, y), "A", 30, maxLen=64)
                else:
                    y = 15
                    textHeight = 35 / (1 + self.english_scale)
                    self.putCentralString(self.info[f"line{i + 1}"]["text"], (x + 35, y), "A", round(textHeight), maxLen=64)
                    y += textHeight + 4
                    self.putCentralString(self.info[f"line{i + 1}"]["textEn"], (x + 35, y), "A", round(textHeight * self.english_scale), maxLen=64)
                x0 = x + 33 if self.info[f"line{i + 1}"]["↰"] or self.info[f"line{i + 1}"]["↶"] else x + 10
                x1 = x + 37 if self.info[f"line{i + 1}"]["↱"] else x + 60
                y = 60
                if self.info[f"line{i + 1}"]["↑"]:
                    if(self.info[f"line{i + 1}"]["↰"] or self.info[f"line{i + 1}"]["↶"]):
                        if self.info[f"line{i + 1}"]["↱"]:
                            self.drawUpArrow((x + 25, y, x + 45, self.height * 0.9))
                        else:
                            self.drawUpArrow((x + 30, y, x + 60, self.height * 0.9))
                            x1 = x + 50
                    else:
                        if self.info[f"line{i + 1}"]["↱"]:
                            self.drawUpArrow((x + 10, y, x + 40, self.height * 0.9))
                            x0 = x + 20
                        else:
                            self.drawUpArrow((x + 20, y, x + 50, self.height * 0.9))
                    y += 0.18 * self.height
                if self.info[f"line{i + 1}"]["↱"]:
                    self.drawRightTurnArrow((x0, y, x + 62, self.height * 0.9))
                if self.info[f"line{i + 1}"]["↰"]:
                    self.drawLeftTurnArrow((x + 5, y, x1, self.height * 0.9))
                    if self.info[f"line{i + 1}"]["↑"]:
                        y += 0.15 * self.height
                    else:
                        y += 0.2 * self.height
                elif self.info[f"line{i + 1}"]["↱"]:
                    y += 0.2 * self.height
                else:
                    y += 0.05 * self.height
                if self.info[f"line{i + 1}"]["↶"]:
                    self.drawUTurnArrow((x + 8, y, x1, self.height * 0.9))
            x += 70
            y = 17
            while y < self.height - 25:
                draw.rectangle([pos * self.scale for pos in (x, y, x + 5, y + 15)], Color.getRGBAColor((255)))
                y += 26
        draw.rectangle([pos * self.scale for pos in (x, 10, x + 5, self.height - 10)], Color.getRGBAColor((255)))
    def setNum(self, num: int, refresh = True):
        """ Set the number of lines """
        if num >= 0:
            self.info["num"] = num
            if self.num < num:
                while self.num < num:
                    self.num += 1
                    newLine = {}
                    for arrow in self.arrowComboList:
                        if "text" in arrow:
                            newLine[arrow] = ""
                        else:
                            newLine[arrow] = False
                    self.info[f"line{self.num}"] = newLine
                if refresh:
                    self.update()
            elif self.num > num:
                while self.num > num:
                    if f"line{self.num}" in self.info:
                        self.info.pop(f"line{self.num}")
                    self.num -= 1
                if refresh:
                    self.update()
    def setText(self, key: str, text: str, refresh = True):
        """ Set the places name of the sign """
        self.info[key]["text"] = text
        self.info[key]["textEn"] = chToEn(text)
        if refresh:
            self.update()
    def autoSet(self, key: str, value, refresh=True):
        """ Set data based on infomation """
        if key == "english scale":
            self.info["english scale"] = value
            self.english_scale = float(value)
            if self.english_scale == 0:
                self.english_scale = None
            if refresh:
                self.update()
        elif key == "num":
            self.setNum(value, refresh)
        elif "line" in key and isinstance(value, dict):
            if key in self.info:
                textChange = False
                for k, v in value.items():
                    if self.info[key][k] != v and (k != "textEn" or not textChange):
                        if k == "text":
                            self.setText(key, v, False)
                            textChange = True
                        else:
                            self.info[key][k] = v
                if refresh:
                    self.update()

class HighwayNoSign(Sign):
    """ A Hignway number sign """
    def __init__(self, scale: int, text_height: int = 30, hasName: bool = False, headColor: tuple = Color.YELLOW, /, info: dict[str,]|None = None):
        super().__init__(scale)
        self.text_height = text_height
        self.hasName = hasName
        self.headColor = Color.getRGBAColor(headColor)
        self.info = {"type": "高速", "No": "", "name": ""}
        if info:
            self.info.update(info)
        self.sharpStr = ""
        self.width = 25
        self.update()
    def putCentralString(self, string, centralPos, font_type, height, color = 255):
        if "#NHH" in self.sharpStr or len(string) < 5:
            super().putCentralString(string, centralPos, font_type, height, color)
        else:
            bigStr = string[:3]
            smallStr = string[3:]
            halfTextLen = (fontLen([bigStr], font_type, height, self.scale) + fontLen([smallStr], font_type, height * 2/3, self.scale)) / 2
            placeText(self.img, (round((centralPos[0] - halfTextLen) * self.scale), centralPos[1] * self.scale), bigStr, font_type, height * self.scale, color)
            placeText(self.img, (round(centralPos[0] - halfTextLen + fontLen([bigStr], font_type, height, self.scale)) * self.scale, round(centralPos[1] + height / 3) * self.scale), smallStr, font_type, height * 2/3 * self.scale, color)
    def update(self):
        if "#NHH" in self.sharpStr:
            self.width = max(75 + fontLen(self.info["No"], "B", self.text_height, self.scale), self.getTextLen(self.info["type"], "A", 10, 10 / self.scale) + 30)
        else:
            self.width = max(50 + len(self.info["No"]) * 25 if len(self.info["No"]) < 5 else round(57.5 + 22.5 * len(self.info["No"])), self.getTextLen(self.info["type"], "A", 10, 10 / self.scale) + 30)
        if self.hasName:
            self.width = max(self.width, round(self.getTextLen(self.info["name"], "A", 20, 0.25) + 30))
        self.img = Image.new("RGBA", (int(self.width * self.scale), (120 if self.hasName else 100) * self.scale), (0, 0, 0, 0))
        self.drawTriRoundRect(None, 3, Color.GREEN, (255))
        self.drawhalfRoundRect((6, 6, self.width - 6, 26), 6, 3, self.headColor)
        self.putCentralText(self.info["type"], (self.width / 2, 11), "A", 10, 10 / self.scale, (255) if self.info["type"] == "国家高速" else (0))
        self.putCentralString(self.info["No"], (round(self.width / 2), 34 if self.hasName else 37), "B", 45)
        if self.hasName:
            self.putCentralText(self.info["name"], (self.width / 2, 86), "A", 20, 0.25)
    def setNo(self, noStr: str, type: str|None = None, name: str|None = None, refresh = True):
        """ Set the number (and the name) of the sign """
        self.info["No"], self.sharpStr = splitSharp(noStr)
        if len(noStr) > 0:
            if noStr[0] == "G":
                self.headColor = Color.RED
                self.info["type"] = "国家高速"
            elif type is not None:
                self.headColor = Color.YELLOW
                self.info["type"] = type
        if name:
            self.hasName = True
            self.info["name"] = name
        if refresh:
            self.update()
    def setName(self, name: str|None, refresh = True):
        """ Set the name of the sign """
        if not name:
            self.hasName = False
            self.info["name"] = ""
        else:
            self.hasName = True
            self.info["name"] = name
        if refresh:
            self.update()
    def autoSet(self, key: str, value, refresh = True):
        """ Set data based on infomation """
        if key == "No":
            self.setNo(value, refresh=refresh)
        elif key == "name":
            self.setName(value, refresh)
        else:
            self.info[key] = value
            if self.info["type"] == "国家高速":
                self.headColor = Color.RED
            else:
                self.headColor = Color.YELLOW
            if refresh:
                self.update()

class HighwayEnterSign(Sign):
    """ An entrace sign of some highways """
    def __init__(self, scale: int, text_height: int = 60, noNo: bool = False, english_scale: float|None = None, /, info: dict[str,]|None = None):
        super().__init__(scale)
        self.text_height = text_height
        self.noNo = noNo
        self.hasLine = False
        self.english_scale = english_scale
        self.info: dict[str, float|str] = {"english scale": 0.0 if self.english_scale is None else self.english_scale, "line": False, "No": "", "name": "", "nameEn": "", "nameL": "", "nameLEn": "", "nameR": "", "nameREn": "", "distance": ""}
        if info:
            self.info.update(info)
        self.update()
    def update(self):
        width = max(6.4 * self.text_height, 
                    2.2 * self.text_height + max([0] + [self.getAutoLen(name, self.text_height, "A", 0.1) for name in self.info["nameL"].split("\\n")]) + max([0] + [self.getAutoLen(name, self.text_height, "A", 0.1) for name in self.info["nameR"].split("\\n")]), 
                    0 if self.info["distance"] in {"l", "r"} else 3.8 * self.text_height + self.getTextLen(self.info["distance"], "B", self.text_height, 0)) if self.hasLine \
                else max(6 * self.text_height, 
                        1.2 * self.text_height + max([0] + [self.getAutoLen(line, self.text_height, "A", 0.1) for line in self.info["name"].split("\\n")]), 
                        0 if self.info["distance"] in {"l", "r"} else 4 * self.text_height + self.getTextLen(self.info["distance"], "B", self.text_height, 0))
        width = max(width, 1.2 * self.text_height + max([0] + [self.getAutoLen(name, self.text_height, "A", 0.1) for name in self.info["No"].split("\\n")]))
        height = 2.8 * self.text_height + sum([0] + [0.2 * self.text_height + Sign.getAutoHeight(line, self.text_height) for line in self.info["No"].split("\\n") if line != ""]) + \
                (max(sum([0] + [0.4 * self.text_height + Sign.getAutoHeight(line, self.text_height, self.english_scale, 0.2) for line in self.info["nameL"].split("\\n") if line != ""]), sum([0] + [0.4 * self.text_height + Sign.getAutoHeight(line, self.text_height, self.english_scale, 0.2) for line in self.info["nameR"].split("\\n") if line != ""])) if self.hasLine 
                    else sum([0] + [0.4 * self.text_height + Sign.getAutoHeight(line, self.text_height, self.english_scale, 0.2) for line in self.info["name"].split("\\n") if line != ""]))
        self.img = Image.new("RGBA", (round(width * self.scale), round(height * self.scale)), (0, 0, 0, 0))
        self.drawTriRoundRect(None, 0.1 * self.text_height, Color.GREEN, (255))
        y = 0.6 * self.text_height
        if self.noNo:
            self.drawhalfRoundRect((0.2 * self.text_height, 0.2 * self.text_height, width - 0.19 * self.text_height, 0.8 * self.text_height + sum([0.2 * self.text_height + Sign.getAutoHeight(line, self.text_height) for line in self.info["No"].split("\\n")])), 0.1 * self.text_height, 3, (255))
        for line in self.info["No"].split("\\n"):
            self.putAutoCentralText(line, (width / 2, y), self.text_height, "A", 0.1, Color.GREEN if self.noNo else (255), outTextColor=(255))
            y += Sign.getAutoHeight(line, self.text_height) + 0.2 * self.text_height
        y += 0.4 * self.text_height
        if self.hasLine:
            len1 = max([0] + [self.getAutoLen(name, self.text_height, "A", 0.1) for name in self.info["nameL"]])
            len2 = max([0] + [self.getAutoLen(name, self.text_height, "A", 0.1) for name in self.info["nameR"]])
            x = (width - len2 - self.text_height) / 2  # middle of len1
            yTop = y
            maxH = max(len(self.info["nameL"]), len(self.info["nameR"]))
            y += (maxH - len(self.info["nameL"])) * 0.7 * self.text_height
            for i, name in enumerate(self.info["nameL"]):
                self.putCentralText(name, (x, y), "A", self.text_height)
                if self.english_scale is None:
                    y += 1.4 * self.text_height
                else:
                    y += 1.2 * self.text_height
                    self.putCentralString(self.info["nameLEn"][i], (x, y), "A", self.english_scale * self.text_height, maxLen=len1)
                    y += self.english_scale * self.text_height + 0.4 * self.text_height
            x += len1 / 2 + 0.4 * self.text_height
            y = yTop + (maxH - len(self.info["nameR"])) * 0.7 * self.text_height
            draw = ImageDraw.Draw(self.img)
            if maxH > 0.4:
                draw.rectangle((round(x) * self.scale, round(yTop) * self.scale, round(x + 0.2 * self.text_height) * self.scale, round(yTop + maxH * (1.4 if self.english_scale is None else 1.6 + self.english_scale) * self.text_height - 0.4 * self.text_height) * self.scale), fill=Color.getRGBAColor(255))
            x += 0.6 * self.text_height + len2 / 2
            for i, name in enumerate(self.info["nameR"]):
                self.putCentralText(name, (x, y), "A", self.text_height)
                if self.english_scale is None:
                    y += 1.4 * self.text_height
                else:
                    y += 1.2 * self.text_height
                    self.putCentralString(self.info["nameREn"][i], (x, y), "A", self.english_scale * self.text_height, maxLen=len2)
                    y += self.english_scale * self.text_height + 0.4 * self.text_height
            y = yTop + maxH * (1.4 if self.english_scale is None else 1.6 + self.english_scale) * self.text_height
        else:
            enList = self.info["nameEn"].split("\\n")
            for i, line in enumerate(self.info["name"].split("//n")):
                if self.english_scale is None or len(enList) <= i:
                    self.putAutoCentralText(line, (width / 2, y), self.text_height, "A")
                else:
                    self.putBiAutoCentralText(line, enList[i], (width / 2, y), self.text_height, "A", self.english_scale, 0.2)
                y += Sign.getAutoHeight(line, self.text_height, self.english_scale, 0.2) + 0.4 * self.text_height
        y += 0.1 * self.text_height
        if self.info["distance"] == "r":
            self.drawRightArrow((0.8 * self.text_height, y, width - 3.1 * self.text_height, y + self.text_height))
            y += 0.1 * self.text_height
            self.putText("入", (width - 2.3 * self.text_height, y), "A", 0.7 * self.text_height)
            self.putText("口", (width - 1.5 * self.text_height, y), "A", 0.7 * self.text_height)
        else:
            self.putText("入", (0.6 * self.text_height, y + 0.2 * self.text_height), "A", 0.7 * self.text_height)
            self.putText("口", (1.4 * self.text_height, y + 0.2 * self.text_height), "A", 0.7 * self.text_height)
            if self.info["distance"] == "l":
                self.drawLeftArrow((3.1 * self.text_height, y, width - 0.8 * self.text_height, y + self.text_height))
            else:
                self.putCentralText(self.info["distance"], (width / 2 + 0.4 * self.text_height, y), "B", self.text_height, 0)
                self.drawUpArrow((width - 1.4 * self.text_height, y - 0.1 * self.text_height, width - 0.4 * self.text_height, y + 1.1 * self.text_height), 1)
    def setNo(self, noList: list[str], refresh = True):
        """ Set the text or number sign of the top based on the context """
        if isinstance(noList, str):
            noList = noList.split("\\n")
        self.noNo = False
        self.info["No"] = []
        for line in noList:
            nameList = []
            for name in line.split(" "):
                if ("#N" in name or len(name) > 0 and (isAlpha(name[0]) or name[0].isdigit()) and (len(name) == 1 or isAlpha(name[1]) or name[-1].isdigit or name[-1] in {"东", "西", "南", "北"}) and (len(name) < 4 or name[2:-1].isdigit())):
                    nameList.append(getAutoSharp(name))
                else:
                    nameList.append(name)
                    self.noNo = True
            if len(nameList) > 0:
                self.info["No"].append(" ".join(nameList))
            else:
                self.info["No"].append("")
        if len(self.info["No"]) > 0:
            self.info["No"] = "\\n".join(self.info["No"])
        else:
            self.info["No"] = ""
        if refresh:
            self.update()
    def setName(self, nameList: str, refresh = True):
        """ Set the places name of the sign """
        self.hasLine = False
        self.info["name"] = nameList
        self.info["nameEn"] = [chToEn(name) for name in nameList.split("\\n")]
        if refresh:
            self.update()
    def setNameEn(self, nameList: str, refresh = True):
        """ Set the english places name of the sign """
        self.info["nameEn"] = nameList
        if refresh:
            self.update()
    def setNameL(self, nameList: list[str], refresh = True):
        """ Set the places name in the left side """
        nameList = [str(name) for name in nameList]
        self.hasLine = True
        self.info["nameL"] = nameList
        self.info["nameLEn"] = [chToEn(name) for name in nameList]
        if refresh:
            self.update()
    def setNameLEn(self, nameList: list[str], refresh = True):
        """ Set the english places name in the left side """
        nameList = [str(name) for name in nameList]
        self.info["nameLEn"] = nameList
        if refresh:
            self.update()
    def setNameR(self, nameList: list[str], refresh = True):
        """ Set the places name in the right side """
        nameList = [str(name) for name in nameList]
        self.hasLine = True
        self.info["nameR"] = nameList
        self.info["nameREn"] = [chToEn(name) for name in nameList]
        if refresh:
            self.update()
    def setNameREn(self, nameList: list[str], refresh = True):
        """ Set the english places name in the right side """
        nameList = [str(name) for name in nameList]
        self.info["nameREn"] = nameList
        if refresh:
            self.update()
    def setDistaceStr(self, text: str, refresh = True):
        """ Set the distance info text of the sign, <code>"l"</code> refers to left arrow, <code>"r"</code> refers to right arrow """
        self.info["distance"] = text
        if refresh:
            self.update()
    def autoSet(self, key: str, value, refresh = True):
        """ Set data based on infomation """
        if key == "english scale":
            self.info["english scale"] = value
            self.english_scale = float(value)
            if self.english_scale == 0:
                self.english_scale = None
            if refresh:
                self.update()
        elif key == "line":
            self.hasLine = bool(value)
            self.info["line"] = self.hasLine
            if refresh:
                self.update()
        elif key == "No":
            self.setNo(value, refresh)
        elif key == "name":
            self.setName(value, refresh)
        elif key == "nameEn":
            self.setNameEn(value, refresh)
        elif key == "nameL":
            self.setNameL(value, refresh)
        elif key == "nameLEN":
            self.setNameLEn(value, refresh)
        elif key == "nameR":
            self.setNameR(value, refresh)
        elif key == "nameREn":
            self.setNameREn(value, refresh)
        elif key == "distance":
            self.setDistaceStr(value, refresh)

class HignwayExitDirection(Sign):
    """ An exit sign to show the direction of the ramp """
    def __init__(self, scale, text_height: int = 60, isLeft: bool = False, hasDirection: bool = False, english_scale: float|None = None, /, info: dict[str,]|None = None):
        super().__init__(scale)
        self.text_height = text_height
        self.english_scale = english_scale
        self.isLeft = isLeft
        self.hasDirection: bool = hasDirection
        self.info = {"english scale": 0.0 if english_scale is None else english_scale, "leftArrow": isLeft, "arrow": "↑", "direction": "", "distance": "", "text": "", "textEn": ""}
        if info:
            self.info.update(info)
        self.arrowComboList = ("←", "↖", "↑", "↗", "→", "↓", "↫", "↶", "↰", "↱")
        self.update()
    def update(self):
        textLen = max([1] + [self.getAutoLen(line, self.text_height) for line in self.info["text"].split("\\n")])
        width = textLen + 2.8 * self.text_height
        height = (4 if self.hasDirection else 2.5) * self.text_height
        if self.info["distance"] != "":
            height += 0.6 * self.text_height
        textHeight = sum([Sign.getAutoHeight(line, self.text_height) for line in self.info["text"].split("\\n")]) + 0.4 * self.text_height * self.info["text"].count("\\n") \
                    + (0 if self.english_scale is None else sum([Sign.getAutoEnHeight(line, self.text_height, self.english_scale) for line in self.info["textEn"].split("\\n")]))
        if textHeight + 1.2 * self.text_height > height:
            height = textHeight + 1.2 * self.text_height
        self.img = Image.new("RGBA", (round(width * self.scale), round(height * self.scale)), (0, 0, 0, 0))
        self.drawTriRoundRect(None, 0.1 * self.text_height, Color.GREEN, (255))
        x = width / 2 + (0.9 if self.isLeft else -0.9) * self.text_height
        y = (height - textHeight) / 2
        textList = self.info["text"].split("\\n")
        enList = self.info["textEn"].split("\\n")
        for i, name in enumerate(textList):
            if "#Tt" in textList[i]:
                self.putCentralString(name, (x, y), "A", self.text_height, maxLen=textLen)
                y += Sign.getAutoHeight(name, self.text_height) + 0.2 * self.text_height
                if self.english_scale is not None and i < len(enList) and enList[i] != "":
                    self.putCentralString(enList[i], (x, y), "A", self.english_scale * self.text_height, maxLen=textLen)
                    y += (self.english_scale + 0.2) * self.text_height
            else:
                self.putAutoCentralText(name, (x, y), self.text_height, "A", 0.2)
                y += Sign.getAutoHeight(name, self.text_height) + 0.2 * self.text_height
                if self.english_scale is not None and i < len(enList) and enList[i] != "":
                    self.putCentralString(enList[i], (x, y), "A", self.english_scale * self.text_height, maxLen=self.getAutoLen(name, self.text_height, "A", 0.2))
                    y += (self.english_scale + 0.2) * self.text_height
        arrowX = 0.6 * self.text_height if self.isLeft else width - 1.8 * self.text_height
        arrowY0 = 2 * self.text_height if self.hasDirection else 0.6 * self.text_height
        arrowY1 = height - (0.6 if self.info["distance"] == "" else 1.2) * self.text_height
        if self.hasDirection:
            self.putDirection(f"#D{self.info["direction"]}", (arrowX + 0.1 * self.text_height, 0.6 * self.text_height), self.text_height, Color.GREEN)
        if self.info["arrow"] in {"↶", "↰", "↑", "↱"}:
            self.drawAutoCurveArrow(self.info["arrow"], (arrowX, arrowY0), 1.2 * self.text_height, arrowY1 - arrowY0)
        elif (midY := (arrowY0 + arrowY1) / 2) > arrowY1 - 0.4 * self.text_height:
            self.drawAutoStraightArrow(self.info["arrow"], (arrowX, arrowY1 - 1.6 * self.text_height), 1.2 * self.text_height)
        else:
            self.drawAutoStraightArrow(self.info["arrow"], (arrowX, midY - 0.6 * self.text_height), 1.2 * self.text_height)
        if self.info["distance"] != "":
            self.putCentralString(self.info["distance"], (arrowX + 0.6 * self.text_height, height - self.text_height), "B", 0.4 * self.text_height, maxLen=1.2 * self.text_height)
    def setArrowType(self, arrow: str, refresh = True):
        """ Set the type of the arrow in <code>"←", "↖", "↑", "↗", "→", "↓"</code> """
        if arrow in {"←", "↖", "↑", "↗", "→", "↓", "↫", "↶", "↰", "↱"}:
            self.info["arrow"] = arrow
        if refresh:
            self.update()
    def setText(self, text: str, refresh = True):
        """ Set the places name of the sign """
        self.info["text"] = text
        self.info["textEn"] = chToEn(text)
        if refresh:
            self.update()
    def autoSet(self, key: str, value, refresh = True):
        """ Set data based on infomation """
        if key == "english scale":
            self.info["english scale"] = value
            self.english_scale = float(value)
            if self.english_scale == 0:
                self.english_scale = None
            if refresh:
                self.update()
        elif key == "leftArrow":
            self.isLeft = bool(value)
            self.info["leftArrow"] = self.isLeft
            if refresh:
                self.update()
        elif key == "direction":
            self.hasDirection = value != ""
            self.info["direction"] = value[0] if self.hasDirection else ""
            if refresh:
                self.update()
        elif key == "arrow":
            self.setArrowType(value, refresh)
        elif key == "text":
            self.setText(value, refresh)
        elif key == "textEn" or key == "distance":
            super().autoSet(key, value, refresh)

class ExitSign(Sign):
    """ An exit sign"""
    def __init__(self, scale: int, isLeft: bool = False, /, info: dict[str,]|None = None):
        super().__init__(scale)
        self.isLeft = isLeft
        self.info: dict[str, str] = {"No": ""}
        if info:
            self.info.update(info)
        self.update()
    def noLen(self):
        """ Get the length of the number string """
        numList = []
        charList = []
        for char in self.info["No"]:
            if char.isdigit():
                numList.append(char)
            else:
                charList.append(char)
        return fontLen(numList, "B", 50, self.scale) + 5 * (len(numList) - 1 if len(numList) > 0 else 0) + fontLen(charList, "B", 100/3, self.scale) + 10/3 * len(charList)
    def putText(self, text: str, pos: tuple[float, float], font_type: str, height: int, color: tuple = (255)):
        """ Put text on sign, font_type should be <code>"A"</code>, <code>"B"</code>, or <code>"C"</code>."""
        x, y = pos
        x *= self.scale
        y *= self.scale
        for char in text:
            if font_type != "B" or char.isdigit():
                placeText(self.img, (round(x), round(y)), char, font_type, height * self.scale, color)
                x += (fontLen(char, "B", 50, self.scale) + height / 10) * self.scale
            else:
                placeText(self.img, (round(x), round(y + height * self.scale / 3)), char, font_type, height * 2/3 * self.scale, color)
                x += (fontLen(char, "B", 100/3, self.scale) + height * 2/3 / 10) * self.scale
    def update(self):
        noLen = self.noLen()
        width = noLen * 1.281  # 8/sqrt(39)
        width = round(105 + width) if width > 130 else 235
        self.img = Image.new('RGBA', (width * self.scale, 100 * self.scale), (255, 255, 255, 0))
        self.drawTriRoundRect((0, 0, width, 100), 3, fill1=Color.GREEN, fill2=(255))
        draw = ImageDraw.Draw(self.img)
        draw.ellipse([93 * self.scale, 10 * self.scale, (width - 12) * self.scale, 90 * self.scale], fill=(255, 255, 255, 255))
        self.putText(self.info["No"], (width / 2 + 40 - noLen / 2, 25), "B", 50, Color.GREEN)
        if self.isLeft:
            self.putText("左", (35, 15), "A", 30)
            self.putText("出", (15, 55), "A", 30)
            self.putText("口", (53, 55), "A", 30)
        else:
            self.putText("出", (15, 35), "A", 30)
            self.putText("口", (53, 35), "A", 30)
    def setNo(self, text: str):
        """ Set the number-text"""
        self.info["No"] = text
        self.update()

class AidSign(Sign):
    """ An aid sign """
    def __init__(self, scale: int, text_height: int = 30, gap: float = 0.1, color1: tuple = (255), color2: tuple = (0), /, info: dict[str,]|None = None):
        """ Color1 is the main color, color2 is the text color. """
        super().__init__(scale)
        self.text_height = text_height
        self.gap = gap
        self.color1 = Color.getRGBAColor(color1)
        self.color2 = Color.getRGBAColor(color2)
        self.info = {"text": ""}
        if info:
            self.info.update(info)
        self.update()
    def update(self):
        width = max([0] + [fontLen([line.split("#", 1)[0]], "A", self.text_height, self.scale) if "#TT" in line 
                           else self.getAutoLen(line.split("#", 1)[0], self.text_height, "A", self.gap) for line in self.info["text"].split("\\n") if "#Tt" not in line]) + 1.2 * self.text_height
        self.img = Image.new("RGBA", (round(width * self.scale), round((self.info["text"].count("\\n") * 1.4 + 2.2) * self.text_height * self.scale)), (255, 255, 255, 0))
        if "#C" in self.info["text"]:
            colorStr = self.info["text"][self.info["text"].find("#C") + 1:].split("#", 1)[0][1:]
            if len(colorStr) >= 2:
                self.color1, self.color2, *_ = [Color.getRGBAColor(color) for color in Color.getDefaultColor(colorStr)]
        self.drawTriRoundRect(None, self.text_height * 0.1, self.color1, self.color2)
        y = 0.6 * self.text_height
        for line in self.info["text"].split("\\n"):
            if "#TT" in line:
                self.putCentralString(line.split("#", 1)[0], (width / 2, y), "A", self.text_height, self.color2)
            elif "#Tt" in line:
                self.putCentralString(line.split("#", 1)[0], (width / 2, y), "A", self.text_height, self.color2, maxLen=width - 1.2 * self.text_height)
            else:
                self.putCentralText(line.split("#", 1)[0], (width / 2, y), "A", self.text_height, self.gap, self.color2)
            y += 1.4 * self.text_height
    def setText(self, text: str):
        """ Set the text of the sign """
        self.info["text"] = text
        self.update()

class RoadNoSign(AidSign):
    """ A sign of road number"""
    def __init__(self, scale: int, text_height: int = 30, /, info: dict[str,]|None = None):
        super().__init__(scale, text_height, 0.1, (255), (0), info=info)
    def update(self):
        if "#C" in self.info["text"]:
            colorStr = self.info["text"][self.info["text"].find("#C") + 1:].split("#", 1)[0][1:]
            if len(colorStr) >= 2:
                self.color1, self.color2, *_ = [Color.getRGBAColor(color) for color in Color.getDefaultColor(colorStr)]
        self.img = Image.new("RGBA", (4 * self.text_height * self.scale, 2 * self.text_height * self.scale), (255, 255, 255, 0))
        self.drawTriRoundRect((0, 0, 4 * self.text_height, 2 * self.text_height), self.text_height * 0.1, self.color1, self.color2)
        if len(self.info["text"]) > 0:
            self.putCentralString(self.info["text"], (2 * self.text_height, round(0.5 * self.text_height)), "B", self.text_height, self.color2)
    def setNo(self, noStr: str, refresh = True):
        """ Set the number of the sign """
        self.info["text"] = noStr
        if len(noStr) > 0:
            if noStr[0] == "G":
                self.color1 = Color.RED
                self.color2 = (255)
            elif noStr[0] == "S":
                self.color1 = Color.YELLOW
                self.color2 = (0)
            else:
                self.color1 = (255)
                self.color2 = (0)
            if refresh:
                self.update()
    def autoSet(self, key: str, value, refresh = True):
        """ Set data based on infomation """
        if key == "text":
            self.setNo(value, refresh)