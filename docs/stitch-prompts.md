# FileWise — Stitch 设计提示词

> 以下提示词直接复制粘贴到 Stitch 中生成设计稿。
> 每种风格包含：整体布局 + 各页面独立提示词。

---

## 通用样式前缀

每条提示词前面加上这段（或在 Stitch 的全局设定中配置）：

```
Style: minimal flat desktop app UI. Clean white/light theme. No gradients. No shadows heavier than 1px.
Font: Inter, 13px base. Border radius: 8px cards, 6px buttons.
Colors: background #f9f9fb, cards #ffffff, sidebar #f2f2f5, border #e0e0e6, text #111118, secondary text #60646c, muted text #9194a0, accent #5b5bd6, accent light rgba(91,91,214,0.08).
Viewport: 1280x800. App name: FileWise. Language: Chinese (Simplified).
```

---

## 风格 A：经典三栏式

### A-0 整体布局

```
A desktop file manager app called FileWise with a 3-column layout.

Column 1 — Activity Bar: 48px wide, light gray (#eaeaee), vertical icon-only navigation. 8 icons stacked: dashboard grid, folder, broom, magnifier, chat bubble, image, bar chart, shield. Bottom: sun/moon toggle, gear icon. Active icon has a 2px left accent border (#5b5bd6).

Column 2 — Sidebar: 220px wide, background #f2f2f5. Top: workspace name "FileWise" with a small purple square logo. Below: contextual navigation list for the active section. Collapsible with a toggle button.

Column 3 — Content: fills remaining width, background #f9f9fb, padding 28px 32px. Page title at top-left, content below.

No top header bar. No gradients anywhere. Clean white/light theme.
```

### A-1 概览页 Dashboard

```
FileWise dashboard in 3-column layout. Activity Bar on left (48px, icon-only). Sidebar (220px) shows quick action shortcuts list.

Content area:
Row 1: flat card, left side has a 100px circular score ring (showing "87"), right side has 4 check result rows (icon + label + status text). Below the ring: "一键体检" purple button.
Row 2: 5 small cards in horizontal grid. Each card: centered icon (14px) + title "智能整理" + one-line description. Flat border, no colored backgrounds.
Row 3: two equal-width cards side by side. Left "磁盘使用" with thin 4px progress bars. Right "文件分布" with category bars.
Row 4: "最近活动" card with rows: small dot + action text + timestamp.

Light theme. White cards on #f9f9fb background. No gradients.
```

### A-2 智能整理页 Organize

```
FileWise file organize page in 3-column layout.

Sidebar shows folder tree or recent folders list.

Content: page title "智能整理". Top action bar: "选择文件夹" button + "扫描" button. Below: flat table with columns — checkbox, file name, type badge (small rounded label), size, modified date. Badges use subtle accent-dim background. Bottom bar: "移动到..." button with folder path display.

Light theme. No gradients.
```

### A-3 智能清理页 Clean

```
FileWise cleanup page in 3-column layout.

Sidebar shows 4 category filters: 临时文件, 重复文件, 大文件, 隔离区 — as a vertical tab list.

Content: top summary bar showing "可清理 2.3 GB (47项)" in muted text. Below: flat table — file name, path (truncated), size, type badge, delete button. Bottom action bar: "一键清理" primary button + "全选" checkbox.

Light theme. No gradients.
```

### A-4 智能搜索页 Search

```
FileWise search page in 3-column layout.

Sidebar shows filter panel: category dropdown, size range inputs, date range picker — stacked vertically with labels.

Content: top has a large search input (full width, 40px height, placeholder "搜索文件名或内容..."). Below: results list, each row: file icon + name + truncated path + size + date + category badge + action buttons (eye icon, quarantine icon). Empty state: centered muted text "输入关键词开始搜索".

Light theme. No gradients.
```

### A-5 AI 助手页 Chat

```
FileWise AI chat page in 3-column layout.

Sidebar shows conversation history list: each item is a one-line summary with timestamp. Top of sidebar: "新对话" button.

Content: chat interface. Top-right: model selector dropdown + clear button. Message area: AI messages left-aligned (white card bg, rounded, border #e0e0e6), user messages right-aligned (accent bg #5b5bd6, white text). AI message contains a markdown code block and a bullet list. Bottom: input bar — text field (flex 1) + send button (accent).

Light theme. No gradients.
```

