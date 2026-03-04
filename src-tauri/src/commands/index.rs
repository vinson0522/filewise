use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct IndexStats {
    pub total_files: i64,
    pub total_size: i64,
    pub last_indexed: Option<i64>,
}

/// IPC: 获取索引统计信息
#[tauri::command]
pub async fn get_index_stats() -> Result<IndexStats, String> {
    // TODO: 从数据库查询
    Ok(IndexStats { total_files: 0, total_size: 0, last_indexed: None })
}

/// IPC: 搜索文件
#[tauri::command]
pub async fn search_files(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    // TODO: 实现全文检索 + 语义搜索
    let _ = (query, limit);
    Ok(vec![])
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified_at: Option<i64>,
    pub category: Option<String>,
    pub score: f32,
}
