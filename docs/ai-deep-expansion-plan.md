# FileWise AI 深度扩展计划

> 目标：将 AI 助手从"简单问答 + 10 个工具调用"升级为**真正智能的文件管理 Copilot**。

---

## 一、现状分析

### 当前能力

| 维度 | 现状 | 问题 |
|------|------|------|
| 响应模式 | `stream: false`，一次性返回 | 长任务等待 10-30 秒无反馈，体验差 |
| 工具数量 | 10 个（navigate/health/clean/search/scan/disk/index） | 缺少 vault、security、image、watcher、settings 等 |
| 意图识别 | 正则优先 → AI ReAct 兜底 | 正则脆弱，AI 经常格式错误导致工具调不通 |
| 上下文 | 注入磁盘/索引/隔离区/快照统计 | 无文件内容感知，无用户行为记忆，无会话持久化 |
| UI 交互 | 纯文本 + Markdown + 导航按钮 | 无流式打字效果，无文件拖拽，无结构化展示 |
| 多模态 | 无 | 无法看图、分析文件内容 |
| 会话管理 | 内存存储，刷新即丢 | 无历史会话，无上下文续接 |

### 当前工具清单

```
navigate, health_check, scan_clean, execute_clean,
scan_directory, search_files, scan_large_files,
scan_duplicates, get_disk_info, get_index_stats
```

---

## 二、扩展路线图（按优先级排序）

### Phase 1：体验基础升级（1-2 天）

#### 1.1 流式响应（Streaming）
**痛点**：用户发消息后等 10-30 秒才能看到回复
**方案**：
- 后端：`ai_chat` 改为 `stream: true`，使用 Tauri event 逐 token 推送
- 前端：监听 `ai-stream-chunk` 事件，实时追加文字，打字机效果
- 云端 API 同样支持 SSE 流式

```rust
// 后端：流式推送
#[tauri::command]
async fn ai_chat_stream(
    messages: Vec<ChatMessage>,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Ollama stream=true → 逐行读取 NDJSON → emit event
    let mut stream = client.post(url).json(&body).send().await?;
    while let Some(chunk) = stream.chunk().await? {
        let parsed: OllamaStreamChunk = serde_json::from_slice(&chunk)?;
        app.emit("ai-stream-chunk", &parsed.message.content)?;
        if parsed.done { break; }
    }
    app.emit("ai-stream-done", ())?;
    Ok(())
}
```

```typescript
// 前端：监听流式事件
import { listen } from '@tauri-apps/api/event';

let buffer = '';
const unlisten = await listen('ai-stream-chunk', (e) => {
  buffer += e.payload as string;
  updateLastMessage(buffer); // 实时更新最后一条 AI 消息
});
await invoke('ai_chat_stream', { messages });
unlisten();
```

**效果**：用户发送后 0.5 秒即开始看到文字逐字出现。

---

#### 1.2 会话持久化 + 多会话管理
**痛点**：刷新页面/重启应用后聊天记录全丢

**方案**：
- SQLite 新增 `chat_sessions` 表和 `chat_messages` 表
- 支持创建/切换/删除会话
- 侧边栏显示历史会话列表（在 AI 助手分类下）

```sql
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,       -- 'user' | 'assistant' | 'system' | 'tool'
    content TEXT NOT NULL,
    tool_name TEXT,           -- 工具调用名
    tool_result TEXT,         -- 工具执行结果 JSON
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);
```

**新增 IPC**：
- `create_chat_session(title) → session_id`
- `list_chat_sessions() → Vec<Session>`
- `get_chat_messages(session_id) → Vec<Message>`
- `save_chat_message(session_id, role, content, ...)`
- `delete_chat_session(session_id)`
- `rename_chat_session(session_id, title)`

**UI 变化**：
- Sidebar 在"AI 助手"分类下显示历史会话列表
- 每个会话可重命名/删除
- 新建会话按钮

