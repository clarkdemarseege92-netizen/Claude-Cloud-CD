# 配图风格模板（流程 A）

商户选一张模板 → 写一句画面主体 → 填文案 → 代码把「模板 + 主体 + 文案」拼成一条英文生图提示词。

本文件是模板的**唯一来源**：每张模板的 ```json 代码块可以原样转成代码常量；
`tools/build_prompt.py` 就是直接解析这些代码块来拼提示词的，验收用的提示词全部由它生成。

## 通用约定（所有模板共用，由代码拼接，不写进单张模板）

- 画幅一律 `4:5`（竖版）。
- 文案五个槽，顺序固定：`headline / subheadline / badge / small / brand`。空槽不进提示词。
- 模板只写风格，不写内容：模板文本里不出现任何具体物件，也不出现任何语言的示例字。
- 字号用「字高占画面高度的百分比」，最小一级 ≥ 2.5%。量法：拉丁字母量大写字母高（cap height），
  方块字量整字高，其他文字量主体笔画高（不含上下附加符号）。
- 字体只写类别（粗黑体、衬线……），生图模型加载不了字体文件。
- 配色里的 `{accent}` 是强调色槽：商户设了品牌色就换成品牌色，没设就用模板的 `accentDefault`。
- 每张模板的 `avoid` 都写明「不画真实商标、不出现文案以外的文字」。

### 拼装顺序（`tools/build_prompt.py`）

全部是连贯的英文句子，不加 `Subject:` 之类的标签。

1. `{medium} in a portrait 4:5 format, showing {subject}.` ← 第一句先写媒介和主体
2. `canvas`（画幅与留白）
3. `technique`（画面手法）
4. `lighting`（光线与气质）
5. `palette.base` + 强调色句（`{accent}` 已替换）+ `palette.accentRole`
6. 文案段：先说「画面上恰好有 N 行字，逐字照写」，再按槽的顺序每槽一句：
   `The {槽名} reads "{文案}": {typography.style}, with letters about {heightPct}% of the image height tall, {layout}.`
   模板若有 `sizeRelation`，紧跟在各槽句子之后。
7. 唯一性句：这 N 行是画面上仅有的字，每行只出现一次、不在主体里的屏幕/招牌上重复；品牌名照原样书写，不要设计成标志。
   再加最小字号句 `minSize`（`{minSize}` 取已填槽里最小的字高；默认写成 "X% of the image height"，`--unit px` 时写成 "N pixels"）和大小写句 `caseRule`。
8. `avoid`
9. 通用尾句（所有模板相同）：

```json
{
  "copyClosing": "These {count} lines are the only words anywhere in the image, and each appears once, only in the position described, never repeated on screens, signs or objects inside the picture. Write the brand name {brand} exactly as given, as plain lettering, not designed as a logo, emblem or monogram.",
  "copyClosingNoBrand": "These {count} lines are the only words anywhere in the image, and each appears once, only in the position described, never repeated on screens, signs or objects inside the picture.",
  "minSize": "No line of text may be smaller than stated: even the smallest line must be comfortably readable on a phone screen, with letters at least {minSize} tall; when in doubt, set the text larger, never smaller.",
  "caseRule": "Keep the upper- and lower-case letters of every line exactly as written; do not turn any line into all capitals.",
  "noText": "No text, no lettering, no logos, no watermark anywhere in the image.",
  "fixedTail": "Do not translate, shorten, repeat or restyle the wording of any line. Do not add religious or cultural symbols unless the subject itself asks for them."
}
```

槽名在提示词里的写法：

```json
{
  "headline": "headline",
  "subheadline": "subheading",
  "badge": "badge",
  "small": "footer line",
  "brand": "brand name"
}
```

### 代码排字模式（定稿流程）

生图模型只出**无字底图**；文字由代码用真实字体、HTML/CSS 排上去（`tools/render_html.mjs`，Chromium）。

1. 生图提示词：`build_no_text`（`tools/build_prompt.py`），用模板的 `canvasNoText`（规定放字的暗部区域）、`palette.baseNoText` / `accentRoleNoText`、`avoidNoText`，末尾加通用 `noText` 句。
2. `init`：模板 `textLayer` + 文案 → **文字图层文档**（下一节）。默认按空格分段；**不调用任何 AI**（不识图、不切词）——母语文字的断行和位置由商户在编辑器里一眼看出、手动调整；不熟悉的外国文字，商户真正需要的是翻译准确，那属于文案环节。
3. 编辑器：商户拖动位置、调字号、在任意字处断行（把一段拆开 + `forceBreaks`）、换特效预设 / 颜色角色——**改的就是这份文档**。亮度粗检（`tools/check_text.py` 的逻辑，深色模板适用）可作为实时提示：字压到画面里的东西时标红。
4. `render`：服务端校验文档 → 同一套 HTML/CSS 截图出成品。编辑器里看到的和导出的是同一份 CSS。

#### 模板里的 `textLayer`（初始值 + 约束）

| 字段 | 含义 |
|---|---|
| `fontFamily` | 字体类别；代码映射到字体文件（`geometric-sans` → Inter + Noto Sans Thai；正式实现补中日韩、西里尔用的 Noto） |
| `safeMargin` | 安全边距（画面比例）：任何文字框不得越出 |
| `minCapPct` / `maxCapPct` | 字高上下限（参照字高 / 画高 ×100）。**2.5 是硬下限，编辑器和服务端都要挡** |
| `accentLight` / `accentDark` | 强调色向白 / 向黑混合的比例，生成 `--accent-light` / `--accent-dark` |
| `colors` | 允许的颜色角色：角色名 → 固定色，或 `accent` / `accentLight`（跟品牌色走） |
| `initialLayout` | `init` 用的初始版式：边距、文字列顶 / 宽 / 间距 / 底、底边基线、`widthShrinkFloor`（为了不拆开一段最多缩到几倍） |
| `slots` | 每槽默认字高 `capPct`、字重、颜色角色、行高、`maxLines`、`pill`（胶囊框） |
| `effects` / `defaultEffect` | 特效预设：id → 一段 CSS（选择器 `.t` 是所有行，`.headline` 等是单槽；颜色只用 `var(--accent…)` 或 `currentColor`）。编辑器只能在这些预设里选 |

字高口径：按文字体系取参照字——拉丁 `H`、西里尔 `Н`、泰文 `ก`（不含上下附加符号）、中日 `国`（整字）。同字号下泰文辅音只有拉丁大写的约 3/4，不分体系的话泰文会掉到 2% 以下（实测 1.99%）。

#### 文字图层文档（TextLayerDoc v1）

一张图一份。示例：`examples/dark-floating.ezitak-th.doc.json`、`examples/dark-floating.ezitak-en.doc.json`。

```text
{
  "version": 1,
  "template": "dark-floating",                  // 模板 id
  "canvas": { "width": 1408, "height": 1760 },  // 底图像素尺寸
  "base": "<底图：服务端绝对路径或 URL>",
  "accent": "#0F9D8A",                          // 强调色：商户品牌色，未设则用模板默认
  "effect": "stroke",                           // 必须是模板 textLayer.effects 里的 id
  "lines": [                                    // 每个有文案的槽一行，槽名不重复；空槽不出现
    {
      "slot": "headline",                       // badge / headline / subheadline / small / brand
      "text": "ทุกข้อความ ตอบกลับในไม่กี่วินาที",       // ≤ 80 字（与产品代码 COPY_LINE_MAX_CHARS 一致）
      "segments": ["ทุกข้อความ ", "ตอบกลับ", "ในไม่กี่วินาที"],  // 断行单位，拼起来必须与 text 逐字相同；只在段与段之间换行
      "forceBreaks": [1],                       // 在这些下标的段前强制换行（商户在编辑器里点的）
      "x": 0.055, "y": 0.0857, "w": 0.5,        // 文字框左上角和宽度（画面比例）；高度由排版决定
      "align": "left",                          // left / right / center
      "capPct": 3.22,                           // 参照字高 / 画高 ×100，范围 [minCapPct, maxCapPct]
      "weight": 800, "color": "white", "lineHeight": 1.12   // color 必须是模板 colors 里的角色名
    }
  ]
}
```

规则（`render_html.mjs validate`；服务端必须执行——文档来自浏览器，不可信）：
- `segments.join("") === text`：编辑器只能改断行，不能借断行偷改字；改字要同时改 `text` 和 `segments`。
- 某一段比文字框还宽时，渲染器**只对那一段**放开段内断行，并在输出里报 `unlockedSegments`，编辑器应提示商户加宽框或缩小字号。
- 排出来的文字越过安全边距时，渲染器输出 `outsideSafeArea`，编辑器应提示。
- 颜色、特效只能取模板里列出的值；不接受任意 CSS。

`segments` 的来源：`init` 按空格切（空格留在前一段末尾）。不用空格分词的文字（泰文等）一整段放不下时，浏览器在段内自行断行；断得不对由商户在编辑器里拆段、强制换行或调宽度。编辑器拆段 / 合并时只改切分方式，拼起来必须仍与 `text` 逐字相同。

---

## 1. 深色漂浮 `dark-floating`

**适合哪类商户**：想显得现代、有科技感或高级感的商户，比如数码/手机维修、美容美甲、健身工作室、
SaaS/线上服务。主体是单件物品或一个画面时效果最好。

| 项 | 内容 |
|---|---|
| 画幅与留白 | 4:5；近黑底铺满，主体略偏右、约占画高一半多，四周大面积留暗；字小、贴角，直接压在暗底上，背后没有色块 |
| 版式 | 左上一列左对齐：角标在最上，下面紧接标题、副标题（都在画面上部，副标题不碰主体），整列限制在画面左侧 55% 宽度内；小字左下；品牌名右下，与小字同一基线 |
| 字体层级 | 角标、副标题、小字、品牌四行**同字号**（≥ 标题字高一半），只靠颜色和粗细区分。标题 6%（粗几何黑体，白，最多三行）/ 副标题 4%（常规黑体，强调色浅色调，最多两行）/ 角标 3.5%（粗黑体，强调色，细描边圆角框、无填充）/ 小字 4%（常规黑体，浅灰，与副标题一样大；提示词里叫 footer line，避免被当成脚注缩小）/ 品牌 3.5%（粗黑体，白，宽字距） |
| 配色 | 近黑底、白、浅灰 + 强调色 `{accent}`，默认电光紫 `#7C5CFF`；两级强调：强调色本色 + 浅色调 |
| 画面手法 | 精致 3D 渲染（主体里的人物也用同一种 3D 质感，不做成照片）；主体周围一圈 5–7 个小的光滑 3D 漂浮物，前后错落，全部取自主体本身的简化符号，不带任何字；主体和漂浮物都清晰锐利，最多最远的一两个略虚 |
| 光线与气质 | 左上一盏柔和主光 + 强调色轮廓光，主体下方一抹强调色辉光；沉静、高级、现代，大部分画面在暗部 |
| avoid | 不画真实商标、应用图标、水印；不出现文案以外的任何字、字母、数字；无边框、无横幅文字框、无主体以外新增的人或物；不画单独漂浮的手、身体部位或手势 |
| 文字特效（代码排字） | 三个预设，默认 `glow` 柔和发光（标题白字 + 强调色光晕；角标强调色描边胶囊 + 外发光）；可选 `stroke` 描边、`gradient` 渐变字。CSS 见 `textLayer.effects`，颜色全部走 `--accent` 系列变量和颜色角色 |

