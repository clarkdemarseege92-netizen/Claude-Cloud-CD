// 文字图层：模板 + 文案 → TextLayerDoc（init）；TextLayerDoc → 成品图（render）。格式见 ../templates.md「文字图层文档」。
//
//   node render_html.mjs init   <base.png> <copy.json> <template_id> <doc.json> --font-dir <dir> [--accent #RRGGBB] [--effect id] [--vision vision.json | --segments seg.json]
//   node render_html.mjs render <doc.json> <out.png> --font-dir <dir>
//   node render_html.mjs validate <doc.json>
//
// 编辑器读写的就是 doc.json；服务端只认 doc.json 出图，所以编辑器里看到的和导出的是同一套 HTML/CSS。
// --vision：vision.py 的输出，用其中的 segments（断行单位）和 subjectBox（主体伸进文字列时收窄列宽）。
// --segments：只给断行单位 {slot: ["段1", "段2", ...]}。都没有时按空格切（空格留在前一段末尾）。
// render 同时输出 <out>.render.json：每行实际行数、外框（供碰撞检查）、哪些段因放不下被迫段内断行。
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // 预装在全局，ESM import 解析不到
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLOTS = ["badge", "headline", "subheadline", "small", "brand"]; // 绘制顺序；槽名与产品代码 COPY_LINES 一致
const COPY_LINE_MAX_CHARS = 80; // 与 promo-image-prompt.ts 同值
const FONT_FILES = { "geometric-sans": ["Inter-var.ttf", "NotoSansThai-var.ttf"] };

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const cmd = args[0];

function loadTemplate(id) {
  const md = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates.md"), "utf8");
  const t = [...md.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1])).find((b) => b.id === id);
  if (!t) throw new Error(`templates.md 里没有模板 ${id}`);
  return t;
}

/** 按空格切段：空格跟在前一段末尾，拼回去与原文逐字相同。 */
const splitAtSpaces = (text) => text.match(/[^ ]+ */g) ?? [text];

