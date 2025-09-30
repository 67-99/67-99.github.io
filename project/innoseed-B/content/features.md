# 主要功能

我们根据目标生成了许多功能，包括但不限于：
- 添加网站
- 定期扫描并修复
- 修复失效网络链条

## 添加网站

当用户选择任意一个网站添加备份时，系统会读取该网站页面，获取所有该网站的链接并存储所有的父子关系，然后使用广度优先搜索所有该网站所链接的网页并加入数据库。用户可以选择是否添加其所链接其他域名进入数据库，以及此域名下的获取范围。

```mermaid
graph TB
web ==> root
    subgraph 增强范围
        root ==> Choose(["aaa
        (选择添加此网址)"]) & aab & C((index))
        subgraph 默认范围
            Choose ==> 1 & 2 & 3 & A0((index))
            1 ==> A1((index))
            2 ==> A2((index))
            3 ==> A3((index))
        end
        A1 -.-> A0
        A1 -.-> C
        A2 -.-> A1
        A3 -.-> A2
        B -.-> C
        C -.-> A3 & B
        aab ==> B((index))
    end
```

## 定期扫描并修复

用户在部署此系统后，可以设定自动扫描周期以及扫描范围，系统会自动获取网页状态码并更新数据库超链接与网页快照，用户可以选择是否新增网页以完善现有数据库网络。当数据库中网页缺失时，系统将自动执行修复命令并更新网页快照。

```mermaid
graph TB
    root ==> aaa & aab & C((index))
    subgraph 现有数据库
        aaa ==> 1 & 2 & 3 & A0((index))
        1 ==> A1((index))
        2 ==> A2((index))
        3 ==> A3((index))
    end
    A1 -.-> A0
    A1 -.-> C
    A2 -.-> A1
    A3 -.-> A2
    B -.-> C
    subgraph 可添加
        C -.-> A3 & B
        aab ==> B((index))
    end
```
## 修复失效网络链条

对于失效网站，系统会自动获取其有效父网站，并根据标题信息与网页信息相似度重构网站链接。若网站被找到，旧网站将被链接至新网站；否则，旧网站将被标记为“废弃”。

若出现网站架构迁移，则会根据修复结果智能验证性迁移相似失效网站。

```mermaid
graph TB
    subgraph 数据库
        aaa ==> A0((index)) & 1 & 2 & 3
        1 ==x X((index))
        2 ==> A2((index))
        3 ==> A3((index))
        subgraph 重构节点
            A1((index))
        end
        1 ==> A1
    end
    A0 x-.-x X
    A2 x-.-x X
    A1 -.-> A0
    X x-.-x C((root/index))
    A1 -.-> C
    A2 -.-> A1
    A3 -.-> A2
```