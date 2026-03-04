pub mod commands;
pub mod db;
pub mod engine;
pub mod security;

use commands::file_ops::*;
use commands::index::*;
use commands::snapshot::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // file_ops
            scan_directory_shallow,
            get_disk_info,
            move_files,
            quarantine_file,
            // index
            get_index_stats,
            search_files,
            // snapshot
            list_snapshots,
            restore_snapshot,
            delete_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
