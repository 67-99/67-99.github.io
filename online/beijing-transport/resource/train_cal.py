import os
import json
import math
import bisect
from tqdm import tqdm
from collections import Counter

# 营运时段口径（与前端 script.js 一致：200 ≤ t < 1660）。
# JSON 的午夜键（"0" / "24"）同时存低值（1~59）与其 +1440 镜像（1441~1499），前端只保留后者；
# train_cal 原先不过滤，低半份会另起一条链 ⇒ 全量 88 个「幽灵午夜车次」
# （如 M1 id=385：西单@1 → 天安门西@3 → … → 四惠@21）。
# 另有极少数**无镜像对照**的低值（M14 3 个 / M16 2 个 / M4 12 个），本就该剔除。
SERVICE_LO, SERVICE_HI = 200, 1660

# 上下行运行时分核查结果：(线路, 时段标签, 站1, 站2, 上行分钟, 下行分钟)。
# 逐线路收集，主流程结束时汇总打印并落盘 resource/train_runtime_diff.txt。
RUNTIME_DIFFS: list[tuple[str, str, str, str, int, int]] = []

def getFilePath(*path: list[str] | str):
    return os.path.join(os.path.dirname(__file__), *path)

def hav_dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    """两站经纬度（度）间的球面距离，单位 km"""
    R = 6371.0
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def estimate_run_time(l1: list[int], l2: list[int], hi: int,
                      lo_slack: int = 1, hi_slack: int = 2) -> int | None:
    """从两站时刻列表估算典型站间运行时分（分钟）。

    R56 重写。旧实现走「全局众数是否显著占优（maxc ≥ 次高 × 1.2）」的启发式，
    在“行车间隔 ≈ 区间运行时分”的高密度线路上会被跨车次巧合差值打平：判据失效后
    回退到「差值直方图的第一个显著局部峰」，常取到 1~2 分钟，而真值 3~6 分钟
    ⇒ 配对窗口整体偏移 ⇒ **该区间上每条链齐刷刷断裂**（M8 林萃桥→森林公园南门、
    M17 北神树→十八里店、M15 南法信→后沙峪 都是这么坏的）。

    现改为**目标函数法**：直接枚举候选 m ∈ [1, hi]，用窗口
    ``[max(m-lo_slack, 1), m+hi_slack]`` 统计「有多少个来源时刻能在窗口内找到
    后继」（贪心取窗口内最早的未被占用后继），取计数最大的 m —— 这是把
    「事后警告」变成「事前目标函数」；同时**不从合并时刻表估计**（由调用方逐时段传入），
    彻底避开“工作日∪双休日合并后噪声地板抬高、众数优势消失”的失效路径。

    ⚠️ 判别性说明：真实运行时分 r 的第一个整倍是 r 本身，但周期性时刻表下
    r+H、r+2H 的配对数同样高（H = 发车间隔）⇒ 目标函数在 {r+kH} 上近似持平。
    因此并列时取**更小**的 m（r 是最小的那个显著峰）。
    """
    if not l1 or not l2:
        return None
    best_m, best_pair, best_exact = None, -1, -1
    for m in range(1, hi + 1):
        lo, hw = max(m - lo_slack, 1), m + hi_slack
        used = set()
        n_pair = n_exact = 0
        for t1 in l1:
            j = bisect.bisect_left(l2, t1 + lo)
            limit = t1 + hw
            while j < len(l2) and l2[j] <= limit:
                if l2[j] not in used:
                    used.add(l2[j])
                    n_pair += 1
                    if l2[j] - t1 == m:
                        n_exact += 1
                    break
                j += 1
        if (n_pair, n_exact) > (best_pair, best_exact):
            best_m, best_pair, best_exact = m, n_pair, n_exact
    return best_m

# 待避站匹配窗口的额外放宽（分钟）：慢车在待避站（如 M6 常营/通运门）临时停车
# 2~2.5 分钟再发车，导致“进入待避站”区间的运行时分比众数大 2~3 分钟；
# 放宽该方向的匹配窗口可避免待避车次链在此断开（轻微代价：高密度时段可能与
# 下一班次错配，但对整体链的连贯性利大于弊）。
PAUSE_SLACK = 3

# 折返时长范围（分钟）：列车循环运行，到达大小交路终点后大多调向发车（小部分进停车场/
# 停车线），因此“终点站反向发车时刻 - 折返时长”可推得大致的到站时刻。折返匹配同时用于
# 判定某车次确实在正线终点折返（大交路，可延伸至终点）还是中途折返（小交路）/进停车场。
TURN_MIN, TURN_MAX = 3, 12

