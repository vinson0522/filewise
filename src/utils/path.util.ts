/**
 * 路径工具 — 客户端前置验证
 * 注意：这里的验证只是 UX 层防御，真正的安全验证在 Rust 层完成
 */

const FORBIDDEN_PREFIXES = [
  'C:\\Windows',
  'C:\\System32',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData\\Microsoft',
  '/etc',
  '/proc',
  '/sys',
  '/dev',
];

/** 验证路径是否合法（客户端预检） */
export function validatePath(path: string): { valid: boolean; reason?: string } {
  if (!path.trim()) {
    return { valid: false, reason: '路径不能为空' };
  }
  if (path.includes('..')) {
    return { valid: false, reason: '路径不能包含 ..' };
  }
  const lower = path.toLowerCase();
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (lower.startsWith(prefix.toLowerCase())) {
      return { valid: false, reason: `禁止访问系统目录: ${prefix}` };
    }
  }
  return { valid: true };
}

/** 从完整路径提取文件名 */
export function getFileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

/** 从完整路径提取父目录 */
export function getParentDir(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : normalized;
}

/** 格式化文件大小 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/** 格式化时间戳 */
export function formatDate(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString('zh-CN');
}

/** 根据扩展名推断文件分类 */
export function inferCategory(extension?: string): string {
  if (!extension) return '其他';
  const ext = extension.toLowerCase();
  const map: Record<string, string> = {
    doc: '文档', docx: '文档', pdf: '文档', txt: '文档', md: '文档',
    xls: '文档', xlsx: '文档', ppt: '文档', pptx: '文档',
    jpg: '图片', jpeg: '图片', png: '图片', gif: '图片', svg: '图片', webp: '图片',
    mp4: '视频', avi: '视频', mov: '视频', mkv: '视频',
    mp3: '音频', wav: '音频', flac: '音频', aac: '音频',
    zip: '压缩包', rar: '压缩包', '7z': '压缩包', tar: '压缩包', gz: '压缩包',
    js: '代码', ts: '代码', jsx: '代码', tsx: '代码',
    py: '代码', rs: '代码', go: '代码', java: '代码', cpp: '代码', c: '代码',
  };
  return map[ext] ?? '其他';
}