---

#### 1.3 工具调用全覆盖（补齐缺失工具）

新增 14 个工具，覆盖所有现有 IPC 能力：

| 工具名 | 功能 | params |
|--------|------|--------|
| `move_files` | 移动/归档文件 | `{files, target_dir, mode}` |
| `quarantine_file` | 隔离文件 | `{path}` |
| `restore_quarantine` | 恢复隔离文件 | `{id}` |
| `list_quarantine` | 查看隔离区 | `{}` |
| `watch_directory` | 启动目录监控 | `{path}` |
| `stop_watcher` | 停止监控 | `{}` |
| `vault_encrypt` | 加密文件到保险箱 | `{path, password}` |
| `vault_decrypt` | 从保险箱解密 | `{id, password, target}` |
| `vault_list` | 列出保险箱文件 | `{}` |
| `scan_sensitive` | 扫描敏感信息 | `{path}` |
| `check_integrity` | 文件完整性校验 | `{path}` |
| `tag_images` | AI 标注图片 | `{path, model}` |
| `search_images` | 按标签搜索图片 | `{keyword}` |
| `save_settings` | 修改设置项 | `{key, value}` |

工具总数从 10 → **24**。

**system prompt 更新**：按分类组织工具说明，加入使用示例和约束。

---

### Phase 2：智能增强（2-3 天）

#### 2.1 上下文感知增强

**a) 文件内容摘要注入**

用户提到某个文件时，自动读取文件前 2KB 内容，注入 AI 上下文：

```rust
#[tauri::command]
async fn read_file_preview(path: String) -> Result<String, String> {
    let mut buf = vec![0u8; 2048];
    let mut f = tokio::fs::File::open(&path).await.map_err(|e| e.to_string())?;
    let n = f.read(&mut buf).await.map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&buf[..n]).to_string())
}
```

前端 agent 在检测到路径时自动调用，注入 `[FILE_CONTEXT]` 到下一轮 AI 消息。

**b) 用户行为记忆**

分析审计日志，提取用户高频操作模式：

```
最近 7 天操作统计：
- 每天约清理 1 次临时文件
- 高频搜索关键词：report, 季度, 合同
- 常用目录：D:\工作文件, D:\Downloads
- 整理偏好：按类型分类
```

注入 system prompt，使 AI 能说出"您上次清理了 2.3GB 临时文件"这类个性化回答。

**c) 页面感知**

告诉 AI 用户当前所在页面和操作状态：

```typescript
// 注入当前页面上下文
const pageContext = `用户当前在「${currentPage}」页面。`;
```

这样 AI 可以根据当前页面给出更精准的建议。

---

#### 2.2 智能意图路由（替换正则）

**痛点**：正则匹配太脆弱，"帮我把下载目录的东西归一下类" 匹配不到。

**方案**：用小模型做意图分类，替代硬编码正则。

```typescript
interface IntentResult {
  intent: 'disk_analysis' | 'clean' | 'large_files' | 'duplicates'
    | 'organize' | 'search' | 'index' | 'security' | 'vault'
    | 'image' | 'settings' | 'general_chat';
  entities: {
    path?: string;
    keyword?: string;
    file_type?: string;
    size_threshold?: number;
  };
  confidence: number;
}

async function classifyIntent(msg: string): Promise<IntentResult> {
  // 先尝试本地规则（快速、高置信度的简单case）
  const quickResult = quickRuleMatch(msg);
  if (quickResult && quickResult.confidence > 0.9) return quickResult;

  // 再用 AI 分类（单独的轻量请求，系统提示词固定）
  const intentPrompt = `对以下用户消息进行意图分类，返回JSON：
    {"intent": "...", "entities": {...}, "confidence": 0.0-1.0}
    可选意图：disk_analysis, clean, large_files, duplicates, organize,
    search, index, security, vault, image, settings, general_chat
    用户消息：${msg}`;
  const result = await aiChat([{ role: 'user', content: intentPrompt }]);
  return JSON.parse(result);
}
```

