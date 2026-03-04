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

export async function scanDirectoryShallow(path: string): Promise<FileEntry[]> {
  const { valid, reason } = validatePath(path);
  if (!valid) throw new Error(reason);
  return safeInvoke<FileEntry[]>('scan_directory_shallow', { path });
}

export async function getDiskInfo(): Promise<DiskInfo[]> {
  return safeInvoke<DiskInfo[]>('get_disk_info');
}

// ===================== 文件操作 =====================

export async function moveFiles(operations: MoveOperation[]): Promise<OperationResult> {
  for (const op of operations) {
    const { valid, reason } = validatePath(op.source);
    if (!valid) throw new Error(`来源路径无效: ${reason}`);
  }
  return safeInvoke<OperationResult>('move_files', { operations });
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

export async function searchFiles(query: string, limit = 50): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  return safeInvoke<SearchResult[]>('search_files', { query, limit });
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
