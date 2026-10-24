"""把文案用真实字体排到无字底图上（流程 A 的「代码排字」原型）。

  python3 render_text.py <base_image> <template_id> <copy_id> <out.png> --font-dir <dir> [--accent "#7C5CFF"]

字号按模板 textLayer.slots[*].capPct（大写字母高 / 画高）换算，代码保证不低于 minCapPct。
字体目录里按 textLayer.font 找文件：geometric-sans → Inter-var.ttf（可变字体，按 weight 设字重）。
"""
import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_prompt import load, load_cases  # noqa: E402

FONT_FILES = {"geometric-sans": "Inter-var.ttf"}


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(c, other, t):
    return tuple(round(a + (b - a) * t) for a, b in zip(c, other))


class Fonts:
    def __init__(self, path):
        self.path = str(path)
        probe = self.get(1000, 400)
        l, t, r, b = probe.getbbox("H", anchor="ls")
        self.cap_ratio = -t / 1000  # 大写字母高 / 字号

    def get(self, size, weight):
        f = ImageFont.truetype(self.path, max(1, round(size)))
        axes = f.get_variation_axes()
        values = []
        for ax in axes:
            name = ax["name"].decode() if isinstance(ax["name"], bytes) else ax["name"]
            if name.startswith("Weight"):
                values.append(min(max(weight, ax["minimum"]), ax["maximum"]))
            else:  # 光学尺寸：大字用展示字形
                values.append(ax["maximum"] if size >= 32 else max(ax["minimum"], round(size)))
        f.set_variation_by_axes(values)
        return f

    def size_for_cap(self, cap_px):
        return cap_px / self.cap_ratio


def wrap(text, font, max_w, tracking=0):
    # 有空格的文字按词换行；没有空格的（中日文、泰文）按字符换行，泰文的断词留到正式实现再处理
    tokens = text.split(" ") if " " in text else list(text)
    sep = " " if " " in text else ""
    lines, cur = [], ""
    for tok in tokens:
        trial = (cur + sep + tok) if cur else tok
        if text_width(trial, font, tracking) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = tok
    if cur:
        lines.append(cur)
    return lines


def text_width(s, font, tracking=0):
    w = font.getlength(s)
    return w + tracking * max(0, len(s) - 1)


def draw_text(draw, xy, s, font, fill, tracking=0, anchor="ls"):
    if not tracking:
        draw.text(xy, s, font=font, fill=fill, anchor=anchor)
        return
    x, y = xy
    if anchor[0] == "r":
        x -= text_width(s, font, tracking)
    for ch in s:
        draw.text((x, y), ch, font=font, fill=fill, anchor="l" + anchor[1])
        x += font.getlength(ch) + tracking


