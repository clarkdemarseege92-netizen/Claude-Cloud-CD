// 用 Chromium（Playwright）把文案按 HTML/CSS 排到无字底图上，支持 CSS 文字特效。
//
//   node render_html.mjs <base.png> <copy.json> <effect> <out.png> --font-dir <dir> [--accent #7C5CFF]
//
// 字号按「大写字母高 / 画高」（capPct）换算；文字列超出 column.bottom 时整体缩小，任何一行不低于 minCapPct。
// 输出同名 .json：每行实际字号、行数，以及在浏览器里量到的字形高度。
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // 预装在全局，ESM import 解析不到
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [basePath, copyPath, effect, outPath] = args;
const fontDir = path.resolve(opt("--font-dir"));
const accent = opt("--accent", "#7C5CFF");
const copy = JSON.parse(fs.readFileSync(copyPath, "utf8"));

// 与 templates.md 里 dark-floating.textLayer 同一组数
const spec = {
  margin: 0.055, top: 0.055, maxWidth: 0.5, gap: 0.022, bottom: 0.5, baseline: 0.945, minCapPct: 2.5,
  slots: {
    badge: { capPct: 2.6, weight: 700 },
    headline: { capPct: 4.6, weight: 800, lineHeight: 1.12 },
    subheadline: { capPct: 2.7, weight: 400, lineHeight: 1.3 },
    small: { capPct: 2.6, weight: 400, lineHeight: 1.3 },
    brand: { capPct: 3.2, weight: 800 },
  },
};

const hex = (h) => h.replace("#", "").match(/../g).map((x) => parseInt(x, 16));
const [ar, ag, ab] = hex(accent);
const mixW = (t) => `rgb(${[ar, ag, ab].map((c) => Math.round(c + (255 - c) * t)).join(",")})`;
const A = (a) => `rgba(${ar},${ag},${ab},${a})`;
const accentLight = mixW(0.45);
const accentDark = `rgb(${[ar, ag, ab].map((c) => Math.round(c * 0.45)).join(",")})`;

// 每种特效 = 一组 CSS；正式实现时每张模板带一组，写在模板的 textLayer.effect 里
const EFFECTS = {
  glow: `
    .headline { color:#fff; text-shadow: 0 0 .35em ${A(0.55)}, 0 .04em .12em rgba(0,0,0,.6); }
    .subheadline { color:${accentLight}; text-shadow: 0 0 .5em ${A(0.35)}; }
    .badge { color:${accent}; border:.09em solid ${accent}; box-shadow: 0 0 .6em ${A(0.45)}, inset 0 0 .4em ${A(0.25)}; }
    .small { color:#C9CAD6; } .brand { color:#fff; text-shadow: 0 0 .3em ${A(0.5)}; }`,
  stroke: `
    .headline { color:#fff; -webkit-text-stroke: .07em ${accent}; paint-order: stroke fill; text-shadow: .05em .07em 0 rgba(0,0,0,.85); }
    .subheadline { color:#fff; -webkit-text-stroke: .05em ${accentDark}; paint-order: stroke fill; }
    .badge { color:#fff; background:${accent}; border:.09em solid ${accent}; }
    .small { color:#fff; -webkit-text-stroke: .05em #000; paint-order: stroke fill; }
    .brand { color:#fff; -webkit-text-stroke: .07em ${accent}; paint-order: stroke fill; }`,
  gradient: `
    .headline { background: linear-gradient(180deg, #ffffff 15%, ${accentLight} 70%, ${accent} 100%); -webkit-background-clip:text; background-clip:text; color:transparent; filter: drop-shadow(0 .05em .15em rgba(0,0,0,.6)); }
    .subheadline { color:${accentLight}; }
    .badge { color:#fff; background: linear-gradient(90deg, ${accent}, ${accentLight}); border:.09em solid transparent; }
    .small { color:#C9CAD6; }
    .brand { background: linear-gradient(90deg, #fff, ${accentLight}); -webkit-background-clip:text; background-clip:text; color:transparent; }`,
  neon: `
    .headline { color:#fff; text-shadow: 0 0 .04em #fff, 0 0 .15em ${accent}, 0 0 .4em ${accent}, 0 0 .9em ${accent}, 0 0 1.6em ${A(0.6)}; }
    .subheadline { color:#f2edff; text-shadow: 0 0 .2em ${accent}, 0 0 .6em ${A(0.7)}; }
    .badge { color:#fff; border:.09em solid #fff; box-shadow: 0 0 .25em ${accent}, 0 0 .7em ${accent}, inset 0 0 .4em ${accent}; text-shadow: 0 0 .3em ${accent}; }
    .small { color:#e8e6f5; text-shadow: 0 0 .4em ${A(0.6)}; }
    .brand { color:#fff; text-shadow: 0 0 .1em #fff, 0 0 .4em ${accent}, 0 0 1em ${accent}; }`,
  extrude: `
    .headline { color:#fff; text-shadow: ${Array.from({ length: 9 }, (_, i) => `${(i + 1) * 0.006}em ${(i + 1) * 0.008}em 0 ${i < 8 ? accentDark : "rgba(0,0,0,.6)"}`).join(", ")}, .1em .14em .25em rgba(0,0,0,.7); }
    .subheadline { color:${accentLight}; text-shadow: .03em .04em 0 rgba(0,0,0,.8); }
    .badge { color:#fff; background:${accent}; border:.09em solid ${accent}; box-shadow: .1em .14em 0 ${accentDark}; }
    .small { color:#C9CAD6; }
    .brand { color:#fff; text-shadow: ${Array.from({ length: 6 }, (_, i) => `${(i + 1) * 0.006}em ${(i + 1) * 0.008}em 0 ${accentDark}`).join(", ")}; }`,
};

