from textGenerator import placeText, fontLen
from math import sin, cos, tan, asin, atan, pi as PI
from PIL import Image, ImageDraw

def isAlpha(string: str):
    return all(["A"<= char <= "z" and char.isalpha() for char in string])

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

def splitDSharpInfo(string: str) -> tuple[str, str]:
    """ Split 1 <code>#D</code> in string """
    dPos = string.find("#D")
    if dPos == -1:
        return (string, "")
    posText = string[:dPos]
    string = string[dPos + 2:]
    dPos = string.find("#")
    if dPos == -1:
        return (posText, "#D" + string)
    return (posText + string[dPos + 1], "#D" + string[:dPos])

class Color:
    BLUE = (33, 77, 160)
    GREEN = (34, 150, 60)
    RED = (231, 20, 32)
    YELLOW = (244, 236, 25)
    ORANGE = (236, 101, 27)
    BROWN = (163, 104, 38)
    def getDefaultColor(colorStr: str):
        """ Get default color by characters """
        colorList = []
        for char in colorStr:
            if char == "B":
                colorList.append(Color.BLUE)
            elif char == "G":
                colorList.append(Color.GREEN)
            elif char == "R":
                colorList.append(Color.RED)
            elif char == "Y":
                colorList.append(Color.YELLOW)
            elif char == "O":
                colorList.append(Color.ORANGE)
            elif char == "b":
                colorList.append(Color.BROWN)
            elif char == "W":
                colorList.append((255,))
            else:
                colorList.append((0,))
        return colorList
    def getRGBAColor(color: tuple):
        """ Convert color to 3-channel color """
        if isinstance(color, int):
            color = (color, color, color, 255)
        elif len(color) == 1:
            color = (color[0], color[0], color[0], 255)
        elif len(color) == 3:
            color = (*color, 255)
        return color

