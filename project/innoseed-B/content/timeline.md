# 项目时间线

由于黑客松在一天内举行（2025/9/20），所以每一项功能开发的耗时都被压缩到了极致。

```mermaid
gantt
    title 项目时间安排
    dateFormat HH:mm
    axisFormat %H:%M

    section 活动安排
    签到 : sign, 08:00, 1m
    听取规则 : done, rules, after sign, 45m
    实现方式讨论 : discuss, after rules, 45m
    搭建虚拟网站 : website, after discuss, 30m
    实现网站接口 : interface, after website, 1h
    搭建数据库 : database, after interface, 2.5h
    实现网络遍历 : traverse, after database, 1h
    实现网络修复 : repair, after traverse, 2h
    最终debug : debug, 16:00, 50m
    项目提交 : milestone, m2, 17:27, 0m

    section 项目汇报
    项目截至 : milestone, deadline, 18:00, 0m
    项目汇报 : report, 19:30, 20m
```