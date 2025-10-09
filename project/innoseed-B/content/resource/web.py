import os

def getWebPath(path: str):
    """ Get the path based on the pathList """
    a = os.path.dirname(__file__)
    b = path.replace("/", "\\")
    return os.path.join(a, "web", b)

def isFolder(path: str):
    """ Get wether the path is a folder """
    try:
        os.listdir(path)
        return True
    except:
        return False

def getWeb(path: str) -> tuple[int, ]:
    """ Get the content of the webPage """
    if os.path.exists(os.path.dirname(getWebPath(path))):
        _, ext = os.path.splitext(os.path.basename(path))
        if ext == "":
            path += ".html"
        fileList = os.listdir(os.path.dirname(getWebPath(path)))
        if os.path.basename(path) in fileList:
            data = ""
            with open(getWebPath(path), "r", encoding="utf-8") as file:
                data = file.read()
            return (200, data)
        return (404, None)
    else:
        return (404, None)