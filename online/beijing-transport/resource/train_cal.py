import os
import json
import math
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

if __name__ == "__main__":
    if not os.path.exists(getFilePath("train")):
        os.mkdir(getFilePath("train"))
    with open(getFilePath("tracks.json"), "r", encoding="utf-8") as f:
        tracks_config = json.load(f)
    station_data = {name: value["main"] for name, value in tracks_config.items() if "main" in value}
    station_pos = {name: {st["n"]: tuple(st["sl"]) for st in value.get("stations", []) if "n" in st and "sl" in st}
                   for name, value in tracks_config.items() if "main" in value}
    for name, directions in station_data.items():
        station_data[name] = [[st["n"] for st in direction if "n" in st] for direction in directions]
    for time_file in os.listdir(getFilePath("timetable")):
        id_ = os.path.splitext(time_file)[0]
        if id_ in station_data and time_file not in {"M6.json"}:
            stations = station_data[id_]
            with open(getFilePath("timetable", time_file), "r", encoding="utf-8") as f:
                timetable_data = json.load(f)
            time_dict: dict[str, dict[str, str|dict[str, list[int]]]] = {}
            for st in timetable_data["stations"]:
                for key, value in st.items():
                    if isinstance(value, dict):
                        for k, v in value.items():
                            if isinstance(v, dict):
                                time_list = [item for items in v.values() for item in items]
                                value[k] = time_list
                    time_dict.setdefault(st["station_name"], {})[key] = value
            min_time_list: dict[tuple[str, str], int] = {}
            pos = station_pos.get(id_, {})
            for i, direc in enumerate(("up", "down")):
                for j in range(1, len(stations[i])):
                    st1, st2 = stations[i][j - 1], stations[i][j]
                    st_t1, st_t2 = time_dict[st1].get(direc, {}), time_dict[st2].get(direc, {})
                    if sum(len(st_) for st_ in st_t1.values()) > 0 and sum(len(st_) for st_ in st_t2.values()) > 0:
                        # 用站间距推算“合理站间运行时分”区间（最低速度按 10 km/h），只统计区间内的差值取众数：
                        # 整表平移产生的巧合差值（如 23/50 分钟）不会混入，同时兼容 CAE/DAE 等大站间距线路。
                        if st1 in pos and st2 in pos:
                            d_km = hav_dist(pos[st1], pos[st2])
                            hi = max(1, math.ceil(d_km / 10 * 60))
                        else:
                            hi = 30    # 无坐标时的兜底范围
                        diffs = [t2 - t1 for key in st_t1 for t1 in st_t1[key] for t2 in st_t2[key] if 1 <= t2 - t1 <= hi]
                        if diffs:
                            # 取“最常见运行时分（众数）”而非全局最小值：时刻表里混有区间车、不同车次的巧合时刻，
                            # 全局最小会被跨车次的巧合污染，导致 {min, min+1} 窗口完全错配；众数才是真实旅行时间。
                            cnt = Counter(diffs)
                            m = max(cnt.values())
                            min_time_list[(st1, st2)] = min(d for d, c in cnt.items() if c == m)
            # 双方向核查：同一对站的上下行运行时分应一致（起终点站仅单方向有数据，无法核查）
            for (st1, st2), t in list(min_time_list.items()):
                if (st2, st1) in min_time_list and abs(min_time_list[(st2, st1)] - t) > 1:
                    print(f"  警告 {id_} {st1}<->{st2}：上下行运行时分不一致 "
                          f"({t} vs {min_time_list[(st2, st1)]})，请检查时刻表数据")

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
                for sche_type in sche_types:
                    # 各站该方向该时段的时刻表（已排序）
                    times = []
                    for st in seq:
                        lst = time_dict[st].get(direc, {}).get(sche_type, []) if st is not None else []
                        times.append(sorted(lst))

                    # ---- 第一步：相邻站合并 ----
                    # 将 st1 与 st2 间时间差约为运行时分（众数 ±1 分钟）的时刻配对，并删除已配对时刻
                    out_link = {}               # (站序号, 时刻) -> (下一站序号, 时刻)
                    target_used = [set() for _ in range(n)]  # 各站已被配对（作为目标）的时刻
                    for k in range(n - 1):
                        m = line_min(seq[k], seq[k + 1])
                        if m is None:
                            continue
                        for t1 in times[k]:
                            for t2 in times[k + 1]:
                                if t2 in target_used[k + 1]:
                                    continue
                                d = t2 - t1
                                if d < max(m - 1, 1):
                                    continue
                                if d > m + 1:
                                    break            # times 有序，超出窗口即可停止
                                out_link[(k, t1)] = (k + 1, t2)
                                target_used[k + 1].add(t2)
                                break

                    # ---- 第二步：跨站车次（跳过中间站不停，未来数据可能包含） ----
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

                    # ---- 链成完整车次（含区间车：中途站始发/终到） ----
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
                        # ---- 补全终点：末站无时刻表时用典型站间时分(min_time_list)推算 ----
                        k_end = chain[-1][0]
                        tail = []                       # [(站序号, 推算时刻)]
                        if k_end < n - 1:
                            if all(not times[kk] for kk in range(k_end + 1, n)):
                                t_est = chain[-1][1]
                                ok = True
                                for kk in range(k_end, n - 1):
                                    m = line_min(seq[kk], seq[kk + 1])
                                    if m is None:
                                        ok = False
                                        break
                                    t_est += m
                                    tail.append((kk + 1, t_est))
                                if not ok:
                                    tail = []
                        train_id += 1
                        stops = [{"station": seq[kk], "time": tt} for kk, tt in chain]
                        stops += [{"station": seq[kk], "time": tt, "estimated": True} for kk, tt in tail]
                        train: dict[str, object] = {"id": train_id, "stations": stops}
                        result[i].setdefault(sche_type, []).append(train)

            with open(getFilePath("train", f"{id_}.json"), "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)