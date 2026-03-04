pub mod commands;
pub mod db;
pub mod engine;
pub mod security;
pub mod state;

use commands::clean::*;
use commands::file_ops::*;
use commands::index::*;
use commands::snapshot::*;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 获取系统应用数据目录，如 C:\Users\<user>\AppData\Roaming\com.filewise.dev
            let data_dir = app.path().app_data_dir()
                .expect("无法获取应用数据目录");

            let app_state = AppState::init(data_dir)
                .expect("数据库初始化失败");

            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // file_ops
            scan_directory_shallow,
            get_disk_info,
            move_files,
            scan_large_files,
            scan_duplicates,
            pick_folder,
            quarantine_file,
            restore_quarantine,
            // clean
            scan_clean_targets,
            execute_clean,
            // index
            get_index_stats,
            scan_and_index,
            search_files,
            // snapshot
            list_snapshots,
            restore_snapshot,
            delete_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
