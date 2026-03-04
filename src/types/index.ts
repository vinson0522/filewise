// ===================== 文件相关类型 =====================

export interface FileEntry {
  path: string;
  name: string;
  extension?: string;
  size: number;
  modified_at?: number;
  is_dir: boolean;
}

export interface DiskInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
}

export interface MoveOperation {
  source: string;
  target: string;
}

export interface OperationResult {
  success: boolean;
  processed: number;
  message: string;
}

// ===================== 索引 / 搜索 =====================

export interface IndexStats {
  total_files: number;
  total_size: number;
  last_indexed?: number;
}

export interface SearchResult {
  path: string;
  name: string;
  size: number;
  modified_at?: number;
  category?: string;
  score: number;
}

// ===================== 快照 =====================

export interface SnapshotInfo {
  id: string;
  created_at: number;
  description: string;
  file_count: number;
  status: 'active' | 'restored' | 'expired';
}

// ===================== UI 状态 =====================

export type PageKey =
  | 'dashboard'
  | 'organize'
  | 'clean'
  | 'search'
  | 'chat'
  | 'report'
  | 'settings';

export type FileCategory =
  | 'document'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'other';

export type CleanLevel = 'safe' | 'warn' | 'danger';

export interface CleanItem {
  name: string;
  desc: string;
  size: string;
  level: CleanLevel;
  count: number;
}

export interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
  timestamp?: number;
}