class Sign:
    """ A sign """
    def __init__(self, scale: int):
        self.scale = scale
        self.img: Image.Image = None
        self.info: dict[str,] = None
    def drawRoundRect(self, xy: tuple[float, float, float, float], rad: float, fill: tuple = None):
        """ Draw rounded rectangle on image """
        x0, y0, x1, y1 = xy
        x0 *= self.scale
        y0 *= self.scale
        x1 *= self.scale
        y1 *= self.scale
        fill = Color.getRGBAColor(fill)
        draw = ImageDraw.Draw(self.img)
        if rad == 0:
            draw.rectangle([x0, y0, x1, y1], fill=fill)
            return
        rad *= self.scale
        draw.ellipse([x0, y0, x0 + 2*rad, y0 + 2*rad], fill=fill)
        draw.ellipse([x1 - 2*rad, y0, x1, y0 + 2*rad], fill=fill)
        draw.ellipse([x0, y1 - 2*rad, x0 + 2*rad, y1], fill=fill)
        draw.ellipse([x1 - 2*rad, y1 - 2*rad, x1, y1], fill=fill)
        draw.rectangle([x0 + rad, y0, x1 - rad, y1], fill=fill)
        draw.rectangle([x0, y0 + rad, x1, y1 - rad], fill=fill)
    def drawBiRoundRect(self, xy: tuple[float, float, float, float], gap: float, fill1: tuple = None, fill2: tuple = None):
        """ Draw double rounded rectangle on image """
        if xy is None:
            xy = (0, 0, self.img.size[0] / self.scale, self.img.size[1] / self.scale)
        x0, y0, x1, y1 = xy
        self.drawRoundRect(xy, gap * 3, fill2)
        self.drawRoundRect((x0 + gap, y0 + gap, x1 - gap, y1 - gap), gap * 2, fill1)
    def drawTriRoundRect(self, xy: tuple[float, float, float, float], gap: float, fill1: tuple = None, fill2: tuple = None):
        """ Draw triple rounded rectangle on image """
        if xy is None:
            xy = (0, 0, self.img.size[0] / self.scale, self.img.size[1] / self.scale)
        x0, y0, x1, y1 = xy
        self.drawRoundRect(xy, gap * 4, fill1)
        self.drawRoundRect((x0 + gap, y0 + gap, x1 - gap, y1 - gap), gap * 3, fill2)
        self.drawRoundRect((x0 + 2*gap, y0 + 2*gap, x1 - 2*gap, y1 - 2*gap), gap * 2, fill1)
    def drawhalfRoundRect(self, xy: tuple[float, float, float, float], rad: float, direction: int, fill: tuple = None):
        """ Draw rounded rectangle on image, rounded direction: <code>0(R)</code>, <code>1(D)</code>, <code>2(L)</code>, <code>3(U)</code> """
        x0, y0, x1, y1 = xy
        x0 *= self.scale
        y0 *= self.scale
        x1 *= self.scale
        y1 *= self.scale
        rad *= self.scale
        fill = Color.getRGBAColor(fill)
        draw = ImageDraw.Draw(self.img)
        draw.ellipse([x0, y0, x0 + 2*rad, y0 + 2*rad], fill=fill)
        draw.ellipse([x1 - 2*rad, y0, x1, y0 + 2*rad], fill=fill)
        draw.ellipse([x0, y1 - 2*rad, x0 + 2*rad, y1], fill=fill)
        draw.ellipse([x1 - 2*rad, y1 - 2*rad, x1, y1], fill=fill)
        draw.rectangle([x0 if direction == 0 else x0 + rad, y0, x1 if direction == 2 else x1 - rad, y1], fill=fill)
        draw.rectangle([x0, y0 if direction == 1 else y0 + rad, x1, y1 if direction == 3 else y1 - rad], fill=fill)
    def drawStraightBar(self, pos: tuple[float, float], angle: float, text_height: int, lineLen: float = 1.5, lineWidth: float = 0.4, color: tuple = (255)):
        """ Draw a straight bar with angle <br> Angle should be in radians """
        x, y = pos
        lineWidth /= 2
        color = Color.getRGBAColor(color)
        draw = ImageDraw.Draw(self.img)
        posList = [-lineWidth * text_height * cos(-angle), lineWidth * text_height * sin(-angle)]
        posList += [lineWidth * text_height * cos(-angle), -lineWidth * text_height * sin(-angle)]
        posList += [posList[2] + (lineLen - lineWidth + 0.1) * text_height * sin(angle), posList[3] - (lineLen - lineWidth + 0.1) * text_height * cos(angle)]
        posList += [(lineLen + 0.1) * text_height * sin(angle), -(lineLen + 0.1) * text_height * cos(angle)]
        posList += [posList[0] + (lineLen - lineWidth + 0.1) * text_height * sin(angle), posList[1] - (lineLen - lineWidth + 0.1) * text_height * cos(angle)]
        draw.polygon([((x if i % 2 == 0 else y) + pos) * self.scale for i, pos in enumerate(posList)], fill=color)
    def drawHArcBar(self, start: tuple[float, float], end: tuple[float, float], text_height: int, lineWidth: float = 0.4, fill: tuple = (255)):
        """ Draw arc with horizontal end """
        x1, y1 = start
        x2, y2 = end
        x1 *= self.scale
        y1 *= self.scale
        x2 *= self.scale
        y2 *= self.scale
        lineWidth *= text_height * self.scale
        fill = Color.getRGBAColor(fill)
        draw = ImageDraw.Draw(self.img)
        x3 = x2 + lineWidth * 1.732 / 2 if x1 < x2 else x2 - lineWidth * 1.732 / 2
        if y1 == y2:
            draw.polygon([round(x2), round(y2 - lineWidth / 2), round(x2), round(y2 + lineWidth / 2), round(x3), round(y2)], fill=fill)
            x1, x2 = min(x1, x2), max(x1, x2)
            draw.rectangle([round(x1), round(y2 - lineWidth / 2), round(x2), round(y2 + lineWidth / 2)], fill=fill)
            return
        r = ((x1 - x2) ** 2 + (y1 - y2) ** 2) / (y1 - y2) / 2
        y0 = y2 + r
        r = abs(r)
        if y1 > y2:
            ang0 = 270 - asin((x2 - x1) / r) / PI * 180
            ang1 = 270
            draw.polygon([round(x2), round(y2), round(x2), round(y2 + lineWidth), round(x3), round(y2 + lineWidth / 2)], fill=fill)
        else:
            ang0 = 90 + asin((x2 - x1) / r) / PI * 180
            ang1 = 90
            draw.polygon([round(x2), round(y2), round(x2), round(y2 - lineWidth), round(x3), round(y2 - lineWidth / 2)], fill=fill)
        draw.arc((round(x2 - r), round(y0 - r), round(x2 + r), round(y0 + r)), min(ang0, ang1), max(ang0, ang1), fill=fill, width=round(lineWidth))
    def drawLeftArrow(self, xy: tuple[float, float, float, float], fill: tuple = (255)):
        """ Draw left arrow on image """
        x0, y0, x1, y1 = xy
        x0 *= self.scale
        y0 *= self.scale
        x1 *= self.scale
        y1 *= self.scale
        fill = Color.getRGBAColor(fill)
        h = (y1 - y0) / 3
        x = min(x1, x0 + 3 * h)
        y = (y0 + y1) / 2
        draw = ImageDraw.Draw(self.img)
        draw.polygon([x, y0, x0 + 3/2 * h, y0, x0, y, x0 + 3/2 * h, y1, x, y1, x - 3/2 * h, y], fill=fill)
        draw.rectangle([x0 + h / 2, y - h / 2, x1, y + h / 2], fill=fill)
    def drawUpLeftArrow(self, pos: tuple[float, float], height, arrowSize: float = 1/4, fill: tuple = (255)):
        """ Draw up-left arrow on image (arrowSize ∈ (0, 0.6)) """
        x, y = pos
        x *= self.scale
        y *= self.scale
        height *= self.scale
        fill = Color.getRGBAColor(fill)
        w0 = 2/3 * arrowSize
        draw = ImageDraw.Draw(self.img)
        draw.polygon([x, y, x + height / 2, y, x + (1/2 + arrowSize) * height, y + arrowSize * height, x + (arrowSize + w0) * height, y + arrowSize * height, x + height, y + (1 - w0) * height, 
                      x + (1 - w0) * height, y + height, x + arrowSize * height, y + (arrowSize + w0) * height, x + arrowSize * height, y + (1/2 + arrowSize) * height, x, y + height / 2], fill=fill)
    def drawUpArrow(self, xy: tuple[float, float, float, float], arrowSize: float = 1.0, fill: tuple = (255)):
        """ Draw up arrow on image """
        x0, y0, x1, y1 = xy
        x0 *= self.scale
        y0 *= self.scale
        x1 *= self.scale
        y1 *= self.scale
        fill = Color.getRGBAColor(fill)
        w = (x1 - x0) / 3
        y = min(y1, y0 + (arrowSize + 3/2) * w * 1.2)
        x = (x0 + x1) / 2
        draw = ImageDraw.Draw(self.img)
        draw.polygon([x0, y, x0, y0 + 3/2 * w, x, y0, x1, y0 + 3/2 * w, x1, y, x, y - 3/2 * w], fill=fill)
        w *= arrowSize
        draw.rectangle([x - w / 2, y0 + w, x + w / 2, y1], fill=fill)
    def drawUpRightArrow(self, pos: tuple[float, float], height, arrowSize: float = 1/4, fill: tuple = (255)):
        """ Draw up-right arrow on image (arrowSize ∈ (0, 0.6)) """
        x, y = pos
        x *= self.scale
        y *= self.scale
        height *= self.scale
        fill = Color.getRGBAColor(fill)
        w0 = 2/3 * arrowSize
        draw = ImageDraw.Draw(self.img)
        draw.polygon([x + height, y, x + height / 2, y, x + (1/2 - arrowSize) * height, y + arrowSize * height, x + (1 - arrowSize - w0) * height, y + arrowSize * height, x, y + (1 - w0) * height, 
                      x + w0 * height, y + height, x + (1 - arrowSize) * height, y + (arrowSize + w0) * height, x + (1 - arrowSize) * height, y + (1/2 + arrowSize) * height, x + height, y + height / 2], fill=fill)
    def drawRightArrow(self, xy: tuple[float, float, float, float], fill: tuple = (255)):
        """ Draw right arrow on image """
        x0, y0, x1, y1 = xy
        x0 *= self.scale
        y0 *= self.scale
        x1 *= self.scale
        y1 *= self.scale
        fill = Color.getRGBAColor(fill)
        h = (y1 - y0) / 3
        x = max(x0, x1 - 3 * h)
        y = (y0 + y1) / 2
        draw = ImageDraw.Draw(self.img)
        draw.polygon([x, y0, x1 - 3/2 * h, y0, x1, y, x1 - 3/2 * h, y1, x, y1, x + 3/2 * h, y], fill=fill)
        draw.rectangle([x0, y - h / 2, x1 - h / 2, y + h / 2], fill=fill)
    def drawDownRightArrow(self, pos: tuple[float, float], height, arrowSize: float = 1/4, fill: tuple = (255)):
        """ Draw down-right arrow on image (arrowSize ∈ (0, 0.6)) """
        x, y = pos
        x *= self.scale
        y *= self.scale
        height *= self.scale
        fill = Color.getRGBAColor(fill)
        w0 = 2/3 * arrowSize
        draw = ImageDraw.Draw(self.img)
        draw.polygon([x + height, y + height, x + height / 2, y + height, x + (1/2 - arrowSize) * height, y + (1 - arrowSize) * height, x + (1 - arrowSize - w0) * height, y + (1 - arrowSize) * height, x, y + w0 * height, 
                      x + w0 * height, y, x + (1 - arrowSize) * height, y + (1 - arrowSize - w0) * height, x + (1 - arrowSize) * height, y + (1/2 - arrowSize) * height, x + height, y + height / 2], fill=fill)
    def drawDownArrow(self, xy: tuple[float, float, float, float], arrowSize: float = 1.0, fill: tuple = (255)):
        """ Draw large down arrow on image """
        x0, y0, x1, y1 = xy
        x0 *= self.scale
        y0 *= self.scale
        x1 *= self.scale
        y1 *= self.scale
        arrowSize *= 3/5
        fill = Color.getRGBAColor(fill)
        w = (x1 - x0) / 3
        y = max(y0, y1 - (arrowSize + 3/2) * w * 1.2)
        x = (x0 + x1) / 2
        draw = ImageDraw.Draw(self.img)
        draw.polygon([x0, y, x0, y1 - 3/2 * w, x, y1, x1, y1 - 3/2 * w, x1, y, x, y + 3/2 * w], fill=fill)
        w *= arrowSize
        draw.rectangle([x - w / 2, y0, x + w / 2, y1 - w], fill=fill)
    def drawDownLeftArrow(self, pos: tuple[float, float], height, arrowSize: float = 1/4, fill: tuple = (255)):
        """ Draw down-left arrow on image (arrowSize ∈ (0, 0.6)) """
        x, y = pos
        x *= self.scale
        y *= self.scale
        height *= self.scale
        fill = Color.getRGBAColor(fill)
        w0 = 2/3 * arrowSize
        draw = ImageDraw.Draw(self.img)
        draw.polygon([x, y + height, x + height / 2, y + height, x + (1/2 + arrowSize) * height, y + (1 - arrowSize) * height, x + (arrowSize + w0) * height, y + (1 - arrowSize) * height, x + height, y + w0 * height, 
                      x + (1 - w0) * height, y, x + arrowSize * height, y + (1 - arrowSize - w0) * height, x + arrowSize * height, y + (1/2 - arrowSize) * height, x, y + height / 2], fill=fill)
    def drawUTurnArrow(self, xy: tuple[float, float, float, float], fill: tuple = (255)):
        """ Draw an U-turn arrow on image """
        x0, y0, x1, y1 = xy
        if y1 - y0 >= x1 - x0:
            lineWidth = (x1 - x0) / 5
            self.drawDownArrow([x0, y0 + 2 * lineWidth, x1 - 2 * lineWidth, y1], 5/3, fill)
            x0 *= self.scale
            y0 *= self.scale
            x1 *= self.scale
            y1 *= self.scale
            lineWidth *= self.scale
            draw = ImageDraw.Draw(self.img)
            draw.arc([x0 + lineWidth, y0, x1, y0 + 4 * lineWidth], 180, 0, Color.getRGBAColor(fill), round(lineWidth))
            draw.rectangle([x1 - lineWidth, y0 + 2 * lineWidth, x1, y1], Color.getRGBAColor(fill))
    def drawLeftTurnArrow(self, xy: tuple[float, float, float, float], fill: tuple = (255)):
        """ Draw an left turn arrow on image """
        x0, y0, x1, y1 = xy
        if (y1 - y0) > 3/5 * (x1 - x0):
            lineWidth = (x1 - x0) / 5
            self.drawLeftArrow([x0, y0, x1 - 2 * lineWidth, y0 + 3 * lineWidth], fill)
            x0 *= self.scale
            y0 *= self.scale
            x1 *= self.scale
            y1 *= self.scale
            lineWidth *= self.scale
            draw = ImageDraw.Draw(self.img)
            draw.arc([x0 + lineWidth, y0 + lineWidth, x1, y0 + 5 * lineWidth], 270, 0, Color.getRGBAColor(fill), round(lineWidth))
            draw.rectangle([x1 - lineWidth, y0 + 3 * lineWidth, x1, y1], Color.getRGBAColor(fill))
    def drawRightTurnArrow(self, xy: tuple[float, float, float, float], fill: tuple = (255)):
        """ Draw an right turn arrow on image """
        x0, y0, x1, y1 = xy
        if (y1 - y0) > 3/5 * (x1 - x0):
            lineWidth = (x1 - x0) / 5
            self.drawRightArrow([x0 + 2 * lineWidth, y0, x1, y0 + 3 * lineWidth], fill)
            x0 *= self.scale
            y0 *= self.scale
            x1 *= self.scale
            y1 *= self.scale
            lineWidth *= self.scale
            draw = ImageDraw.Draw(self.img)
            draw.arc([x0, y0 + lineWidth, x1 - lineWidth, y0 + 5 * lineWidth], 180, 270, Color.getRGBAColor(fill), round(lineWidth))
            draw.rectangle([x0, y0 + 3 * lineWidth, x0 + lineWidth, y1], Color.getRGBAColor(fill))
    def drawAutoStraightArrow(self, arrowType: str, pos: tuple[float, float], width: float, height: float = None, arrowSize: float|None = None, fill: tuple = (255)):
        """ Put straight arrow on image <br>straight arrow: (<code>"←", "↖", "↑", "↗", "→", "↘", "↓", "↙", "↶", "↰", "↱"</code>) """
        x, y = pos
        if height is None:
            height = width
        if arrowType == "←":
            self.drawLeftArrow((x, y, x + width, y + height), fill)
        elif arrowType == "↖":
            self.drawUpLeftArrow(pos, width, 1/4 if arrowSize is None else arrowSize, fill)
        elif arrowType == "↑":
            self.drawUpArrow((x, y, x + width, y + height), 1 if arrowSize is None else arrowSize, fill)
        elif arrowType == "↗":
            self.drawUpRightArrow(pos, width, 1/4 if arrowSize is None else arrowSize, fill)
        elif arrowType == "→":
            self.drawRightArrow((x, y, x + width, y + height), fill)
        elif arrowType == "↘":
            self.drawDownRightArrow(pos, width, 1/4 if arrowSize is None else arrowSize, fill)
        elif arrowType == "↓":
            self.drawDownArrow((x, y, x + width, y + height), 1 if arrowSize is None else arrowSize, fill)
        elif arrowType == "↙":
            self.drawDownLeftArrow(pos, width, 1/4 if arrowSize is None else arrowSize, fill)
        elif arrowType == "↶":
            self.drawUTurnArrow((x, y, x + width, y + height), fill)
        elif arrowType == "↰":
            self.drawLeftTurnArrow((x, y, x + width, y + height), fill)
        elif arrowType == "↱":
            self.drawRightTurnArrow((x, y, x + width, y + height), fill)
    def drawLeftCurveArrow(self, xy: tuple[float, float, float, float], lineWidth: int|None = None, fill: tuple = (255)):
        """ Draw rounded left arrow """
        x1, y1, x2, y2 = xy
        x1 *= self.scale
        y1 *= self.scale
        x2 *= self.scale
        y2 *= self.scale
        if not lineWidth:
            lineWidth = min(x2 - x1, y2 - y1) / 50
        lineWidth *= self.scale
        fill = Color.getRGBAColor(fill)
        draw = ImageDraw.Draw(self.img)
        if x2 - x1 < y2 - y1:
            r = abs(((x1 - x2) ** 2 + (y1 - y2) ** 2) / (x1 - x2) / 2)
            x0, y0 = x2 - r, y2
            ang0 = -asin((y2 - y1) / r)
            ang1 = 0
        else:
            r = abs(((x1 - x2) ** 2 + (y1 - y2) ** 2) / (y1 - y2) / 2)
            x0, y0 = x1, y1 + r
            ang0 = -PI / 2
            ang1 = asin((x2 - x1) / r) - PI / 2
        ang0 += lineWidth / r
        vecX = (cos(ang0), sin(ang0))
        vecY = (-sin(ang0), cos(ang0))
        def transPos(base: tuple[float, float], x: float = 0, y: float = 0):
            if not base:
                base = (0, 0)
            return (base[0] + x * vecX[0] + y * vecY[0], base[1] + x * vecX[1] + y * vecY[1])
        p1 = transPos((x1, y1), -0.52 * lineWidth)
        p2 = transPos(p1, 1.5 * lineWidth, 1.5 * lineWidth)
        p6 = transPos(p1, -1.5 * lineWidth, 1.5 * lineWidth)
        p4 = transPos(p1, 0, 1.5 * lineWidth)
        p3 = transPos(p2, 0, 1.5 * lineWidth)
        p5 = transPos(p6, 0, 1.5 * lineWidth)
        draw.polygon([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1], p5[0], p5[1], p6[0], p6[1]], fill=fill)
        ang0 *= 180 / PI
        ang1 *= 180 / PI
        draw.arc((round(x0 - r), round(y0 - r), round(x0 + r), round(y0 + r)), min(ang0, ang1), max(ang0, ang1), fill=fill, width=round(lineWidth))
    def drawRightCurveArrow(self, xy: tuple[float, float, float, float], lineWidth: int|None = None, fill: tuple = (255)):
        """ Draw rounded right arrow """
        x1, y1, x2, y2 = xy
        x1 *= self.scale
        y1 *= self.scale
        x2 *= self.scale
        y2 *= self.scale
        if not lineWidth:
            lineWidth = min(x2 - x1, y2 - y1) / 50
        lineWidth *= self.scale
        fill = Color.getRGBAColor(fill)
        draw = ImageDraw.Draw(self.img)
        if x2 - x1 < y2 - y1:
            r = abs(((x1 - x2) ** 2 + (y1 - y2) ** 2) / (x2 - x1) / 2)
            x0, y0 = x1 + r, y2
            ang0 = PI
            ang1 = PI + asin((y2 - y1) / r)
        else:
            r = abs(((x1 - x2) ** 2 + (y1 - y2) ** 2) / (y2 - y1) / 2)
            x0, y0 = x2, y1 + r
            ang0 = -PI / 2 - asin((x2 - x1) / r)
            ang1 = -PI / 2
        ang1 -= lineWidth / r
        vecX = (-cos(ang1), -sin(ang1))
        vecY = (sin(ang1), -cos(ang1))
        def transPos(base: tuple[float, float], x: float = 0, y: float = 0):
            if not base:
                base = (0, 0)
            return (base[0] + x * vecX[0] + y * vecY[0], base[1] + x * vecX[1] + y * vecY[1])
        p1 = transPos((x2, y1), 0.52 * lineWidth)
        p2 = transPos(p1, 1.5 * lineWidth, 1.5 * lineWidth)
        p6 = transPos(p1, -1.5 * lineWidth, 1.5 * lineWidth)
        p4 = transPos(p1, 0, 1.5 * lineWidth)
        p3 = transPos(p2, 0, 1.5 * lineWidth)
        p5 = transPos(p6, 0, 1.5 * lineWidth)
        draw.polygon([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1], p5[0], p5[1], p6[0], p6[1]], fill=fill)
        ang0 *= 180 / PI
        ang1 *= 180 / PI
        draw.arc((round(x0 - r), round(y0 - r), round(x0 + r), round(y0 + r)), min(ang0, ang1), max(ang0, ang1), fill=fill, width=round(lineWidth))
    def drawLeftRingArrow(self, xy: tuple[float, float, float, float], fill: tuple = (255)):
        """ Draw an overring left arrow on image """
        x0, y0, x1, y1 = xy
        w = (x1 - x0) / 8
        self.drawLeftArrow((x0, y0 + 2 * w, x1 - 2 * w, y0 + 5 * w), fill=fill)
        x0 *= self.scale
        y0 *= self.scale
        x1 *= self.scale
        y1 *= self.scale
        w *= self.scale
        fill = Color.getRGBAColor(fill)
        draw = ImageDraw.Draw(self.img)
        draw.arc([round(x0 + 4 * w), round(y0), round(x1), round(y0 + 4 * w)], -180, 90, fill, round(w))
        draw.rectangle([round(x0 + 4 * w), round(y0 + 2 * w), round(x0 + 5 * w), round(y0 + 2.5 * w)], fill=fill)
        draw.rectangle([round(x0 + 4 * w), round(y0 + 4.5 * w), round(x0 + 5 * w), round(y1)], fill=fill)
    def drawAutoCurveArrow(self, arrowType: str, pos: tuple[float, float], width: float, height: float = None, arrowSize: float|None = None, fill: tuple = (255)):
        """ Put curve arrow on image <br>curve arrow: (<code>"↫", "↰", "↱"</code>) """
        x, y = pos
        if height is None:
            height = width
        if arrowType == "←":
            self.drawLeftArrow((x, y, x + width, y + height), fill)
        elif arrowType == "↖":
            self.drawUpLeftArrow(pos, width, 1/4 if arrowSize is None else arrowSize, fill)
        elif arrowType == "↑":
            self.drawUpArrow((x, y, x + width, y + height), 1 if arrowSize is None else arrowSize, fill)
        elif arrowType == "↗":
            self.drawUpRightArrow(pos, width, 1/4 if arrowSize is None else arrowSize, fill)
        elif arrowType == "→":
            self.drawRightArrow((x, y, x + width, y + height), fill)
        elif arrowType == "↓":
            self.drawDownArrow((x, y, x + width, y + height), 5/3 if arrowSize is None else arrowSize, fill)
        elif arrowType == "↶":
            self.drawUTurnArrow((x, y, x + width, y + height), fill)
        elif arrowType == "↰":
            self.drawLeftCurveArrow((x, y, x + width, y + height), arrowSize, fill)
        elif arrowType == "↱":
            self.drawRightCurveArrow((x, y, x + width, y + height), arrowSize, fill)
        elif arrowType == "↫":
            self.drawLeftRingArrow((x, y, x + width, y + height), fill)
    def getTextLen(self, text: str, font_type: str, font_height: float, gap: float = 0.1):
        """ The total length of each echaracter, font_type should be <code>"A"</code>, <code>"B"</code>, or <code>"C"</code>. """
        if "#Tt" in text:
            return 0
        if "#TT" in text:
            return fontLen([text], font_type, font_height, self.scale)
        return fontLen([char for char in text if not isAlpha(char)], font_type, font_height, self.scale) + fontLen([char for char in text if isAlpha(char)], font_type, font_height * 2/3, self.scale) + (len(text) - 1) * font_height * gap
    def putText(self, text: str, pos: tuple[float, float], font_type: str, height: int, gap: float = 0.1, color: tuple = (255)):
        """ Put text on sign, font_type should be <code>"A"</code>, <code>"B"</code>, or <code>"C"</code>. """
        x, y = pos
        x *= self.scale
        y *= self.scale
        if color is None:
            color = (255)
        if "#" in text:
            text = text.split("#", 1)[0]
        desmo = False
        for char in text:
            if desmo:
                desmo = char.isdigit()
                if desmo or isAlpha(char):
                    placeText(self.img, (round(x), round(y + height * self.scale / 3)), char, font_type, height * 2/3 * self.scale, color)
                    x += (fontLen(char, font_type, height * 2/3, self.scale) + height * gap) * self.scale
                else:
                    placeText(self.img, (round(x), round(y)), char, font_type, height * self.scale, color)
                    x += (fontLen(char, font_type, height, self.scale) + height * gap) * self.scale
            elif isAlpha(char):
                desmo = False
                placeText(self.img, (round(x), round(y + height * self.scale / 3)), char, font_type, height * 2/3 * self.scale, color)
                x += (fontLen(char, font_type, height * 2/3, self.scale) + height * gap) * self.scale
            else:
                if char == ".":
                    desmo = True
                placeText(self.img, (round(x), round(y)), char, font_type, height * self.scale, color)
                x += (fontLen(char, font_type, height, self.scale) + height * gap) * self.scale
    def putCentralText(self, text: str, centralPos: tuple[float, float], font_type: str, height: int, gap: float = 0.1, color: tuple = (255)):
        """ Put text on sign with central pos (North side), font_type should be <code>"A"</code>, <code>"B"</code>, or <code>"C"</code>. """
        x, y = centralPos
        if "#" in text:
            text = text.split("#", 1)[0]
        self.putText(text, (x - self.getTextLen(text, font_type, height, gap) / 2, y), font_type, height, gap, color)
    def putCentralString(self, string: str, centralPos: tuple[float, float], font_type: str, height: int, color: tuple|None = None, maxLen: float|None = None):
        """ Put a string on sign with central pos (North side), font_type should be <code>"A"</code>, <code>"B"</code>, or <code>"C"</code>. """
        text, _ = splitSharp(string)
        x, y = centralPos
        if isAlpha(text) and any([char in "gjpqy" for char in text]):
            if all([char in "acemnorsuvwxz -" for char in text]):
                y += height / 2
                height *= 2
            else:
                height *= 4/3
        halfTextLen = fontLen([text], font_type, height, self.scale) / 2
        if maxLen is not None and maxLen < halfTextLen * 2:
            halfTextLen = maxLen / 2
        placeText(self.img, (round((x - halfTextLen) * self.scale), round(y * self.scale)), text, font_type, height * self.scale, (255) if color is None else color, None if maxLen is None else round(maxLen * self.scale))
    def putAutoCentralString(self, string: str, centralPos: tuple[float, float], font_type: str, height: int, color1: tuple|None = None, color2: tuple|None = None, maxLen: float|None = None):
        """ Put a string on sign with central pos (North side) based on the sharp (#) infomation, <br>font_type should be <code>"A"</code>, <code>"B"</code>, or <code>"C"</code>.</br> """
        x, y = centralPos
        halfTextLen = self.getAutoLen(string, height, font_type, 0) / 2
        if maxLen is not None and maxLen < halfTextLen * 2:
            halfTextLen = maxLen / 2
        x -= halfTextLen
        text, sharp = splitSharp(string)
        if isAlpha(text) and any([char in "gjpqy" for char in text]):
            if all([char in "acemnorsuvwxz -" for char in text]):
                y += height / 2
                height *= 2
            else:
                height *= 4/3
        if "#D" in sharp:
            string, dStr = splitDSharpInfo(string)
            maxLen -= 1.1 * height
            self.putDirection(dStr, (x + min(self.getAutoLen(string, height, "A", 0), maxLen) + 0.1 * height, y), height, Color.BLUE if color2 is None else color2, (255) if color1 is None else color1)
        if "#NW" in sharp:
            return self.putWayNo(string, (x, y - height / 6), 4/3 * height)
        if "#NH" in sharp:
            return self.putHighwayNo(string, (x, y - height / 3), 5/3 * height)
        if "#B" in sharp:
            return self.putBoxedText(string, (x, y), height, font_type, maxLen= None if maxLen is None else maxLen)
        placeText(self.img, (round(x * self.scale), round(y * self.scale)), text, font_type, height * self.scale, (255) if color1 is None else color1, None if maxLen is None else round(maxLen * self.scale))
    def putDirection(self, text: str, pos: tuple[float, float], height: int, text_color: tuple, block_color = (255)):
        """ Put the direction block """
        if "#D" in text:
            char = getSharpText(text, "D")
        else:
            char = text[0] if len(text) > 1 else text
        if char != "":
            x, y = pos
            draw = ImageDraw.Draw(self.img)
            draw.rectangle((round(x) * self.scale, round(y) * self.scale, round(x + height) * self.scale, round(y + height) * self.scale), fill=Color.getRGBAColor(block_color))
            self.putCentralString(char[0], (x + 0.5 * height, y + 0.1 * height), "A", 0.8 * height, Color.getRGBAColor(text_color))
    def putBoxedText(self, text: str, pos: tuple[float, float], height: float, font_type: str, color1 : tuple|None = None, color2 : tuple|None = None, maxLen: float|None = None):
        """ Put boxed text on image """
        if font_type not in {"A", "B", "C"}:
            font_type = "A"
        x, y = pos
        textStr, sharpStr = splitSharp(text)
        if "#BC" in sharpStr:
            colorList = getSharpText(sharpStr, "BC")
            if len(colorList) > 1:
                color2 = colorList[1]
            if len(colorList) > 0:
                color1 = colorList[0]
        if color1 is None:
            color1 = Color.BLUE
        if color2 is None:
            color2 = (255)
        color1 = Color.getRGBAColor(color1)
        color2 = Color.getRGBAColor(color2)
        if maxLen is None:
            width = self.getTextLen(textStr, font_type, height * 0.75, 0) + 0.25 * height
        else:
            width = maxLen
        self.drawBiRoundRect((x, y, x + width, y + height), 0.06 * height, color1, color2)
        self.putCentralString(textStr, (x + width / 2, y + 0.125 * height), font_type, height * 0.75, color2, None if maxLen is None else maxLen - 0.25 * height)
    def getWayNoLen(self, numStr: str, height: float):
        """ Get the length of a road-number-sign """
        height /= 2
        numStr, aidStr = splitSharp(numStr)
        return max(height * 4, fontLen([numStr], "B", height, self.scale) + height) + (1.8 * height if "#D" in aidStr else 0)
    def putWayNo(self, numStr: str, pos: tuple[float, float], height: float, color1: tuple|None = None, color2: tuple|None = None, aidFirst: bool = False, outTextColor = Color.GREEN):
        """ Put a road-number-sign on the sign"""
        numStr, aidStr = splitSharp(numStr)
        width = self.getWayNoLen(numStr, height)
        height = height / 2
        x, y = pos
        if "#C" in aidStr:
            colorStr = aidStr[aidStr.find("#C") + 1:].split("#", 1)[0][1:]
            if len(colorStr) >= 2:
                color1, color2, *_ = [Color.getRGBAColor(color) for color in Color.getDefaultColor(colorStr)]
        if color1 == None:
            if len(numStr) > 0:
                if numStr[0] == "G":
                    color1 = Color.RED
                elif numStr[0] == "S":
                    color1 = Color.YELLOW
                else:
                    color1 = (255)
            else:
                color1 = (255)
        color1 = Color.getRGBAColor(color1)
        if color2 == None:
            if len(numStr) > 0:
                if numStr[0] == "G":
                    color2 = (255)
                elif numStr[0] == "S":
                    color2 = (0)
                else:
                    color2 = (0)
            else:
                color2 = (0)
        color2 = Color.getRGBAColor(color2)
        self.drawBiRoundRect((x, y, x + width, y + 2 * height), 0.1 * height, color1, color2)
        self.putCentralString(numStr, (x + width / 2, y + 0.5 * height), "B", height, color2)
    def putCentralWayNo(self, numStr: str, centralPos: tuple[float, float], height: float, color1: tuple|None = None, color2: tuple|None = None):
        """ Put a road-number-sign on the sign with pos (North pos)"""
        self.putWayNo(numStr, (centralPos[0] - self.getWayNoLen(numStr, height) / 2 , centralPos[1]), height, color1, color2)
    def getHighwayNoLen(numStr: str, height: float):
        """ Get the length of the highway sign """
        numStr, aidStr = splitSharp(numStr)
        sumLen = 0
        if "#NHH" in aidStr:
            return sumLen + max(0.5 + len(numStr) * 0.25, 0.375 * len(numStr)) * height
        return sumLen + (0.5 + len(numStr) * 0.25 if len(numStr) < 5 else 0.575 + 0.225 * len(numStr)) * height
    def putHighwayNo(self, numStr: str, pos: tuple[float, float], height: float, typeStr: str|None = None, color: tuple|None = None):
        """ Put a highway-sign on the sign """
        width = Sign.getHighwayNoLen(numStr, height)
        numStr, aidStr = splitSharp(numStr)
        if (sharp := getSharpText(aidStr, "H")) != "":
            typeStr = sharp
        x, y = pos
        if typeStr is None:
            typeStr = "国家高速" if len(numStr) > 0 and numStr[0] == "G" else "高速"
        textColor = (255) if typeStr == "国家高速" else (0)
        if len(colorList := getSharpText(aidStr, "C")) > 0:
            color = colorList[0]
            if len(colorList) > 1:
                textColor = colorList[1]
        if color is None:
            if len(numStr) > 0 and numStr[0] == "G":
                color = Color.RED
            else:
                color = Color.YELLOW
        color = Color.getRGBAColor(color)
        textColor = Color.getRGBAColor(textColor)
        self.drawTriRoundRect((x - 0.03 * height, y - 0.03 * height, x + width + 0.03 * height, y + 1.03 * height), 0.03 * height, Color.GREEN, (255))
        self.drawhalfRoundRect((x + 0.03 * height, y + 0.03 * height, x + width - 0.03 * height, y + 0.23 * height), 0.06 * height, 0.03 * height, color)
        self.putCentralText(typeStr, (x + width / 2, y + 0.08 * height), "A", 0.1 * height, 10 / self.scale, textColor)
        text_height = 0.45 * height
        if "#NHH" in aidStr:
            self.putCentralString(numStr, (x + width / 2, y + 0.37 * height), "B", text_height)
        else:
            bigStr = numStr[:3]
            smallStr = numStr[3:]
            bigStrLen = fontLen([bigStr], "B", text_height, self.scale)
            smallStrLen = fontLen([smallStr], "B", text_height * 2/3, self.scale)
            startPos = x + width / 2 - (bigStrLen + smallStrLen) / 2
            placeText(self.img, (round(startPos * self.scale), round((y + 0.37 * height) * self.scale)), bigStr, "B", text_height * self.scale, Color.getRGBAColor((255)))
            placeText(self.img, (round(startPos + bigStrLen) * self.scale, round(y + 0.37 * height + text_height / 3) * self.scale), smallStr, "B", text_height * 2/3 * self.scale, Color.getRGBAColor((255)))
    def putCentralHighwayNo(self, numStr: str, pos: tuple[float, float], height: float, typeStr: str|None = None, color: tuple|None = None):
        """ Put a highway-sign on the sign with pos (North pos) """
        self.putHighwayNo(numStr, (pos[0] - Sign.getHighwayNoLen(numStr, height) / 2, pos[1]), height, typeStr, color)
    def getAutoLen(self, text: str, height: float, font_type: str = "A", gap: float = 0.1) -> float:
        """ Get the length of the string based on the sharp (#) infomation """
        if " " in text:
            textList = [textStr for textStr in text.split(" ") if textStr != ""]
            return sum([self.getAutoLen(textStr, height, font_type, gap) for textStr in textList]) + (len(textList) - 1) * height * gap
        if "#" not in text:
            return self.getTextLen(text, font_type, height, gap)
        textStr, aidStr = splitSharp(text)
        if "#Tt" in aidStr:
            return 0
        aidLen = 0
        if "#TT" in aidStr:
            gap = 0
        if "#D" in aidStr:
            aidLen += (1 + max(0.1, gap)) * height
        if "#N" in aidStr:
            if "#NW" in aidStr:
                return self.getWayNoLen(text, 4/3 * height) + aidLen
            elif "#NH" in aidStr:
                return Sign.getHighwayNoLen(text, 5/3 * height) + aidLen
        if "#B" in aidStr:
            return self.getTextLen(textStr, font_type, 0.75 * height, 0) + 0.25 * height + aidLen * 4/3
        return self.getTextLen(textStr, font_type, height, gap) + aidLen
    def putAutoText(self, text: str, pos: tuple[float, float], height: int, typeStr: str|None = None, gap: float = 0.1, color1: tuple|None = None, color2: tuple|None = None, aidFirst: bool = False, outTextColor = Color.GREEN):
        """ Put text on the image based on the sharp (#) infomation """
        if " " in text:
            textList = [textStr for textStr in text.split(" ") if textStr != ""] 
            yList = [Sign.getAutoHeight(textStr, height, enGap=gap) for textStr in textList]
            if hasattr(self, "english_scale") and self.english_scale is not None:
                yMax = max([Sign.getAutoEnHeight(textStr, height, self.english_scale, gap) for textStr in textList])
            else:
                yMax = max([0] + yList)
            x, y = pos
            for i, textStr in enumerate(textList):
                self.putAutoText(textStr, (x, y + (yMax - yList[i]) / 2), height, typeStr, gap, color1, color2, aidFirst, outTextColor)
                x += self.getAutoLen(textStr, height, typeStr, gap) + height * gap
        else:
            if "#" not in text:
                return self.putText(text, pos, typeStr, height, gap, (255) if color1 is None else color1)
            textStr, aidStr = splitSharp(text)
            if "#D" in aidStr:
                if aidFirst:
                    self.putDirection(text, pos, height, outTextColor, block_color=color1)
                    pos = (pos[0] + (1 + gap) * height, pos[1])
                else:
                    self.putDirection(text, (pos[0] + self.getAutoLen(text[:text.find("#D")], height, "A", gap) + gap * height, pos[1]), height, outTextColor, block_color=color1)
            if "#NW" in aidStr:
                return self.putWayNo(text, pos, 4/3 * height)
            if "#NH" in aidStr:
                return self.putHighwayNo(text, pos, 5/3 * height)
            if "#B" in aidStr:
                return self.putBoxedText(text, pos, 4/3 * height, typeStr)
            self.putText(textStr, pos, typeStr, height, gap, color1)
    def putAutoCentralText(self, text: str, pos: tuple[float, float], height: int, typeStr: str|None = None, gap: float = 0.1, color1: tuple|None = None, color2: tuple|None = None, aidFirst: bool = False, outTextColor = Color.GREEN, maxLen: float | None = None):
        """ Put text on the image based on the sharp (#) infomation with pos (North pos) """
        if " " in text:
            return self.putAutoText(text, (pos[0] - self.getAutoLen(text, height, gap=gap) / 2, pos[1]), height, typeStr, gap, color1, color2, aidFirst, outTextColor)
        if "#" not in text:
            return self.putCentralText(text, pos, typeStr, height, gap, (255) if color1 is None else color1)
        if "#NW" in text:
            return self.putCentralWayNo(text, pos, 4/3 * height)
        if "#NH" in text:
            return self.putCentralHighwayNo(text, pos, 5/3 * height)
        if "#T" in text:
            if "#B" in text:
                return self.putBoxedText(text, (pos[0] - self.getAutoLen(text, height, typeStr, 0) / 2), 4/3 * height, "A")
            return self.putCentralString(text, pos, typeStr, height, (255) if color1 is None else color1, Color.BLUE if color2 is None else color2, maxLen if "#Tt" in text else None)
        if "#B" in text:
            return self.putBoxedText(text, (pos[0] - self.getAutoLen(text, height, typeStr, 0) / 2, pos[1]), 4/3 * height, "A")
        self.putAutoText(text, (pos[0] - self.getAutoLen(text, height, gap=gap) / 2, pos[1]), height, typeStr, gap, color1, color2, aidFirst, outTextColor)
    def putBiAutoText(self, text: str, enText: str, pos: tuple[float, float], text_height: int, english_scale: float|None, typeStr: str|None = None, gap: float = 0.1, color1: tuple|None = None, color2: tuple|None = None, minHeight: float = 0, aidFirst: bool = False, outTextColor = Color.GREEN):
        """ Put ch & en text on the image based on the sharp (#) infomation """
        x, y = pos
        yMax = Sign.getAutoHeight(text, text_height, english_scale, gap)
        yH = max(yMax, minHeight)
        if english_scale is None or enText == "":
            return self.putText(text, (x, y + (yH - yMax) / 2), typeStr, text_height, gap, (255) if color1 is None else color1)
        if " " in text:
            textList = [textStr for textStr in text.split(" ") if textStr != ""] 
            enList = ["" if textStr == "\\" else textStr for textStr in enText.split(" ")] 
            yList = [Sign.getAutoHeight(textStr, text_height, english_scale, enGap=gap) for textStr in textList]
            yMax = max([0] + yList)
            for i, textStr in enumerate(textList):
                self.putBiAutoText(textStr, enList[i], (x, y + (yMax - yList[i]) / 2), text_height, typeStr, gap, color1, color2, aidFirst, outTextColor)
                x += self.getAutoLen(textStr, text_height, typeStr, gap) + text_height * gap
        else:
            y += (yH - yMax) / 2
            if "#" not in text:
                self.putText(text, (x, y), typeStr, text_height, gap, (255) if color1 is None else color1)
                y += Sign.getAutoHeight(text, text_height) + gap * text_height
                textLen = self.getTextLen(text, typeStr, text_height, gap)
                return self.putCentralString(enText, (x + textLen / 2, y), typeStr, text_height, (255) if color1 is None else color1, Color.BLUE if color2 is None else color2, maxLen=textLen)
            textStr, aidStr = splitSharp(text)
            if "#D" in aidStr:
                if aidFirst:
                    self.putDirection(getSharpText(aidStr, "D"), (x, y), text_height, outTextColor, block_color=color1)
                    x += (1 + gap) * text_height
                else:
                    self.putDirection(getSharpText(aidStr, "D"), (x + self.getAutoLen(text[:text.find("#D")], text_height, "A", gap) + gap * text_height, y), text_height, outTextColor, block_color=color1)
            if "#N" in aidStr:
                if "#NW" in aidStr:
                    return self.putWayNo(text, (x, y), 4/3 * text_height)
                elif "#NH" in aidStr:
                    return self.putHighwayNo(text, (x, y), 5/3 * text_height)
            if "#B" in aidStr:
                return self.putBoxedText(text, pos, 4/3 * text_height, typeStr)
            self.putText(text, pos, typeStr, text_height, gap, color1)
            y += Sign.getAutoHeight(text, text_height) + gap * text_height
            textLen = self.getTextLen(text, typeStr, text_height, gap)
            self.putCentralString(enText, (x + textLen / 2, y), typeStr, text_height, (255) if color1 is None else color1, Color.BLUE if color2 is None else color2, maxLen=textLen)
    def getAutoHeight(text: str, height: float, english_scale: float|None = None, enGap: float = 0.4):
        """ Get the height of a line """
        if "#NH" in text:
            return 5/3 * height
        if "#NW" in text or "#B" in text:
            return 4/3 * height
        return height if english_scale is None else (1 + english_scale + enGap) * height
    def getAutoEnHeight(text: str, height: float, english_scale: float, gap: float = 0.2):
        """ Get the height of a line """
        if text == "" or "#N" in text:
            return 0
        return (english_scale + gap) * height
    def getDirectionBbox(self, textDict: dict[str,], text_height: int, lineLen: float = 1.5, lineGap: float = 0.3, enGap: float = 0.2) -> tuple[float, float, float, float]:
        """ Get the bonding box of the direction """
        if any([label not in textDict for label in {"heading", "text"}]):
            return None
        boxW = min(4 * text_height, self.getAutoLen(textDict["text"], text_height, "A", 0))
        if boxW == 0:
            boxW = 1
        boxH = text_height
        if "textEn" in textDict and hasattr(self, "english_scale") and self.english_scale is not None and self.english_scale > 0 and textDict["textEn"] != "":
            boxH += (enGap + self.english_scale) * text_height
            if (enLen := min(4 * text_height, fontLen([textDict["textEn"]], "A", self.english_scale * text_height, self.scale))) > boxW:
                boxW = enLen
        nextList = []
        if "next" in textDict and textDict["next"] != "":
            nextList = textDict["next"].split("\\n")
            nextLen = max([self.getAutoLen(line, 2/3 * text_height, "A", 0) for line in nextList]) + 0.6 * text_height
            if boxW < nextLen < 4 * text_height:
                boxW = nextLen
            boxH += sum([Sign.getAutoHeight(line, 2/3 * text_height) for line in nextList]) + (len(nextList)) * enGap * text_height
        angle = textDict["heading"] * PI/12
        centerX = lineLen * text_height * sin(angle)
        centerY = lineLen * text_height * cos(angle)
        if PI/2 - abs(PI/2 - abs(angle)) < atan(boxW / boxH):
            centerX += lineGap * text_height * sin(angle) + boxH * tan(angle if -PI/2 < angle < PI/2 else (-PI if angle < 0 else PI) - angle) / 2
            if -PI/2 < angle <= PI/2:
                centerY += lineGap * text_height + boxH / 2
            else:
                centerY -= lineGap * text_height + boxH / 2
        else:
            centerY += lineGap * text_height * cos(angle)
            if angle < 0:
                centerX -= lineGap * text_height + boxW / 2
                centerY -= boxW / tan(angle) / 2
            else:
                centerX += lineGap * text_height + boxW / 2
                centerY += boxW / tan(angle) / 2
        return (min(0, centerX - boxW / 2), -max(0, centerY + boxH / 2), max(0, centerX + boxW / 2), -min(0, centerY - boxH / 2))
    def putDirection(self, textDict: dict[str,], pos: tuple[float, float], text_height: int, lineLen: float = 1.5, lineWidth: float = 0.4, lineGap: float = 0.3, enGap: float = 0.2, color: tuple = (255), bgColor: tuple = Color.BLUE):
        """ Put the direction infomation and bar """
        if any([label not in textDict for label in {"heading", "text"}]):
            return
        boxW = min(4 * text_height, self.getAutoLen(textDict["text"], text_height, "A", 0))
        if boxW == 0:
            boxW = 1
        boxH = text_height
        if "textEn" in textDict and hasattr(self, "english_scale") and self.english_scale is not None and self.english_scale > 0 and textDict["textEn"] != "":
            boxH += (enGap + self.english_scale) * text_height
            if (enLen := min(4 * text_height, fontLen([textDict["textEn"]], "A", self.english_scale * text_height, self.scale))) > boxW:
                boxW = enLen
        nextList = []
        if "next" in textDict and textDict["next"] != "":
            nextList = textDict["next"].split("\\n")
            nextLen = max([self.getAutoLen(line, 2/3 * text_height, "A", 0) for line in nextList]) + 0.6 * text_height
            if boxW < nextLen < 4 * text_height:
                boxW = nextLen
            boxH += sum([Sign.getAutoHeight(line, 2/3 * text_height) for line in nextList]) + (len(nextList)) * enGap * text_height
        angle = textDict["heading"] * PI/12
        self.drawStraightBar(pos, angle, text_height, lineLen, lineWidth, color)
        # put text
        x, y = pos
        color = Color.getRGBAColor(color)
        x += lineLen * text_height * sin(angle)
        y -= lineLen * text_height * cos(angle)
        if PI/2 - abs(PI/2 - abs(angle)) < atan(boxW / boxH):
            x += lineGap * text_height * sin(angle) + boxH * tan(angle if -PI/2 < angle < PI/2 else (-PI if angle < 0 else PI) - angle) / 2
            if -PI/2 < angle <= PI/2:
                y -= lineGap * text_height + boxH / 2
            else:
                y += lineGap * text_height + boxH / 2
        else:
            y += lineGap * text_height * cos(angle)
            if angle < 0:
                x -= lineGap * text_height + boxW / 2
                y += boxW / tan(angle) / 2
            else:
                x += lineGap * text_height + boxW / 2
                y -= boxW / tan(angle) / 2
        y -= boxH / 2
        self.putAutoCentralString(textDict["text"], (x, y), "A", text_height, color, bgColor, None if "#B" in textDict["text"] and self.getAutoLen(textDict["text"], text_height, "A", 0) < boxW else boxW)
        y += (1 + enGap) * text_height
        if "textEn" in textDict and hasattr(self, "english_scale") and self.english_scale is not None and self.english_scale > 0 and textDict["textEn"] != "":
            self.putCentralString(textDict["textEn"], (x, y), "B", self.english_scale * text_height, color, boxW)
            y += (self.english_scale + enGap) * text_height
        if len(nextList) > 0:
            nextH = (2/3 * len(nextList) + enGap * (len(nextList) - 1)) * text_height
            placeText(self.img, (round((x - nextLen / 2) * self.scale), round(y * self.scale)), "(", "B", nextH * self.scale, color, round(0.3 * text_height * self.scale))
            placeText(self.img, (round((x + nextLen / 2 - 0.3 * text_height) * self.scale), round(y * self.scale)), ")", "B", nextH * self.scale, color, round(0.3 * text_height * self.scale))
            for text in nextList:
                self.putAutoCentralString(text, (x, y), "A", 2/3 * text_height, color, bgColor, None if "#B" in text and self.getAutoLen(text, 2/3 * text_height, "A", 0) < boxW else boxW)
                y += (2/3 + enGap) * text_height
    def update(self):
        """ Sign image generator """
        pass
    def autoSet(self, key: str, value, refresh = True):
        """ Set data based on infomation (unsafe) <p> Safe type should be override</p> """
        self.info[key] = value
        if refresh:
            self.update()
    def save(self, path: str):
        """ Save the sign """
        if self.img:
            self.img.save(path)