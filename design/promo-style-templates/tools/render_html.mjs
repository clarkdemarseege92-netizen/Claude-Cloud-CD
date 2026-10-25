// 文字图层：模板 + 文案 → TextLayerDoc（init）；TextLayerDoc → 成品图（render）。格式见 ../templates.md「文字图层文档」。
//
//   node render_html.mjs init   <base.png> <copy.json> <template_id> <doc.json> --lang <en|ru|th|zh-Hans|zh-Hant|ja> --font-root <dir> [--font "Family@vN"] [--accent #RRGGBB] [--effect id] [--segments seg.json]
//   node render_html.mjs render <doc.json> <out.png> --font-root <dir|url>
//   node render_html.mjs validate <doc.json> --font-root <dir>
//
// 编辑器读写的就是 doc.json；服务端只认 doc.json 出图，所以编辑器里看到的和导出的是同一套 HTML/CSS。
// 默认按空格分段（空格留在前一段末尾）；不用空格分词的文字整段放不下时由浏览器自行断行。
// 断在哪里由商户在编辑器里决定（拆段 + forceBreaks）；生图流程里不调用任何 AI 做断行或识图（2026-10-24 定）。
// --segments：测试用，直接给定分段 {slot: ["段1", "段2", ...]}。
// 字体全部是 Google Fonts，按 font_mirror.py 复制到 --font-root（模拟 R2）后加载，文档里都记 {family, version}：
//   defaultFonts  模板默认字体（init 时按 lang 排好顺序、锁定版本），永远作为后备
//   font          商户给整张图选的字体：作用于除品牌名以外的所有行
//   lines[].font  单行字体：优先级最高；品牌名只认这一项（默认用模板字体，商户可单独换）
// 换字体会改变每行的宽高，而文档存的是绝对位置：编辑器换字体后应带 --font 重新 init（「按当前字体重新排版」）。
// render 同时输出 <out>.render.json：每行实际行数、外框（供碰撞检查）、哪些段因放不下被迫段内断行、
// 越出安全区的行（outsideSafeArea）、互相重叠的行（overlaps）。
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // 预装在全局，ESM import 解析不到
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLOTS = ["badge", "headline", "subheadline", "small", "brand"]; // 绘制顺序；槽名与产品代码 COPY_LINES 一致
const COPY_LINE_MAX_CHARS = 80; // 与 promo-image-prompt.ts 同值
const LANGS = ["en", "ru", "th", "zh-Hans", "zh-Hant", "ja"];

const args = process.argv.slice(2);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** 文案用到的文字体系 → 字体必须覆盖的 Google Fonts subset（任一满足即可）。 */
function requiredSubsets(text) {
  const need = [];
  if (/[\u0E00-\u0E7F]/.test(text)) need.push(["thai"]);
  if (/[\u3040-\u30FF]/.test(text)) need.push(["japanese"]);
  else if (/[\u4E00-\u9FFF]/.test(text)) need.push(["chinese-simplified", "chinese-traditional", "chinese-hongkong", "japanese"]);
  if (/[\u0400-\u04FF]/.test(text)) need.push(["cyrillic"]);
  if (/[A-Za-z]/.test(text)) need.push(["latin"]);
  return need;
}
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
  if (!LANGS.includes(doc.lang)) errs.push(`lang 只能是 ${LANGS.join(" / ")}`);
  /** 字体引用必须已复制到字体存储；texts 给出时还要覆盖这些文字用到的文字体系。 */
  const checkFont = (f, where, texts) => {
    const metaPath = path.join(fontRootDir(), slug(f?.family ?? ""), String(f?.version ?? ""), "meta.json");
    if (!fs.existsSync(metaPath)) return errs.push(`${where}: ${f?.family} ${f?.version} 还没复制到字体存储`), null;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    for (const any of texts ? requiredSubsets(texts.join(" ")) : []) {
      if (!any.some((s) => meta.subsets.includes(s))) errs.push(`${where}: ${meta.family} 不支持文案里的 ${any.join(" / ")} 文字`);
    }
    return meta;
  };
  // 模板默认字体合起来必须覆盖全部文案——它们是最后的后备，缺了就会落到系统字体
  const defaults = (doc.defaultFonts ?? []).map((f, i) => checkFont(f, `defaultFonts[${i}]`)).filter(Boolean);
  if (!defaults.length) errs.push("defaultFonts 不能为空（由 init 按模板生成）");
  for (const any of requiredSubsets((doc.lines ?? []).map((l) => l.text).join(" "))) {
    if (defaults.length && !defaults.some((m) => any.some((s) => m.subsets.includes(s)))) errs.push(`defaultFonts 不覆盖文案里的 ${any.join(" / ")} 文字`);
  }
  if (doc.font !== undefined) checkFont(doc.font, "font", (doc.lines ?? []).filter((l) => l.slot !== "brand").map((l) => l.text));
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
    if (l.font !== undefined) checkFont(l.font, `${at}.font`, [l.text]);
  }
  return errs;
}

