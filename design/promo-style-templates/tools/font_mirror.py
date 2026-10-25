"""字体「选中即复制」原型：Developer API 目录 → CSS2 切片 → 写到一个目录（模拟 R2）。

  python3 font_mirror.py catalog <catalog.json>                       # 拉目录（需 Google Fonts API key，由 Network secrets 注入请求头）
  python3 font_mirror.py mirror <catalog.json> "<Family>" <root_dir> [--base-url URL] [--force]
  python3 font_mirror.py preview "<Family>" "<样字>" <out.css>          # 菜单预览：text= 子集，只含这几个字

mirror 结果：<root>/<family-slug>/<version>/font.css + *.woff2 + LICENSE.txt。
CSS 里的地址改写成 --base-url（默认 file://<root>），对应 R2 上的公开地址。
版本号取自目录；CSS2 返回的切片地址里也带版本（/s/<family>/<version>/），两者不一致就报错，避免把新版本存进旧路径。
"""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

CATALOG_API = "https://www.googleapis.com/webfonts/v1/webfonts"
CSS2 = "https://fonts.googleapis.com/css2"
# CSS2 按 User-Agent 决定返回格式；用现代浏览器 UA 才会拿到 woff2 + unicode-range 切片
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
LICENSE_DIRS = ("ofl", "apache", "ufl")


def slug(family):
    return re.sub(r"[^a-z0-9]+", "", family.lower())


def fetch_catalog(path):
    # capability=VF 才会返回可变轴（axes）；不带它，复制时只能按字重取，光学尺寸等轴会被固定在默认值
    r = requests.get(CATALOG_API, params={"sort": "popularity", "capability": "VF"}, timeout=60)
    r.raise_for_status()
    Path(path).write_text(r.text, encoding="utf-8")
    print(f"{len(r.json()['items'])} families -> {path}")


def css2_query(entry):
    """可变字体取全部轴的完整区间（实测只取 wght 时 Inter 的 opsz 被固定在 14，大字号字距偏宽，英文页脚多折一行）；
    静态字体取全部非斜体字重。"""
    fam = entry["family"]  # 空格原样交给 requests 编码；先换成 + 会被编码成 %2B，CSS2 返回 400
    axes = [a for a in entry.get("axes") or [] if a["tag"] != "ital"]
    if axes:
        # CSS2 要求轴名按字母序、小写在前
        axes.sort(key=lambda a: (a["tag"] != a["tag"].lower(), a["tag"]))
        tags = ",".join(a["tag"] for a in axes)
        ranges = ",".join(f"{a['start']:g}..{a['end']:g}" for a in axes)
        return f"{fam}:{tags}@{ranges}"
    weights = sorted({int(v) if v.isdigit() else 400 for v in entry["variants"] if "italic" not in v})
    return f"{fam}:wght@{';'.join(map(str, weights))}"


def mirror(catalog_path, family, root, base_url=None, force=False):
    items = json.loads(Path(catalog_path).read_text(encoding="utf-8"))["items"]
    entry = next((i for i in items if i["family"] == family), None)
    if not entry:
        sys.exit(f"目录里没有 {family}")
    version = entry["version"]
    dest = Path(root) / slug(family) / version
    if (dest / "font.css").exists() and not force:
        print(f"已存在，直接用：{dest / 'font.css'}")
        return dest
    css = requests.get(CSS2, params={"family": css2_query(entry), "display": "swap"}, headers={"User-Agent": UA}, timeout=60)
    css.raise_for_status()
    urls = re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", css.text)
    versions = {m for u in urls for m in re.findall(r"/s/[^/]+/(v\d+)/", u)}
    if versions != {version}:
        sys.exit(f"版本不一致：目录 {version}，CSS2 切片 {versions}")
    dest.mkdir(parents=True, exist_ok=True)

    def get(u):
        name = u.rsplit("/", 1)[1]
        (dest / name).write_bytes(requests.get(u, timeout=60).content)
        return u, name

    with ThreadPoolExecutor(8) as ex:
        mapping = dict(ex.map(get, sorted(set(urls))))
    base = (base_url or f"file://{Path(root).resolve()}").rstrip("/")
    out_css = css.text
    for u, name in mapping.items():
        out_css = out_css.replace(u, f"{base}/{slug(family)}/{version}/{name}")
    (dest / "font.css").write_text(out_css, encoding="utf-8")
    # 许可文件：google/fonts 仓库按许可分目录
    for d in LICENSE_DIRS:
        for fname in ("OFL.txt", "LICENSE.txt"):
            r = requests.get(f"https://raw.githubusercontent.com/google/fonts/main/{d}/{slug(family)}/{fname}", timeout=30)
            if r.status_code == 200:
                (dest / "LICENSE.txt").write_text(r.text, encoding="utf-8")
                break
        if (dest / "LICENSE.txt").exists():
            break
    size = sum(f.stat().st_size for f in dest.glob("*.woff2"))
    meta = {"family": family, "version": version, "lastModified": entry["lastModified"], "subsets": entry["subsets"],
            "axes": entry.get("axes"), "files": len(mapping), "bytes": size, "license": (dest / "LICENSE.txt").exists()}
    (dest / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False))
    return dest


def preview(family, sample, out_css):
    r = requests.get(CSS2, params={"family": family, "text": sample}, headers={"User-Agent": UA}, timeout=30)
    r.raise_for_status()
    urls = re.findall(r"url\((https://[^)]+)\)", r.text)
    total = sum(len(requests.get(u, timeout=30).content) for u in urls)
    Path(out_css).write_text(r.text, encoding="utf-8")
    print(f"{family}: {len(urls)} 个文件，共 {total} 字节（样字 {len(sample)} 个字符）")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "catalog":
        fetch_catalog(sys.argv[2])
    elif cmd == "mirror":
        base = sys.argv[sys.argv.index("--base-url") + 1] if "--base-url" in sys.argv else None
        mirror(sys.argv[2], sys.argv[3], sys.argv[4], base, "--force" in sys.argv)
    elif cmd == "preview":
        preview(sys.argv[2], sys.argv[3], sys.argv[4])
