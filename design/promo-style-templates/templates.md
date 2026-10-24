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
   `The {槽名} reads "{文案}": {typography.style}, about {heightPct}% of the image height tall, {layout}.`
7. 唯一性句：这 N 行是画面上仅有的字；品牌名照原样书写，不要设计成标志。
8. `avoid`
9. 通用尾句（所有模板相同）：

```json
{
  "copyClosing": "These {count} lines are the only words anywhere in the image. Write the brand name {brand} exactly as given, as plain lettering, not designed as a logo, emblem or monogram.",
  "copyClosingNoBrand": "These {count} lines are the only words anywhere in the image.",
  "fixedTail": "Do not translate, shorten, repeat or restyle the wording of any line. Do not add religious or cultural symbols unless the subject itself asks for them."
}
```

槽名在提示词里的写法：

```json
{
  "headline": "headline",
  "subheadline": "subheading",
  "badge": "badge",
  "small": "small line",
  "brand": "brand name"
}
```

---

## 1. 深色漂浮 `dark-floating`

**适合哪类商户**：想显得现代、有科技感或高级感的商户，比如数码/手机维修、美容美甲、健身工作室、
SaaS/线上服务。主体是单件物品或一个画面时效果最好。

| 项 | 内容 |
|---|---|
| 画幅与留白 | 4:5；近黑底铺满，主体居中约占画高一半多，四周大面积留暗；字小、贴角，直接压在暗底上，背后没有色块 |
| 版式 | 左上一列左对齐：角标在最上，下面是标题、副标题，整列宽不超过画宽约四分之三；小字左下；品牌名右下，与小字同一基线 |
| 字体层级 | 标题 5%（粗几何黑体，白，最多三行）/ 副标题 3.2%（常规黑体，强调色浅色调，最多两行）/ 角标 3%（粗黑体，强调色，细描边圆角框、无填充）/ 小字 3%（细黑体，柔灰）/ 品牌 3%（粗黑体，白，宽字距） |
| 配色 | 近黑底、白、柔灰 + 强调色 `{accent}`，默认电光紫 `#7C5CFF`；两级强调：强调色本色 + 浅色调 |
| 画面手法 | 精致 3D 渲染；主体周围一圈 5–7 个小的光滑 3D 漂浮物，前后错落，全部取自主体本身的简化符号，不带任何字；浅景深 |
| 光线与气质 | 左上一盏柔和主光 + 强调色轮廓光，主体下方一抹强调色辉光；沉静、高级、现代，大部分画面在暗部 |
| avoid | 不画真实商标、应用图标、水印；不出现文案以外的任何字、字母、数字；无边框、无横幅文字框、无主体以外新增的人或物 |

```json
{
  "id": "dark-floating",
  "name": "深色漂浮",
  "fitFor": "想显得现代、有科技感或高级感的商户（数码/手机维修、美容美甲、健身工作室、线上服务）；主体是单件物品或一个画面时效果最好。",
  "aspectRatio": "4:5",
  "medium": "A polished 3D-rendered promotional poster",
  "canvas": "A deep, almost black background fills the whole frame. The subject sits in the centre and takes up a little over half of the frame height, with wide dark margins on every side. All text is small and kept close to the edges, set directly on the dark background with nothing behind it, no panel, box, banner or strip; the middle of the frame belongs to the subject alone.",
  "technique": "A loose ring of five to seven small glossy 3D objects floats around the subject at different depths; each one is a simplified symbol taken from the subject itself rather than anything new, and none of them carries any lettering. Smooth clay-like 3D rendering with a soft sheen and a shallow depth of field, so the farthest floating objects blur slightly.",
  "lighting": "Lit by one soft key light from the upper left and a thin rim light in the accent colour, with a faint accent-coloured glow pooling beneath the subject. The mood is calm, premium and modern, with most of the frame left in deep shadow.",
  "palette": {
    "base": "The colours stay restrained: near-black background, white for the headline and the brand name, soft grey for the small line, and the subject's own natural colours.",
    "accentSentence": "The accent colour is {accent}.",
    "accentDefault": "electric violet (#7C5CFF)",
    "accentRole": "The accent colour appears on the badge, in the rim light and on two or three of the floating objects; a lighter tint of the same accent is used for the subheading. No other saturated colours are added to the background or the text."
  },
  "layout": {
    "headline": "placed directly under the badge, aligned to the left margin and spanning no more than about three quarters of the frame width",
    "subheadline": "placed directly under the headline with the same left alignment",
    "badge": "placed in the top-left corner on the top and left margins, above the headline",
    "small": "placed in the bottom-left corner on the bottom margin",
    "brand": "placed in the bottom-right corner on the same baseline as the small line"
  },
  "typography": {
    "headline": { "heightPct": 5, "style": "set in a heavy geometric sans-serif in white, in no more than three lines" },
    "subheadline": { "heightPct": 3.2, "style": "set in a regular-weight sans-serif in the light tint of the accent colour, in no more than two lines" },
    "badge": { "heightPct": 3, "style": "set in a bold sans-serif in the accent colour inside a thin rounded outline of the same colour, with no fill" },
    "small": { "heightPct": 3, "style": "set in a light sans-serif in soft grey" },
    "brand": { "heightPct": 3, "style": "set in a bold sans-serif in white with wide letter spacing" }
  },
  "avoid": "Do not draw any real brand logo, trademark, app icon or watermark, and do not add any words, letters or numbers beyond the lines listed above. No frames or borders, no banners or text boxes, and no extra people or objects that are not part of the subject or its floating ring."
}
```
