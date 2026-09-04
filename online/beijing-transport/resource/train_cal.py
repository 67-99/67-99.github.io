import os
import json
import math
from tqdm import tqdm
from collections import Counter

def getFilePath(*path: list[str] | str):
    return os.path.join(os.path.dirname(__file__), *path)

def hav_dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    """两站经纬度（度）间的球面距离，单位 km"""
    R = 6371.0
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

def estimate_run_time(l1: list[int], l2: list[int], hi: int) -> int | None:
    """从两站时刻列表估算典型站间运行时分。

    混合策略：
    1) 若“全局众数”明显占优（计数 ≥ 次高计数的 1.2 倍），直接取众数——此时同列车
       运行时分簇占绝对多数（如 M9 六里桥东→北京西站，真实 5 分钟 vs 巧合 19 分钟）；
    2) 否则取“差值直方图的最小显著局部峰”（≥30% 最大计数的第一个峰）——众数被
       高密度行车下整表平移/跨车次巧合差值（5/10/15 分钟）打成平手时（如
       军事博物馆→北京西站 25 vs 4 几乎同票），第一个显著峰才是真实运行时分。
    """
    diffs = [b - a for a in l1 for b in l2 if 1 <= b - a <= hi]
    if not diffs:
        return None
    cnt = Counter(diffs)
    maxc = max(cnt.values())
    mode_v = min(d for d, c in cnt.items() if c == maxc)
    second = max(c for d, c in cnt.items() if c != maxc) if len(cnt) > 1 else 0
    if second > 0 and maxc >= second * 1.2:
        return mode_v
    for d in range(1, hi + 1):
        c = cnt.get(d, 0)
        if c < maxc * 0.3:
            continue
        if c >= cnt.get(d - 1, 0) and c >= cnt.get(d + 1, 0):
            return d
    return mode_v

# 待避站匹配窗口的额外放宽（分钟）：慢车在待避站（如 M6 常营/通运门）临时停车
# 2~2.5 分钟再发车，导致“进入待避站”区间的运行时分比众数大 2~3 分钟；
# 放宽该方向的匹配窗口可避免待避车次链在此断开（轻微代价：高密度时段可能与
# 下一班次错配，但对整体链的连贯性利大于弊）。
PAUSE_SLACK = 3

# 折返时长范围（分钟）：列车循环运行，到达大小交路终点后大多调向发车（小部分进停车场/
# 停车线），因此“终点站反向发车时刻 - 折返时长”可推得大致的到站时刻。折返匹配同时用于
# 判定某车次确实在正线终点折返（大交路，可延伸至终点）还是中途折返（小交路）/进停车场。
TURN_MIN, TURN_MAX = 3, 12

# 闭环线路单列车最多跨过的“整圈”数（车次按无前驱时刻逐站续行，可自然跑多圈；
# 此上限仅作安全护栏，防止个别误配对把一整天时刻吞进同一条链）。
RING_MAX_LAPS = 8