def gen_ring_direction(seq, direc, sche_type, time_dict, rt, pause_set, start_id=0):
    """闭环线路（tracks.json 中 "loop": true）一个方向一个时段的列车生成。

    R56 改动：**环缝不再参与配对 ⇒ 一条车次 = 一环（一趟）**。

    旧实现在环缝（末站 → 首站）也建立配对，使环线成为「没有终点锚点」的无限链：
    逐站贪心一旦在某处错配，链就沿环缝一直接力下去，把整天的时刻吞进少数几条超长链。
    实测 M2 上行（18 站、各站 199~204 趟）只生成 **23 条链、平均 108 站 ≈ 6 圈**，
    另有 1130 个时刻成为孤立点被丢弃（M2 一条线独占全局“丢弃时刻”的 76%）。

    只配相邻站后，车次语义与直线线路「一车次 = 一次全程」一致，也与旧 train 文件
    的形态吻合（旧 M2 上行 weekday 中位 17 站 ≈ 正好一圈）。

    rt(st1, st2, sche) 为站间运行时分查询（逐时段 + 反向兜底），由主流程注入。
    """
    n = len(seq)
    times = [sorted(time_dict[st].get(direc, {}).get(sche_type, [])) if st in time_dict else []
             for st in seq]

    # 环线发车间隔常与站间运行时分同量级（且出入库/停站时长有波动），配对窗口比直线
    # 线路放宽 1 分钟（m-1 .. m+2），减少在个别“瓶颈站对”上整链断裂。
    LOOP_WIN_LO, LOOP_WIN_HI = -1, 2

    # ---- 第一步：相邻站合并（不含环缝）----
    out_link = {}                      # (站序号, 时刻) -> (下一站序号, 时刻)
    target_used = [set() for _ in range(n)]
    for k in range(n - 1):
        k2 = k + 1
        m = rt(seq[k], seq[k2], sche_type)
        if m is None:
            continue
        hi_w = m + (PAUSE_SLACK if seq[k2] in pause_set else LOOP_WIN_HI)
        # 与直线线路一致：源升序、各取窗口内最早可用后继（区间二部图最大匹配 + 保序）
        for t1 in times[k]:
            j = bisect.bisect_left(times[k2], t1 + max(m + LOOP_WIN_LO, 1))
            while j < len(times[k2]) and times[k2][j] <= t1 + hi_w:
                if times[k2][j] not in target_used[k2]:
                    out_link[(k, t1)] = (k2, times[k2][j])
                    target_used[k2].add(times[k2][j])
                    break
                j += 1

    # 不做直线线路的“跨站越行”配对：站间运行时分与发车间隔同量级时，跨多站的配对窗口
    # 很宽（每跳 ±1 分钟累计），会把断链后残剩的时刻误拼成“跳十几站”的假快车。

    # ---- 链成车次（上限一环，避免跨圈接力）----
    incoming = {}
    for (k, t1), (k2, t2) in out_link.items():
        incoming[(k2, t2)] = (k, t1)
    starts = [(k, t) for k in range(n) for t in times[k] if (k, t) not in incoming]
    starts.sort(key=lambda x: (x[0], x[1]))
    trains = []
    for k, t in starts:
        chain = [(k, t)]
        cur = (k, t)
        while cur in out_link and len(chain) < n:
            cur = out_link[cur]
            chain.append(cur)
        if len(chain) < 2:
            continue                 # 孤立时刻不成车次
        # 越行/快车识别
        max_gap = 0
        for j in range(len(chain) - 1):
            gap = chain[j + 1][0] - chain[j][0]
            if gap > 0 and gap > max_gap:
                max_gap = gap
        stops = [{"station": seq[kk], "time": tt} for kk, tt in chain]
        train: dict[str, object] = {"id": start_id + len(trains) + 1, "stations": stops}
        if max_gap >= 3:
            train["express"] = True
        trains.append(train)
    return trains

