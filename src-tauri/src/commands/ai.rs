use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;
use crate::commands::settings::AppSettings;

const OLLAMA_BASE: &str = "http://localhost:11434";

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

// ——————————————————————————————————————————————
// Ollama API 类型
// ——————————————————————————————————————————————

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
    system: Option<String>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

#[derive(Serialize, Deserialize)]
struct OllamaChatMsg {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaChatMsg>,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaChatResponse {
    message: OllamaChatMsg,
}

// ——————————————————————————————————————————————
// 内部辅助：读取当前设置的模型名称
// ——————————————————————————————————————————————

fn get_ai_settings(state: &AppState) -> AppSettings {
    if let Ok(db) = state.db.lock() {
        if let Ok(json) = db.query_row(
            "SELECT value FROM settings WHERE key = 'app_settings'",
            [],
            |r| r.get::<_, String>(0),
        ) {
            if let Ok(s) = serde_json::from_str::<AppSettings>(&json) {
                return s;
            }
        }
    }
    AppSettings::default()
}

fn get_model(state: &AppState) -> String {
    get_ai_settings(state).ai_model
}

/// OpenAI-compatible /v1/chat/completions 响应
#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}
#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIMsg,
}
#[derive(Deserialize)]
struct OpenAIMsg {
    content: String,
}

