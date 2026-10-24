"""通过 OpenRouter 出图。密钥读环境变量 OPENROUTER_API_KEY，或由环境的 Network secrets 注入；不打印、不落盘。

  python3 gen.py --list-models                      # 列出图像型号（核实 id 用）
  python3 gen.py dark-floating lang-en --model <id> # 出一张，存到 --out 目录
  python3 gen.py dark-floating lang-en --dry-run    # 只打印提示词
"""
import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_prompt import build_case  # noqa: E402

API = "https://openrouter.ai/api/v1"


def list_models():
    r = requests.get(f"{API}/models", params={"output_modalities": "image"}, timeout=60)
    r.raise_for_status()
    for m in r.json()["data"]:
        print(m["id"], "|", m.get("name"), "|", json.dumps(m.get("pricing")), "|", m.get("architecture", {}).get("output_modalities"))


def generate(prompt, model, size=None):
    """图像型号走 /api/v1/images（chat/completions 会返回 404）。"""
    # 密钥优先读环境变量；没有就不带 Authorization，由云端环境的 Network secrets 在出网时注入。
    key = os.environ.get("OPENROUTER_API_KEY")
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    # Muse Image 不认 aspect_ratio（第 1 张返回 1280×1920）；--size 传明确像素时只发 size。
    body = {"model": model, "prompt": prompt}
    if size:
        body["size"] = size
    else:
        body["aspect_ratio"] = "4:5"
    r = requests.post(f"{API}/images", headers=headers, json=body, timeout=300)
    if r.status_code != 200:
        sys.exit(f"HTTP {r.status_code}: {r.text[:800]}")
    data = r.json()
    items = data.get("data") or []
    if not items:
        sys.exit(f"没有返回图片：{json.dumps(data)[:800]}")
    media = items[0].get("media_type", "image/png")
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(media, "bin")
    return base64.b64decode(items[0]["b64_json"]), ext, data.get("usage")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("template_id", nargs="?")
    ap.add_argument("case_id", nargs="?")
    ap.add_argument("--model")
    ap.add_argument("--accent")
    ap.add_argument("--size")
    ap.add_argument("--unit", default="pct", choices=["pct", "px"])
    ap.add_argument("--out", default="out")
    ap.add_argument("--tag", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list-models", action="store_true")
    a = ap.parse_args()
    if a.list_models:
        return list_models()
    prompt = build_case(a.template_id, a.case_id, a.accent, a.unit)
    if a.dry_run:
        return print(prompt)
    if not a.model:
        sys.exit("需要 --model")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = f"{a.template_id}__{a.case_id}__{a.model.replace('/', '_')}{('__' + a.tag) if a.tag else ''}"
    t0 = time.time()
    img, ext, usage = generate(prompt, a.model, a.size)
    (out / f"{stem}.{ext}").write_bytes(img)
    (out / f"{stem}.json").write_text(
        json.dumps({"model": a.model, "size": a.size, "template": a.template_id, "case": a.case_id, "accent": a.accent, "unit": a.unit,
                    "prompt": prompt, "usage": usage, "seconds": round(time.time() - t0, 1)},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(out / f"{stem}.{ext}")


if __name__ == "__main__":
    main()