def render(base_path, template, copy, accent_hex, fonts, out_path):
    base = Image.open(base_path).convert("RGB")
    W, H = base.size
    tl = template["textLayer"]
    accent = hex_rgb(accent_hex)
    colors = {"accent": accent, "accentLight": mix(accent, (255, 255, 255), tl["accentLight"])}

    def color(v):
        return colors.get(v) or hex_rgb(v)

    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    margin = tl["margin"] * W
    col_w = tl["column"]["maxWidth"] * W
    gap = tl["column"]["gap"] * H
    report = {}

    boxes = []  # (槽, 文字外框)，用于碰撞粗检

    def fit(slot, text, max_w, scale=1.0, record=True):
        """按 capPct×scale 定字号；超出 maxLines 就逐步缩小，但不低于 minCapPct。"""
        spec = tl["slots"][slot]
        cap = max(spec["capPct"] * scale, tl["minCapPct"])
        while True:
            cap_px = cap / 100 * H
            font = fonts.get(fonts.size_for_cap(cap_px), spec["weight"])
            tracking = spec.get("tracking", 0) * fonts.size_for_cap(cap_px)
            lines = wrap(text, font, max_w, tracking)
            if len(lines) <= spec["maxLines"] or cap - 0.1 < tl["minCapPct"]:
                if record:
                    report[slot] = {"capPct": round(cap, 2), "capPx": round(cap_px, 1), "lines": lines,
                                    "overflow": len(lines) > spec["maxLines"]}
                return spec, font, cap_px, tracking, lines
            cap -= 0.1

    def column(scale, draw):
        """左上文字列：角标 → 标题 → 副标题。返回列底边 y。draw=False 时只量高度。"""
        y = tl["column"]["top"] * H
        if copy.get("badge"):
            spec, font, cap_px, tr, lines = fit("badge", copy["badge"], col_w, scale, draw)
            pad_x, pill_h = cap_px * 0.9, cap_px * 2.3
            tw = text_width(lines[0], font, tr)
            box = [margin, y, margin + tw + 2 * pad_x, y + pill_h]
            if draw:
                d.rounded_rectangle(box, radius=pill_h / 2, outline=color(spec["outline"]) + (255,), width=max(2, round(H * 0.0018)))
                draw_text(d, (margin + pad_x, y + pill_h / 2 + cap_px / 2), lines[0], font, color(spec["color"]) + (255,), tr)
                boxes.append(("badge", box))
            y += pill_h + gap
        for slot in ("headline", "subheadline"):
            if not copy.get(slot):
                continue
            spec, font, cap_px, tr, lines = fit(slot, copy[slot], col_w, scale, draw)
            size = fonts.size_for_cap(cap_px)
            for i, line in enumerate(lines):
                base_y = y + cap_px + i * size * spec["lineHeight"]
                if draw:
                    draw_text(d, (margin, base_y), line, font, color(spec["color"]) + (255,), tr)
                    boxes.append((slot, [margin, base_y - cap_px * 1.05, margin + text_width(line, font, tr), base_y + size * 0.22]))
            y += cap_px + (len(lines) - 1) * size * spec["lineHeight"] + size * 0.3 + gap
        return y - gap

    # 文字列不得越过模板规定的空白区底边（textLayer.column.bottom）：整体按比例缩小，最小字仍不低于 minCapPct
    scale = 1.0
    while column(scale, False) > tl["column"]["bottom"] * H and scale > 0.5:
        scale -= 0.02
    col_bottom = column(scale, True)
    report["_column"] = {"scale": round(scale, 2), "bottomPct": round(col_bottom / H * 100, 1),
                         "fitsZone": col_bottom <= tl["column"]["bottom"] * H}

    baseline = tl["baseline"] * H
    brand_w = 0
    if copy.get("brand"):
        spec, font, cap_px, tr, lines = fit("brand", copy["brand"], W * 0.4)
        brand_w = text_width(lines[0], font, tr)
        draw_text(d, (W - margin, baseline), lines[0], font, color(spec["color"]) + (255,), tr, anchor="rs")
        boxes.append(("brand", [W - margin - brand_w, baseline - cap_px * 1.05, W - margin, baseline + cap_px * 0.3]))
    if copy.get("small"):
        # 页脚可用宽度 = 画宽 - 两侧边距 - 品牌名实际宽度 - 间隔；排不下就向上折行，绝不丢字
        spec, font, cap_px, tr, lines = fit("small", copy["small"], W - 2 * margin - brand_w - 0.05 * W)
        size = fonts.size_for_cap(cap_px)
        for i, line in enumerate(lines):
            y_line = baseline - (len(lines) - 1 - i) * size * spec.get("lineHeight", 1.3)
            draw_text(d, (margin, y_line), line, font, color(spec["color"]) + (255,), tr)
            boxes.append(("small", [margin, y_line - cap_px * 1.05, margin + text_width(line, font, tr), y_line + size * 0.22]))

    gray = base.convert("L")
    collisions = {}
    for slot, (x0, y0, x1, y1) in boxes:
        crop = gray.crop((int(x0), int(y0), int(x1), int(y1)))
        hist = crop.histogram()
        bright = sum(hist[90:]) / max(1, sum(hist))
        collisions[slot] = max(collisions.get(slot, 0), round(bright * 100, 1))
    report["_collisionPct"] = collisions  # >2% 视为字压到了画面里的东西

    # 柔和投影：只为保证文字在暗底上的边缘清楚，不是色块
    sh = tl["shadow"]
    alpha = layer.getchannel("A").filter(ImageFilter.GaussianBlur(sh["blur"] * H))
    shadow = Image.new("RGBA", (W, H), hex_rgb(sh["color"]) + (0,))
    shadow.putalpha(alpha.point(lambda v: round(v * sh["opacity"])))
    out = base.convert("RGBA")
    out.alpha_composite(shadow)
    out.alpha_composite(layer)
    out.convert("RGB").save(out_path)
    lost = [k for k, v in report.items() if not k.startswith("_") and v["overflow"]]
    if lost:
        print(f"⚠ 超出行数上限（已全部画出，但版式可能挤）：{lost}", file=sys.stderr)
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("template_id")
    ap.add_argument("copy_id")
    ap.add_argument("out")
    ap.add_argument("--font-dir", required=True)
    ap.add_argument("--accent")
    a = ap.parse_args()
    _, _, templates = load()
    t = templates[a.template_id]
    copy = load_cases()["copy"][a.copy_id]
    accent = a.accent or re.search(r"#[0-9A-Fa-f]{6}", t["palette"]["accentDefault"]).group(0)
    fonts = Fonts(Path(a.font_dir) / FONT_FILES[t["textLayer"]["font"]])
    report = render(a.base, t, copy, accent, fonts, a.out)
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
