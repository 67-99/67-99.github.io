## 数据来源
最一开始设计时，地图选用的是可拖拽类型组件，最终选择了`leaflet`。若要使用`leaflet`显示图块，则要使用由`?x={x}&y={y}&z={z}`控制显示的API。由于地图在整个项目里只作为底图存在，所以我在免费API中选择了高德地图的瓦片底图（`wprd01.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}`）。该API支持传递`&style`、`&ltype`来控制显示的种类，其中`&style=6`是卫星地图，`&style=7`是正常路网图。
> 参考[免费瓦片网站](https://www.cnblogs.com/googlegis/p/14986844.html)和[高德瓦片API参数](https://blog.csdn.net/qq_31881865/article/details/103741538#comments_19547050)

接下来就是线路线位了，由于本项目参考Centralgo的[NaL北京轨交线路图](https://centralgo.site/scmap/index.html)，所以仿照其线网绘制出主线网baseline作为主要框架。拟合成曲线后采样为折线，最后由`trans_shift.py`脚本微调各位置。站点位置信息则由[高德地图](map.amap.com/service/subway)及其[坐标拾取器](https://lbs.amap.com/tools/picker)共同获取，之后根据现实站点位置进行微调

![centralgo线路图](content/resource/baseline-centralgo.png)

为了显示站台实际位置与配线图，我根据[北京地图配线图](https://sierraqin.github.io/metro)中的配线信息整理成`tracks.json`，标明上下行位置及站台位置，并根据上文的baseline绘制线路。

![sierraqin线路图（网页版）](content/resource/tracks-sierraqin.png)