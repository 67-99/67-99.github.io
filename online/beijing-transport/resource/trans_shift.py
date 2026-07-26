import json
import os

def getFilePath(*path: list[str] | str):
    return os.path.join(os.path.dirname(__file__), *path)

if __name__ == "__main__":
    with open(getFilePath('shift.json'), 'r', encoding='utf-8') as f:
        shift_data = json.load(f)
    for name, commands in shift_data.items():
        path = getFilePath("temp", f"{name}.json") if os.path.exists(getFilePath("temp", f"{name}.json")) else (
            getFilePath("lines", f"{name}.json") if os.path.exists(getFilePath("lines", f"{name}.json")) else None
        )
        if not path:
            print("缺少线路", name)
            continue
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for op, *param in commands:
            if op == "prior":  # prior, idx, prior
                idx, prior = param
                data["points"][idx][0] = prior
                print(f"{name}[{idx}]层级变换为{prior}")
            elif op == "append":  # append, idx, [lat, lon]
                idx, point = param
                lat, lon = point
                data["points"][idx][1].append([lat, lon])
                print(f"{name}[{idx}]末尾新增{point}")
            elif op == "insert":  # insert, [idx, i], [lat, lon]
                pos, point = param
                lat, lon = point
                idx, i = pos
                data["points"][idx][1].insert(i, [lat, lon])
                print(f"{name}[{idx}]在{i}插入{point}")
            elif op == "shift":  # shift, [idx, [start, end]], Δ[lat, lon]
                pos, shift = param
                lat, lon = shift
                idx, pos = pos
                if len(pos) == 1:
                    i = pos[0]
                    data["points"][idx][1][i][0] += lat
                    data["points"][idx][1][i][1] += lon
                    print(f"{name}[{idx}][{i}]平移{shift}")
                else:
                    start, end = pos
                    if start > end:
                        end, start = start, end
                    for i in range(start, end):
                        data["points"][idx][1][i][0] += lat
                        data["points"][idx][1][i][1] += lon
                    print(f"{name}[{idx}][{start}: {end}]平移{shift}")
            elif op == "split":  # insert, [[idx1, idx2, ...], [name1, name2, ...], ...]
                point_groups = {}
                for idx, splits in enumerate(param):
                    seps, names = splits
                    if len(seps) < len(names):
                        seps.append(len(data["points"][idx][1]) - 1)
                    last_sep = 0
                    for sep, name in zip(seps, names):
                        point_groups.setdefault(name, []).append((data["points"][idx][0], data["points"][idx][1][last_sep: sep + 1]))
                        last_sep = sep
                for name_, points in point_groups.items():
                    output = {k: v for k, v in data.items() if k in {"name", "color"}}
                    output["id"] = name_
                    output["points"] = points
                    with open(getFilePath("lines", f"{name_}.json"), 'w', encoding='utf-8') as f:
                        json.dump(output, f, indent=1)
                    print(f"{name}分离出{len(points)}组共长{sum(len(p[1]) for p in points)}的文件{name_}")
                break
        else:
            if "path" in data:
                data.pop("path")
            with open(getFilePath("lines", f"{name}.json"), 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=1)