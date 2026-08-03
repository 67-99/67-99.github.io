import json
import os
import shutil

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
            print("[W]", "缺少线路", name)
            continue
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for op, *param in commands:
            if op == "prior":  # prior, idx, prior
                idx, prior = param
                data["points"][idx][0] = prior
                print(f"{name}[{idx}]层级变换为{prior}")
            elif op == "pop":  # pop, idx, i
                idx, i = param
                data["points"][idx][1].pop(i)
                print(f"{name}[{idx}]移除节点{i}")
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
            elif op == "set": # set, index/name, value
                key, value = param
                if isinstance(key, str):
                    for item in data.get("stations", []):
                        if item.get("n", "") == key:
                            if isinstance(value, dict):
                                for k, v in value.items():
                                    item[k] = v
                                print(f"设置{name}{key}站为{value}")
                            elif isinstance(value, list):
                                item["sl"] = value
                                print(f"设置{name}{key}站位置于{value}")
                            break
                    else:
                        print("[W]", f"{name}中未找到车站{key}")
                elif isinstance(key, list|tuple):
                    idx, i = key
                    data["points"][idx][1][i] = value
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
            elif op == "split": # split, [[idx1, [start, end]], ...], ([prior1, ...])
                layers = []
                priors = param[1] if len(param) > 1 else []
                for i, split in enumerate(param[0]):
                    idx, pos = split
                    if len(pos) == 1:
                        points = data["points"][idx][1][pos]
                    else:
                        start, end = pos
                        points = data["points"][idx][1][start: end]
                    layers.append((prior[i] if len(priors) > i else data["points"][idx][0], points))
                data["points"] = layers
            elif op == "separate":  # separate, [[idx1, idx2, ...], [name1, name2, ...], ...]
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
                    output = {k: v for k, v in data.items() if k in {"name", "color", "stations"}}
                    output["id"] = name_
                    output["points"] = points
                    with open(getFilePath("lines", f"{name_}.json"), 'w', encoding='utf-8') as f:
                        json.dump(output, f, indent=4)
                    print(f"{name}分离出{len(points)}组共长{sum(len(p[1]) for p in points)}的文件{name_}")
                break
        else:
            if "path" in data:
                data.pop("path")
            with open(getFilePath("lines", f"{name}.json"), 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4)
    files = [name for name in os.listdir(getFilePath("temp")) if os.path.splitext(name)[0] not in shift_data]
    for file in files:
        shutil.copy(getFilePath("temp", file), getFilePath("lines", file))