### A-6 图片标签页 Image

```
FileWise image tagging page in 3-column layout.

Sidebar shows tag cloud: small flat badges "风景" "人物" "建筑" "动物" etc, clickable.

Content: top bar — folder picker button + model selector dropdown + "开始标记" button + progress bar. Below: grid or table of tagged images — small thumbnail (40x40) + file name + tags as badges + description text + size. Each row has a delete tag button.

Light theme. No gradients.
```

### A-7 其他页面

```
FileWise settings page in 3-column layout.
Sidebar shows settings categories: AI 模型, 监控目录, 排除路径, 通用.
Content: active section "AI 模型". Card with: radio button group for model selection (本地 Ollama / 云端 API), base URL input field, model name input. Below card: "保存" button. All flat, no gradients. Light theme.
```

```
FileWise report page in 3-column layout.
Sidebar shows report types: 操作日志, 快照管理, 隔离区.
Content: flat table with columns — timestamp, action badge (移动/清理/隔离 with subtle colored text), file path, detail. Pagination at bottom. Top-right: "导出CSV" and "导出JSON" outline buttons. Light theme. No gradients.
```

```
FileWise security page in 3-column layout.
Sidebar shows security features: 文件保险箱, 敏感扫描, 完整性校验, 目录保护, 审计导出.
Content: "文件保险箱" active. Top: "加密文件" button + password input field with strength bar (4 segments). Below: table — file name, original path, encrypted date, size, "解密" button per row. Light theme. No gradients.
```

---

## 风格 B：对话驱动型

### B-0 整体布局

```
A desktop AI assistant app called FileWise. Conversation-driven layout.

Top: 48px header bar, background #f2f2f5, border-bottom 1px #e0e0e6. Left: purple square logo + "FileWise" text. Center: search/command input (420px wide, rounded, white background, placeholder "搜索文件或输入指令..."). Right: 3 icon buttons (gear, sun/moon, lock).

Main area: single-column chat interface, max-width 720px, centered horizontally, full height below header.

Bottom: fixed input bar (max-width 720px, centered). Text input field + attach button + send button. Below input: horizontal row of quick command pills.

No sidebar. No gradients. Clean white/light background #f9f9fb.
```

### B-1 首次打开 / 概览

```
FileWise conversation-driven app. Top header with logo and search bar.

Chat area (720px centered) showing welcome state:
- AI avatar + message: "欢迎使用 FileWise！以下是你的系统概览："
- Embedded card inside AI message: health score 87 (small ring) + 4 status rows (磁盘 OK, 可清理 1.2GB, 索引 12340 个, 评分 87).
- Below that card: another embedded card showing 2-column mini layout: left "磁盘使用" with 2 thin bars, right "最近活动" with 3 text rows.
- AI message: "你可以直接告诉我你想做什么，或点击下方快捷按钮。"

Bottom input bar. Quick command pills below: "📊 系统概览" "📁 整理文件" "🧹 清理空间" "🔍 搜索文件" "🖼 标记图片" "📋 查看报告" "🔒 安全中心" "⚙️ 设置".

Light theme. No gradients.
```

### B-2 文件操作对话

```
FileWise conversation UI. 720px centered chat.

Conversation flow:
1. User bubble (right, accent bg): "帮我清理 D 盘的临时文件"
2. AI bubble (left, card bg): "正在扫描 D 盘..." with a small inline spinner.
3. AI bubble with embedded result card: "发现 23 个临时文件，共 1.8 GB". Inside the card: a mini table (4 rows visible) showing file name + size. Below table: "全部清理" purple button + "查看详情" text button.
4. User bubble: "清理吧"
5. AI bubble: "已清理 23 个文件，释放 1.8 GB 空间 ✓" with a success checkmark.

Bottom input bar with send button. Light theme. White cards. No gradients.
```

### B-3 搜索交互

```
FileWise conversation UI. User types in the top centered search bar.

Search bar is focused, showing "report" as typed text.
Below search bar: a dropdown results panel (max 8 items). Each row: file icon + "report_2024.docx" name + "D:\Documents" path + "2.3 MB" size. Bottom of dropdown: "在 AI 中搜索" link.

Light theme. No gradients.
```

### B-4 设置面板

