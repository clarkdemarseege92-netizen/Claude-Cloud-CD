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
| `tools/font_mirror.py` | 字体目录、选中即复制（模拟 R2）、菜单预览子集 |
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

前置：`OPENROUTER_API_KEY` 与 Google Fonts API key 都由云端环境的 Network secrets 注入（`openrouter.ai` `/api/v1/`；`www.googleapis.com` `/webfonts/`，标头 `X-Goog-Api-Key`）。字体全部来自 Google Fonts，先用 `font_mirror.py` 复制到字体目录（模拟 R2），模板默认字体（Inter、Noto Sans Thai / SC / TC / JP）必须先复制。

```bash
cd design/promo-style-templates/tools

# 核实图像型号 id
python3 gen.py --list-models

# 看提示词 / 出无字底图
python3 gen.py dark-floating lang-en --no-text --dry-run
python3 gen.py dark-floating ind-coffee --no-text --model meta/muse-image --size 1024x1280 --out <out_dir>

# 文字图层：生成初始文档 → 出图 → 校验
node render_html.mjs init   <base.png> <copy.json> dark-floating <doc.json> --lang <en|ru|th|zh-Hans|zh-Hant|ja> --font-root <fonts_root> [--font "Kanit@v17"]
node render_html.mjs render <doc.json> <out.png> --font-root <fonts_root>    # 同时写 <out>.render.json（含 overlaps / outsideSafeArea）
node render_html.mjs validate <doc.json> --font-root <fonts_root>

# 字体：拉目录 → 选中即复制（本地目录模拟 R2）→ 文档加 font 后出图
python3 font_mirror.py catalog <catalog.json>
python3 font_mirror.py mirror <catalog.json> "Kanit" <fonts_root> [--base-url https://<r2-public>/fonts]
python3 font_mirror.py preview "Kanit" "Kanit ทดลองใช้ฟรี" <out.css>

# 碰撞粗检（深色模板）：>2% 视为字压到画面里的东西
python3 check_text.py <base.png> <out>.render.json
```

`copy.json` 是 `{headline, subheadline, badge, small, brand}`；可加 `--accent "#RRGGBB"`、`--effect glow|stroke|gradient`。

## 字体选择与加载（给产品代码的方案，未实现）

目标：商户能从 Google Fonts 里按语言挑字体；编辑器预览、服务端导出用**同一份字体文件**；不预先囤积字体，**谁选了才复制到 R2**。

实测依据（2026-10-25）：Google Fonts 目录共 1950 个家族；按文字体系：简体中文 10、繁体中文 16（另香港 3）、日文 68、泰文 34、西里尔 294、拉丁 1829。CSS2 接口取 Noto Sans SC 两个字重返回 202 个 woff2 切片（单片约 4KB）；加 `text=` 只取十来个字，返回约 2.6KB 的子集字体。Developer API 不带 key 返回 403；key 放在请求头 `X-Goog-Api-Key` 里可用（云端环境 Network secrets：网站 `www.googleapis.com`、路径 `/webfonts/`、前缀留空）。

### 原型验证（`tools/font_mirror.py` + `render_html.mjs --font-root`，2026-10-25）

| 测试 | 结果 |
|---|---|
| Developer API 目录 | 200；1959 个家族；字段 `family / category / variants / subsets / version / lastModified / files / axes / menu`。各文字体系数量与网站目录一致（简体 10、繁体 16、日 68、泰 34、西里尔 294） |
| 选中即复制：Kanit（泰文，静态 9 字重） | 36 个 woff2，0.6MB，附 OFL 许可；版本 v17 与 CSS2 切片路径里的版本一致 |
| 选中即复制：Noto Sans SC（简体） | 101 个切片覆盖全部字重，4.5MB，首次复制 6 秒；版本 v41 |
| 菜单预览 `text=`（字体名 + 本语言样字，17 个字符） | Kanit 4.7KB、Noto Sans SC 2.4KB、ZCOOL KuaiLe 1.5KB，各 1 个文件 |
| 文档加 `font: {family, version}` 出图 | Kanit、Noto Sans SC、ZCOOL KuaiLe 都正确加载；换字体后参照字高不变（泰文页脚两种字体都是 2.61%），因为字号按所选字体的参照字重新换算 |
| 泰文文案选了 Noto Sans SC | `validate` 拒绝：「不支持文案里的 thai 文字」 |

