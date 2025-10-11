# Project页面

在project表下，有一组<code>script.js</code>,<code>style.css</code>可以帮助分页面读取并链接显示<code>./contents</code>里面的内容。分页面的组织架构如下：
```
分页面/
├── content/
│   ├── source/
│   │   └── 所有你需要的页面素材
│   ├── content.json
│   └── 页面文件
└── index.html
```
其中<code>content</code>中放置所有页面正文依赖文件，<code>content/content.json</code>包含页面的所有链接信息，<code>content/source</code>中推荐存储所有正文依赖资源。

> 注：若要使用project默认框架，则<code>index.html</code>建议包含[以下架构](project/template.html.md)。

## content.json配置

正文支持配置markdown、图片、视频与下载源。<code>content.json</code>中格式为：
```
[
    {
        "id": str, 
        "title": "文字标题", 
        "type":"类型关键字", 
        "src":"文件地址", 
        ...
    },
    ...
]
```
其中，类型关键字为<code>markdown</code>, <code>image</code>, <code>image-gallery</code>, <code>video</code>, <code>downloads</code>, <code>html</code>之一，文件加载地址为<code>content/文件地址</code>。

<code>image</code>关键字需要提供图片地址，格式为：
```
{
    "id":"image", "title":"...", "type":"image",
    "src":"path", "alt":"图片名称", "caption":"标题描述",
    "showInNav": false
}
```
<code>image-gallery</code>关键字需要提供多个图片地址，格式为：
```
{
    "id":"gallery", "title":"...", "type":"image-gallery",
    "images":[
        {"src":"path", "alt":"图片名称", "caption":"标题描述"},
        ...
    ]
}
```
<code>video</code>关键字需要提供视频地址，格式为：
```
{
    "id":"video","title":"...","type":"video",
    "src":"视频地址","poster":"视频封面地址","caption":"标题描述"
}
```
<code>downloads</code>关键字需要提供文件地址，格式为：
```
{
    "id":"download", "title":"...", "type":"downloads",
    "files":[
        {"name": "文件描述", "src":"path", "size":"大小"},
        ...
    ]
}
```
<code>html</code>关键字需要提供嵌套网站网址，格式为：
```
    {
        "id": "url", "title": ...","type": "html",
        "src": "path", "height": "iFrame高", "sandbox": "",
        "description": "网页描述", "caption": "网页注释"
    }
```