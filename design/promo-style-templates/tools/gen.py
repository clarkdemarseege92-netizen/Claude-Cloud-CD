"""通过 OpenRouter 出图。密钥只从环境变量 OPENROUTER_API_KEY 读，不打印、不落盘。

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


def generate(prompt, model, modalities):
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit("OPENROUTER_API_KEY 未设置")
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "modalities": modalities,
        "image_config": {"aspect_ratio": "4:5"},
    }
    r = requests.post(
        f"{API}/chat/completions",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json=body,
        timeout=300,
    )
    if r.status_code != 200:
        sys.exit(f"HTTP {r.status_code}: {r.text[:800]}")
    data = r.json()
    msg = data["choices"][0]["message"]
    images = msg.get("images") or []
    if not images:
        sys.exit(f"没有返回图片：{json.dumps(data)[:800]}")
    url = images[0]["image_url"]["url"]
    header, b64 = url.split(",", 1)
    ext = "png" if "png" in header else "jpg" if "jpeg" in header else "webp" if "webp" in header else "bin"
    return base64.b64decode(b64), ext, data.get("usage")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("template_id", nargs="?")
    ap.add_argument("case_id", nargs="?")
    ap.add_argument("--model")
    ap.add_argument("--accent")
    ap.add_argument("--modalities", default="image")  # 两个型号的 output_modalities 都只有 image
    ap.add_argument("--out", default="out")
    ap.add_argument("--tag", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--list-models", action="store_true")
    a = ap.parse_args()
    if a.list_models:
        return list_models()
    prompt = build_case(a.template_id, a.case_id, a.accent)
    if a.dry_run:
        return print(prompt)
    if not a.model:
        sys.exit("需要 --model")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = f"{a.template_id}__{a.case_id}__{a.model.replace('/', '_')}{('__' + a.tag) if a.tag else ''}"
    t0 = time.time()
    img, ext, usage = generate(prompt, a.model, a.modalities.split(","))
    (out / f"{stem}.{ext}").write_bytes(img)
    (out / f"{stem}.json").write_text(
        json.dumps({"model": a.model, "template": a.template_id, "case": a.case_id, "accent": a.accent,
                    "prompt": prompt, "usage": usage, "seconds": round(time.time() - t0, 1)},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(out / f"{stem}.{ext}")


if __name__ == "__main__":
    main()