function pageHtml(doc, W, H) {
  const tl = loadTemplate(doc.template).textLayer;
  const [r, g, b] = doc.accent.slice(1).match(/../g).map((x) => parseInt(x, 16));
  const accentLight = `rgb(${[r, g, b].map((c) => Math.round(c + (255 - c) * tl.accentLight)).join(",")})`;
  const accentDark = `rgb(${[r, g, b].map((c) => Math.round(c * tl.accentDark)).join(",")})`;
  const roleColor = (role) => ({ accent: "var(--accent)", accentLight: "var(--accent-light)" })[tl.colors[role]] ?? tl.colors[role];
  const all = [...(doc.defaultFonts ?? []), doc.font, ...doc.lines.map((l) => l.font)].filter(Boolean);
  const uniq = [...new Map(all.map((f) => [`${f.family}@${f.version}`, f])).values()];
  const fontLink = uniq.map((f) => `<link rel="stylesheet" href="${fontRootUrl()}/${slug(f.family)}/${f.version}/font.css">`).join("");
  const q = (f) => `"${f.family}"`;
  const fallback = [...(doc.defaultFonts ?? []).map(q), "sans-serif"].join(", ");
  // 优先级：单行字体 > 整张图字体（品牌名不吃这一层）> 模板默认字体
  const familyFor = (l) => [l.font ? q(l.font) : null, l.slot !== "brand" && doc.font ? q(doc.font) : null, fallback].filter(Boolean).join(", ");
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const lines = doc.lines.map((l) => {
    const pill = tl.slots[l.slot]?.pill;
    // 段与段之间才允许换行（<wbr>）；forceBreaks 指定的段前强制换行（<br>）
    const single = tl.slots[l.slot]?.maxLines === 1;
    // 单行槽不插 <wbr>：nowrap 里 <wbr> 仍是断行点（实测俄文角标被折成两行）
    const inner = l.segments.map((s, k) => `${k ? ((l.forceBreaks ?? []).includes(k) ? "<br>" : single ? "" : "<wbr>") : ""}<span class="seg">${esc(s)}</span>`).join("");
    const box = (pill ? `width:max-content; max-width:${l.w * W}px; padding:.42em .9em; border-radius:999px;` : `width:${l.w * W}px;`)
      + (single ? " white-space:nowrap;" : ""); // 单行槽（角标、品牌）永不折行
    return `<div class="t ${l.slot}" data-slot="${l.slot}" data-cap="${l.capPct}" style="left:${l.x * W}px; top:${l.y * H}px; ${box} text-align:${l.align}; font-family:${familyFor(l).replace(/"/g, "'")}; font-weight:${l.weight}; line-height:${l.lineHeight}; color:${roleColor(l.color)};">${inner}</div>`;
  });
  const bg = doc.base.startsWith("/") ? "file://" + doc.base : doc.base;
  return `<!doctype html><html lang="${doc.lang}"><head><meta charset="utf-8">${fontLink}<style>
html,body { margin:0; padding:0; }
#c { --accent:${doc.accent}; --accent-light:${accentLight}; --accent-dark:${accentDark};
     position:relative; width:${W}px; height:${H}px; overflow:hidden;
     background:url("${bg}") center/cover; }
.t { position:absolute; box-sizing:border-box; text-wrap:pretty; word-break:auto-phrase; }
/* text-wrap:pretty 避免末行孤字（实测英文 "too"、简体「聊」单独成行）；word-break:auto-phrase 让日文按短语断行（实测「ど / の言語」） */
.seg { white-space:nowrap; }
${tl.effects[doc.effect]}
</style></head><body><div id="c">${lines.join("\n")}</div></body></html>`;
}