**效果**：用户说"把桌面那些乱七八糟的东西收拾一下"也能正确识别为 `organize` 意图。

---

#### 2.3 复合任务规划器（Task Planner）

**痛点**：用户说"全面体检然后清理并生成报告"，当前只能走 ReAct 逐步调，效率低且容易中断。

**方案**：AI 先生成执行计划，用户确认后批量执行。

```typescript
// AI 生成计划
interface TaskPlan {
  title: string;
  steps: {
    tool: string;
    params: Record<string, unknown>;
    description: string;
    dependsOn?: number; // 步骤依赖
  }[];
}

// UI 展示为可视化步骤列表
// 用户可以：确认全部执行 / 跳过某步 / 修改参数
```

**前端效果**：
```
🤖 我帮您制定了以下计划：

 ✅ Step 1: 系统健康检查
 ⏳ Step 2: 扫描可清理项目
 ⏳ Step 3: 执行清理（需确认）
 ⏳ Step 4: 重新检查健康评分
 ⏳ Step 5: 导出审计报告

 [全部执行]  [逐步确认]  [取消]
```

---

### Phase 3：多模态 + 深度集成（3-5 天）

#### 3.1 文件拖拽到对话

用户可以拖拽文件到聊天输入区，AI 自动分析：

```typescript
// 拖拽处理
function handleDrop(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files || []);
  // 对于图片：调用视觉模型描述
  // 对于文档：读取前 2KB 内容
  // 对于目录：扫描统计
  const context = await buildFileContext(files);
  appendChatMessage({ role: 'system', text: context });
  // 自动发送分析请求
  send(`请分析这${files.length}个文件：${files.map(f => f.name).join(', ')}`);
}
```

**效果**：拖一张图片进去 → AI 自动识别内容、标签、建议归档位置。

---

#### 3.2 对话内嵌交互组件

AI 回复中嵌入可操作的结构化组件，而非纯文本：

| 场景 | 嵌入组件 |
|------|----------|
| 磁盘分析 | 进度条可视化 + 饼图 |
| 大文件列表 | 可勾选表格 + 批量删除按钮 |
| 重复文件 | 对比卡片 + 保留/删除按钮 |
| 清理扫描 | 分类列表 + 一键清理按钮 |
| 搜索结果 | 文件列表 + 打开/定位按钮 |
| 任务计划 | 步骤列表 + 执行控制按钮 |

```typescript
// 消息类型扩展
interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  // 新增：结构化数据
  widget?: {
    type: 'file_list' | 'disk_chart' | 'clean_targets' | 'task_plan' | 'image_preview';
    data: unknown;
    actions?: { label: string; handler: string; params: unknown }[];
  };
}
```

**效果**：AI 说"找到 5 个大文件"时，消息内直接显示带勾选框的文件列表和"删除选中"按钮，用户无需离开聊天页面。

---

#### 3.3 图片对话（多模态）

在聊天中直接与图片交互：

```typescript
// 用户可以：
// 1. 拖入图片 → AI 描述内容
// 2. 粘贴截图 → AI 分析
// 3. 输入"分析这张图片 D:\photos\xxx.jpg" → 自动调用视觉模型

async function analyzeImageInChat(imagePath: string): Promise<string> {
  const base64 = await readImageBase64(imagePath);
  // 调用 Ollama 视觉模型（llava）
  const response = await invoke('ai_vision_chat', {
    imagePath,
    prompt: '请描述这张图片的内容，并建议合适的标签和归档目录。',
    model: 'llava:7b',
  });
  return response;
}
```

**新增 IPC**：`ai_vision_chat(image_path, prompt, model)` — 用 Ollama multimodal API。

---

### Phase 4：智能自动化（5-7 天）

#### 4.1 规则引擎 + 自动执行