const fileUrl = (p) => "file://" + p;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Inter; src: url("${fileUrl(fontDir + "/Inter-var.ttf")}"); font-weight: 100 900; }
@font-face { font-family: "Noto Sans Thai"; src: url("${fileUrl(fontDir + "/NotoSansThai-var.ttf")}"); font-weight: 100 900; }
html,body { margin:0; padding:0; }
#c { position:relative; width:var(--W); height:var(--H); background:url("${fileUrl(path.resolve(basePath))}") center/cover; overflow:hidden;
     font-family: Inter, "Noto Sans Thai", sans-serif; }
.col { position:absolute; left:calc(var(--W) * ${spec.margin}); top:calc(var(--H) * ${spec.top}); width:calc(var(--W) * ${spec.maxWidth}); }
.col > * { display:block; margin:0 0 calc(var(--H) * ${spec.gap}) 0; }
.badge { display:inline-block !important; border-radius:999px; padding:.42em .9em; line-height:1; white-space:nowrap; }
.foot { position:absolute; left:calc(var(--W) * ${spec.margin}); right:calc(var(--W) * ${spec.margin}); bottom:calc(var(--H) * ${(1 - spec.baseline).toFixed(3)});
        display:flex; align-items:flex-end; justify-content:space-between; gap:calc(var(--W) * .05); }
.small { flex:1 1 auto; } .brand { flex:0 0 auto; letter-spacing:.04em; white-space:nowrap; line-height:1; }
${EFFECTS[effect]}
</style></head><body><div id="c">
<div class="col">
  ${copy.badge ? `<div><span class="badge t" data-slot="badge"></span></div>` : ""}
  ${copy.headline ? `<div class="headline t" data-slot="headline"></div>` : ""}
  ${copy.subheadline ? `<div class="subheadline t" data-slot="subheadline"></div>` : ""}
</div>
<div class="foot">
  ${copy.small ? `<div class="small t" data-slot="small"></div>` : "<div></div>"}
  ${copy.brand ? `<div class="brand t" data-slot="brand"></div>` : ""}