/** 页面里：按每行的参照字定字号（拉丁 H / 西里尔 Н / 泰文 ก / 中日 国），再量外框、报告被迫段内断行的段。 */
function sizeAndMeasure(page, H) {
  return page.evaluate(async (H) => {
    await document.fonts.ready;
    const cv = document.createElement("canvas").getContext("2d");
    // 每种文字的参照字：拉丁 H / 西里尔 Н / 泰文 ก（不含上下附加符号）/ 中日 国（整字）
    const REFS = [[/[A-Za-z0-9]/, "H"], [/[\u0400-\u04FF]/, "Н"], [/[\u0E00-\u0E7F]/, "ก"], [/[\u3040-\u30FF\u4E00-\u9FFF]/, "国"]];
    const refsIn = (t) => REFS.filter(([re]) => re.test(t)).map(([, c]) => c);
    const refChar = (t) => refsIn(t).at(-1) ?? "H"; // 报告用：这一行的主要文字
    for (const el of document.querySelectorAll(".t")) {
      const cs = getComputedStyle(el);
      const refs = refsIn(el.textContent);
      cv.font = `${cs.fontWeight} 1000px ${cs.fontFamily}`;
      await document.fonts.load(cv.font, refs.join("") + el.textContent);
      // 一行里有几种文字，就按参照字最矮的那种定字号，保证每种文字都不低于 capPct
      // （实测日文页脚按汉字定字号时，夹在里面的 "SNS" 只有 2.16%）
      const ratio = Math.min(...(refs.length ? refs : ["H"]).map((ref) => {
        const mt = cv.measureText(ref);
        return (mt.actualBoundingBoxAscent + (ref === "国" ? mt.actualBoundingBoxDescent : 0)) / 1000;
      }));
      // 目标字高向上取整到整像素（实测不取整时俄文页脚量出 2.44%，差 1px）
      el.style.fontSize = Math.ceil((+el.dataset.cap / 100) * H) / ratio + "px";
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

async function render(doc, outPng) {
  const errs = validate(doc);
  if (errs.length) throw new Error("文字图层文档不合法：\n" + errs.join("\n"));
  const { width: W, height: H } = doc.canvas;
  const slots = await withPage(W, H, pageHtml(doc, W, H), async (page) => {
    const r = await sizeAndMeasure(page, H);
    await page.screenshot({ path: outPng });
    return r;
  });
  const m = loadTemplate(doc.template).textLayer.safeMargin;
  // 文字实际排出来越过安全边距（例如商户把字号拉大、行数变多）→ 报给编辑器，由它提示商户
  const outsideSafeArea = Object.entries(slots).filter(([, v]) => v.box[3] > H * (1 - m) + 1 || v.box[2] > W * (1 - m) + 1).map(([k]) => k);
  // 行与行重叠（商户拖动或换字体后常见）→ 报给编辑器
  const overlaps = [];
  const names = Object.keys(slots);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const [a, b] = [slots[names[i]].box, slots[names[j]].box];
    if (Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 2 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 2) overlaps.push([names[i], names[j]]);
  }
  const full = { slots, outsideSafeArea, overlaps };
  fs.writeFileSync(outPng.replace(/\.png$/, ".render.json"), JSON.stringify(full, null, 1)); // 不叫 .json：曾与同名的识图结果互相覆盖
  return full;
}

/** 模板默认字体 → 按 lang 排序并锁定版本（取字体存储里已复制的最新版本）。
 *  拉丁排第一（数字、英文品牌名都走它）；其次是文案语言自己的字体——同一个汉字在简 / 繁 / 日字体里写法不同，顺序决定用哪套字形。 */
function defaultFontsFor(tl, lang) {
  const map = tl.defaultFonts;
  const own = { en: "latin", ru: "cyrillic", th: "thai", "zh-Hans": "zh-Hans", "zh-Hant": "zh-Hant", ja: "ja" }[lang];
  const order = ["latin", own, "cyrillic", "thai", "zh-Hans", "zh-Hant", "ja"];
  const families = [...new Set(order.map((k) => map[k]).filter(Boolean))];
  return families.map((family) => {
    const dir = path.join(fontRootDir(), slug(family));
    const versions = fs.existsSync(dir) ? fs.readdirSync(dir).filter((v) => /^v\d+$/.test(v)).sort((a, b) => +b.slice(1) - +a.slice(1)) : [];
    if (!versions.length) throw new Error(`模板默认字体 ${family} 还没复制到字体存储：python3 font_mirror.py mirror <catalog> "${family}" ${fontRootDir()}`);
    return { family, version: versions[0] };
  });
}

/** 模板 + 文案 → 初始文档：按模板 initialLayout 排一遍（左上文字列 + 底边一行），把每行的位置写成绝对坐标（画面比例）。 */
async function init(basePath, copy, templateId, effect, accent, segmentsHint, lang, font = null) {
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
  if (!LANGS.includes(lang)) throw new Error(`--lang 只能是 ${LANGS.join(" / ")}`);
  const doc = {
    version: 1, template: templateId, lang, canvas: { width: W, height: H }, base: path.resolve(basePath), defaultFonts: defaultFontsFor(tl, lang),
    accent: accent ?? t.palette.accentDefault.match(/#[0-9A-Fa-f]{6}/)[0], effect: effect ?? tl.defaultEffect, lines: [],
    ...(font ? { font } : {}),
  };
  const measure = (lines) => withPage(W, H, pageHtml({ ...doc, lines }, W, H), (page) => sizeAndMeasure(page, H));

  // 左上文字列：角标 → 标题 → 副标题，逐行叠放。列底越过 columnBottom、或有段放不进列宽 → 整体缩小再排；
  // 字号不低于 minCapPct；为了让一段不被拆开最多缩到 widthShrinkFloor 倍（再小标题就失去层级）。
  const colSlots = ["badge", "headline", "subheadline"].filter((s) => filled.includes(s));
  // 文字列宽不足以放下一整段时，整列按比例缩小，最多缩到 widthShrinkFloor 倍；再放不下就让那一段段内断行（渲染器会报出来）
  const fullW = +(1 - 2 * L.margin).toFixed(4);
  for (let scale = 1; ; scale -= 0.02) {
    let y = L.columnTop;
    let split = false;
    const lines = [];
    for (const s of colSlots) {
      // 单行槽（角标）不换行：框宽按实际文字宽给，可以比文字列宽，但不出安全区
      const single = tl.slots[s].maxLines === 1;
      const l = mk(s, L.margin, +y.toFixed(4), single ? fullW : L.columnMaxWidth, "left", scale);
      const r = (await measure([l]))[s];
      if (single) l.w = Math.min(fullW, +((r.box[2] - r.box[0]) / W + 0.005).toFixed(4));
      split ||= r.unlockedSegments.length > 0;
      lines.push(l);
      y += (r.box[3] - r.box[1]) / H + L.columnGap;
    }
    const tooLow = y - L.columnGap > L.columnBottom;
    if ((tooLow && scale - 0.02 >= 0.5) || (split && scale - 0.02 >= L.widthShrinkFloor)) continue;
    doc.lines.push(...lines);
    break;
  }
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
    // 页脚放不进一行就先缩到最小字号再试；仍放不下才接受两行（底边对齐，向上长）
    let scale = 1;
    let r = await measure([mk("small", L.margin, 0.5, w, "left")]);
    if (r.small.lines > 1) { scale = tl.minCapPct / tl.slots.small.capPct; r = await measure([mk("small", L.margin, 0.5, w, "left", scale)]); }
    doc.lines.push(mk("small", L.margin, +(L.baseline - (r.small.box[3] - r.small.box[1]) / H).toFixed(4), w, "left", scale));
  }
  doc.lines.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  return doc;
}

function fontRootDir() { return path.resolve(opt("--font-root", "fonts")); }
function fontRootUrl() { const r = opt("--font-root", "fonts"); return /^https?:/.test(r) ? r.replace(/\/$/, "") : "file://" + path.resolve(r); }
try {
  if (cmd === "init") {
    const [, base, copyPath, templateId, docPath] = args;
    const copy = JSON.parse(fs.readFileSync(copyPath, "utf8"));
    const seg = opt("--segments") ? JSON.parse(fs.readFileSync(opt("--segments"), "utf8")) : null;
    const f = opt("--font");
    const font = f ? { family: f.slice(0, f.lastIndexOf("@")), version: f.slice(f.lastIndexOf("@") + 1) } : null;
    const doc = await init(base, copy, templateId, opt("--effect"), opt("--accent"), seg, opt("--lang"), font);
    fs.writeFileSync(docPath, JSON.stringify(doc, null, 1));
    const errs = validate(doc);
    console.log(docPath, errs.length ? "INVALID:\n" + errs.join("\n") : "valid");
  } else if (cmd === "render") {
    const [, docPath, out] = args;
    const r = await render(JSON.parse(fs.readFileSync(docPath, "utf8")), out);
    const brief = Object.fromEntries(Object.entries(r.slots).map(([k, v]) => [k, { lines: v.lines, fontPx: v.fontPx, unlocked: v.unlockedSegments }]));
    console.log(out, JSON.stringify(brief), "outsideSafeArea:", JSON.stringify(r.outsideSafeArea), "overlaps:", JSON.stringify(r.overlaps));
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
