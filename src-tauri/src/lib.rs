pub mod commands;
pub mod engine;
pub mod security;
pub mod state;

use commands::ai::*;
use commands::clean::*;
use commands::file_ops::*;
use commands::index::*;
use commands::settings::*;
use commands::snapshot::*;
use state::AppState;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 获取系统应用数据目录
            let data_dir = app.path().app_data_dir()
                .expect("无法获取应用数据目录");

            let app_state = AppState::init(data_dir)
                .expect("数据库初始化失败");

            // R8: 启动时清理已过期的隔离区文件
            let now = chrono::Utc::now().timestamp();
            if let Ok(db) = app_state.db.lock() {
                let _ = db.execute(
                    "DELETE FROM quarantine WHERE expires_at < ?1",
                    rusqlite::params![now],
                );
            }

            app.manage(app_state);

            // 系统托盘
            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            TrayIconBuilder::new()
                .tooltip("FileWise — AI 智能文件助手")
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => { app.exit(0); }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

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
            list_quarantine,
            restore_quarantine,
            // clean
            scan_clean_targets,
            execute_clean,
            // index
            get_index_stats,
            scan_and_index,
            search_files,
            get_category_stats,
            get_category_stats_by_path,
            watch_directory,
            stop_watcher,
            get_watcher_status,
            // snapshot
            list_snapshots,
            restore_snapshot,
            delete_snapshot,
            // settings
            get_settings,
            save_settings,
            // audit log
            list_audit_log,
            get_health_score,
            // AI
            check_ollama,
            list_ollama_models,
            ai_chat,
            ai_classify_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
