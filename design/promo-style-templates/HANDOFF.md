# 交接：配图风格模板（流程 A）· 第一阶段成果

- 仓库 / 分支：`clarkdemarseege92-netizen/Claude-Cloud-CD` · `design/promo-style-templates`（未合并，未开 PR）
- 目录：`design/promo-style-templates/`；入口看 `README.md`，模板唯一来源 `templates.md`，全部测试记录 `results.md`
- 时间：2026-10-24 ～ 10-26；OpenRouter 累计费用约 $0.12（生图 + 识图测试）
- 没有改任何产品代码（EZBot 仓库只读过 `feat/mcp-oauth` 的 `promo-image-prompt.ts`）

## 一、定下来的流程（和最初设想不同，已与产品方确认）

最初是「模板 + 主体 + 文案 → 一条提示词 → 生图模型连字一起画」。实测后改为：

1. **生图只出无字底图**：`meta/muse-image`（OpenRouter `/api/v1/images`，必须传 `size: "1024x1280"`，返回 1408×1760 = 4:5；它不认 `aspect_ratio`）。提示词由模板拼出，规定好放字的暗部区域，并禁止任何文字。约 $0.01/张。
2. **文字由代码排**：Chromium 里用 HTML/CSS + 真实字体排字（`tools/render_html.mjs`）。生成「文字图层文档」（TextLayerDoc v1，格式见 `templates.md`）。
3. **编辑器（产品代码，未做）**：商户读写这份文档——拖动位置、调字号、断行、换特效预设 / 颜色 / 字体。建议 DOM + Moveable（支持鼠标和触屏），不用 Canvas、不用 TipTap/ProseMirror。
4. **服务端出图**：校验文档 → 同一套 HTML/CSS 截图，保证编辑器看到的 = 导出的。

**流程里不调用任何 AI 做识图或断行**（DeepSeek 试过，可用但成果会被人工编辑覆盖；母语文字由商户自己调整，外语的风险在翻译准确性，属于文案环节）。

## 二、交付物

| 文件 | 内容 |
|---|---|
| `templates.md` | 通用约定、拼装顺序、代码排字流程、`textLayer` 字段说明、**TextLayerDoc v1 格式与校验规则**、模板 1 `dark-floating`（中文七项表 + 可直接转代码常量的 json） |
| `README.md` | 目录、四步流程、命令速查、新做一张模板的步骤、提示词踩坑规则、放弃过的方案、**字体选择与加载方案** |
| `results.md` | 每一轮测试：提示词全文、费用、字高、问题与改动 |
| `thumbnails/dark-floating.webp` | 540×675 缩略图（EziTak 示例主体 + 英文文案） |
| `examples/*.doc.json` | 文字图层文档示例：英文、泰文、日文、品牌名单独换字体 |
| `tools/` | `build_prompt.py` 拼提示词；`gen.py` 出图；`render_html.mjs` init / render / validate；`font_mirror.py` Google Fonts 目录、选中即复制（模拟 R2）、菜单预览子集；`check_text.py` 碰撞粗检；`cases.json` 测试主体与六语文案；`measure.py` 量字高 |

## 三、模板完成情况

| # | 模板 | 状态 |
|---|---|---|
| 1 | 深色漂浮 `dark-floating` | ✅ 完成：风格、行业 3 张（按摩师 / 白色 SUV / 咖啡，均无多余内容、风格一致）、6 种语言验收（英 / 俄 / 泰 / 简 / 繁 / 日，最小字高 2.50–2.67%，无越界、无重叠、无碰撞）、3 个文字特效预设（glow 默认 / stroke / gradient） |
| 2–9 | 清爽留白、大字报、暖光生活、杂志封面、扁平插画、产品棚拍、霓虹夜景（备选：手写温度） | ❌ 未开始。按 `README.md`「新做一张模板的步骤」做；浅色模板的碰撞粗检（亮度法）不适用，需另想办法或靠编辑器人工判断 |

## 四、产品代码需要实现的（本任务没做）

1. **文字图层**：把 `render_html.mjs` 里的 `pageHtml` + `sizeAndMeasure` 抽成前后端共用模块；服务端 Chromium 出图；`validate` 必须在服务端执行（文档来自浏览器，不可信）。
2. **编辑器**：Moveable 拖动 / 拉宽 / 缩放；断行（任意字处拆段 + `forceBreaks`）；特效、颜色、字体选择器；**换字体后自动「按当前字体重新排版」**（`init --font`），否则会重叠——渲染报告的 `overlaps` / `outsideSafeArea` 用来提示。
3. **字体**：Google Fonts Developer API 做目录（key 只在服务端，每天缓存）；商户选中后从 CSS2 接口拉切片 CSS + woff2 复制到 R2（路径带版本号、只增不改、附许可、并发加锁）；菜单预览用 CSS2 `text=` 子集；文档记录 `{family, version}`。模板默认字体（Inter、Noto Sans Thai / SC / TC / JP）需预先复制。
4. **规则（已在文档格式里定好）**：最小字高 2.5%（按每行出现的最矮文字体系计算，所有语言生效）；品牌名默认模板字体、可单独换；颜色 / 特效只能取模板预设；强调色跟商户品牌色。

## 五、未核实 / 需要人工的

- **文案**：繁体、日文、俄文、泰文均为草稿，**需母语者复核**（`tools/cases.json`）。泰文标题默认在 "ตอบ / กลับ" 处断开，按设计留给商户在编辑器里调。
- `meta/muse-image` 的服务商标识带 `eval-20260824`，可能是评测版，后续可能变动或下线。
- Google Fonts API 的调用频率限制和使用条款未核实；目录里的「开源 / 品牌字体」标记不可靠，许可以 google/fonts 仓库里每个家族的许可文件为准。
- Moveable 未在本环境实际接入，交互细节需产品方用目标版本确认。
- 现有产品代码 `promo-image-prompt.ts` 里 `IMAGE_SPEC` 是 1:1，新流程是 4:5，两处口径需产品方统一。

## 六、环境配置（云端环境 Network secrets，已由用户配好）

- `openrouter.ai` · 路径 `/api/v1/` · `Authorization: Bearer <key>`；OpenRouter 账户的 allowed providers 已加 `meta`
- `www.googleapis.com` · 路径 `/webfonts/` · 标头 `X-Goog-Api-Key`，前缀留空
