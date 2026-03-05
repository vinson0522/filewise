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
  used_space: number;
  fs_type: string;
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

// ===================== 隔离区 =====================

export interface QuarantineItem {
  id: number;
  original_path: string;
  name: string;
  deleted_at: number;
  expires_at: number;
  size: number;
}

// ===================== UI 状态 =====================

export type PageKey =
  | 'dashboard'
  | 'organize'
  | 'clean'
  | 'search'
  | 'chat'
  | 'report'
  | 'settings'
  | 'help'
  | 'changelog'
  | 'security'
  | 'image';

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

export interface AgentActionResult {
  type: 'disk_info' | 'clean_scan' | 'large_files' | 'duplicates' | 'index_stats' | 'search' | 'navigate'
    | 'quarantine' | 'vault' | 'security' | 'image' | 'watcher' | 'automation' | 'file_preview' | 'plan';
  label: string;
  data: unknown;
  navigateTo?: PageKey;
}

export interface ChatWidget {
  type: 'file_list' | 'disk_chart' | 'clean_targets' | 'task_plan' | 'image_preview' | 'suggestion_list' | 'quarantine_list';
  data: unknown;
  actions?: { label: string; action: string; params?: unknown }[];
}

export interface ChatMessage {
  role: 'ai' | 'user';
  text: string;
  timestamp?: number;
  actionResult?: AgentActionResult;
  widget?: ChatWidget;
  isStreaming?: boolean;
}

// ===================== 会话管理 =====================

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessageRecord {
  id: number;
  session_id: string;
  role: string;
  content: string;
  tool_name?: string;
  tool_result?: string;
  widget_type?: string;
  widget_data?: string;
  created_at: string;
}

// ===================== 自动化规则 =====================

export interface AutomationRule {
  id: number;
  name: string;
  trigger_type: 'file_created' | 'schedule' | 'disk_threshold';
  trigger_config: string;
  action_type: 'move' | 'clean' | 'tag' | 'encrypt' | 'notify' | 'quarantine';
  action_config: string;
  enabled: boolean;
  last_run?: string;
  run_count: number;
  created_at: string;
}

export interface Suggestion {
  type: 'warning' | 'info' | 'tip';
  title: string;
  message: string;
  action?: string;
  priority: number;
}

// ===================== 高级搜索 =====================

export interface AdvancedQuery {
  keyword?: string;
  category?: string;
  extensions?: string[];
  size_min?: number;
  size_max?: number;
  modified_after?: string;
  modified_before?: string;
  path_prefix?: string;
}

export interface AdvancedSearchResult {
  path: string;
  name: string;
  size: number;
  modified_at?: number;
  category?: string;
  extension?: string;
}

// ===================== 任务计划 =====================

export interface TaskPlanStep {
  tool: string;
  params: Record<string, unknown>;
  description: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  result?: string;
}