发现的事：
- **模板必须给每种文字配默认字体**：中文文案不指定 `font` 时，模板字体（Inter + Noto Sans Thai）都不含汉字，只能落到容器的系统字体——生产环境不能依赖系统字体。dark-floating 的字体注册表要补 Noto Sans SC / TC / JP。
- **商户选的字体会作用到所有行，包括品牌名**（例：选 ZCOOL KuaiLe 后 "EziTak" 也变成快乐体）。品牌名要不要固定用模板字体，是产品决定。
- 目录不带 `capability=VF` 时不返回 `axes`；复制时按 `variants` 取全部字重即可，对可变字体 CSS2 返回的仍是同一组切片。
- 中文副标题出现单字成行（"聊"），属于编辑器里商户手动调整的范围。

### 两个接口，各管一件事

| 接口 | 用途 | 说明 |
|---|---|---|
| Developer API `www.googleapis.com/webfonts/v1/webfonts`（需 API key） | **字体目录 / 注册表** | 按 `subset`（文字体系）、`category`、热门度筛选；返回家族名、字重 / 可变轴、`subsets`、**版本号**、更新时间。服务端每天缓存一次，key 不出服务端 |
| CSS2 `fonts.googleapis.com/css2?family=…` | **取字体文件** | 返回已按 `unicode-range` 切好的 woff2 + CSS。Developer API 给的是整个字体文件（中文 10–50MB），不能直接给浏览器 |

### 流程

```
① 字体菜单（编辑器）
   缓存的目录 → 按文案的文字体系过滤（写泰文只列支持泰文的）→ 虚拟滚动列表
   每一项用该字体本身显示「字体名 · 本语言样字」：CSS2 加 text=<字体名+样字>，每项几 KB
   （或改用预先生成的小样图，菜单阶段就不向 Google 发请求）
② 商户点选
   服务端：R2 已有 fonts/<家族>/<版本>/ → 直接返回 CSS 地址
           没有 → 从 CSS2 拉 CSS + 全部切片 → 改写成 R2 地址 → 写入 R2（附许可文件）→ 返回
           同一家族并发首次选择要加锁，只拉一次；中文首次复制可能 5–10 秒，界面显示加载中
   编辑器：插入 <link> 指向 R2 上的 CSS
③ 文字图层文档记录 font: { "family": "Kanit", "version": "<目录里的版本号>" }
④ 服务端出图：Chromium 加载同一份 R2 CSS（本地缓存）→ 与编辑器一致
   可选优化：导出时改用 text= 子集，只含这张图用到的字
```

### 规则

- **只在预览菜单阶段**可以直接从 Google 加载（会把商户 IP 发给 Google；欧洲有判例）。选定之后的编辑和导出一律走 R2。
- **R2 路径带版本号、只增不改**：Google 更新字体后，旧文档重新导出仍用旧版本，字形不变。
- **服务端校验**：`font.family` 必须在注册表里，且 `subsets` 覆盖文案用到的文字体系（否则会退回系统字体，排版走样）；`version` 必须是已复制到 R2 的版本。
- **加载方式**：中日文必须用切片 CSS（`<link>`，或为每个切片建一个带 `unicodeRange` 的 `FontFace`）；一个 `FontFace` 对应一个完整文件只适合拉丁、泰文这类小字体。
- **模板只给推荐**：模板写默认字体 + 两三个推荐，商户可从完整菜单另选。
- **许可**：以 google/fonts 仓库里每个家族自带的许可文件为准（大多 OFL）；目录 API 里的「开源 / 品牌字体」标记不可靠（实测 Noto Sans SC 被标成品牌字体）。
- 简体中文展示体很少（10 个里 4 个是手写 / 书法），「大字报」「霓虹」这类模板的简体中文版可能只能用 Noto Sans SC 最粗字重代替，模板里要写明。

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
