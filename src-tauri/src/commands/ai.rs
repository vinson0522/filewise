use serde::{Deserialize, Serialize};
use tauri::State;
use crate::state::AppState;
use crate::commands::settings::AppSettings;

const OLLAMA_BASE: &str = "http://127.0.0.1:11434";

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

fn get_model(state: &AppState) -> String {
    if let Ok(db) = state.db.lock() {
        if let Ok(json) = db.query_row(
            "SELECT value FROM settings WHERE key = 'app_settings'",
            [],
            |r| r.get::<_, String>(0),
        ) {
            if let Ok(s) = serde_json::from_str::<AppSettings>(&json) {
                return s.ai_model;
            }
        }
    }
    "qwen2.5:7b".to_string()
}

// ——————————————————————————————————————————————
// IPC: 健康检查 — 检测 Ollama 是否在线
// ——————————————————————————————————————————————

#[tauri::command]
pub async fn check_ollama() -> Result<bool, String> {
    let client = reqwest::Client::new();
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
    let client = reqwest::Client::new();
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

const FILE_ASSISTANT_SYSTEM: &str = "\
你是 FileWise AI，一个专业的文件管理助手。\
你可以帮用户：整理文件、清理重复/临时文件、查找文件、分析磁盘空间。\
当用户描述文件管理需求时，给出清晰的操作步骤建议。\
回复简洁、专业，使用中文。不要提供与文件管理无关的内容。";

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
    let model = get_model(&state);

    let client = reqwest::Client::new();

    // 构建对话上下文（最近 10 条）
    let mut chat_msgs: Vec<OllamaChatMsg> = vec![
        OllamaChatMsg { role: "system".to_string(), content: FILE_ASSISTANT_SYSTEM.to_string() },
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
    let client = reqwest::Client::new();

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