```json
{
  "id": "dark-floating",
  "name": "深色漂浮",
  "fitFor": "想显得现代、有科技感或高级感的商户（数码/手机维修、美容美甲、健身工作室、线上服务）；主体是单件物品或一个画面时效果最好。",
  "aspectRatio": "4:5",
  "medium": "A polished 3D-rendered promotional poster",
  "canvas": "A deep, almost black background fills the whole frame. The subject sits slightly right of centre and takes up a little over half of the frame height, with wide dark margins on every side. All text is kept close to the edges, set directly on the dark background with nothing behind it, no panel, box, banner or strip; the middle of the frame belongs to the subject alone.",
  "technique": "A loose ring of five to seven small glossy 3D objects floats around the subject at different depths; each one is a simplified symbol taken from the subject itself rather than anything new, and none of them carries any lettering. Smooth clay-like 3D rendering with a soft sheen, and the subject, including any people in it, is rendered in exactly the same 3D style as the floating objects rather than as a photograph. The subject is in crisp, sharp focus with clean edges and fine detail, and so are the floating objects; only the one or two smallest objects farthest in the background may be very slightly softened.",
  "lighting": "Lit by one soft key light from the upper left and a thin rim light in the accent colour, with a faint accent-coloured glow pooling beneath the subject. The mood is calm, premium and modern, with most of the frame left in deep shadow.",
  "palette": {
    "base": "The colours stay restrained: near-black background, white for the headline and the brand name, light grey for the footer line, and the subject's own natural colours.",
    "baseNoText": "The colours stay restrained: a near-black background and the subject's own natural colours.",
    "accentSentence": "The accent colour is {accent}.",
    "accentDefault": "electric violet (#7C5CFF)",
    "accentRole": "The accent colour appears on the badge, in the rim light and on two or three of the floating objects; a lighter tint of the same accent is used for the subheading. No other saturated colours are added to the background or the text.",
    "accentRoleNoText": "The accent colour appears in the rim light and on two or three of the floating objects. No other saturated colours are added to the background."
  },
  "layout": {
    "headline": "placed directly under the badge in the upper part of the frame, aligned to the left margin, with the whole text column staying within the left fifty-five percent of the frame width",
    "subheadline": "placed directly under the headline with the same left alignment, kept clear of the subject",
    "badge": "placed in the top-left corner on the top and left margins, above the headline",
    "small": "placed in the bottom-left corner on the bottom margin",
    "brand": "placed in the bottom-right corner on the same baseline as the footer line"
  },
  "typography": {
    "headline": { "heightPct": 6, "style": "set in a heavy geometric sans-serif in white, in no more than three lines" },
    "subheadline": { "heightPct": 4, "style": "set in a regular-weight sans-serif in the light tint of the accent colour, in no more than two lines" },
    "badge": { "heightPct": 3.5, "style": "set in a bold sans-serif in the accent colour inside a thin rounded outline of the same colour, with no fill" },
    "small": { "heightPct": 4, "style": "set in a regular-weight sans-serif in light grey, exactly as large as the subheading" },
    "brand": { "heightPct": 3.5, "style": "set in a bold sans-serif in white with wide letter spacing" }
  },
  "canvasNoText": "A deep, almost black background fills the whole frame. The subject sits in the lower right part of the frame, its centre about three fifths of the way across and a little below the middle, and it takes up about half of the frame height. The upper-left area, a little over half the frame wide and the top half of the frame tall, is calm dark background with only a soft gradient and nothing in it, and so is a band along the bottom edge; the floating objects stay around the subject on the right and lower part of the frame and never drift into these areas.",
  "avoidNoText": "Do not draw any real brand logo, trademark, app icon or watermark. No frames or borders, no banners or panels, and no extra people or objects that are not part of the subject or its floating ring. No hands, body parts or hand gestures floating on their own.",
  "textLayer": {
    "fontFamily": "geometric-sans",
    "safeMargin": 0.03,
    "minCapPct": 2.5,
    "maxCapPct": 12,
    "accentLight": 0.45,
    "accentDark": 0.45,
    "colors": {
      "white": "#FFFFFF",
      "grey": "#C9CAD6",
      "accent": "accent",
      "accentLight": "accentLight"
    },
    "initialLayout": {
      "margin": 0.055,
      "columnTop": 0.055,
      "columnMaxWidth": 0.5,
      "columnGap": 0.022,
      "columnBottom": 0.5,
      "baseline": 0.945,
      "widthShrinkFloor": 0.75
    },
    "slots": {
      "badge": {
        "capPct": 2.6,
        "weight": 700,
        "color": "accent",
        "lineHeight": 1,
        "maxLines": 1,
        "pill": true
      },
      "headline": {
        "capPct": 4.6,
        "weight": 800,
        "color": "white",
        "lineHeight": 1.12,
        "maxLines": 3
      },
      "subheadline": {
        "capPct": 2.7,
        "weight": 400,
        "color": "accentLight",
        "lineHeight": 1.3,
        "maxLines": 3
      },
      "small": {
        "capPct": 2.6,
        "weight": 400,
        "color": "grey",
        "lineHeight": 1.3,
        "maxLines": 2
      },
      "brand": {
        "capPct": 3.2,
        "weight": 800,
        "color": "white",
        "lineHeight": 1,
        "maxLines": 1
      }
    },
    "defaultEffect": "glow",
    "effects": {
      "glow": ".t { text-shadow: 0 .04em .12em rgba(0,0,0,.6); } .headline { text-shadow: 0 0 .35em color-mix(in srgb, var(--accent) 55%, transparent), 0 .04em .12em rgba(0,0,0,.6); } .subheadline { text-shadow: 0 0 .5em color-mix(in srgb, var(--accent) 35%, transparent), 0 .04em .12em rgba(0,0,0,.6); } .badge { text-shadow: none; border: .09em solid currentColor; box-shadow: 0 0 .6em color-mix(in srgb, var(--accent) 45%, transparent), inset 0 0 .4em color-mix(in srgb, var(--accent) 25%, transparent); } .brand { letter-spacing: .04em; text-shadow: 0 0 .3em color-mix(in srgb, var(--accent) 50%, transparent); }",
      "stroke": ".t { -webkit-text-stroke: .05em var(--accent-dark); paint-order: stroke fill; } .headline { -webkit-text-stroke: .07em var(--accent); text-shadow: .05em .07em 0 rgba(0,0,0,.85); } .small { -webkit-text-stroke: .05em #000; } .badge { -webkit-text-stroke: 0; color: #fff !important; background: var(--accent); border: .09em solid var(--accent); } .brand { letter-spacing: .04em; -webkit-text-stroke: .07em var(--accent); }",
      "gradient": ".headline { background: linear-gradient(180deg, #fff 15%, var(--accent-light) 70%, var(--accent) 100%); -webkit-background-clip: text; background-clip: text; color: transparent !important; filter: drop-shadow(0 .05em .15em rgba(0,0,0,.6)); } .badge { color: #fff !important; background: linear-gradient(90deg, var(--accent), var(--accent-light)); border: .09em solid transparent; } .brand { letter-spacing: .04em; background: linear-gradient(90deg, #fff, var(--accent-light)); -webkit-background-clip: text; background-clip: text; color: transparent !important; }"
    }
  },
  "sizeRelation": "The badge, the subheading, the footer line and the brand name are all set at the same text size, at least half the height of the headline letters; they differ from each other only in colour and weight, never in size.",
  "avoid": "Do not draw any real brand logo, trademark, app icon or watermark, and do not add any words, letters or numbers beyond the lines listed above. No frames or borders, no banners or text boxes, and no extra people or objects that are not part of the subject or its floating ring."
}
```
