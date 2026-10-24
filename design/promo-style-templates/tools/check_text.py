"""碰撞粗检：在 render_html.mjs 输出的每个文字行外框（<out>.render.json）下，看无字底图里有多少明显亮于暗底的像素。

  python3 check_text.py <base.png> <out.render.json>
>2% 视为字压到了画面里的东西（只适用于深色底模板；浅色模板要靠识图）。
"""
import json
import sys

from PIL import Image

base = Image.open(sys.argv[1]).convert("L")
rep = json.load(open(sys.argv[2]))
worst = {}
for slot, v in rep["slots"].items():
    for x0, y0, x1, y1 in v["rects"]:
        hist = base.crop((x0, y0, x1, y1)).histogram()
        worst[slot] = max(worst.get(slot, 0), round(sum(hist[90:]) / max(1, sum(hist)) * 100, 1))
print(json.dumps(worst))
