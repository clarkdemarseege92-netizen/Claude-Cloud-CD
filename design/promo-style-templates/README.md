# 配图风格模板 · 制作与验收流程

流程 A：商户选风格模板 → 写一句画面主体 → 填文案 → 出图。本目录只交付**模板本身**和验证用的工具，不是产品代码。

## 目录

| 路径 | 内容 |
|---|---|
| `templates.md` | **唯一来源**。通用约定、拼装顺序、代码排字流程、文字图层文档格式，以及每张模板（中文七项表 + 可直接转代码常量的 ```json 块） |
| `results.md` | 每一轮测试：型号、提示词全文、费用、字高、问题与改动 |
| `thumbnails/<模板 id>.webp` | 每张模板一张缩略图（540×675，EziTak 示例主体 + 英文文案） |
| `examples/` | 文字图层文档示例（英文、泰文编辑后）和测试用分段 |
| `tools/build_prompt.py` | 解析 `templates.md` 的 json 块，拼生图提示词 |
| `tools/gen.py` | 调 OpenRouter 出图 |
| `tools/render_html.mjs` | 文字图层：`init` / `render` / `validate`（Chromium + HTML/CSS） |
| `tools/check_text.py` | 碰撞粗检（深色模板）：文字框下面的底图是否有东西 |
| `tools/measure.py` | 放大量字高（模型画字那条旧路径用的人工核对工具） |
| `tools/cases.json` | 测试用主体（行业 3 + EziTak 示例）和文案（英文、泰文草稿） |

## 定稿流程（四步）

```
① 生图（无字底图）          ② init                 ③ 编辑器（产品代码）      ④ render
模板 + 主体 ──────────▶ 底图 ─┬─▶ 文字图层文档 ──────▶ 商户拖动 / 字号 / ──────▶ 校验 → 成品图
build_no_text + gen.py        │   （模板 textLayer       断行 / 特效 / 颜色
                    文案 ─────┘    + 文案）
```

1. **生图**：`build_prompt.py --no-text` 用模板的 `canvasNoText` 等字段拼提示词——画面里规定好放字的暗部区域，并明确禁止任何文字；`gen.py` 用 `meta/muse-image` 出图，**必须传 `size: "1024x1280"`**（它不认 `aspect_ratio`），实际返回 1408×1760（4:5）。
2. **init**：`render_html.mjs init` 按模板 `textLayer.initialLayout` 把五个槽排一遍，量出每行位置，写成**文字图层文档**（TextLayerDoc v1，格式见 `templates.md`）。默认按空格分段。**不调用任何 AI。**
3. **编辑器**（产品代码，另一个对话做）：读写这份文档。商户能改位置、字号（不低于 2.5%）、断行（任意字处拆段 + 强制换行）、特效预设、颜色角色。
4. **render**：服务端 `validate` 后用同一套 HTML/CSS 在 Chromium 里截图。编辑器看到的和导出的是同一份 CSS。

文案五个槽：`headline / subheadline / badge / small / brand`，空槽不出现。强调色 `accent` = 商户品牌色，未设用模板默认。

## 命令速查

前置：`OPENROUTER_API_KEY` 由云端环境的 Network secrets 注入（`openrouter.ai`，路径 `/api/v1/`）；字体目录放 `Inter-var.ttf`、`NotoSansThai-var.ttf`（google/fonts，OFL）。

```bash
cd design/promo-style-templates/tools

# 核实图像型号 id
python3 gen.py --list-models

# 看提示词 / 出无字底图
python3 gen.py dark-floating lang-en --no-text --dry-run
python3 gen.py dark-floating ind-coffee --no-text --model meta/muse-image --size 1024x1280 --out <out_dir>

# 文字图层：生成初始文档 → 出图 → 校验
node render_html.mjs init   <base.png> <copy.json> dark-floating <doc.json> --font-dir <fonts>
node render_html.mjs render <doc.json> <out.png> --font-dir <fonts>     # 同时写 <out>.render.json
node render_html.mjs validate <doc.json>

# 碰撞粗检（深色模板）：>2% 视为字压到画面里的东西
python3 check_text.py <base.png> <out>.render.json
```

`copy.json` 是 `{headline, subheadline, badge, small, brand}`；可加 `--accent "#RRGGBB"`、`--effect glow|stroke|gradient`。

## 新做一张模板的步骤

1. 在 `templates.md` 加一节：中文七项表（画幅与留白 / 版式 / 字体层级 / 配色 / 画面手法 / 光线与气质 / avoid）+ 「适合哪类商户」+ 英文 id，以及 json 块。
2. json 块里写：`medium`、`canvasNoText`（规定放字区域）、`technique`、`lighting`、`palette`（`baseNoText` / `accentSentence` / `accentDefault` / `accentRoleNoText`）、`avoidNoText`，以及 `textLayer`（初始版式、各槽默认字高 / 字重 / 颜色角色、2–3 个特效预设 CSS）。
3. 出 EziTak 示例底图 → `init` → `render`，检查放字区域是否干净、字高、特效。
4. 出行业 3 张（按摩师、白色 SUV、咖啡），查：有没有凭空多出模板里的内容、风格是否一致。
5. 结果写进 `results.md`；缩略图存 `thumbnails/<id>.webp`（宽 480–600px）。

## 写提示词的规则（实测踩过的坑）

- 连贯英文句子，第一句先写媒介和主体；不写 `Subject:` 之类的标签。
- 风格和内容分开：模板里不出现任何具体物件、任何语言的示例字。
- 要留放字区域，写「这块是平静的暗背景，漂浮物不进入」，不写「留空白放字」（会出横幅）。
- 写 "capital letters" 会让模型把所有字排成全大写。
- 写「浅景深 / 远处虚化」会连主体一起糊掉；要写「主体清晰锐利」。
- 写屏幕内容要具体有颜色，并写「只有表情和图标，没有字」，否则屏幕里会出现模糊的伪文字或重复文案。
- avoid 里写「不画单独漂浮的手、身体部位或手势」（否则按摩主题会出现一只 OK 手势）。
- 主体里的人物要写明「和漂浮物同一种 3D 质感」，否则人物是照片、漂浮物是黏土，风格割裂。

## 走过、但放弃的路（详见 `results.md`）

- **让生图模型画字**：字号不受控（实际约为要求的一半，换成像素单位也一样），小字始终 < 2.5%；错字只能人工逐张核对。→ 改为代码排字。
- **Pillow 排字**：做不了描边 / 渐变 / 霓虹等 CSS 特效，和编辑器也对不上。→ 改为 Chromium。
- **DeepSeek 识图 + 断行**：能用（每张约 $0.001–0.002），但成果会被编辑器里的人工调整覆盖；断行由母语商户手动处理更准。→ 从流程中去掉。
- **Canva API**：自动填模板需要 Enterprise 订阅，且是「代表某个 Canva 用户」操作，不适合当平台的排字引擎。
