# -*- coding: utf-8 -*-
"""时刻表数据质量检查工具（聚合报告版）

思路：越行车（快车）是少数，绝大多数列车每站都停 —— 同一方向、同一时段内
各站的“时刻数/每小时车次”应高度一致。任何明显偏离都可疑（终点站到达方向除外）。

检查项与判定：
  [时]  时间数值错误（小时块归属/乱序/越界）——时间转换或抄写错误
  [重]  重复时刻（跨小时块/块内）
  [缺]  某站某小时整段没车而邻站有 —— 该时段缺车；或时刻总数远少于邻站
  [多]  某站时刻总数远多于邻站 —— 整表重复/误抄入他站数据
  [键]  缺方向键 / 站名与 tracks 不一致
说明：小交路折返站之后、越行通过站的时刻数会合法偏少；两站对不上时
报告会同时列出“A 多”与“B 缺”两种可能，需结合原始图判断。

用法：python resource/data_check.py [线路ID...]    （不带参数=全部线路）
"""
import json
import os
import sys
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8")

def getFilePath(*path):
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), *path)

def estimate_run_time(l1, l2, hi=30):
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

def hour_belong(h: int, t: int) -> int:
    """时刻 t（绝对分钟）按小时块归属应写在哪一小时；-1=非法/越界"""
    if 0 <= t <= 1559:
        return 0 if t < 60 or t >= 1440 else t // 60
    return -1

