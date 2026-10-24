"""把「模板 + 主体 + 文案」拼成一条英文生图提示词。

模板从 ../templates.md 的 ```json 代码块里读，保证验收用的提示词和交付的模板是同一份。
用法：python3 build_prompt.py <template_id> <case_id> [--accent "deep teal (#0F9D8A)"]
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SLOTS = ["headline", "subheadline", "badge", "small", "brand"]
NUM_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}


def _json_blocks():
    text = (ROOT / "templates.md").read_text(encoding="utf-8")
    return [json.loads(b) for b in re.findall(r"```json\n(.*?)\n```", text, re.S)]


def load():
    blocks = _json_blocks()
    common = next(b for b in blocks if "fixedTail" in b)
    slot_names = next(b for b in blocks if b.get("headline") == "headline")
    templates = {b["id"]: b for b in blocks if "id" in b}
    return common, slot_names, templates


def load_cases():
    return json.loads((ROOT / "tools" / "cases.json").read_text(encoding="utf-8"))


# Muse Image 传 size=1024x1280 时实际返回 1408×1760。unit="px" 时按这个画布把百分比换算成像素写进提示词。
CANVAS = (1408, 1760)


def size_phrase(pct, unit):
    if unit == "px":
        return f"{round(pct / 100 * CANVAS[1])} pixels"
    return f"{pct:g}% of the image height"


def build(template, subject, copy, accent=None, common=None, slot_names=None, unit="pct"):
    if common is None or slot_names is None:
        common, slot_names, _ = load()
    t = template
    pal = t["palette"]
    sentences = [
        f"{t['medium']} in a portrait 4:5 format, showing {subject.rstrip('.')}."
        + (f" The canvas is {CANVAS[0]} by {CANVAS[1]} pixels." if unit == "px" else ""),
        t["canvas"],
        t["technique"],
        t["lighting"],
        " ".join([pal["base"], pal["accentSentence"].format(accent=accent or pal["accentDefault"]), pal["accentRole"]]),
    ]
    filled = [s for s in SLOTS if copy.get(s, "").strip()]
    if filled:
        n = len(filled)
        sentences.append(
            f"The image carries exactly {NUM_WORDS[n]} {'line' if n == 1 else 'lines'} of text, each written exactly as given below."
        )
        for s in filled:
            ty = t["typography"][s]
            sentences.append(
                f"The {slot_names[s]} reads \"{copy[s].strip()}\": {ty['style']}, with letters about {size_phrase(ty['heightPct'], unit)} tall, {t['layout'][s]}."
            )
        if t.get("sizeRelation"):
            sentences.append(t["sizeRelation"])
        if "brand" in filled:
            sentences.append(common["copyClosing"].format(count=NUM_WORDS[n], brand=f"\"{copy['brand'].strip()}\""))
        else:
            sentences.append(common["copyClosingNoBrand"].format(count=NUM_WORDS[n]))
        min_pct = min(t["typography"][s]["heightPct"] for s in filled)
        sentences.append(common["minSize"].format(minSize=size_phrase(min_pct, unit)))
        sentences.append(common["caseRule"])
    sentences.append(t["avoid"])
    sentences.append(common["fixedTail"])
    return "\n\n".join(sentences)


def build_case(template_id, case_id, accent=None, unit="pct"):
    common, slot_names, templates = load()
    cases = load_cases()
    case = cases["cases"][case_id]
    copy = cases["copy"][case["copy"]]
    return build(templates[template_id], case["subject"], copy, accent, common, slot_names, unit)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("template_id")
    ap.add_argument("case_id")
    ap.add_argument("--accent")
    ap.add_argument("--unit", default="pct", choices=["pct", "px"])
    a = ap.parse_args()
    print(build_case(a.template_id, a.case_id, a.accent, a.unit))