def gen_ring_direction(seq, direc, sche_type, time_dict, min_time_list, pause_set, start_id=0):
    """闭环线路（tracks.json 中 "loop": true）一个方向一个时段的列车生成。

    与直线线路的关键差异：
    1) 序列是“整环缺一环缝”的列表 —— 除相邻站对（k, k+1）外，还配对“环缝”
       （末站 -> 首站），环缝运行时分已在主流程用全线速度中位数估算进 min_time_list；
    2) 列车由无前驱的时刻出发、沿环逐站续行，**可以跨环缝连续绕多圈**（时刻严格递增，
       不会成环死循环），直到数据结束；
    3) 不套用直线线路的“终点折返匹配 / 推算延伸 / 小交路标记” —— 环线列车无终点，
       到站时刻耗尽即自然结束。
    """
    n = len(seq)
    times = [sorted(time_dict[st].get(direc, {}).get(sche_type, [])) if st in time_dict else []
             for st in seq]

    # 环线发车间隔常与站间运行时分同量级（且出入库/停站时长有波动），配对窗口比直线
    # 线路放宽 1 分钟（m-1 .. m+2），减少在个别“瓶颈站对”上整链断裂。
    LOOP_WIN_LO, LOOP_WIN_HI = -1, 2

    # ---- 第一步：相邻站合并（含环缝 末站->首站）----
    out_link = {}                      # (站序号, 时刻) -> (下一站序号, 时刻)
    target_used = [set() for _ in range(n)]
    for k in range(n):
        k2 = (k + 1) % n               # k == n-1 时为环缝（回到首站，允许跨圈续行）
        m = min_time_list.get((seq[k], seq[k2]))
        if m is None:
            continue
        hi_w = m + (PAUSE_SLACK if seq[k2] in pause_set else LOOP_WIN_HI)
        for t1 in times[k]:
            for t2 in times[k2]:
                if t2 in target_used[k2]:
                    continue
                d = t2 - t1
                if d < max(m + LOOP_WIN_LO, 1):
                    continue
                if d > hi_w:
                    break            # times 有序，超出窗口即可停止
                out_link[(k, t1)] = (k2, t2)
                target_used[k2].add(t2)
                break

    # 不做直线线路的“跨站越行”配对：站间运行时分与发车间隔同量级时，跨多站的配对窗口
    # 很宽（每跳 ±1 分钟累计），会把断链后残剩的时刻误拼成“跳十几站”的假快车。
    # （如真需要环线越行快车，可再按 pause/越行站声明单独实现。）

    # ---- 链成车次 ----
    incoming = {}
    for (k, t1), (k2, t2) in out_link.items():
        incoming[(k2, t2)] = (k, t1)
    starts = [(k, t) for k in range(n) for t in times[k] if (k, t) not in incoming]
    starts.sort(key=lambda x: (x[0], x[1]))
    max_stops = RING_MAX_LAPS * n     # 安全护栏：单个车次最多约 RING_MAX_LAPS 圈
    trains = []
    for k, t in starts:
        chain = [(k, t)]
        cur = (k, t)
        while cur in out_link and len(chain) < max_stops:
            cur = out_link[cur]
            chain.append(cur)
        if len(chain) < 2:
            continue                 # 孤立时刻不成车次
        # 越行/快车识别（跨圈处首尾相接不算跳站）
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
    station_data = {name: value["main"] for name, value in tracks_config.items() if "main" in value}
    station_pos = {name: {st["n"]: tuple(st["sl"]) for st in value.get("stations", []) if "n" in st and "sl" in st}
                   for name, value in tracks_config.items() if "main" in value}
    for name, directions in station_data.items():
        station_data[name] = [[st["n"] for st in direction if "n" in st] for direction in directions]
    for time_file in tqdm(os.listdir(getFilePath("timetable")),leave=False):
        id_ = os.path.splitext(time_file)[0]
        if id_ not in station_data or time_file in {}:
            continue
        stations = station_data[id_]
        with open(getFilePath("timetable", time_file), "r", encoding="utf-8") as f:
            timetable_data = json.load(f)
        time_dict: dict[str, dict[str, str|dict[str, list[int]]]] = {}
        for st in timetable_data["stations"]:
            for key, value in st.items():
                if isinstance(value, dict):
                    for k, v in value.items():
                        if isinstance(v, dict):
                            value[k] = sorted({x for items in v.values() for x in items})
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

        # ---- 典型站间运行时分 ----
        min_time_list: dict[tuple[str, str], int] = {}
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
                    st_t1, st_t2 = time_dict[st1].get(direc, {}), time_dict[st2].get(direc, {})
                    l1 = sorted(x for v in st_t1.values() for x in v)
                    l2 = sorted(x for v in st_t2.values() for x in v)
                    if not l1 or not l2:
                        continue
                    if st1 in pos and st2 in pos:
                        d_km = hav_dist(pos[st1], pos[st2])
                        hi = max(1, math.ceil(d_km / 10 * 60))
                    else:
                        hi = 30    # 无坐标时的兜底范围
                    est = estimate_run_time(l1, l2, hi)
                    if est is not None:
                        min_time_list[(st1, st2)] = est
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
        # 双方向核查：同一对站的上下行运行时分应一致（起终点站仅单方向有数据，无法核查）
        for (st1, st2), t in sorted(min_time_list.items()):
            if (st2, st1) in min_time_list and abs(min_time_list[(st2, st1)] - t) > 1:
                tqdm.write(f"  警告 {id_} {st1}<->{st2}：上下行运行时分不一致 ({t} vs {min_time_list[(st2, st1)]})，请检查时刻表数据")

        def line_min(st1: str, st2: str) -> int | None:
            """取相邻站的典型运行时分（众数）；缺失时尝试反方向（旅行时间与方向无关）"""
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
                # ---- 大环（闭环线路）：列车绕整环运行，可跨“环缝”连续跑多圈 ----
                # （不套用直线线路的终点折返/延伸逻辑 —— 环线无终点）
                for sche_type in sorted(sche_types):
                    trains = gen_ring_direction(seq, direc, sche_type, time_dict, min_time_list,
                                                pause_sets[i], train_id)
                    if trains:
                        result[i][sche_type] = trains
                        train_id += len(trains)
                continue
            for sche_type in sorted(sche_types):
                # 各站该方向该时段的时刻表（已排序）
                times = []
                for st in seq:
                    lst = time_dict[st].get(direc, {}).get(sche_type, []) if st is not None else []
                    times.append(sorted(lst))

                # ---- 第一步：相邻站合并 ----
                # 将 st1 与 st2 间时间差约为运行时分（众数 ±1 分钟，待避站可放宽）的时刻配对，
                # 并删除已配对时刻
                out_link = {}               # (站序号, 时刻) -> (下一站序号, 时刻)
                target_used = [set() for _ in range(n)]  # 各站已被配对（作为目标）的时刻
                for k in range(n - 1):
                    m = line_min(seq[k], seq[k + 1])
                    if m is None:
                        continue
                    hi_w = m + (PAUSE_SLACK if seq[k + 1] in pause_sets[i] else 1)
                    for t1 in times[k]:
                        for t2 in times[k + 1]:
                            if t2 in target_used[k + 1]:
                                continue
                            d = t2 - t1
                            if d < max(m - 1, 1):
                                continue
                            if d > hi_w:
                                break            # times 有序，超出窗口即可停止
                            out_link[(k, t1)] = (k + 1, t2)
                            target_used[k + 1].add(t2)
                            break

                # ---- 第二步：跨站车次（越行/通过不停车，如 M6 金台路→郝家府）----
                for k in range(n - 2):
                    for t1 in times[k]:
                        if (k, t1) in out_link:
                            continue
                        for k2 in range(k + 2, n):
                            # 累计运行时分，允许每跳一站再浮动 ±1 分钟
                            expected = 0
                            valid = True
                            for j in range(k, k2):
                                m = line_min(seq[j], seq[j + 1])
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
                            m = line_min(seq[kk], seq[kk + 1])
                            if m is None:
                                ok = False
                                break
                            t_est += m
                            legs.append((kk + 1, m))
                        # 2) 正线终点折返匹配：反向发车 D 满足 到站+3 ≤ D ≤ 到站+12
                        term_d = None
                        if ok:
                            rev_list = time_dict[seq[n - 1]].get(rev, {}).get(sche_type, [])
                            cand = [D for D in rev_list if TURN_MIN <= D - t_est <= TURN_MAX]
                            if cand:
                                term_d = min(cand, key=lambda D: abs(D - t_est - (TURN_MIN + TURN_MAX) // 2))
                        if term_d is not None:
                            # 大交路：在正线终点折返 => 延伸到正线终点。
                            # 中间站按典型运行时分累计；末站到站时刻优先用实测运行时分（t_est，
                            # 精确且保持单调），折返反推（D - 折返时长）作为运行时分缺失时的兜底。
                            tt = T
                            for kk, m in legs:
                                tt += m
                                tail.append((kk, tt))
                            if not ok:
                                arr = term_d - (TURN_MIN + TURN_MAX) // 2
                                arr = max(arr, T + 1)             # 保持单调
                                tail[-1] = (n - 1, arr)
                        else:
                            # 未在正线终点折返（可能是小交路/进停车场，也可能是正线终点
                            # 反向数据缺失——如金安桥上行 16:18 后截断）。小交路标记只依据
                            # short_end 声明（反向折返匹配在密集数据下噪声太大，不作为依据）；
                            # 未声明的按典型运行时分兜底延伸到正线终点。
                            if seq[k_end] in short_end_sets[i]:
                                short_turn_st = seq[k_end]       # 声明的小交路终点
                            elif ok:
                                tt = T
                                for kk, m in legs:
                                    tt += m
                                    tail.append((kk, tt))
                    elif seq[k_end] in short_end_sets[i] and k_end < n - 1:
                        # 链末站是声明的小交路终点（其后仍有数据、链在此断）：标记
                        short_turn_st = seq[k_end]
                    # ---- 越行/快车识别：车次链跳站（通过不停车）----
                    max_gap = max((chain[j + 1][0] - chain[j][0] for j in range(len(chain) - 1)), default=0)
                    is_express = max_gap >= 3

                    train_id += 1
                    stops = [{"station": seq[kk], "time": tt} for kk, tt in chain]
                    stops += [{"station": seq[kk], "time": tt, "estimated": True} for kk, tt in tail]
                    train: dict[str, object] = {"id": train_id, "stations": stops}
                    if short_turn_st:
                        train["short_turn"] = short_turn_st
                    if is_express:
                        train["express"] = True
                    result[i].setdefault(sche_type, []).append(train)

        with open(getFilePath("train", f"{id_}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)