if __name__ == "__main__":
    if not os.path.exists(getFilePath("train")):
        os.mkdir(getFilePath("train"))
    with open(getFilePath("tracks.json"), "r", encoding="utf-8") as f:
        tracks_config = json.load(f)
    # ring_lines：在 tracks.json 中以 "loop": true 显式声明的闭环线路（如 M2、M10）
    ring_lines = {name for name, value in tracks_config.items() if "main" in value and value.get("loop")}
    have_timetable = {os.path.splitext(f)[0] for f in os.listdir(getFilePath("timetable")) if f.endswith(".json")}
    station_data = {name: value["main"] for name, value in tracks_config.items() if "main" in value}
    station_pos = {name: {st["n"]: tuple(st["sl"]) for st in value.get("stations", []) if "n" in st and "sl" in st}
                   for name, value in tracks_config.items() if "main" in value}
    for name, directions in station_data.items():
        station_data[name] = [[st["n"] for st in direction if "n" in st] for direction in directions]

    def through_ext_ids(id_: str):
        """贯通扩展线：线路 ID 加字母后缀、且【不带自己的时刻表文件】（如 M1E 之于 M1、
        M4S 之于 M4）。贯通运营（1号线-八通线、4号线-大兴线）的时刻表只写在主线路
        （M1/M4）文件里；自带时刻表的（如 M25W）不算贯通扩展。"""
        return sorted(k for k in station_data
                      if k != id_ and k.startswith(id_) and k[len(id_):].isalpha()
                      and k not in have_timetable)

    def seq_overlap_len(x: list[str], y: list[str]) -> int:
        """x 末尾连续 == y 开头连续 的最大长度（站序重叠，用于贯通拼接）"""
        best = 0
        for k in range(1, min(len(x), len(y)) + 1):
            if x[-k:] == y[:k]:
                best = k
        return best

    def stitch_through(id_: str) -> list[list[str]]:
        """把贯通扩展线的站序拼接到本线两个方向（重叠站去重）。
        dir0/dir1 分别在“尾接”或“头接”方向拼接，重叠由站序后缀/前缀自动判断。"""
        dirs = [list(station_data[id_][0]), list(station_data[id_][1])]
        for eid in through_ext_ids(id_):
            ed = station_data[eid]
            for d in (0, 1):
                A, B = dirs[d], ed[d]
                ov = seq_overlap_len(A, B)          # 扩展线接在本线之后（尾接）
                if ov and len(B) > ov:
                    dirs[d] = A + B[ov:]
                    continue
                ov2 = seq_overlap_len(B, A)         # 扩展线接在本线之前（头接）
                if ov2 and len(B) > ov2:
                    dirs[d] = B[:len(B) - ov2] + A
        for d in (0, 1):                            # 防御性去重（贯通线不应有重复站）
            seen, keep = set(), []
            for s in dirs[d]:
                if s not in seen:
                    seen.add(s)
                    keep.append(s)
            dirs[d] = keep
        return dirs

    # 自检计数（原先「孤立时刻」是静默丢弃：全量 7308 个真实时刻因此不出现在任何车次里）
    stats = {"isolated": 0, "src": 0, "linked": 0, "dead_pairs": 0}

    for time_file in tqdm(os.listdir(getFilePath("timetable")),leave=False):
        id_ = os.path.splitext(time_file)[0]
        if id_ not in station_data or time_file in {}:
            continue
        stations = station_data[id_]
        # ---- 贯通拼接：M1/M4 的时刻表覆盖 M1E/M4S，生成贯穿两段线路的车次 ----
        if id_ not in ring_lines and through_ext_ids(id_):
            stitched = stitch_through(id_)
            if len(stitched[0]) > len(stations[0]) or len(stitched[1]) > len(stations[1]):
                tqdm.write(f"  贯通 {id_} ←→ {'、'.join(through_ext_ids(id_))}："
                           f"{len(stations[0])}站 -> {len(stitched[0])}站")
                stations = stitched
        with open(getFilePath("timetable", time_file), "r", encoding="utf-8") as f:
            timetable_data = json.load(f)
        time_dict: dict[str, dict[str, str|dict[str, list[int]]]] = {}
        for st in timetable_data["stations"]:
            for key, value in st.items():
                if isinstance(value, dict) and key in ("up", "down"):
                    for k, v in value.items():
                        if isinstance(v, dict):       # A 型（小时键）→ 合并小时、去重、按营运时段过滤
                            value[k] = sorted({x for items in v.values() for x in items
                                               if SERVICE_LO <= x < SERVICE_HI})
                        elif isinstance(v, list):     # B 型（扁平数组，M5/M9/M11）
                            value[k] = sorted({x for x in v if SERVICE_LO <= x < SERVICE_HI})
                time_dict.setdefault(st["station_name"], {})[key] = value
        # ---- 小交路终点 / 待避站（顶层新键，均按方向给出站名列表）----
        # short_end: 该方向小交路列车折返/终到的车站，如 M6 up: ["潞城", "草房", "通州北关"]
        # pause:     待避车站（慢车在此等待快车越行），不等于越行车站
        short_end = timetable_data.get("short_end") or {}
        pause = timetable_data.get("pause") or {}
        short_end_sets = [set(short_end.get("up", [])), set(short_end.get("down", []))]
        pause_sets = [set(pause.get("up", [])), set(pause.get("down", []))]
        # ---- 小环检测（如机场线 CAE：3号航站楼仅上行经过，2号航站楼仅下行经过）----
        # 两方向站点集合不一致 => 环线，可用“环闭合”补算缺失的运行时分。
        loop = set(stations[0]) != set(stations[1])

        # ---- 典型站间运行时分（逐时段估计）----
        # min_time_sched: (st1, st2, 时段) -> 分钟   ← 配对窗口的真实依据
        # min_time_list : (st1, st2) -> 分钟        ← 跨时段兜底（环缝/小环闭合/无时段数据时）
        sches_all = sorted({k for val in time_dict.values() for key, v in val.items()
                            if key in ("up", "down") and isinstance(v, dict) for k in v.keys()})
        min_time_sched: dict[tuple[str, str, str], int] = {}
        min_time_list: dict[tuple[str, str], int] = {}
        est_votes: dict[tuple[str, str], Counter] = {}
        # est_dir: (站1, 站2, 方向, 时段) -> 分钟。与 min_time_sched 同期写入，但**保留方向**，
        # 供末尾的「上下行运行时分核查」判定哪一侧是上行、哪一侧是下行。
        est_dir: dict[tuple[str, str, str, str], int] = {}
        pos = station_pos.get(id_, {})
        for i, direc in enumerate(("up", "down")):
            # 本方向参与配对的站序：原始序列 + （小环时）插入对侧额外站后的扩展序列
            seqs = [list(stations[i])]
            if loop:
                ext = list(stations[i])
                for st in stations[1 - i]:
                    if st not in ext:
                        idx = stations[1 - i].index(st)
                        prev_st = stations[1 - i][idx - 1] if idx > 0 else None
                        next_st = stations[1 - i][idx + 1] if idx + 1 < len(stations[1 - i]) else None
                        if prev_st in ext and next_st in ext:
                            p, q = ext.index(prev_st), ext.index(next_st)
                            if abs(p - q) == 1:
                                ext.insert(max(p, q), st)
                seqs.append(ext)
            for seq_i in seqs:
                for j in range(1, len(seq_i)):
                    st1, st2 = seq_i[j - 1], seq_i[j]
                    st_t1 = time_dict.get(st1, {}).get(direc, {})
                    st_t2 = time_dict.get(st2, {}).get(direc, {})
                    if not isinstance(st_t1, dict) or not isinstance(st_t2, dict):
                        continue
                    if st1 in pos and st2 in pos:
                        d_km = hav_dist(pos[st1], pos[st2])
                        hi = max(1, math.ceil(d_km / 10 * 60))
                    else:
                        hi = 30    # 无坐标时的兜底范围
                    hi = min(hi, 20)   # 相邻站运行时分不可能超过 20 分钟，限制候选枚举范围
                    # ⚠️ 逐时段估计（工作日/双休日分别估），不再用「合并列表」——
                    # 合并会把噪声地板抬高、让众数优势消失（见 estimate_run_time 说明）
                    for sche in sches_all:
                        l1 = sorted(st_t1.get(sche, []) or [])
                        l2 = sorted(st_t2.get(sche, []) or [])
                        if not l1 or not l2:
                            continue
                        est = estimate_run_time(l1, l2, hi)
                        if est is None:
                            continue
                        min_time_sched[(st1, st2, sche)] = est
                        est_dir[(st1, st2, direc, sche)] = est
                        # 跨时段兜底值：按「该时段两侧较短时刻数」加权投票取众数
                        est_votes.setdefault((st1, st2), Counter())[est] += min(len(l1), len(l2))
        for _pair, _c in est_votes.items():
            min_time_list[_pair] = _c.most_common(1)[0][0]
        # ---- 小环闭合：补算缺失配对（环的两条弧总耗时相等）----
        # 例（CAE 上行）：三元桥->3号航站楼 已知 X，2号航站楼->三元桥（下行直连）已知 Z，
        # 则 3号航站楼->2号航站楼 = Z - X（两条弧 三元桥→T3→T2 与 T2→三元桥 耗时相等）。
        # 注意：必须在两个方向都算完 min_time 之后再执行，否则对侧方向的弧2还未就绪。
        if loop:
            for i in (0, 1):
                other = stations[1 - i]
                for b in stations[i]:
                    if b in other:
                        continue                      # 仅处理本方向独有的“分支站”
                    idx = stations[i].index(b)
                    if idx == 0 or idx == len(stations[i]) - 1:
                        continue
                    prev_st, next_st = stations[i][idx - 1], stations[i][idx + 1]
                    tp = min_time_list.get((prev_st, b))          # 弧1前半段
                    tn = min_time_list.get((next_st, prev_st))    # 弧2（对侧方向直连）
                    if tp is not None and tn is not None and tp < tn and (b, next_st) not in min_time_list:
                        min_time_list[(b, next_st)] = tn - tp
                    elif tp is not None and tn is not None and (b, next_st) in min_time_list and (prev_st, b) not in min_time_list:
                        v = tn - min_time_list[(b, next_st)]
                        if v >= 1:
                            min_time_list[(prev_st, b)] = v
        # ---- 大环“环缝”运行时分 ----
        # 闭环线路（tracks.json 中 "loop": true，如 M2/M10）的方向列表是整圈环线缺一环缝
        # 的序列：列表首尾两站（如 M2 外环 西直门…积水潭）在环上实际相邻（积水潭↔西直门），
        # 但两个方向的列表都在同一对站处断开，这段“环缝”不在任何相邻配对里。
        # 站间时刻表对这段的众数会被出入库车次污染（实测 3 分钟 vs 巧合 7~10 分钟），因此
        # 用“全线相邻对 分钟/公里 中位数 × 环缝距离”估算，随后用“整环时长一致性”做上下行校准。
        if id_ in ring_lines:
            sec_per_km = []
            for (a, b), t in min_time_list.items():
                if a in pos and b in pos:
                    d_km = hav_dist(pos[a], pos[b])
                    if d_km >= 0.15 and t <= max(5, d_km * 3.5 + 2):   # 剔除被污染的过大约值
                        sec_per_km.append(t / d_km)
            seam_min_km = sorted(sec_per_km)[len(sec_per_km) // 2] if sec_per_km else 2.6
            seam_ests = []
            for i in (0, 1):
                a, b = stations[i][-1], stations[i][0]
                if a not in pos or b not in pos:
                    continue
                d_km = hav_dist(pos[a], pos[b])
                seam_ests.append(max(2, round(d_km * seam_min_km)))
            # 上下行环缝方向相反但距离相同，理论上应一致：取二者中位数做双方向兜底
            if seam_ests:
                seam_t = sorted(seam_ests)[len(seam_ests) // 2]
                for i in (0, 1):
                    a, b = stations[i][-1], stations[i][0]
                    if a in pos and b in pos:
                        min_time_list.setdefault((a, b), seam_t)
        # 上下行运行时分核查已下移（见「洞口估值」段之后）——那里同时覆盖逐时段与跨时段兜底。
        # 全线“秒/公里”中位数：用于封站/无数据站跳连的直达运行时分估算（数据缺失站无法
        # 直接取众数——高密度行车下跨站差值会被 d=1 的跨车次巧合污染，距离法更稳）。
        if pos:
            sec_per_km = []
            for (a, b), t in min_time_list.items():
                if a in pos and b in pos:
                    d_km = hav_dist(pos[a], pos[b])
                    if d_km >= 0.15 and t <= max(5, d_km * 3.5 + 2):
                        sec_per_km.append(t / d_km)
            line_sec_per_km = sorted(sec_per_km)[len(sec_per_km) // 2] if sec_per_km else 80.0
        else:
            line_sec_per_km = 80.0

        # ---- 洞口（中间站无时刻表）估值：把洞两侧的有数据站**当作相邻站** ----
        # 例：M1 八角游乐园 封站改造，up/down 都没有任何时刻 ⇒ 古城 与 八宝山 之间夹着一个
        # 「无时刻表站」。旧实现只在配对时跨过该站，运行时分却只能落到距离法兜底（est 恒为
        # 2、窗口 [1,3]），而两端站自己的时刻表给出的跨洞运行时分为 5~6 分钟 ⇒ 窗口装不下
        # ⇒ 车次在洞两侧被切成两条链（八宝山因此成为大量车次的起点/终点）。
        # 这里让跨洞的两端站与普通相邻站完全同口径：用它们各自的时刻表逐时段估运行时分。
        # ⚠️ 只处理**两端都还有数据**的洞；洞口顶在线路端部时不构成站间对（如 M1 福寿岭尚未
        # 开通、苹果园下行表为空，那是「正线终点」问题，由末尾的 tail 延伸处理）。
        def _dir_has_data(st_: str, direc_: str) -> bool:
            d_ = time_dict.get(st_, {}).get(direc_, {})
            return isinstance(d_, dict) and any(d_.get(s_) for s_ in sches_all)

        for i_ in (0, 1):
            direc_ = ("up", "down")[i_]
            seq_ = list(stations[i_])
            j_ = 0
            while j_ < len(seq_):
                if _dir_has_data(seq_[j_], direc_):
                    j_ += 1
                    continue
                k_ = j_ - 1
                while j_ < len(seq_) and not _dir_has_data(seq_[j_], direc_):
                    j_ += 1
                if k_ < 0 or j_ >= len(seq_):
                    continue                     # 洞口顶在线路端部 ⇒ 不构成站间对
                a_, b_ = seq_[k_], seq_[j_]
                hi_ = 30
                if a_ in pos and b_ in pos:
                    hi_ = min(max(1, math.ceil(hav_dist(pos[a_], pos[b_]) / 10 * 60)), 20)
                for sche_ in sches_all:
                    l1_ = sorted(time_dict.get(a_, {}).get(direc_, {}).get(sche_, []) or [])
                    l2_ = sorted(time_dict.get(b_, {}).get(direc_, {}).get(sche_, []) or [])
                    if not l1_ or not l2_:
                        continue
                    est_ = estimate_run_time(l1_, l2_, hi_)
                    if est_ is None:
                        continue
                    min_time_sched.setdefault((a_, b_, sche_), est_)
                    est_dir.setdefault((a_, b_, direc_, sche_), est_)
                    est_votes.setdefault((a_, b_), Counter())[est_] += min(len(l1_), len(l2_))
        for _pair, _c in est_votes.items():
            min_time_list.setdefault(_pair, _c.most_common(1)[0][0])

        # ---- 上下行运行时分核查（差 > 1 分钟即报）----
        # 旅行时间与方向无关 ⇒ 同一对相邻站（含跨洞的两端站）、同一时段的上下行典型运行时分
        # 应当一致；相差 2 分钟以上说明是**时刻表数据本身**的问题（逐时段估计的噪声不足以致此）。
        # 逐时段优先；某站对在任一时段都没有双向数据时，才退回跨时段兜底值核对（避免重复报）。
        _per_scheme_pairs: set[tuple[str, str]] = set()
        for (a_, b_, _d_, _s_) in est_dir:
            _per_scheme_pairs.add((a_, b_))
        _up_est = {(a_, b_, s_): v_ for (a_, b_, d_, s_), v_ in est_dir.items() if d_ == "up"}
        _dn_est = {(a_, b_, s_): v_ for (a_, b_, d_, s_), v_ in est_dir.items() if d_ == "down"}
        _diff_local: list[tuple[str, str, str, str, int, int]] = []
        for (a_, b_, s_), v_ in sorted(_up_est.items()):
            w_ = _dn_est.get((b_, a_, s_))
            if w_ is not None and abs(w_ - v_) > 1:
                _diff_local.append((id_, s_, a_, b_, v_, w_))
        for (a_, b_), v_ in sorted(min_time_list.items()):
            if (a_, b_) in _per_scheme_pairs or (b_, a_) in _per_scheme_pairs:
                continue                     # 已有逐时段结论，避免重复报告
            w_ = min_time_list.get((b_, a_))
            if w_ is not None and abs(w_ - v_) > 1:
                _diff_local.append((id_, "跨时段兜底", a_, b_, v_, w_))
        if _diff_local:
            RUNTIME_DIFFS.extend(_diff_local)

        def line_min(st1: str, st2: str, sche: str | None = None) -> int | None:
            """取相邻站的典型运行时分；优先**该时段**估值，再试反方向，最后跨时段兜底
            （旅行时间与方向无关，双向估计应当一致）"""
            if sche is not None:
                if (st1, st2, sche) in min_time_sched:
                    return min_time_sched[(st1, st2, sche)]
                if (st2, st1, sche) in min_time_sched:
                    return min_time_sched[(st2, st1, sche)]
            if (st1, st2) in min_time_list:
                return min_time_list[(st1, st2)]
            if (st2, st1) in min_time_list:
                return min_time_list[(st2, st1)]
            return None

        result: list[dict[str, list[dict[str,]]]] = [{}, {}]
        train_id = 0
        sche_types = {k for val in time_dict.values() for key, v in val.items() if key in {"up", "down"} for k in v.keys()}
        for i, direc in enumerate(("up", "down")):
            seq = stations[i]
            n = len(seq)
            if id_ in ring_lines:
                # ---- 大环（闭环线路）：一条车次 = 一环（一趟），不跨环缝续圈 ----
                # （不套用直线线路的终点折返/延伸逻辑 —— 环线无终点）
                for sche_type in sorted(sche_types):
                    trains = gen_ring_direction(seq, direc, sche_type, time_dict, line_min, pause_sets[i], train_id)
                    if trains:
                        result[i][sche_type] = trains
                        train_id += len(trains)
                    _tot = sum(len(time_dict.get(st, {}).get(direc, {}).get(sche_type, []) or []) for st in seq)
                    _cov = sum(len(t["stations"]) for t in trains)
                    stats["isolated"] += max(_tot - _cov, 0)
                    stats["src"] += _tot
                    stats["linked"] += _cov
                continue
            for sche_type in sorted(sche_types):
                # 各站该方向该时段的时刻表（已排序）
                times = []
                for st in seq:
                    lst = time_dict.get(st, {}).get(direc, {}).get(sche_type, []) if st is not None else []
                    times.append(sorted(lst))

                # ---- 第一步：相邻站合并 ----
                # 将 st1 与 st2 间时间差约为运行时分（众数 ±1 分钟，待避站可放宽）的时刻配对，
                # 并删除已配对时刻
                out_link = {}               # (站序号, 时刻) -> (下一站序号, 时刻)
                target_used = [set() for _ in range(n)]  # 各站已被配对（作为目标）的时刻

                # 无数据站（该方向无任何时刻）＝ 封站/数据缺失：列车直接通过不停。
                # 计算“下一个有数据的站”及跨过无数据站的直达运行时分，供本步跳连。
                has_data = [bool(times[k]) for k in range(n)]
                next_data = [None] * n
                nxt = None
                for k in range(n - 1, -1, -1):
                    next_data[k] = nxt
                    if has_data[k]:
                        nxt = k
                for k in range(n - 1):
                    if not has_data[k]:
                        continue
                    k2 = k + 1
                    if has_data[k2]:
                        m = line_min(seq[k], seq[k2], sche_type)
                        # 窗口 [m-1, m+2]：m 量级 3~6 分钟时 [m-1, m+1] 太紧，
                        # 会把“停站时长波动 1 分钟”的真实后继挤出窗口（待避站再放宽 PAUSE_SLACK）
                        hi_w = m + (PAUSE_SLACK if seq[k2] in pause_sets[i] else 2) if m else None
                    else:
                        # 下一站无数据（封站改造／中间站无时刻表，如 M1 八角游乐园）：
                        # **忽略这些站**，直接跨到其后第一个有数据的站。跨洞两端站的运行时
                        # 分已在上面的「洞口估值」段按相邻站估好，这里与普通相邻站同一口径：
                        # 窗口 [m-1, m+2]（待避站再放宽）。旧实现用距离法兜底得到 m=2、
                        # 窗口 [1,3]，装不下真实 5~6 分钟的跨洞运行时分 ⇒ 车次在洞两侧断成两条。
                        k2 = next_data[k]
                        if k2 is None:
                            continue
                        est = line_min(seq[k], seq[k2], sche_type)
                        if est is None:
                            # 跨洞运行时分也估不出来（如两端站有一侧缺坐标）：退回距离法兜底
                            # （对两站直接取众数会被 d=1 的跨车次巧合污染，见上）
                            if seq[k] in pos and seq[k2] in pos:
                                est = max(2, round(hav_dist(pos[seq[k]], pos[seq[k2]]) * line_sec_per_km / 60))
                            else:
                                est = 3
                        m, hi_w = est, est + (PAUSE_SLACK if seq[k2] in pause_sets[i] else 2)
                    # 贪心「源按 t1 升序、各取窗口内最早未被占用的 t2」＝窗口区间二部图上的
                    # **最大匹配**，且天然**保序**（t1 增 ⇒ t2 增）——正是车次链需要的结构。
                    # 实测（M5 down weekday）它比「按 |d-m| 最近优先」多配 1~9% 的来源时刻：
                    # 最近优先在密集时刻下会把邻居的后继抢走，反而留下无后继的孤立源。
                    for t1 in times[k]:
                        j = bisect.bisect_left(times[k2], t1 + max(m - 1, 1))
                        while j < len(times[k2]) and times[k2][j] <= t1 + hi_w:
                            if times[k2][j] not in target_used[k2]:
                                out_link[(k, t1)] = (k2, times[k2][j])
                                target_used[k2].add(times[k2][j])
                                break
                            j += 1
                    # 自检：本站有多少来源时刻没配上后继（配对失败率高的区间＝估值可疑）
                    stats["src"] += len(times[k])
                    _linked = sum(1 for t1 in times[k] if (k, t1) in out_link)
                    stats["linked"] += _linked
                    if m and len(times[k]) >= 3 and _linked == 0:
                        stats["dead_pairs"] += 1

                # ---- 第二步：跨站车次（越行/通过不停车）----
                # 只允许跳过 1~2 站（k2-k ≤ 3）：长线路（如贯通后的 M1 36 站）上若放开
                # 跨十几站的配对，松散的累计窗口（每跳 ±1 分钟）会把断链残时刻误拼成
                # “复兴门→土桥”式的跨城假快车。
                for k in range(n - 2):
                    for t1 in times[k]:
                        if (k, t1) in out_link:
                            continue
                        for k2 in range(k + 2, min(n, k + 4)):
                            # 累计运行时分，允许每跳一站再浮动 ±1 分钟
                            expected = 0
                            valid = True
                            for j in range(k, k2):
                                m = line_min(seq[j], seq[j + 1], sche_type)
                                if m is None:
                                    valid = False
                                    break
                                expected += m
                            if not valid:
                                continue
                            slack = k2 - k
                            for t2 in times[k2]:
                                if t2 in target_used[k2]:
                                    continue
                                d = t2 - t1
                                if d < max(expected - slack, 1):
                                    continue
                                if d > expected + slack:
                                    break
                                out_link[(k, t1)] = (k2, t2)
                                target_used[k2].add(t2)
                                break
                            if (k, t1) in out_link:
                                break

                # ---- 链成完整车次（含区间车：中途站始发/终到）----
                incoming = {}
                for (k, t1), (k2, t2) in out_link.items():
                    incoming[(k2, t2)] = (k, t1)
                starts = [(k, t) for k in range(n) for t in times[k] if (k, t) not in incoming]
                starts.sort(key=lambda x: (x[0], x[1]))
                for k, t in starts:
                    chain = [(k, t)]
                    cur = (k, t)
                    while cur in out_link:
                        cur = out_link[cur]
                        chain.append(cur)
                    if len(chain) < 2:
                        stats["isolated"] += 1
                        continue    # 孤立时刻不成车次

                    # ---- 终点处理：折返匹配 + 运行时分推算 ----
                    # 列车循环运行：到终点/折返站后大多调向发车（小部分进停车场/停车线），
                    # 所以“终点站反向发车时刻 - 折返时长”可推得到站时刻；折返匹配同时用于
                    # 判定该车次是正线终点折返（大交路，延伸至终点）还是中途折返（小交路）/
                    # 进停车场（无折返匹配，如末班车）。
                    k_end = chain[-1][0]
                    T = chain[-1][1]
                    tail = []                        # [(站序号, 推算时刻)]
                    short_turn_st = None
                    if k_end < n - 1 and all(not times[kk] for kk in range(k_end + 1, n)):
                        rev = "down" if i == 0 else "up"
                        # 1) 推算到正线终点的到达时刻（逐段累计典型运行时分）
                        t_est = T
                        legs = []                    # [(站序号, 该段运行时分)]
                        ok = True
                        for kk in range(k_end, n - 1):
                            m = line_min(seq[kk], seq[kk + 1], sche_type)
                            if m is None:
                                ok = False
                                break
                            t_est += m
                            legs.append((kk + 1, m))
                        # 2) 正线终点折返匹配：反向发车 D 满足 到站+3 ≤ D ≤ 到站+12
                        #    ⚠️ 折返匹配必须落在**尾部实际算得出的最深一站** Z 上，而不是 seq[n-1]：
                        #    正线终点之后常常还挂着无时刻表站（M1 下行 苹果园 之后的福寿岭 尚未
                        #    开通，tracks.json 里福寿岭就在末位），按 seq[n-1] 取会拿到空表 ⇒ 永远
                        #    匹配不上 ⇒ 真正跑到正线终点的车次被误判成「未折返」，苹果园从车次里
                        #    凭空消失。Z 由已算出的 legs 决定（legs 为空时退回 seq[n-1]）。
                        Z = legs[-1][0] if legs else (n - 1)
                        term_d = None
                        if Z > k_end:
                            rev_list = time_dict.get(seq[Z], {}).get(rev, {}).get(sche_type, [])
                            cand = [D for D in rev_list if TURN_MIN <= D - t_est <= TURN_MAX]
                            if cand:
                                term_d = min(cand, key=lambda D: abs(D - t_est - (TURN_MIN + TURN_MAX) // 2))
                        if term_d is not None:
                            # 大交路：确有反向折返 ⇒ 该车次跑到正线终点 Z，延伸到 Z。
                            # ⚠️ 折返匹配**只用来判定「到没到 Z」**，不用来反推时刻：
                            # 反推要假设一个折返时长（旧实现取 (3+12)//2=7 分钟），那是拿
                            # 常数去拟合数据。到站时刻一律由相邻站间运行时分累计得到
                            # （legs 的最后一段正是「到 Z」那一段，其时分来自时刻表）。
                            tt = T
                            for kk, m in legs:
                                tt += m
                                tail.append((kk, tt))
                        else:
                            # 反向折返匹配不上（可能是小交路/进停车场，也可能是正线终点反向
                            # 数据缺失——如金安桥上行 16:18 后截断）。小交路标记只依据
                            # short_end 声明；未声明的按**已算出的**相邻站间时分兜底延伸：
                            # legs 可能只是部分腿（尾部还挂着无时刻表站，有一段算不出时分），
                            # 此时停在算得出的最后一站（旧实现要求全部腿都算得出、否则整段放弃）。
                            if seq[k_end] in short_end_sets[i]:
                                short_turn_st = seq[k_end]       # 声明的小交路终点
                            elif legs:
                                tt = T
                                for kk, m in legs:
                                    tt += m
                                    tail.append((kk, tt))
                    elif k_end < n - 1:
                        # 链在中间站断（其后仍有数据）。**列车的终点只有两种：小交路折返站
                        # 或线路两端** ⇒ 链末落在中间站时，该站必然是小交路折返站，直接标记。
                        # （旧实现只在 short_end 声明里查 ⇒ 声明不全时真实折返站一律漏标；
                        # 而反向折返匹配在中间站命中率 91%、判别力太弱，也不适合作判据。）
                        short_turn_st = seq[k_end]
                    # ---- 越行/快车识别：车次链跳站（通过不停车）----
                    max_gap = max((chain[j + 1][0] - chain[j][0] for j in range(len(chain) - 1)), default=0)
                    is_express = max_gap >= 3

                    # ---- 链 -> 站点列表：跨过的「无时刻表中间站」（封站改造/缺数据，如 M1
                    # 八角游乐园）**一律补进站点列表**，按站间距插值给时刻并标 stop:false
                    # （前端据此渲染为“通过不停车”，dwell=0 直接划过）----
                    def chain_stops(chain_):
                        res = []
                        for idx in range(len(chain_)):
                            k, t = chain_[idx]
                            res.append((k, t, None))
                            if idx + 1 < len(chain_):
                                k2, t2 = chain_[idx + 1]
                                # 中间全部无数据（封站/缺失）⇒ 补站。
                                # ⚠️ 旧实现还要 t2-t ≥ 站数（1 分钟分辨率下放得下才补），
                                # 时距过紧时**整站丢弃** ⇒ 该站在车次里凭空消失（站表里看不到
                                # 八角游乐园）。现改为一律补站：时距够就用严格递增时刻，不够
                                # （数据本身只有 1 分钟分辨率）时允许并列同一分钟。
                                if k2 - k > 1 and all(not times[kk] for kk in range(k + 1, k2)):
                                    seg = []
                                    for kk in range(k, k2):
                                        if seq[kk] in pos and seq[kk + 1] in pos:
                                            seg.append(hav_dist(pos[seq[kk]], pos[seq[kk + 1]]))
                                        else:
                                            seg.append(1.0)
                                    tot = sum(seg) or 1.0
                                    strict = t2 - t >= k2 - k
                                    acc, pt = 0.0, t
                                    for kk in range(k + 1, k2):
                                        acc += seg[kk - k - 1]
                                        tt = round(t + (t2 - t) * acc / tot)
                                        tt = max(tt, pt + 1) if strict else max(tt, pt)
                                        tt = min(tt, t2 - 1) if strict else min(tt, t2)
                                        pt = tt
                                        res.append((kk, tt, {"stop": False, "estimated": True}))
                        return res

                    train_id += 1
                    stops = [{"station": seq[kk], "time": tt, **(ex or {})} for kk, tt, ex in chain_stops(chain)]
                    stops += [{"station": seq[kk], "time": tt, "estimated": True} for kk, tt in tail]
                    train: dict[str, object] = {"id": train_id, "stations": stops}
                    if short_turn_st:
                        train["short_turn"] = short_turn_st
                    if is_express:
                        train["express"] = True
                    result[i].setdefault(sche_type, []).append(train)

        with open(getFilePath("train", f"{id_}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

    # 自检汇总（原实现是静默 `continue`，孤立时刻数无人知晓）
    if stats["src"]:
        tqdm.write("  [自检] 孤立时刻=%d  配对成功率=%.1f%%  零链接站间对=%d"
                   % (stats["isolated"], 100.0 * stats["linked"] / stats["src"], stats["dead_pairs"]))
    # 上下行运行时分核查报告：直接打印到输出（不落盘）
    if RUNTIME_DIFFS:
        tqdm.write("  [核查] 上下行运行时分不一致（>1 分钟）共 %d 处：" % len(RUNTIME_DIFFS))
        for _r in RUNTIME_DIFFS:
            tqdm.write("      %-5s %-12s %s <-> %s：上行 %d / 下行 %d 分钟（差 %d）"
                       % (_r[0], _r[1], _r[2], _r[3], _r[4], _r[5], abs(_r[4] - _r[5])))
    else:
        tqdm.write("  [核查] 上下行运行时分不一致（>1 分钟）：0 处")