/// 云端 AI 对话（OpenAI 兼容接口：通义千问/DeepSeek/Moonshot/OpenAI 等）
async fn cloud_chat(
    settings: &AppSettings,
    system_prompt: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let base_url = if settings.cloud_ai_base_url.is_empty() {
        match settings.cloud_ai_provider.as_str() {
            "deepseek"  => "https://api.deepseek.com".to_string(),
            "moonshot"  => "https://api.moonshot.cn".to_string(),
            "zhipu"     => "https://open.bigmodel.cn/api/paas".to_string(),
            "openai"    => "https://api.openai.com".to_string(),
            _ => "https://dashscope.aliyuncs.com/compatible-mode".to_string(), // 通义千问
        }
    } else {
        settings.cloud_ai_base_url.clone()
    };

    let model = if settings.cloud_ai_model.is_empty() {
        match settings.cloud_ai_provider.as_str() {
            "deepseek"  => "deepseek-chat",
            "moonshot"  => "moonshot-v1-8k",
            "zhipu"     => "glm-4-flash",
            "openai"    => "gpt-4o-mini",
            _ => "qwen-plus",
        }.to_string()
    } else {
        settings.cloud_ai_model.clone()
    };

    let mut msgs = vec![
        serde_json::json!({"role": "system", "content": system_prompt}),
    ];
    let history = if messages.len() > 10 { &messages[messages.len()-10..] } else { messages };
    for m in history {
        msgs.push(serde_json::json!({"role": m.role, "content": m.content}));
    }

    let body = serde_json::json!({
        "model": model,
        "messages": msgs,
        "stream": false,
    });

    let client = http_client();
    let resp = client
        .post(format!("{}/v1/chat/completions", base_url))
        .header("Authorization", format!("Bearer {}", settings.cloud_ai_api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("云端 AI 连接失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("云端 AI 错误 {}: {}", status, text));
    }

    let data: OpenAIResponse = resp.json().await.map_err(|e| format!("解析响应失败: {}", e))?;
    data.choices.first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "云端 AI 返回空响应".to_string())
}

// ——————————————————————————————————————————————
// 构建实时上下文（注入 AI system prompt）
// ——————————————————————————————————————————————

fn build_context(state: &AppState) -> String {
    let mut lines: Vec<String> = Vec::new();

    // 磁盘信息
    let disks = sysinfo::Disks::new_with_refreshed_list();
    for d in disks.list() {
        let total = d.total_space();
        let avail = d.available_space();
        let used = total.saturating_sub(avail);
        let pct = if total > 0 { used as f64 / total as f64 * 100.0 } else { 0.0 };
        lines.push(format!(
            "- 磁盘 {}: 总容量 {:.1}GB, 已用 {:.1}GB ({:.0}%), 可用 {:.1}GB",
            d.mount_point().display(),
            total as f64 / 1e9, used as f64 / 1e9, pct, avail as f64 / 1e9
        ));
    }

    // 索引统计
    if let Ok(db) = state.db.lock() {
        if let Ok((cnt, sz)) = db.query_row::<(i64, i64), _, _>(
            "SELECT COUNT(*), COALESCE(SUM(size),0) FROM file_index", [],
            |r| Ok((r.get(0)?, r.get(1)?))
        ) {
            lines.push(format!("- 已索引文件: {} 个, 总大小 {:.1}GB", cnt, sz as f64 / 1e9));
        }

        // 分类统计 top 5
        if let Ok(mut stmt) = db.prepare(
            "SELECT COALESCE(category,'其他'), COUNT(*) FROM file_index GROUP BY category ORDER BY COUNT(*) DESC LIMIT 5"
        ) {
            let cats: Vec<String> = stmt.query_map([], |r| {
                Ok(format!("{}({}个)", r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            }).ok().map(|rows| rows.filter_map(|r| r.ok()).collect()).unwrap_or_default();
            if !cats.is_empty() {
                lines.push(format!("- 文件分类: {}", cats.join(", ")));
            }
        }

        // 隔离区
        if let Ok(qcnt) = db.query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM quarantine", [], |r| r.get(0)
        ) {
            if qcnt > 0 { lines.push(format!("- 隔离区: {} 个文件", qcnt)); }
        }

        // 快照
        if let Ok(scnt) = db.query_row::<i64, _, _>(
            "SELECT COUNT(*) FROM snapshots WHERE status='active'", [], |r| r.get(0)
        ) {
            if scnt > 0 { lines.push(format!("- 可恢复快照: {} 个", scnt)); }
        }
    }

    lines.join("\n")
}

// ——————————————————————————————————————————————
// IPC: 健康检查 — 检测 Ollama 是否在线
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn check_ollama() -> Result<bool, String> {
    let client = http_client();
    match client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

// ——————————————————————————————————————————————
// IPC: 列出本地已安装的 Ollama 模型
// ——————————————————————————————————————————————

#[derive(Deserialize, Serialize)]
pub struct OllamaModel {
    pub name: String,
    pub size: u64,
}

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<TagEntry>,
}

#[derive(Deserialize)]
struct TagEntry {
    name: String,
    size: u64,
}

#[tauri::command]
pub async fn list_ollama_models() -> Result<Vec<OllamaModel>, String> {
    let client = http_client();
    let resp = client
        .get(format!("{}/api/tags", OLLAMA_BASE))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Ollama 未运行: {}", e))?;

    let tags: TagsResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(tags.models.into_iter().map(|m| OllamaModel { name: m.name, size: m.size }).collect())
}

// ——————————————————————————————————————————————
// IPC: AI 对话（带系统提示词 + 文件助手上下文）
// ——————————————————————————————————————————————

const FILE_ASSISTANT_SYSTEM: &str = r#"你是 FileWise AI 智能助手（Agent模式），内嵌在 FileWise 桌面应用中。你可以直接调用工具来帮用户完成文件管理任务。

## 可用工具
当你需要执行操作时，请在回复中包含 ACTION 标记：

```action
{"tool": "工具名", "params": {参数}}
```

可用工具列表：
1. `navigate` - 跳转页面。params: {"page": "dashboard|organize|clean|search|chat|report|settings|help|security"}
2. `health_check` - 执行系统健康检查。params: {}
3. `scan_clean` - 扫描可清理项目。params: {}
4. `execute_clean` - 执行清理（需要先 scan_clean 获取路径列表）。params: {"paths": ["路径1","路径2"]}
5. `scan_directory` - 扫描目录文件列表。params: {"path": "目录路径"}
6. `search_files` - 搜索文件。params: {"keyword": "关键词"}
7. `scan_large_files` - 扫描大文件。params: {"path": "目录路径", "min_size_mb": 100}
8. `scan_duplicates` - 扫描重复文件。params: {"path": "目录路径"}
9. `get_disk_info` - 获取磁盘使用情况。params: {}
10. `get_index_stats` - 获取文件索引统计。params: {}

## 回答规则
- 当用户请求可以用工具完成的操作时，**直接调用工具执行**，不要只是告诉用户去哪个页面
- 对于复合任务（如"整理桌面然后清理临时文件"），分步执行：先完成第一步，根据结果决定下一步
- 如果工具执行后系统会返回 [OBSERVATION]，你需要根据结果继续思考和回答
- 回复简洁、专业，使用中文，可用 Markdown
- 工具调用时先简短说明你要做什么，然后给出 action 块
- 如果不需要工具调用（如普通问答），正常回复即可，不要强行插入 action
- 不要推荐第三方工具，FileWise 已内置所有功能"#;

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,   // "user" | "assistant"
    pub content: String,
}

#[tauri::command]
pub async fn ai_chat(
    messages: Vec<ChatMessage>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let settings = get_ai_settings(&state);

    // 收集实时系统状态注入上下文
    let context = build_context(&state);
    let system_prompt = if context.is_empty() {
        FILE_ASSISTANT_SYSTEM.to_string()
    } else {
        format!("{}\n\n【当前系统状态】\n{}", FILE_ASSISTANT_SYSTEM, context)
    };

    // 路由：本地 Ollama 或云端 API
    if !settings.local_ai && !settings.cloud_ai_api_key.is_empty() {
        return cloud_chat(&settings, &system_prompt, &messages).await;
    }

    // 本地 Ollama 对话
    let model = settings.ai_model.clone();
    let client = http_client();

    let mut chat_msgs: Vec<OllamaChatMsg> = vec![
        OllamaChatMsg { role: "system".to_string(), content: system_prompt },
    ];
    let history = if messages.len() > 10 { &messages[messages.len()-10..] } else { &messages[..] };
    for m in history {
        chat_msgs.push(OllamaChatMsg {
            role: m.role.clone(),
            content: m.content.clone(),
        });
    }

    let body = OllamaChatRequest { model, messages: chat_msgs, stream: false };

    let resp = client
        .post(format!("{}/api/chat", OLLAMA_BASE))
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama 连接失败: {}。请确保已安装并运行 Ollama。", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama 错误 {}: {}", status, text));
    }

    let chat_resp: OllamaChatResponse = resp.json().await.map_err(|e| e.to_string())?;
    Ok(chat_resp.message.content)
}

