import { invoke } from '@tauri-apps/api/core';
import type {
  FileEntry, DiskInfo, MoveOperation,
  OperationResult, IndexStats, SearchResult,
  SnapshotInfo,
} from '../types';
import { validatePath } from '../utils/path.util';

/** 通用 IPC 调用包装，统一错误处理 */
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.error(`[IPC] ${cmd} failed:`, e);
    throw new Error(String(e));
  }
}

// ===================== 文件扫描 =====================

/** 打开系统原生文件夹选择对话框，返回选中路径或 null */
export async function pickFolder(): Promise<string | null> {
  return safeInvoke<string | null>('pick_folder');
}

export async function scanDirectoryShallow(path: string): Promise<FileEntry[]> {
  const { valid, reason } = validatePath(path);
  if (!valid) throw new Error(reason);
  return safeInvoke<FileEntry[]>('scan_directory_shallow', { path });
}

export async function getDiskInfo(): Promise<DiskInfo[]> {
  return safeInvoke<DiskInfo[]>('get_disk_info');
}

// ===================== 文件操作 =====================

export async function moveFiles(
  operations: MoveOperation[],
  description?: string,
): Promise<OperationResult> {
  for (const op of operations) {
    const { valid, reason } = validatePath(op.source);
    if (!valid) throw new Error(`来源路径无效: ${reason}`);
  }
  return safeInvoke<OperationResult>('move_files', { operations, description });
}

export async function quarantineFile(path: string): Promise<OperationResult> {
  const { valid, reason } = validatePath(path);
  if (!valid) throw new Error(reason);
  return safeInvoke<OperationResult>('quarantine_file', { path });
}

// ===================== 索引 / 搜索 =====================

export async function getIndexStats(): Promise<IndexStats> {
  return safeInvoke<IndexStats>('get_index_stats');
}

/** 深度扫描目录并写入索引，返回最新统计 */
export async function scanAndIndex(path: string): Promise<IndexStats> {
  const { valid, reason } = validatePath(path);
  if (!valid) throw new Error(reason);
  return safeInvoke<IndexStats>('scan_and_index', { path });
}

export async function searchFiles(query: string, limit = 50): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  return safeInvoke<SearchResult[]>('search_files', { query, limit });
}

// ===================== 清理 =====================

export interface CleanTarget {
  name: string;
  description: string;
  path: string;
  size: number;
  file_count: number;
  level: 'safe' | 'warn';
}

export interface CleanResult {
  freed_bytes: number;
  deleted_count: number;
  failed: string[];
}

export interface DupGroup {
  hash: string;
  files: string[];
  size: number;
  total_wasted: number;
}

export interface LargeFileEntry {
  path: string;
  name: string;
  size: number;
  modified_at?: number;
  accessed_at?: number;
}

export async function scanCleanTargets(): Promise<CleanTarget[]> {
  return safeInvoke<CleanTarget[]>('scan_clean_targets');
}

export async function executeClean(paths: string[]): Promise<CleanResult> {
  return safeInvoke<CleanResult>('execute_clean', { paths });
}

export async function scanDuplicates(path: string): Promise<DupGroup[]> {
  const { valid, reason } = validatePath(path);
  if (!valid) throw new Error(reason);
  return safeInvoke<DupGroup[]>('scan_duplicates', { path });
}

export async function scanLargeFiles(path: string, minSizeMb = 100): Promise<LargeFileEntry[]> {
  const { valid, reason } = validatePath(path);
  if (!valid) throw new Error(reason);
  return safeInvoke<LargeFileEntry[]>('scan_large_files', { path, minSizeMb });
}

// ===================== 隔离区 =====================

export interface QuarantineItem {
  id: number;
  original_path: string;
  name: string;
  deleted_at: number;
  expires_at: number;
  size: number;
}

export async function listQuarantine(): Promise<QuarantineItem[]> {
  return safeInvoke<QuarantineItem[]>('list_quarantine');
}

export async function restoreQuarantine(recordId: number): Promise<OperationResult> {
  return safeInvoke<OperationResult>('restore_quarantine', { recordId });
}

// ===================== 快照 =====================

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return safeInvoke<SnapshotInfo[]>('list_snapshots');
}

export async function restoreSnapshot(snapshotId: string): Promise<string> {
  return safeInvoke<string>('restore_snapshot', { snapshotId });
}

export async function deleteSnapshot(snapshotId: string): Promise<string> {
  return safeInvoke<string>('delete_snapshot', { snapshotId });
}

// ===================== 设置 =====================

export interface AppSettings {
  local_ai: boolean;
  auto_organize: boolean;
  snapshot_before_op: boolean;
  auto_start: boolean;
  minimize_to_tray: boolean;
  excluded_paths: string[];
  large_file_threshold_mb: number;
  ai_model: string;
}

export async function getSettings(): Promise<AppSettings> {
  return safeInvoke<AppSettings>('get_settings');
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return safeInvoke<void>('save_settings', { settings });
}

// ===================== 审计日志 =====================

export interface AuditEntry {
  id: number;
  ts: number;
  action: string;
  path: string;
  detail: string;
  result: string;
}

export async function listAuditLog(): Promise<AuditEntry[]> {
  return safeInvoke<AuditEntry[]>('list_audit_log');
}

// ===================== 文件打开 =====================

/** 用资源管理器打开文件所在目录 */
export async function revealInExplorer(path: string): Promise<void> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  // 使用 shell open 打开父目录
  const parent = path.replace(/[^\\\/]+$/, '').replace(/[\\\/]$/, '') || 'C:\\';
  await tauriInvoke('plugin:opener|open_path', { path: parent }).catch(() =>
    tauriInvoke('open_path', { path: parent })
  );
}
