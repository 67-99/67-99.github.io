import os
import re
import json

from web import getWeb

def getPath(path: str):
    """ Get the path based on the pathList """
    return os.path.join(os.path.dirname(__file__), path.replace("/", "\\"))

def isFolder(path: str):
    """ Get wether the path is a folder """
    try:
        os.listdir(path)
        return True
    except:
        return False

def getDir(path: str):
    """ Get the directory file list """
    if not os.path.exists(path):
        return None
    fileList = {}
    for file in os.listdir(path):
        if isFolder(filePath := os.path.join(path, file)):
            fileList[file] = getDir(filePath)
        else:
            fileList[file] = None
    return fileList

def getAllPath(path: dict[str, dict]) -> list[str]:
    """ Get all paths of the data """
    allPath = []
    for file, subPaths in path.items():
        if subPaths is None:
            allPath.append(file)
        else:
            allPath += [f"{file}/{filePath}" for filePath in getAllPath(subPaths)]
    return allPath

def getHtmlLinks(page: str) -> dict[str, str]:
    """
        Get all links and title of page
        Return: {path: title}
    """
    pattern = r'<a\s+[^>]*href=["\']([^"\']*)["\'][^>]*(?:title=["\']([^"\']*)["\'])?[^>]*>(.*?)</a>'
    # 查找所有匹配的链接
    matches = re.findall(pattern, page, re.IGNORECASE | re.DOTALL)
    # 创建结果字典
    links = {}
    for match in matches:
        href = match[0].strip()
        title_attr = match[1].strip() if match[1] else ""
        link_text = re.sub(r'<[^>]+>', '', match[2]).strip()  # 移除链接文本中的HTML标签
        # 确定链接标题的优先级: title属性 > 链接文本 > href作为后备
        if title_attr:
            title = title_attr
        elif link_text:
            title = link_text
        else:
            title = href.split('/')[-1]  # 使用href的最后一部分作为标题
        # 如果href不为空，添加到结果字典
        if href and not href.startswith(('javascript:', 'mailto:', 'tel:', '#')):
            links[href] = title
    return links

def getJson(path: str) -> str:
    path = getPath(f"dataset/{os.path.splitext(path)[0]}/info.json")
    if os.path.exists(path):
        data = {}
        with open(path, "r", encoding="utf-8") as jsonFile:
            data = json.load(jsonFile)
        return data
    return {}

def writeJson(path: str, jsonObj) -> str:
    path = getPath(f"dataset/{os.path.splitext(path)[0]}")
    if not os.path.exists(path):
        os.makedirs(path)
    with open(f"{path}/info.json", "w", encoding="utf-8") as jsonFile:
        json.dump(jsonObj, jsonFile)

def getAbsPath(basePath: str, relativePath: str):
    outCount = relativePath.count("../")
    if outCount == 0:
        return f"{basePath.split("/", 1)[0]}/{relativePath}"
    else:
        return f"{"/".join(basePath.split("/")[:-(outCount + 1)])}/{relativePath.replace("../", "")}"

def webFix(path: str, lostPaths: list[str] = []) -> str|None:
    if getWeb(path)[0] != 200:
        lostJson: dict = getJson(path)
        for prePath, title in lostJson.get("preList", {}).items():
            if prePath in lostPaths:
                continue
            code, page = getWeb(prePath)
            if code != 200:
                newPath = webFix(prePath, lostPaths + [path])
                if newPath is None:
                    continue
                code, page = getWeb(prePath)
            if page is not None:
                links = getHtmlLinks(page)
                for postPath, postTitle in links.items():
                    postPath = getAbsPath(prePath, postPath)  # postPath -> newPath
                    if title == postTitle and getWeb(postPath)[0] == 200:  # replaceable
                        lostJson["Abandoned"] = True
                        lostJson["link"] = postPath
                        writeJson(path, lostJson)
                        _, newPage = getWeb(postPath)
                        newLinks = getHtmlLinks(newPage)
                        newObj = {"preList": lostJson.get("preList", {}), "postList": {}}
                        for lastpostPath, lastpostTitle in newLinks.items():
                            lastpostPath = getAbsPath(postPath, lastpostPath)
                            newObj["postList"][lastpostPath] = lastpostTitle
                            postJson: dict = getJson(lastpostPath)
                            if "postList" in postJson and path in postJson["postList"]:
                                postJson["postList"].pop(path)
                            postJson.setdefault("preList", {})[postPath] = lastpostTitle
                            writeJson(postPath, postJson)
                        writeJson(postPath, lostJson)
                        return postPath
        # Set abandoned
        lostJson["Abandoned"] = True
        writeJson(path, lostJson)
    return None

def searchAll(webList: list[str]):
    webList = [url if url.endswith(".html") else f"{url}.html" for url in webList]
    checkState: dict[str, bool] = {pagePath: False for pagePath in webList}
    checked: set[str] = set([])
    lostList: list[str] = []
    while len(checkState) > 0:
        print(webList)
        webList = []
        for pagePath in checkState.keys():
            code, page = getWeb(pagePath)
            if code == 200:
                checkState[pagePath] = True
                checked.add(pagePath)
                if pagePath in lostList:
                    lostList.remove(pagePath)
                relativeLinks = getHtmlLinks(page)
                links = {}
                for postPath, postTitle in relativeLinks.items():
                    postPath = getAbsPath(pagePath, postPath)
                    webList.append(postPath)
                    links[postPath] = postTitle
                    postJson: dict = getJson(postPath)
                    postJson.setdefault("preList", {})[pagePath] = postTitle
                    writeJson(postPath, postJson)
                pageJson = getJson(pagePath)
                pageJson["postList"] = links
                writeJson(pagePath, pageJson)
            else:
                lostList.append(pagePath)
        for path in checked:
            if path in webList:
                webList.remove(path)
        checkState = {pagePath: False for pagePath in webList}
    for page in {url: None for url in lostList}.keys():
        if page not in checked:
            webFix(page)

def getURLs():
    dataPath = getPath("dataset")
    if os.path.exists(dataPath):
        dataR: dict[str, dict] = {}
        for webName in os.listdir(dataPath):
            dataR[webName] = getDir(os.path.join(dataPath, webName))
        data = {}
        for webName, webData in dataR.items():
            data[webName] = [f"{webName}/{os.path.dirname(path)}" for path in getAllPath(webData)]
        return data
    return {}

if __name__ == "__main__":
    data = getURLs()
    for urlList in data.values():
        searchAll({url: None for url in urlList}.keys())