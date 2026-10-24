"""量字高：把一块区域放大，并按「画面高度的 0.5%」画刻度线，方便目测字高占比。

  python3 measure.py <image> <x0> <y0> <x1> <y1> <out.png>   # 坐标为像素
  python3 measure.py <image> --grid <out.png>                # 整图叠 5% 网格，先定位区域
"""
import sys

from PIL import Image, ImageDraw


def grid(path, out):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    d = ImageDraw.Draw(im)
    for i in range(0, 101, 5):
        y = round(h * i / 100)
        d.line([(0, y), (w, y)], fill=(255, 0, 0), width=1)
        d.text((2, y + 1), f"{i}% y={y}", fill=(255, 80, 80))
        x = round(w * i / 100)
        d.line([(x, 0), (x, h)], fill=(0, 160, 255), width=1)
    im.save(out)
    print(f"size {w}x{h}")


def zoom(path, x0, y0, x1, y1, out, scale=4):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    crop = im.crop((x0, y0, x1, y1)).resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.NEAREST)
    d = ImageDraw.Draw(crop)
    step = h * 0.005  # 0.5% 画高
    k = 0
    y = 0.0
    while y <= (y1 - y0):
        yy = round(y * scale)
        major = k % 2 == 0
        d.line([(0, yy), (40 if major else 20, yy)], fill=(255, 0, 0), width=1)
        if major:
            d.text((44, yy - 5), f"{k * 0.5:.1f}%", fill=(255, 60, 60))
        y += step
        k += 1
    crop.save(out)
    print(f"image {w}x{h}; 0.5% = {step:.1f}px; crop y {y0}-{y1}")


if __name__ == "__main__":
    if sys.argv[2] == "--grid":
        grid(sys.argv[1], sys.argv[3])
    else:
        zoom(sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6])
