#!/bin/bash
# 遍历所有以 _ 开头的 .jpg 或 .JPG 文件
for input in _*.jpg _*.JPG; do
    # 检查文件是否存在，避免无匹配时循环一次
    [ -e "$input" ] || continue
    # 去掉文件名开头的下划线，作为输出文件名
    output="${input#_}"
    # 使用 ffmpeg 缩放：高度设为720，宽度自动计算并保持偶数
    ffmpeg -i "$input" -vf "scale=-1:480" -q:v 2 "$output"

    echo "已转换: $input -> $output"
done