// ——————————————————————————————————————————————
// IPC: 智能文件分类建议（给定文件名列表，返回分类方案）
// ——————————————————————————————————————————————

#[derive(Serialize, Deserialize)]
pub struct ClassifySuggestion {
    pub file: String,
    pub suggested_category: String,
    pub suggested_folder: String,
    pub reason: String,
}

#[tauri::command]
pub async fn ai_classify_files(
    file_names: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ClassifySuggestion>, String> {
    if file_names.is_empty() {
        return Ok(vec![]);
    }
    let model = get_model(&state);
    let client = http_client();

    let files_str = file_names.iter().take(30).cloned().collect::<Vec<_>>().join("\n");
    let prompt = format!(
        "请对以下文件名进行分类，返回 JSON 数组，每项包含 file、suggested_category、suggested_folder、reason 字段。\n\
         分类参考：文档/图片/视频/音乐/代码/压缩包/数据/其他。\n\
         文件名列表：\n{}\n\n只返回 JSON，不要其他文字。",
        files_str
    );

    let body = OllamaRequest {
        model,
        prompt,
        stream: false,
        system: Some("你是文件分类专家，只返回 JSON 数组，格式严格。".to_string()),
    };

    let resp = client
        .post(format!("{}/api/generate", OLLAMA_BASE))
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("Ollama 连接失败: {}", e))?;

    let gen: OllamaResponse = resp.json().await.map_err(|e| e.to_string())?;
    let text = gen.response.trim().to_string();

    // 提取 JSON 数组部分（模型可能包含额外文字）
    let json_start = text.find('[').unwrap_or(0);
    let json_end   = text.rfind(']').map(|i| i + 1).unwrap_or(text.len());
    let json_slice = &text[json_start..json_end];

    serde_json::from_str::<Vec<ClassifySuggestion>>(json_slice)
        .map_err(|e| format!("AI 返回格式解析失败: {}\n原始回复: {}", e, &text[..text.len().min(200)]))
}