/** 服务端必须做的校验——doc 来自浏览器，不可信。返回错误列表。 */
function validate(doc) {
  const errs = [];
  let t;
  try { t = loadTemplate(doc.template); } catch (e) { return [e.message]; }
  const tl = t.textLayer;
  const m = tl.safeMargin;
  if (doc.version !== 1) errs.push("version 必须是 1");
  if (!/^#[0-9A-Fa-f]{6}$/.test(doc.accent ?? "")) errs.push("accent 必须是 #RRGGBB");
  if (!tl.effects[doc.effect]) errs.push(`effect 只能是 ${Object.keys(tl.effects).join(" / ")}`);
  const seen = new Set();
  for (const [i, l] of (doc.lines ?? []).entries()) {
    const at = `lines[${i}](${l.slot})`;
    if (!SLOTS.includes(l.slot) || seen.has(l.slot)) errs.push(`${at}: 槽名无效或重复`);
    seen.add(l.slot);
    if (typeof l.text !== "string" || !l.text.trim() || l.text.length > COPY_LINE_MAX_CHARS) errs.push(`${at}: text 为空或超过 ${COPY_LINE_MAX_CHARS} 字`);
    if (!Array.isArray(l.segments) || l.segments.join("") !== l.text) errs.push(`${at}: segments 拼起来必须与 text 逐字相同`);
    if ((l.forceBreaks ?? []).some((k) => !Number.isInteger(k) || k < 1 || k >= (l.segments?.length ?? 0))) errs.push(`${at}: forceBreaks 下标越界`);
    if (!(l.capPct >= tl.minCapPct && l.capPct <= tl.maxCapPct)) errs.push(`${at}: capPct 必须在 ${tl.minCapPct}–${tl.maxCapPct}`);
    if (!(l.x >= m && l.y >= m && l.w > 0 && l.x + l.w <= 1 - m + 1e-6 && l.y < 1 - m)) errs.push(`${at}: 外框超出安全边距 ${m}`);
    if (!tl.colors[l.color]) errs.push(`${at}: color 只能是 ${Object.keys(tl.colors).join(" / ")}`);
    if (!["left", "right", "center"].includes(l.align)) errs.push(`${at}: align 无效`);
    if (!(l.weight >= 100 && l.weight <= 900)) errs.push(`${at}: weight 无效`);
    if (!(l.lineHeight >= 0.8 && l.lineHeight <= 2)) errs.push(`${at}: lineHeight 无效`);
  }
  return errs;
}

function pageHtml(doc, fontDir, W, H) {
  const tl = loadTemplate(doc.template).textLayer;
  const [r, g, b] = doc.accent.slice(1).match(/../g).map((x) => parseInt(x, 16));
  const accentLight = `rgb(${[r, g, b].map((c) => Math.round(c + (255 - c) * tl.accentLight)).join(",")})`;
  const accentDark = `rgb(${[r, g, b].map((c) => Math.round(c * tl.accentDark)).join(",")})`;
  const roleColor = (role) => ({ accent: "var(--accent)", accentLight: "var(--accent-light)" })[tl.colors[role]] ?? tl.colors[role];
  const files = FONT_FILES[tl.fontFamily];
  const fonts = files.map((f, i) => `@font-face { font-family: F${i}; src: url("file://${fontDir}/${f}"); font-weight: 100 900; }`).join("\n");
  const family = files.map((_, i) => `F${i}`).join(", ");
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const lines = doc.lines.map((l) => {
    const pill = tl.slots[l.slot]?.pill;
    // 段与段之间才允许换行（<wbr>）；forceBreaks 指定的段前强制换行（<br>）
    const inner = l.segments.map((s, k) => `${k ? ((l.forceBreaks ?? []).includes(k) ? "<br>" : "<wbr>") : ""}<span class="seg">${esc(s)}</span>`).join("");
    const box = (pill ? `width:max-content; max-width:${l.w * W}px; padding:.42em .9em; border-radius:999px;` : `width:${l.w * W}px;`)
      + (tl.slots[l.slot]?.maxLines === 1 ? " white-space:nowrap;" : ""); // 单行槽（角标、品牌）永不折行
    return `<div class="t ${l.slot}" data-slot="${l.slot}" data-cap="${l.capPct}" style="left:${l.x * W}px; top:${l.y * H}px; ${box} text-align:${l.align}; font-weight:${l.weight}; line-height:${l.lineHeight}; color:${roleColor(l.color)};">${inner}</div>`;
  });
  const bg = doc.base.startsWith("/") ? "file://" + doc.base : doc.base;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
html,body { margin:0; padding:0; }
#c { --accent:${doc.accent}; --accent-light:${accentLight}; --accent-dark:${accentDark};
     position:relative; width:${W}px; height:${H}px; overflow:hidden; font-family:${family}, sans-serif;
     background:url("${bg}") center/cover; }
.t { position:absolute; box-sizing:border-box; }
.seg { white-space:nowrap; }
${tl.effects[doc.effect]}
</style></head><body><div id="c">${lines.join("\n")}</div></body></html>`;
}

/** 页面里：按每行的参照字定字号（拉丁 H / 西里尔 Н / 泰文 ก / 中日 国），再量外框、报告被迫段内断行的段。 */
function sizeAndMeasure(page, H) {
  return page.evaluate(async (H) => {
    await document.fonts.ready;
    const cv = document.createElement("canvas").getContext("2d");
    const refChar = (t) => (/[฀-๿]/.test(t) ? "ก" : /[぀-ヿ一-鿿]/.test(t) ? "国" : /[Ѐ-ӿ]/.test(t) ? "Н" : "H");
    for (const el of document.querySelectorAll(".t")) {
      const cs = getComputedStyle(el);
      const ref = refChar(el.textContent);
      cv.font = `${cs.fontWeight} 1000px ${cs.fontFamily}`;
      const mt = cv.measureText(ref);
      const ratio = (mt.actualBoundingBoxAscent + (ref === "国" ? mt.actualBoundingBoxDescent : 0)) / 1000;
      el.style.fontSize = (+el.dataset.cap / 100) * H / ratio + "px";
    }
    const out = {};
    for (const el of document.querySelectorAll(".t")) {
      // 某段比框还宽 → 只对这一段放开断行，绝不让字溢出
      const unlocked = [];
      const inner = el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight);
      for (const sp of el.querySelectorAll(".seg")) {
        if (sp.getBoundingClientRect().width > inner + 1) { sp.style.whiteSpace = "normal"; unlocked.push(sp.textContent); }
      }
      const r = document.createRange(); r.selectNodeContents(el);
      const rects = [...r.getClientRects()].filter((x) => x.width > 0).map((x) => [x.left, x.top, x.right, x.bottom].map(Math.round));
      const box = el.getBoundingClientRect();
      out[el.dataset.slot] = {
        ref: refChar(el.textContent), fontPx: Math.round(parseFloat(el.style.fontSize)),
        lines: new Set(rects.map((x) => x[1])).size, rects, unlockedSegments: unlocked,
        box: [box.left, box.top, box.right, box.bottom].map(Math.round),
      };
    }
    return out;
  }, H);
}

let browser;
async function withPage(W, H, html, fn) {
  browser ??= await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  try {
    const tmp = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "tl-")), "page.html");
    fs.writeFileSync(tmp, html);
    await page.goto("file://" + tmp);
    return await fn(page);
  } finally {
    await page.close();
  }
}

async function imageSize(p) {
  return withPage(100, 100, `<img src="file://${path.resolve(p)}">`, (page) =>
    page.evaluate(async () => { await document.images[0].decode(); return { W: document.images[0].naturalWidth, H: document.images[0].naturalHeight }; }));
}

async function render(doc, outPng, fontDir) {
  const errs = validate(doc);
  if (errs.length) throw new Error("文字图层文档不合法：\n" + errs.join("\n"));
  const { width: W, height: H } = doc.canvas;
  const slots = await withPage(W, H, pageHtml(doc, fontDir, W, H), async (page) => {
    const r = await sizeAndMeasure(page, H);
    await page.screenshot({ path: outPng });
    return r;
  });
  const m = loadTemplate(doc.template).textLayer.safeMargin;
  // 文字实际排出来越过安全边距（例如商户把字号拉大、行数变多）→ 报给编辑器，由它提示商户
  const outsideSafeArea = Object.entries(slots).filter(([, v]) => v.box[3] > H * (1 - m) + 1 || v.box[2] > W * (1 - m) + 1).map(([k]) => k);
  const full = { slots, outsideSafeArea };
  fs.writeFileSync(outPng.replace(/\.png$/, ".render.json"), JSON.stringify(full, null, 1)); // 不叫 .json：曾与同名的识图结果互相覆盖
  return full;
}

/** 模板 + 文案 → 初始文档：按模板 initialLayout 排一遍（左上文字列 + 底边一行），把每行的位置写成绝对坐标（画面比例）。 */
async function init(basePath, copy, templateId, effect, accent, segmentsHint, fontDir, subjectBox = null) {
  const t = loadTemplate(templateId);
  const tl = t.textLayer;
  const L = tl.initialLayout;
  const { W, H } = await imageSize(basePath);
  const filled = SLOTS.filter((s) => (copy[s] ?? "").trim());
  const mk = (slot, x, y, w, align, scale = 1) => {
    const d = tl.slots[slot];
    const text = copy[slot].trim();
    return {
      slot, text, segments: segmentsHint?.[slot] ?? splitAtSpaces(text), forceBreaks: [],
      x, y, w, align, capPct: +Math.max(d.capPct * scale, tl.minCapPct).toFixed(2),
      weight: d.weight, color: d.color, lineHeight: d.lineHeight,
    };
  };
  const doc = {
    version: 1, template: templateId, canvas: { width: W, height: H }, base: path.resolve(basePath),
    accent: accent ?? t.palette.accentDefault.match(/#[0-9A-Fa-f]{6}/)[0], effect: effect ?? tl.defaultEffect, lines: [],
  };
  const measure = (lines) => withPage(W, H, pageHtml({ ...doc, lines }, fontDir, W, H), (page) => sizeAndMeasure(page, H));

  // 左上文字列：角标 → 标题 → 副标题，逐行叠放。列底越过 columnBottom、或有段放不进列宽 → 整体缩小再排；
  // 字号不低于 minCapPct；为了让一段不被拆开最多缩到 widthShrinkFloor 倍（再小标题就失去层级）。
  const colSlots = ["badge", "headline", "subheadline"].filter((s) => filled.includes(s));
  // 识图给了主体外框、且主体伸进文字列 → 与主体同高的那几行收到「主体左边 − subjectGap」，不窄于 columnMinWidth；
  // 主体上方的行保持原宽（只收窄需要收的行，否则标题会被无谓缩小——实测泰文标题因此缩到和正文一样大）
  let narrowW = L.columnMaxWidth;
  let subjectTop = 2;
  if (subjectBox) {
    const [sx0, sy0, , sy1] = subjectBox;
    if (sx0 < L.margin + L.columnMaxWidth && sy0 < L.columnBottom && sy1 > L.columnTop) {
      narrowW = Math.max(L.columnMinWidth, +(sx0 - L.subjectGap - L.margin).toFixed(4));
      subjectTop = sy0;
    }
  }
  const narrowed = [];
  for (let scale = 1; ; scale -= 0.02) {
    narrowed.length = 0;
    let y = L.columnTop;
    let split = false;
    const lines = [];
    for (const s of colSlots) {
      let l = mk(s, L.margin, +y.toFixed(4), L.columnMaxWidth, "left", scale);
      let r = (await measure([l]))[s];
      if (narrowW < L.columnMaxWidth && (r.box[3] / H) > subjectTop) {
        l = mk(s, L.margin, +y.toFixed(4), narrowW, "left", scale);
        r = (await measure([l]))[s];
        narrowed.push(s);
      }
      split ||= r.unlockedSegments.length > 0;
      lines.push(l);
      y += (r.box[3] - r.box[1]) / H + L.columnGap;
    }
    const tooLow = y - L.columnGap > L.columnBottom;
    if ((tooLow && scale - 0.02 >= 0.5) || (split && scale - 0.02 >= L.widthShrinkFloor)) continue;
    doc.lines.push(...lines);
    break;
  }
  doc.layoutNote = { narrowWidth: narrowW, narrowedSlots: [...narrowed] };
  // 底边：品牌名右对齐、页脚左对齐，底边对齐在 baseline；页脚宽 = 画宽 - 两侧边距 - 品牌名宽 - 间隔
  let brandW = 0;
  if (filled.includes("brand")) {
    const r = await measure([mk("brand", L.margin, 0.5, 0.6, "left")]);
    const s = r.brand.rects[0];
    brandW = +((s[2] - s[0]) / W + 0.01).toFixed(4);
    doc.lines.push(mk("brand", +(1 - L.margin - brandW).toFixed(4), +(L.baseline - (r.brand.box[3] - r.brand.box[1]) / H).toFixed(4), brandW, "right"));
  }
  if (filled.includes("small")) {
    const w = +(1 - 2 * L.margin - brandW - 0.05).toFixed(4);
    const r = await measure([mk("small", L.margin, 0.5, w, "left")]);
    doc.lines.push(mk("small", L.margin, +(L.baseline - (r.small.box[3] - r.small.box[1]) / H).toFixed(4), w, "left"));
  }
  doc.lines.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return doc;
}

const fontDir = path.resolve(opt("--font-dir", "."));
try {
  if (cmd === "init") {
    const [, base, copyPath, templateId, docPath] = args;
    const copy = JSON.parse(fs.readFileSync(copyPath, "utf8"));
    const vision = opt("--vision") ? JSON.parse(fs.readFileSync(opt("--vision"), "utf8")) : null;
    const seg = vision?.segments ?? (opt("--segments") ? JSON.parse(fs.readFileSync(opt("--segments"), "utf8")) : null);
    const doc = await init(base, copy, templateId, opt("--effect"), opt("--accent"), seg, fontDir, vision?.subjectBox ?? null);
    if (vision) {
      // 给编辑器的提示：放字区域被侵入、底图里有字、需要人看的内容
      doc.layoutNote.vision = {
        uncleanZones: vision.zones.filter((z) => !z.clean).map((z) => ({ name: z.name, by: z.intrusions.map((i) => i.what) })),
        hasText: vision.hasText, textSeen: vision.textSeen, concerns: vision.concerns,
      };
    }
    fs.writeFileSync(docPath, JSON.stringify(doc, null, 1));
    const errs = validate(doc);
    console.log(docPath, errs.length ? "INVALID:\n" + errs.join("\n") : "valid");
  } else if (cmd === "render") {
    const [, docPath, out] = args;
    const r = await render(JSON.parse(fs.readFileSync(docPath, "utf8")), out, fontDir);
    const brief = Object.fromEntries(Object.entries(r.slots).map(([k, v]) => [k, { lines: v.lines, fontPx: v.fontPx, unlocked: v.unlockedSegments }]));
    console.log(out, JSON.stringify(brief), "outsideSafeArea:", JSON.stringify(r.outsideSafeArea));
  } else if (cmd === "validate") {
    const errs = validate(JSON.parse(fs.readFileSync(args[1], "utf8")));
    console.log(errs.length ? errs.join("\n") : "valid");
    process.exitCode = errs.length ? 1 : 0;
  } else {
    console.error("用法见文件头");
    process.exitCode = 2;
  }
} finally {
  await browser?.close();
}