用户通过对话设置自动化规则：

```
用户：帮我设一个规则，下载目录的 PDF 文件自动移到文档目录
AI：好的，我来创建这个自动化规则 ✅

📋 规则详情：
  触发：D:\Downloads 目录出现新 .pdf 文件
  动作：移动到 D:\Documents\PDF
  频率：实时监控

[启用规则] [修改] [取消]
```

**后端支持**：
```sql
CREATE TABLE automation_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,      -- 'file_created' | 'schedule' | 'disk_threshold'
    trigger_config TEXT NOT NULL,    -- JSON: {watch_path, pattern, cron, threshold_pct}
    action_type TEXT NOT NULL,       -- 'move' | 'clean' | 'tag' | 'encrypt' | 'notify'
    action_config TEXT NOT NULL,     -- JSON: {target_dir, model, password}
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);
```

**新增 IPC**：
- `create_automation_rule(rule) → id`
- `list_automation_rules() → Vec<Rule>`
- `toggle_automation_rule(id, enabled)`
- `delete_automation_rule(id)`

与现有 `watch_directory` 集成，watcher 检测到文件变化时自动执行匹配规则。

---

#### 4.2 智能建议引擎（Proactive Suggestions）

AI 主动分析系统状态，在仪表盘或对话中推送建议：

```typescript
// 定时后台分析（每小时一次）
async function generateProactiveSuggestions(): Promise<Suggestion[]> {
  const suggestions: Suggestion[] = [];

  // 1. 磁盘空间不足预警
  const disks = await getDiskInfo();
  for (const d of disks) {
    const pct = d.used_space / d.total_space * 100;
    if (pct > 85) {
      suggestions.push({
        type: 'warning',
        title: `${d.mount_point} 空间不足（${pct.toFixed(0)}%）`,
        action: 'scan_clean',
        message: '建议清理临时文件和重复文件释放空间',
      });
    }
  }

  // 2. 长期未整理的目录
  // 3. 重复文件增长趋势
  // 4. 敏感文件暴露风险
  // 5. 索引过期提醒

  return suggestions;
}
```

**仪表盘展示**：KPI 区域下方显示"AI 建议"卡片，点击直接跳转对话执行。

---

#### 4.3 自然语言文件查询（NL2Query）

用户用自然语言描述复杂查询，AI 翻译为结构化搜索条件：

```
用户：找出上个月修改过的、大于 10MB 的 Excel 文件
AI：→ 解析为 { category: '文档', extension: ['.xlsx','.xls'], 
      size_min: 10*1024*1024, modified_after: '2026-02-01', 
      modified_before: '2026-03-01' }
    → 调用 search_files_advanced
    → 找到 23 个匹配文件

用户：这些文件里哪些在 D 盘？
AI：→ 自动过滤上一次结果中 path 以 D:\ 开头的
    → 12 个文件在 D 盘
```

**新增 IPC**：`search_files_advanced(query: AdvancedQuery) → Vec<FileEntry>`

```rust
#[derive(Deserialize)]
pub struct AdvancedQuery {
    keyword: Option<String>,
    category: Option<String>,
    extensions: Option<Vec<String>>,
    size_min: Option<i64>,
    size_max: Option<i64>,
    modified_after: Option<String>,
    modified_before: Option<String>,
    path_prefix: Option<String>,
}
```

---

## 三、架构升级总览

### 对比

```
现在                              →  升级后
─────────────────────────────────────────────────────────────
[用户消息]                         [用户消息/拖拽文件/粘贴图片]
    ↓                                  ↓
[正则匹配 7个]                     [智能意图分类器]
    ↓ 失败                             ↓
[AI ReAct 10工具]                  [任务规划器（生成执行计划）]
    ↓                                  ↓
[一次性返回文本]                    [流式响应 + 嵌入交互组件]
    ↓                                  ↓
[内存消息，刷新丢失]                [SQLite持久化 + 会话管理]
                                       ↓
                                   [规则引擎（自动化执行）]
                                       ↓
                                   [主动建议推送]
```

