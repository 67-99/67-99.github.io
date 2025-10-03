# 成果展示

在这一天中，我们实现了网页递归扫描、扫描更近修复以及定向修复。

## 网页扫描

系统可以实现自动网页获取与添加构建的[虚拟网站](web/index.html)，形成本地数据库。
```
dataset/
└── web/
    ├── aaa/
    │   ├── 1/
    │   │   └── index/
    │   │       ├── 20250920.html
    │   │       └── info.json
    │   ├── 2/
    │   │   └── index/
    │   │       ├── 20250920.html
    │   │       └── info.json
    │   └── 3/
    │       └── index/
    │           ├── 20250920.html
    │           └── info.json
    ├── aab/
    │   └── index/
    │       ├── 20250920.html
    │       └── info.json
    └── index/
        ├── 20250920.html
        └── info.json
```
aab/index/info.index:
```
{
    "preList": 
    {
        "branch/aaa/3/index.html": "\ud83d\udcc1 branch/aab"
    }, 
    "postList": 
    {
        "branch/index.html": "\ud83d\udcc1 branch", 
        "branch/aaa/1/index.html": "\ud83d\udcc1 branch/aaa/1"
    }
}
```
## 网页更改

当虚拟网站被删除后，网页会被标记为<code>abandoned</code>；若虚拟网站被迁移且被找到后，网页会标记新网页位置并标记为<code>abandoned</code>。

被删除的网站：
```
{
    "preList": 
    {
        "branch/aaa/3/index.html": "\ud83d\udcc1 branch/aab"
    }, 
    "postList": 
    {
        "branch/index.html": "\ud83d\udcc1 branch", 
        "branch/aaa/1/index.html": "\ud83d\udcc1 branch/aaa/1"
    }, 
    "Abandoned": true
}
```
被迁移的网站：
```
{
    "preList": 
    {
        "branch/aaa/3/index.html": "\ud83d\udcc1 branch/aab"
    }, 
    "postList": 
    {
        "branch/index.html": "\ud83d\udcc1 branch", 
        "branch/aaa/1/index.html": "\ud83d\udcc1 branch/aaa/1"
    }
    "link": web/b/index/index.html
    "Abandoned": true
}
```