```
FileWise conversation UI with a modal overlay.

Behind: dimmed chat interface.
Modal: centered, 560px wide, white rounded card. Title "系统设置" with close X button. Tabs inside: "AI 模型" (active), "监控目录", "排除路径", "通用". Active tab content: model type radio (本地/云端), URL input, model select dropdown. Bottom: "保存" button.

Light theme. No gradients.
```

---

## 风格 C：悬浮指令式

### C-0 整体布局

```
A desktop Spotlight/Raycast-style command launcher called FileWise.

Full-screen overlay with semi-transparent dark background (rgba(0,0,0,0.6)).

Centered floating panel, 640px wide, rounded 12px corners, background #ffffff, border 1px #e0e0e6, subtle shadow 0 8px 30px rgba(0,0,0,0.12).

Top of panel: large search input (full width inside panel, 48px height, 15px font, placeholder "搜索文件、输入命令或与 AI 对话..."). Search icon on left inside input.

Below input: results area that changes based on context. Default state shows:
- Section "最近文件" with 4 file rows (icon + name + path + size)
- Section "快捷操作" with 4 action rows (icon + "一键体检" / "清理临时文件" / "整理下载文件夹" / "扫描重复文件")

No gradients. Clean white panel on semi-transparent backdrop.
```

### C-1 默认状态

```
FileWise command launcher overlay. 640px centered panel on dark transparent backdrop.

Search input at top: empty, placeholder "搜索文件、输入命令或与 AI 对话...".

Results panel below showing default content:
Section 1 — "📂 最近文件" (muted label): 4 rows, each with file icon + name "季度报告.docx" + path "D:\Documents" + size "2.3 MB" + keyboard shortcut hint "⏎".
Section 2 — "⚡ 快捷操作": 4 rows: "一键体检", "清理临时文件", "智能整理", "扫描大文件". Each with an icon and right-arrow.
Section 3 — "📊 系统状态" (muted label): single row showing "磁盘 C: 65% · D: 42% · 已索引 12,340 个文件" in small muted text.

Bottom of panel: hint text "↑↓ 导航  ⏎ 执行  / 命令  > AI对话  esc 关闭" in 11px muted text.

No gradients. Light theme. White panel.
```

### C-2 搜索模式

```
FileWise command launcher. User typed "report" in search input.

Results panel shows filtered file search results:
6 rows, each: file type icon + highlighted match in filename "**report**_2024.docx" + path "D:\Documents\工作" + size "2.3 MB". Selected/hovered row has bg #eaeaee.

Right side of selected row: action hints "⏎ 打开  ⌘⏎ 定位".

No gradients. Light theme. White panel.
```

### C-3 命令模式

```
FileWise command launcher. User typed "/" in search input, showing "/".

Results panel shows available commands list:
- /clean — 清理临时文件
- /organize — 智能整理文件
- /health — 系统健康检查
- /scan — 扫描文件索引
- /duplicates — 查找重复文件
- /large — 大文件扫描
- /encrypt — 加密文件
- /settings — 打开设置

Each row: command in accent color (#5b5bd6) + description in muted text. Fuzzy filter as user types more.

No gradients. Light theme. White panel.
```

### C-4 AI 对话模式

```
FileWise command launcher. User typed "> 帮我找出最大的5个文件" in search input.

Results panel transforms into a chat response area:
AI response text: "正在扫描所有磁盘..."
Then: a compact embedded table with 5 rows: rank number + file name + path + size (sorted largest first).
Below table: action buttons row — "删除选中" outline button + "移动到..." outline button.

Panel height expanded to fit content (max 500px, scrollable).

No gradients. Light theme. White panel.
```

### C-5 文件详情模式

```
FileWise command launcher. User selected a file from search results.

Results panel shows file detail view:
Top: large file icon + file name "季度报告.docx" + full path.
Info rows: 大小 2.3 MB, 修改时间 2024-03-15, 类型 文档.
Action buttons row: "打开" (accent) + "定位" + "移动" + "加密" + "删除" (danger red text). All flat outline style.
Bottom: "← 返回结果" link.

No gradients. Light theme. White panel.
```

---

## 使用说明

1. 打开 Stitch，先在全局设定中粘贴 **通用样式前缀**
2. 分别生成 A-0、B-0、C-0 三个整体布局，对比选择
3. 选定风格后，逐页生成该风格下的各页面设计稿
4. 截图发给我，我按设计稿精确实现代码