def main():
    only = sys.argv[1:]
    tracks = json.load(open(getFilePath("tracks.json"), encoding="utf-8"))
    lines = sorted(os.path.splitext(f)[0] for f in os.listdir(getFilePath("timetable"))
                   if f.endswith(".json"))
    if only:
        lines = [l for l in lines if l in only]

    grand = Counter()
    for line in lines:
        fn = getFilePath("timetable", f"{line}.json")
        raw = json.load(open(fn, encoding="utf-8"))
        short_end = raw.get("short_end") or {}
        pause = raw.get("pause") or {}
        rep = []     # 每行一条问题
        def add(severity, direc, sche, st, msg):
            rep.append((severity, direc, sche, st, msg))

        # td: {站: {方向: {sche: [原始时刻, 含重复]}}}
        # 防御：站名必须是字符串（数字/空/None 的站名不参与比较与聚合，仅提示，不崩溃）；
        # 小时键必须能转成整数（个别键如 "full" 视为脏数据跳过）；时刻必须是整数。
        td = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        hour_raw = {}          # (站,方向,sche,hour) -> [时刻]
        for st in raw.get("stations", []):
            name = st.get("station_name")
            if not isinstance(name, str) or not name.strip():
                add("键", "-", "-", repr(name), "时刻表 station_name 不是有效字符串，已跳过")
                continue
            name = name.strip()
            for direc in ("up", "down"):
                blk = st.get(direc)
                if not isinstance(blk, dict):
                    continue
                for sche, v in blk.items():
                    if isinstance(v, dict):
                        for h, lst in v.items():
                            if not isinstance(lst, list):
                                continue
                            if not str(h).lstrip("-").isdigit():
                                add("键", direc, str(sche), name,
                                    f"时段键 {h!r} 不是小时数字，该时刻未纳入逐小时检查")
                                continue
                            hi = int(h)
                            vals = [x for x in lst if isinstance(x, int)]
                            td[name][direc][sche].extend(vals)
                            hour_raw[(name, direc, sche, hi)] = vals
                    elif isinstance(v, list):
                        td[name][direc][sche].extend(x for x in v if isinstance(x, int))
        seq = []
        if line in tracks and "main" in tracks[line]:
            main_ = tracks[line]["main"]
            # 线路不完整防御：main 不足两个方向 / 方向含无名站时仍不崩溃
            if isinstance(main_, list):
                seq = [[st["n"] for st in d if isinstance(st, dict) and "n" in st and st["n"]]
                       for d in main_ if isinstance(d, list)]
        track_sts = set(seq[0]) | (set(seq[1]) if len(seq) > 1 else set()) if seq else set()

        for s in sorted(track_sts - set(td)):
            add("键", "-", "-", s, "tracks 有站但时刻表无此站")
        for s in sorted(set(td) - track_sts):
            add("键", "-", "-", s, "时刻表有站但 tracks 无此站")

        # 每方向每sche
        dir_sches = set()
        for st, dd in td.items():
            for direc, sched in dd.items():
                for sche in sched:
                    dir_sches.add((direc, sche))
        for direc, sche in sorted(dir_sches):
            di = 0 if direc == "up" else 1
            if di >= len(seq):
                continue
            st_seq = [s for s in seq[di] if s in td]
            if not st_seq:
                continue
            n = len(st_seq)
            pause_set = set(pause.get(direc, []))
            end_term = st_seq[-1]          # 该方向的终点站（到达方向应为空/少）

            # ---- [时][重] 逐小时块 ----
            for s in st_seq:
                for h in range(24):
                    lst = hour_raw.get((s, direc, sche, h))
                    if lst is None:
                        continue
                    bad = defaultdict(list)      # 应属小时 -> 时刻列表
                    out = []
                    for t in lst:
                        belong = hour_belong(h, t)
                        if belong != h:
                            if belong >= 0:
                                bad[belong].append(t)
                            else:
                                out.append(t)
                    if bad:
                        parts = "、".join(f"{len(v)}个属{k}:00" for k, v in sorted(bad.items()))
                        add("时", direc, sche, s, f"小时块[{h}:00]含{sum(len(v) for v in bad.values())}个不属于该小时的时刻（{parts}，疑似整块错位/转换错误）")
                    for t in out:
                        add("时", direc, sche, s, f"小时块[{h}]越界时刻 {t}")
                    dup = {x: c for x, c in Counter(lst).items() if c > 1}
                    if dup:
                        add("重", direc, sche, s, f"小时块[{h}]内重复 {'、'.join(f'{x//60:02d}:{x%60:02d}×{c}' for x, c in list(dup.items())[:4])}")
            # ---- [重] 跨小时块重复（去重后仍多的站）----
            for s in st_seq:
                c = Counter(td[s][direc][sche])
                dup_all = sum(v - 1 for v in c.values() if v > 1)
                if dup_all >= 2:
                    ex = "、".join(f"{x//60:02d}:{x%60:02d}×{v}" for x, v in list(c.items())[:3] if v > 1)
                    add("重", direc, sche, s, f"共 {dup_all} 个重复时刻（如 {ex}）")

            # ---- [缺][多] 总量对比（越行少 => 各站应一致）----
            uniq = {s: len(set(td[s][direc][sche])) for s in st_seq}
            for idx, s in enumerate(st_seq):
                if s == end_term:
                    continue                     # 到达方向终点站无数据正常
                c = uniq[s]
                nb = []
                if idx > 0:
                    nb.append(uniq[st_seq[idx - 1]])
                if idx + 1 < n:
                    nb.append(uniq[st_seq[idx + 1]])
                if not nb:
                    continue
                nbmax = max(nb)
                if c == 0:
                    add("缺", direc, sche, s, f"时刻数为 0（邻站 {nbmax}）")
                elif c > nbmax * 1.5:
                    add("多", direc, sche, s, f"时刻数 {c} ≈ 邻站 {nbmax} 的 {c / max(nbmax,1):.1f} 倍（整表重复/误抄他站？）")
                elif c < min(nb) * 0.6 and nbmax > 10:
                    note = ""
                    se = set(short_end.get(direc, []))
                    if idx > 0 and st_seq[idx - 1] in se:
                        note = "（前站为小交路折返站，其后区间合法减少，但此幅度过大）"
                    add("缺", direc, sche, s, f"时刻数 {c} 远少于邻站 {nb}（{note}可能缺整段）")

            # ---- [缺] 分小时整段缺失（邻站该小时有车而本站无）----
            hour_of = defaultdict(list)
            for s in st_seq:
                for h in range(24):
                    lst = hour_raw.get((s, direc, sche, h)) or []
                    hour_of[(s, h)] = lst
            for idx, s in enumerate(st_seq):
                if s == end_term:
                    continue
                for h in range(5, 24):
                    if hour_of[(s, h)]:
                        continue
                    have = []
                    for o in (st_seq[idx - 1], st_seq[idx + 1] if idx + 1 < n else None):
                        if o and len(hour_of.get((o, h), [])) >= 5:
                            have.append(o)
                    if len(have) >= 1 and (idx == 0 or idx == n - 1 or len(have) == 2):
                        pass
                    # 邻站有一站>=5趟即可疑；终点站不算
                    if have:
                        add("缺", direc, sche, s, f"{h}:00-{h}:59 整段无车（邻站 {'、'.join(have)} 各有≥5趟）")

            # ---- 相邻首尾对匹配（终点站数据洞检测：起源站时刻应都能延续）----
            # 线路不完整时该方向可能只剩 1 个有数据车站（n < 2），无从配对，直接跳过。
            if n >= 2:
                for idx in (0, n - 2):
                    if idx < 0 or idx + 1 >= n:
                        continue          # n == 1 时 n - 2 == -1，防御
                    A = st_seq[idx]
                    B = st_seq[idx + 1]
                    if A == end_term or B == end_term:
                        pass
                    la = sorted(set(td[A][direc][sche]))
                    lb = sorted(set(td[B][direc][sche]))
                    m = estimate_run_time(la, lb)
                    if not la or not lb or m is None:
                        continue
                    slack = 1 if B not in pause_set else 4
                    no_next = sum(1 for a in la if not any(a + m - 1 <= b <= a + m + slack for b in lb))
                    no_prev = sum(1 for b in lb if not any(b - m - slack <= a <= b - m + 1 for a in la))
                    if no_next > max(4, len(la) * 0.15):
                        add("缺", direc, sche, A, f"有 {no_next}/{len(la)} 个时刻到 {B} 无后继（{B} 该时段缺车或 {A} 多车）")
                    if no_prev > max(4, len(lb) * 0.15):
                        add("缺", direc, sche, B, f"有 {no_prev}/{len(lb)} 个时刻来自 {A} 无前驱（{A} 该时段缺车或 {B} 多车）")

        # ---- 输出 ----
        if not rep:
            print(f"{line}: ✓ 未发现问题")
            continue
        kinds = Counter(r[0] for r in rep)
        print(f"\n===== {line}  共 {len(rep)} 项 {dict(kinds)} =====")
        # 按站聚合展示，同一站同类问题合并成一行
        by = defaultdict(list)
        for sev, direc, sche, st, msg in rep:
            by[(direc, sche, st)].append((sev, msg))
        for (direc, sche, st), items in sorted(by.items()):
            groups = defaultdict(list)
            for sev, msg in items:
                groups[sev].append(msg)
            parts = []
            for sev in ("时", "重", "缺", "多", "键"):
                if groups[sev]:
                    msgs = groups[sev]
                    if len(msgs) > 3 and sev == "缺" and "整段无车" in msgs[0]:
                        # 合并整段缺失的多个小时
                        hs = sorted(set(m.split(":")[0] for m in msgs if "整段无车" in m))
                        other = [m for m in msgs if "整段无车" not in m]
                        s = f"整段无车小时: {','.join(hs)}点"
                        parts.append(f"[{sev}]{s}" + (f"；{'；'.join(other)}" if other else ""))
                    else:
                        parts.append(f"[{sev}]{'；'.join(msgs[:3])}" + ("…" if len(msgs) > 3 else ""))
            print(f"  {direc} {sche} {st}: {'  '.join(parts)}")
        grand.update(kinds)
    print(f"\n===== 汇总（全部线路）=====")
    for k, v in grand.most_common():
        print(f"  {k}: {v}")
    print(f"  总计: {sum(grand.values())}")

if __name__ == "__main__":
    main()