</div></div></body></html>`;

const tmpHtml = outPath.replace(/\.png$/, ".html");
fs.writeFileSync(tmpHtml, html);

const browser = await chromium.launch();
const { width: W, height: H } = await (async () => {
  const p = await browser.newPage();
  await p.goto(fileUrl(path.resolve(basePath)));
  const s = await p.evaluate(() => ({ width: document.images[0].naturalWidth, height: document.images[0].naturalHeight }));
  await p.close();
  return s;
})();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(fileUrl(path.resolve(tmpHtml)));
const report = await page.evaluate(async ({ copy, spec, W, H }) => {
  document.documentElement.style.setProperty("--W", W + "px");
  document.documentElement.style.setProperty("--H", H + "px");
  // 泰文等不用空格分词的文字：浏览器按词典断行，会把复合词拆开（实测 "ตอบกลับ" 被拆成两行）。
  // 商户原文里的空格就是短语边界：每段包成不换行的 span，只在空格处换行；某段放不下时再放开（见下方 unlockLongChunks）。
  const noSpaceScript = (t) => /[\u0E00-\u0E7F\u0E80-\u0EFF\u1000-\u109F\u1780-\u17FF]/.test(t);
  for (const el of document.querySelectorAll(".t")) {
    const text = copy[el.dataset.slot];
    if (noSpaceScript(text) && text.includes(" ")) {
      el.textContent = "";
      text.split(" ").forEach((chunk, i) => {
        if (i) el.append(" ");
        const sp = document.createElement("span");
        sp.className = "chunk"; sp.style.whiteSpace = "nowrap"; sp.textContent = chunk;
        el.append(sp);
      });
    } else el.textContent = text;
  }
  await document.fonts.ready;
  // 字高口径按文字体系取参照字：拉丁量大写 H、西里尔量 Н、泰文量辅音 ก（不含上下附加符号）、中日韩量整字 国。
  // 同一字号下泰文辅音只有拉丁大写的约 3/4，不分体系的话泰文最小字会掉到 2% 以下（实测 1.99%）。
  const cv = document.createElement("canvas").getContext("2d");
  const refChar = (t) => /[\u0E00-\u0E7F]/.test(t) ? "ก" : /[\u3040-\u30FF\u4E00-\u9FFF]/.test(t) ? "国" : /[\u0400-\u04FF]/.test(t) ? "Н" : "H";
  const ratioFor = (el) => {
    cv.font = `${getComputedStyle(el).fontWeight} 1000px ${getComputedStyle(el).fontFamily}`;
    const m = cv.measureText(refChar(el.textContent));
    return (m.actualBoundingBoxAscent + (refChar(el.textContent) === "国" ? m.actualBoundingBoxDescent : 0)) / 1000;
  };
  const capRatio = (() => { cv.font = "400 1000px Inter"; return cv.measureText("H").actualBoundingBoxAscent / 1000; })();
  const apply = (scale) => {
    for (const el of document.querySelectorAll(".t")) {
      const s = spec.slots[el.dataset.slot];
      const cap = Math.max(s.capPct * (["badge", "headline", "subheadline"].includes(el.dataset.slot) ? scale : 1), spec.minCapPct);
      el.style.fontWeight = s.weight;
      el.dataset.ref = refChar(el.textContent);
      el.style.fontSize = (cap / 100 * H) / ratioFor(el) + "px";
      el.style.fontWeight = s.weight;
      if (s.lineHeight) el.style.lineHeight = s.lineHeight;
      el.dataset.cap = cap.toFixed(2);
    }
  };
  let scale = 1;
  apply(scale);
  const colBottom = () => document.querySelector(".col").getBoundingClientRect().bottom - H * spec.gap;
  const tooWide = () => [...document.querySelectorAll(".chunk")].filter(
    (sp) => sp.style.whiteSpace === "nowrap" && sp.getBoundingClientRect().width > sp.parentElement.getBoundingClientRect().width + 1);
  // 先缩字号，让每段短语都放得进一行、文字列也不越过空白区底边
  // 为了让短语不拆行最多缩到 0.75 倍，再小标题就和正文一样大、层级没了（实测泰文缩到 0.56 倍时标题只剩 2.58%）
  while (tooWide().length && scale > 0.75) { scale -= 0.02; apply(scale); }
  while (colBottom() > spec.bottom * H && scale > 0.5) { scale -= 0.02; apply(scale); }
  // 缩到最小字号仍放不下的短语 → 只对那一段放开断行，绝不让字溢出画面；放开后再按高度收一次
  const unlocked = tooWide().map((sp) => { sp.style.whiteSpace = "normal"; return sp.textContent; });
  while (colBottom() > spec.bottom * H && scale > 0.5) { scale -= 0.02; apply(scale); }
  const out = { unlockedChunks: unlocked, capRatio: +capRatio.toFixed(3), scale: +scale.toFixed(2), columnBottomPct: +(colBottom() / H * 100).toFixed(1), slots: {} };
  for (const el of document.querySelectorAll(".t")) {
    const r = document.createRange(); r.selectNodeContents(el);
    const lines = new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    out.slots[el.dataset.slot] = { capPct: +el.dataset.cap, ref: el.dataset.ref, fontPx: Math.round(parseFloat(el.style.fontSize)), lines };
  }
  return out;
}, { copy, spec, W, H });
await page.screenshot({ path: outPath });
await browser.close();
fs.writeFileSync(outPath.replace(/\.png$/, ".json"), JSON.stringify({ effect, accent, ...report }, null, 1));
console.log(outPath, JSON.stringify(report));