### 工具数量变化

```
v1.5 (当前):  10 tools
Phase 1:      24 tools (+14)
Phase 2-4:    30+ tools (+search_advanced, vision, automation, suggestions)
```

---

## 四、实施优先级建议

| 优先级 | 功能 | 工时 | 用户感知提升 |
|--------|------|------|-------------|
| 🔴 P0 | 流式响应 | 4h | ★★★★★ 体验质变 |
| 🔴 P0 | 工具全覆盖（+14） | 4h | ★★★★☆ 能力大幅扩展 |
| 🟡 P1 | 会话持久化 | 3h | ★★★★☆ 基础体验 |
| 🟡 P1 | 意图分类器替换正则 | 3h | ★★★★☆ 理解力提升 |
| 🟡 P1 | 对话内嵌交互组件 | 6h | ★★★★★ 操作效率 |
| 🟢 P2 | 文件内容摘要注入 | 2h | ★★★☆☆ 智能感 |
| 🟢 P2 | 复合任务规划器 | 4h | ★★★★☆ 复杂任务 |
| 🟢 P2 | 文件拖拽到对话 | 3h | ★★★☆☆ 交互自然 |
| 🔵 P3 | 图片多模态对话 | 4h | ★★★☆☆ 差异化 |
| 🔵 P3 | 规则引擎自动化 | 8h | ★★★★★ 智能自动化 |
| 🔵 P3 | 主动建议引擎 | 4h | ★★★☆☆ 感知智能 |
| 🔵 P3 | NL2Query 高级搜索 | 4h | ★★★★☆ 搜索深度 |

**建议执行顺序**：P0（1天）→ P1（2天）→ P2（2天）→ P3（3-4天）

---

## 五、效果对比示例

### 示例 1：用户说"帮我收拾一下电脑"

**现在**：
```
AI：我帮你扫描了磁盘信息... [一大段纯文本]
    然后需要你自己去清理页面操作。
```

**升级后**：
```
AI（流式打字）：好的，我来全面检查一下你的电脑 🔍

📊 系统状态
┌─ 健康评分: 72/100（建议优化）
├─ C盘 使用 78% ██████████░░ 
├─ D盘 使用 45% █████░░░░░░░
└─ 上次清理: 3 天前

🧹 发现可清理 4.2 GB：
┌──────────────┬────────┬──────┐
│ 类型         │  大小  │ 操作 │
├──────────────┼────────┼──────┤
│ 临时文件     │ 2.1 GB │ [清理] │
│ 浏览器缓存   │ 1.3 GB │ [清理] │
│ 系统日志     │ 0.8 GB │ [清理] │
└──────────────┴────────┴──────┘

🔁 发现 12 组重复文件，可再释放 890 MB

[一键全部清理]  [逐项确认]  [查看详情]
```

### 示例 2：用户拖入一张图片

**现在**：不支持

**升级后**：
```
AI：我来分析这张图片...

📷 图片信息
  文件：vacation_2026.jpg (4.2 MB)
  尺寸：4032 × 3024
  拍摄：2026-01-15, iPhone 16

🏷️ AI 识别内容：
  海滩、日落、椰子树、度假

📁 建议归档到：D:\照片\2026\旅行\
  [移动到建议目录]  [自定义目录]  [添加标签]
```

### 示例 3：自动化规则

**现在**：不支持

**升级后**：
```
用户：每天自动清理下载目录超过 30 天的文件

AI：好的，我来设置这个自动化规则 ✅

📋 自动化规则 #3
  ⏰ 触发：每天 02:00
  📂 范围：D:\Downloads
  ⚡ 条件：文件修改时间 > 30 天
  🗑️ 动作：移动到隔离区（可恢复）

  [启用]  [修改]  [试运行]
```
