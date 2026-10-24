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

### 代码排字模式（试验中，2026-10-24 起）

生图模型只出**无字底图**，文字由代码用真实字体排上去（`tools/render_text.py`）。

- 生图提示词：`build_no_text`，用模板的 `canvasNoText`（规定放字的暗部区域）、`palette.baseNoText` / `accentRoleNoText`、`avoidNoText`，末尾加通用 `noText` 句。
- 排字规格：模板的 `textLayer`。`slots[*].capPct` 是大写字母高 / 画高；文字列不越过 `column.bottom`，超出时整体缩小，但任何一行都不低于 `minCapPct`（2.5%）。
- 颜色：`accent` = 强调色槽（商户品牌色或模板默认），`accentLight` = 强调色向白色混合的比例。
- 字体：`font` 是字体类别，代码映射到字体文件（`geometric-sans` → Inter；正式实现要为泰文 / 中日韩 / 西里尔文配 Noto Sans 对应字体）。
- 识图：之后用 `deepseek/deepseek-v4.1-flash`（OpenRouter，支持图像输入）检查放字区域是否干净、微调位置和颜色；现阶段先用 `render_text.py` 里的亮度粗检（`_collisionPct`）代替。

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
| 画面手法 | 精致 3D 渲染；主体周围一圈 5–7 个小的光滑 3D 漂浮物，前后错落，全部取自主体本身的简化符号，不带任何字；主体和漂浮物都清晰锐利，最多最远的一两个略虚 |
| 光线与气质 | 左上一盏柔和主光 + 强调色轮廓光，主体下方一抹强调色辉光；沉静、高级、现代，大部分画面在暗部 |
| avoid | 不画真实商标、应用图标、水印；不出现文案以外的任何字、字母、数字；无边框、无横幅文字框、无主体以外新增的人或物 |

```json
{
  "id": "dark-floating",
  "name": "深色漂浮",
  "fitFor": "想显得现代、有科技感或高级感的商户（数码/手机维修、美容美甲、健身工作室、线上服务）；主体是单件物品或一个画面时效果最好。",
  "aspectRatio": "4:5",
  "medium": "A polished 3D-rendered promotional poster",
  "canvas": "A deep, almost black background fills the whole frame. The subject sits slightly right of centre and takes up a little over half of the frame height, with wide dark margins on every side. All text is kept close to the edges, set directly on the dark background with nothing behind it, no panel, box, banner or strip; the middle of the frame belongs to the subject alone.",
  "technique": "A loose ring of five to seven small glossy 3D objects floats around the subject at different depths; each one is a simplified symbol taken from the subject itself rather than anything new, and none of them carries any lettering. Smooth clay-like 3D rendering with a soft sheen. The subject is in crisp, sharp focus with clean edges and fine detail, and so are the floating objects; only the one or two smallest objects farthest in the background may be very slightly softened.",
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
  "avoidNoText": "Do not draw any real brand logo, trademark, app icon or watermark. No frames or borders, no banners or panels, and no extra people or objects that are not part of the subject or its floating ring.",
  "textLayer": {
    "font": "geometric-sans",
    "margin": 0.055,
    "column": { "top": 0.055, "maxWidth": 0.5, "gap": 0.022, "bottom": 0.5 },
    "bottomBand": 0.88,
    "baseline": 0.945,
    "shadow": { "color": "#000000", "opacity": 0.55, "blur": 0.012 },
    "slots": {
      "badge": { "capPct": 2.6, "weight": 700, "color": "accent", "outline": "accent", "pill": true, "maxLines": 1 },
      "headline": { "capPct": 4.6, "weight": 800, "color": "#FFFFFF", "maxLines": 3, "lineHeight": 1.12 },
      "subheadline": { "capPct": 2.7, "weight": 400, "color": "accentLight", "maxLines": 3, "lineHeight": 1.3 },
      "small": { "capPct": 2.6, "weight": 400, "color": "#C9CAD6", "maxLines": 1, "anchor": "bottom-left" },
      "brand": { "capPct": 3.2, "weight": 800, "color": "#FFFFFF", "tracking": 0.04, "maxLines": 1, "anchor": "bottom-right" }
    },
    "minCapPct": 2.5,
    "accentLight": 0.45
  },
  "sizeRelation": "The badge, the subheading, the footer line and the brand name are all set at the same text size, at least half the height of the headline letters; they differ from each other only in colour and weight, never in size.",
  "avoid": "Do not draw any real brand logo, trademark, app icon or watermark, and do not add any words, letters or numbers beyond the lines listed above. No frames or borders, no banners or text boxes, and no extra people or objects that are not part of the subject or its floating ring."
}
```
