from signTemplate import Color, Sign
from PIL import Image

class SignGeneral(Sign):
    """ A general sign with position setting """
    def __init__(self, scale, text_height: int = 50):
        super().__init__(scale)
        self.text_height = text_height
        self.info = {"background": "GW", "width": 640, "height": 480, "layers": 0}
        self.bgcolor = Color.GREEN
        self.bglinecolor = (255)
    def update(self):
        self.img = Image.new("RGBA", (round(self.info["width"] * self.scale), round(self.info["height"] * self.scale)), (255, 255, 255, 0))
        self.drawTriRoundRect(None, self.text_height * 0.1, self.bgcolor, self.bglinecolor)
    def setNum(self, num: int, refresh = True):
        """ Set the number of lines """
        if num >= 0:
            self.info["num"] = num
            if self.num < num:
                while self.num < num:
                    self.num += 1
                    self.info[f"info{self.num}"] = {"arrow": "↑", "text": "", "textEn": ""}
                if refresh:
                    self.update()
            elif self.num > num:
                while self.num > num:
                    if f"info{self.num}" in self.info:
                        self.info.pop(f"info{self.num}")
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
        elif key == "num":
            self.setNum(value, refresh)
        else:
            super().autoSet(key, value, refresh)