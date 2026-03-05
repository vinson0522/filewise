import {
  getDiskInfo, scanCleanTargets, scanLargeFiles, scanDuplicates,
  searchFiles, scanAndIndex, getCategoryStats,
  readFilePreview, searchFilesAdvanced, aiVisionChat,
  createAutomationRule, listAutomationRules,
  searchImagesByTag, tagImages,
} from './file.service';
import type { AgentActionResult, TaskPlanStep } from '../types';
import { formatSize } from '../utils/path.util';

// ——————————————————————————————————————————————
// 路径提取工具
// ——————————————————————————————————————————————

async function getHomePath(): Promise<string> {
  try {
    const { homeDir } = await import('@tauri-apps/api/path');
    return await homeDir();
  } catch {
    return 'C:\\Users\\User';
  }
}

export async function extractPath(msg: string): Promise<string> {
  const m = msg.match(/([A-Z]:\\[^\s"'，。、]+)/i);
  if (m) return m[1];
  const home = await getHomePath();
  if (/桌面|desktop/i.test(msg)) return `${home}\\Desktop`;
  if (/下载|download/i.test(msg)) return `${home}\\Downloads`;
  if (/文档|document/i.test(msg)) return `${home}\\Documents`;
  if (/图片|picture|photo/i.test(msg)) return `${home}\\Pictures`;
  if (/视频|video/i.test(msg)) return `${home}\\Videos`;
  if (/音乐|music/i.test(msg)) return `${home}\\Music`;
  return '';
}

// ——————————————————————————————————————————————
// 意图分类器（替代脆弱正则）
// ——————————————————————————————————————————————

export type IntentType =
  | 'disk_analysis' | 'clean' | 'large_files' | 'duplicates'
  | 'organize' | 'search' | 'index' | 'health_check'
  | 'quarantine' | 'vault' | 'security' | 'image_tag'
  | 'watch' | 'automation' | 'file_preview'
  | 'general_chat';

interface IntentRule {
  intent: IntentType;
  patterns: RegExp[];
  keywords: string[];
}

const INTENT_RULES: IntentRule[] = [
  { intent: 'health_check', patterns: [/体检|健康|检查.*状态|诊断/], keywords: ['体检', '健康', '诊断'] },
  { intent: 'disk_analysis', patterns: [/磁盘|硬盘|空间|容量|占用|[C-Z]盘|存储|内存不足/], keywords: ['磁盘', '空间', '容量'] },
  { intent: 'clean', patterns: [/清理|清除|临时文件|缓存|垃圾|temp|cache|释放|腾空间|收拾.*电脑/], keywords: ['清理', '清除', '垃圾'] },
  { intent: 'large_files', patterns: [/大文件|大的文件|占空间|很大的/], keywords: ['大文件'] },
  { intent: 'duplicates', patterns: [/重复|duplicate|去重|相同.*文件/], keywords: ['重复', '去重'] },
  { intent: 'organize', patterns: [/整理|归档|分类|归类|organize|收拾|理一下/], keywords: ['整理', '归档', '分类'] },
  { intent: 'search', patterns: [/搜索|查找|找一下|找到|搜一下|search|在哪|哪里/], keywords: ['搜索', '查找'] },
  { intent: 'index', patterns: [/索引|扫描全部|建立索引|index|全盘扫描/], keywords: ['索引'] },
  { intent: 'quarantine', patterns: [/隔离|删除.*安全|安全.*删除|回收/], keywords: ['隔离'] },
  { intent: 'vault', patterns: [/加密|解密|保险箱|vault|encrypt|decrypt|上锁/], keywords: ['加密', '解密', '保险箱'] },
  { intent: 'security', patterns: [/敏感|身份证|银行卡|密码.*扫描|安全.*扫描|完整性/], keywords: ['敏感', '安全扫描'] },
  { intent: 'image_tag', patterns: [/图片.*标签|标注.*图片|识别.*图片|看.*图|分析.*图/], keywords: ['图片标签', '图片识别'] },
  { intent: 'watch', patterns: [/监控|watch|实时|监听/], keywords: ['监控'] },
  { intent: 'automation', patterns: [/自动|规则|定时|每天|自动化|触发/], keywords: ['自动', '规则'] },
  { intent: 'file_preview', patterns: [/预览|看看.*内容|打开.*看|读取.*文件|文件.*内容/], keywords: ['预览', '内容'] },
];

export function classifyIntent(msg: string): IntentType {
  const lower = msg.toLowerCase();
  for (const rule of INTENT_RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(lower) || pat.test(msg)) return rule.intent;
    }
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return rule.intent;
    }
  }
  return 'general_chat';
}

// ——————————————————————————————————————————————
// 快速执行器（按意图直接执行，无需 AI）
// ——————————————————————————————————————————————

export type ProgressCallback = (stage: string) => void;
const noop: ProgressCallback = () => {};

export async function detectAndExecute(msg: string, onProgress: ProgressCallback = noop): Promise<{ text: string; result: AgentActionResult } | null> {
  const intent = classifyIntent(msg);
  if (intent === 'general_chat') return null;

  try {
    switch (intent) {
      case 'health_check': {
        const { getHealthScore } = await import('./file.service');
        const h = await getHealthScore();
        return {
          text: `🏥 系统健康评分：**${h.score}/100**\n\n可释放空间：${formatSize(h.freeable_bytes)}\n${h.issues.length > 0 ? `\n问题：\n${h.issues.map(i => `- ${i}`).join('\n')}` : '✅ 未发现明显问题'}`,
          result: { type: 'navigate', label: '健康检查', data: h, navigateTo: 'dashboard' },
        };
      }
      case 'disk_analysis': {
        onProgress('正在读取磁盘信息...');
        const disks = await getDiskInfo();
        const lines = disks.map(d => {
          const pct = d.total_space > 0 ? Math.round((d.total_space - d.available_space) / d.total_space * 100) : 0;
          return `- **${d.mount_point}** 已用 ${formatSize(d.total_space - d.available_space)} / ${formatSize(d.total_space)} (${pct}%) 可用 ${formatSize(d.available_space)}`;
        });
        return { text: `💾 磁盘使用情况：\n\n${lines.join('\n')}`, result: { type: 'disk_info', label: '磁盘分析', data: disks } };
      }
      case 'clean': {
        onProgress('正在扫描可清理项目...');
        const targets = await scanCleanTargets();
        const total = targets.reduce((s, t) => s + t.size, 0);
        return {
          text: `🧹 发现 ${targets.length} 项可清理内容，共可释放 **${formatSize(total)}**：\n\n${targets.map(t => `- ${t.name}: ${formatSize(t.size)} (${t.file_count} 项)`).join('\n')}`,
          result: { type: 'clean_scan', label: '清理扫描', data: { targets, total }, navigateTo: 'clean' },
        };
      }
      case 'large_files': {
        onProgress('正在解析目标路径...');
        let path = await extractPath(msg);
        if (!path) path = await getHomePath();
        onProgress(`正在扫描大文件: ${path} ...`);
        const files = await scanLargeFiles(path, 50);
        const top = files.slice(0, 10);
        return {
          text: files.length === 0
            ? `✅ 在 ${path} 中未发现超过 50MB 的大文件。`
            : `📦 发现 ${files.length} 个大文件（>50MB），前 ${top.length} 个：\n\n${top.map((f, i) => `${i + 1}. **${f.name}** — ${formatSize(f.size)}`).join('\n')}`,
          result: { type: 'large_files', label: '大文件扫描', data: files, navigateTo: 'clean' },
        };
      }
      case 'duplicates': {
        onProgress('正在解析目标路径...');
        let path = await extractPath(msg);
        if (!path) path = await getHomePath();
        onProgress(`正在扫描重复文件: ${path}（文件哈希计算中，可能需要 1-3 分钟）...`);
        const groups = await scanDuplicates(path);
        onProgress('正在整理扫描结果...');
        const totalWaste = groups.reduce((s, g) => s + g.total_wasted, 0);
        return {
          text: groups.length === 0
            ? `✅ 在 ${path} 中未发现重复文件。`
            : `🔁 发现 ${groups.length} 组重复文件，可释放 **${formatSize(totalWaste)}**`,
          result: { type: 'duplicates', label: '重复文件检测', data: groups, navigateTo: 'clean' },
        };
      }
      case 'organize': {
        onProgress('正在解析目标路径...');
        let path = await extractPath(msg);
        if (!path) path = `${await getHomePath()}\\Desktop`;
        onProgress(`正在扫描并建立索引: ${path} ...`);
        const stats = await scanAndIndex(path);
        onProgress('正在统计文件分类...');
        const cats = await getCategoryStats();
        return {
          text: `📂 已扫描 **${path}**，共 ${stats.total_files} 个文件 (${formatSize(stats.total_size)})。\n\n${cats.slice(0, 6).map(c => `- ${c.category}: ${c.file_count} 个`).join('\n')}\n\n前往整理页面选择归档方式。`,
          result: { type: 'index_stats', label: '文件扫描', data: { stats, cats }, navigateTo: 'organize' },
        };
      }
      case 'search': {
        const kw = msg.replace(/搜索|查找|找一下|找到|搜一下|search|在哪|帮我|文件|一下|请|哪里/g, '').trim();
        if (!kw) return { text: '🔍 请告诉我你要搜索什么文件。', result: { type: 'search', label: '搜索', data: [] } };
        const results = await searchFiles(kw, 10);
        if (results.length === 0) return { text: `🔍 未找到「${kw}」相关文件，请先建立索引。`, result: { type: 'search', label: '搜索', data: [], navigateTo: 'search' } };
        return {
          text: `🔍 找到 ${results.length} 个匹配「${kw}」的文件：\n\n${results.slice(0, 8).map((r, i) => `${i + 1}. **${r.name}** (${formatSize(r.size)}) — ${r.path}`).join('\n')}`,
          result: { type: 'search', label: '搜索结果', data: results, navigateTo: 'search' },
        };
      }
      case 'index': {
        onProgress('正在解析目标路径...');
        let path = await extractPath(msg);
        if (!path) path = await getHomePath();
        onProgress(`正在建立文件索引: ${path}（遍历文件中）...`);
        const stats = await scanAndIndex(path);
        return {
          text: `📋 索引完成！已索引 **${stats.total_files}** 个文件，总大小 **${formatSize(stats.total_size)}**。`,
          result: { type: 'index_stats', label: '索引完成', data: stats },
        };
      }
      case 'quarantine': {
        const { listQuarantine } = await import('./file.service');
        const items = await listQuarantine();
        return {
          text: items.length === 0
            ? '✅ 隔离区为空。'
            : `🗑️ 隔离区共 ${items.length} 个文件：\n\n${items.slice(0, 10).map((q, i) => `${i + 1}. ${q.name} (${formatSize(q.size)})`).join('\n')}`,
          result: { type: 'quarantine', label: '隔离区', data: items, navigateTo: 'clean' },
        };
      }
      case 'vault': {
        const { vaultList } = await import('./file.service');
        const items = await vaultList();
        return {
          text: items.length === 0
            ? '🔐 保险箱为空。前往安全中心可以加密文件。'
            : `🔐 保险箱共 ${items.length} 个加密文件。前往安全中心管理。`,
          result: { type: 'vault', label: '保险箱', data: items, navigateTo: 'security' },
        };
      }
      case 'security': {
        return {
          text: '🛡️ 安全功能包括：敏感信息扫描、文件完整性校验、目录保护。前往安全中心操作。',
          result: { type: 'security', label: '安全中心', data: null, navigateTo: 'security' },
        };
      }
      case 'image_tag': {
        return {
          text: '🏷️ 图片标签功能：可以用 AI 视觉模型自动识别图片内容并添加标签。前往图片标签页面操作。',
          result: { type: 'image', label: '图片标签', data: null, navigateTo: 'image' },
        };
      }
      case 'watch': {
        return {
          text: '👁️ 目录监控功能：可以实时监控指定目录的文件变化。在设置页面配置监控目录。',
          result: { type: 'watcher', label: '目录监控', data: null, navigateTo: 'settings' },
        };
      }
      case 'automation': {
        const rules = await listAutomationRules();
        return {
          text: rules.length === 0
            ? '⚡ 还没有自动化规则。告诉我你想设置什么规则，例如"每天自动清理下载目录超过 30 天的文件"。'
            : `⚡ 当前有 ${rules.length} 条自动化规则：\n\n${rules.map((r, i) => `${i + 1}. ${r.enabled ? '✅' : '⏸️'} ${r.name} (已执行 ${r.run_count} 次)`).join('\n')}`,
          result: { type: 'automation', label: '自动化规则', data: rules },
        };
      }
      case 'file_preview': {
        const path = await extractPath(msg);
        if (!path) return { text: '📄 请指定要预览的文件路径。', result: { type: 'file_preview', label: '文件预览', data: null } };
        const preview = await readFilePreview(path);
        return { text: `📄 ${preview}`, result: { type: 'file_preview', label: '文件预览', data: preview } };
      }
      default:
        return null;
    }
  } catch (e) {
    return { text: `⚠️ 执行操作时出错：${String(e)}`, result: { type: 'navigate', label: '错误', data: null } };
  }
}

// ——————————————————————————————————————————————
// 任务规划器
// ——————————————————————————————————————————————

export function buildTaskPlan(msg: string): TaskPlanStep[] | null {
  const lower = msg.toLowerCase();

  // 全面体检 + 清理
  if (/全面|体检.*清理|清理.*体检|收拾.*电脑|优化.*电脑/.test(lower)) {
    return [
      { tool: 'health_check', params: {}, description: '系统健康检查', status: 'pending' },
      { tool: 'scan_clean', params: {}, description: '扫描可清理项目', status: 'pending' },
      { tool: 'scan_large_files', params: {}, description: '扫描大文件', status: 'pending' },
      { tool: 'scan_duplicates', params: {}, description: '扫描重复文件', status: 'pending' },
      { tool: 'get_disk_info', params: {}, description: '查看磁盘状态', status: 'pending' },
    ];
  }

  // 整理 + 清理
  if (/整理.*清理|清理.*整理/.test(lower)) {
    return [
      { tool: 'scan_directory', params: {}, description: '扫描目录', status: 'pending' },
      { tool: 'scan_clean', params: {}, description: '扫描可清理项', status: 'pending' },
      { tool: 'execute_clean', params: {}, description: '执行清理', status: 'pending' },
    ];
  }

  return null;
}

// ——————————————————————————————————————————————
// AI-driven action parsing & execution (ReAct) — 24+ tools
// ——————————————————————————————————————————————

export interface ParsedAction {
  tool: string;
  params: Record<string, unknown>;
}

export function parseAIActions(text: string): ParsedAction[] {
  const results: ParsedAction[] = [];
  const blockRegex = /```action\s*\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed.tool) results.push(parsed as ParsedAction);
    } catch { /* ignore malformed JSON */ }
  }
  if (results.length === 0) {
    const inlineRegex = /\{[^{}]*"tool"\s*:\s*"[^"]+?"[^{}]*\}/g;
    while ((m = inlineRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(m[0]);
        if (parsed.tool) results.push(parsed as ParsedAction);
      } catch { /* ignore */ }
    }
  }
  return results;
}

export function stripActionBlocks(text: string): string {
  return text
    .replace(/```action\s*\n?[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function executeAIAction(action: ParsedAction, onProgress: ProgressCallback = noop): Promise<{
  observation: string;
  result: AgentActionResult;
}> {
  const p = action.params || {};
  switch (action.tool) {
    // ── 系统监控 ──
    case 'navigate': {
      const page = (p.page as string) || 'dashboard';
      return { observation: `已跳转到「${page}」页面。`, result: { type: 'navigate', label: page, data: null, navigateTo: page as AgentActionResult['navigateTo'] } };
    }
    case 'health_check': {
      onProgress('正在执行系统健康检查...');
      const { getHealthScore } = await import('./file.service');
      const h = await getHealthScore();
      return { observation: `健康评分: ${h.score}/100。可释放: ${formatSize(h.freeable_bytes)}。问题: ${h.issues.join('; ') || '无'}`, result: { type: 'navigate', label: '健康检查', data: h, navigateTo: 'dashboard' } };
    }
    case 'get_disk_info': {
      const disks = await getDiskInfo();
      const lines = disks.map(d => `${d.mount_point} 已用${d.total_space > 0 ? Math.round((d.total_space - d.available_space) / d.total_space * 100) : 0}% 可用${formatSize(d.available_space)}`);
      return { observation: `磁盘信息：\n${lines.join('\n')}`, result: { type: 'disk_info', label: '磁盘信息', data: disks } };
    }
    case 'get_index_stats': {
      const { getIndexStats } = await import('./file.service');
      const stats = await getIndexStats();
      return { observation: `索引统计：${stats.total_files} 个文件，${formatSize(stats.total_size)}`, result: { type: 'index_stats', label: '索引统计', data: stats } };
    }
    // ── 文件管理 ──
    case 'scan_directory': {
      const { scanDirectoryShallow } = await import('./file.service');
      const path = (p.path as string) || '';
      if (!path) return { observation: '错误：未指定目录路径。', result: { type: 'navigate', label: '扫描', data: null } };
      onProgress(`正在扫描目录: ${path} ...`);
      const files = await scanDirectoryShallow(path);
      return { observation: `目录 ${path}：${files.length} 项（${files.filter(f => f.is_dir).length} 文件夹, ${files.filter(f => !f.is_dir).length} 文件）`, result: { type: 'index_stats', label: '目录扫描', data: files } };
    }
    case 'search_files': {
      const keyword = (p.keyword as string) || '';
      if (!keyword) return { observation: '错误：未指定搜索关键词。', result: { type: 'search', label: '搜索', data: [] } };
      const results = await searchFiles(keyword, 10);
      if (results.length === 0) return { observation: `未找到「${keyword}」相关文件。`, result: { type: 'search', label: '搜索', data: [], navigateTo: 'search' } };
      return { observation: `找到 ${results.length} 个匹配「${keyword}」：\n${results.slice(0, 8).map((r, i) => `${i + 1}. ${r.name} (${formatSize(r.size)})`).join('\n')}`, result: { type: 'search', label: '搜索结果', data: results, navigateTo: 'search' } };
    }
    case 'search_files_advanced': {
      const query = {
        keyword: p.keyword as string || undefined,
        category: p.category as string || undefined,
        extensions: p.extensions as string[] || undefined,
        size_min: p.size_min as number || undefined,
        size_max: p.size_max as number || undefined,
        modified_after: p.modified_after as string || undefined,
        modified_before: p.modified_before as string || undefined,
        path_prefix: p.path_prefix as string || undefined,
      };
      const results = await searchFilesAdvanced(query, 20);
      return { observation: results.length === 0 ? '未找到匹配文件。' : `找到 ${results.length} 个文件：\n${results.slice(0, 10).map((r, i) => `${i + 1}. ${r.name} (${formatSize(r.size)}) [${r.category || '未分类'}]`).join('\n')}`, result: { type: 'search', label: '高级搜索', data: results, navigateTo: 'search' } };
    }
    case 'move_files': {
      const { moveFiles } = await import('./file.service');
      const files = (p.files as { source: string; target: string }[]) || [];
      if (files.length === 0) return { observation: '错误：未指定文件。', result: { type: 'navigate', label: '移动', data: null } };
      const res = await moveFiles(files);
      return { observation: `移动完成：${res.processed} 个文件。${res.message}`, result: { type: 'navigate', label: '文件移动', data: res, navigateTo: 'organize' } };
    }
    case 'read_file_preview': {
      const path = (p.path as string) || '';
      if (!path) return { observation: '错误：未指定文件路径。', result: { type: 'file_preview', label: '预览', data: null } };
      const preview = await readFilePreview(path);
      return { observation: preview, result: { type: 'file_preview', label: '文件预览', data: preview } };
    }
    case 'scan_large_files': {
      const path = (p.path as string) || await getHomePath();
      const minSize = (p.min_size_mb as number) || 100;
      onProgress(`正在扫描大文件: ${path}（>${minSize}MB）...`);
      const files = await scanLargeFiles(path, minSize);
      return { observation: files.length === 0 ? `未发现>${minSize}MB大文件。` : `发现 ${files.length} 个大文件：\n${files.slice(0, 10).map((f, i) => `${i + 1}. ${f.name} (${formatSize(f.size)})`).join('\n')}`, result: { type: 'large_files', label: '大文件', data: files, navigateTo: 'clean' } };
    }
    case 'scan_duplicates': {
      const path = (p.path as string) || await getHomePath();
      onProgress(`正在扫描重复文件: ${path}（哈希计算中，请耐心等待）...`);
      const groups = await scanDuplicates(path);
      onProgress('正在统计重复文件结果...');
      const tw = groups.reduce((s, g) => s + g.total_wasted, 0);
      return { observation: groups.length === 0 ? '未发现重复文件。' : `发现 ${groups.length} 组重复文件，可释放 ${formatSize(tw)}`, result: { type: 'duplicates', label: '重复文件', data: groups, navigateTo: 'clean' } };
    }
    // ── 清理 ──
    case 'scan_clean': {
      onProgress('正在扫描可清理项目...');
      const targets = await scanCleanTargets();
      const total = targets.reduce((s, t) => s + t.size, 0);
      return { observation: `发现 ${targets.length} 项可清理，共 ${formatSize(total)}：\n${targets.map(t => `${t.name}: ${formatSize(t.size)}`).join('\n')}`, result: { type: 'clean_scan', label: '清理扫描', data: { targets, total }, navigateTo: 'clean' } };
    }
    case 'execute_clean': {
      const { executeClean } = await import('./file.service');
      const paths = (p.paths as string[]) || [];
      if (paths.length === 0) return { observation: '错误：未指定清理路径。', result: { type: 'clean_scan', label: '清理', data: null } };
      onProgress(`正在清理 ${paths.length} 个项目...`);
      const res = await executeClean(paths);
      return { observation: `清理完成！释放 ${formatSize(res.freed_bytes)}，删除 ${res.deleted_count} 个文件。`, result: { type: 'clean_scan', label: '清理执行', data: res } };
    }
    // ── 隔离区 ──
    case 'quarantine_file': {
      const { quarantineFile } = await import('./file.service');
      const path = (p.path as string) || '';
      if (!path) return { observation: '错误：未指定文件路径。', result: { type: 'quarantine', label: '隔离', data: null } };
      await quarantineFile(path);
      return { observation: `已隔离文件：${path}`, result: { type: 'quarantine', label: '已隔离', data: { path } } };
    }
    case 'list_quarantine': {
      const { listQuarantine } = await import('./file.service');
      const items = await listQuarantine();
      return { observation: items.length === 0 ? '隔离区为空。' : `隔离区 ${items.length} 个文件：\n${items.slice(0, 10).map((q, i) => `${i + 1}. ${q.name} (${formatSize(q.size)})`).join('\n')}`, result: { type: 'quarantine', label: '隔离区', data: items, navigateTo: 'clean' } };
    }
    case 'restore_quarantine': {
      const { restoreQuarantine } = await import('./file.service');
      const id = (p.id as number) || 0;
      if (!id) return { observation: '错误：未指定隔离ID。', result: { type: 'quarantine', label: '恢复', data: null } };
      await restoreQuarantine(id);
      return { observation: `已恢复隔离文件 ID=${id}`, result: { type: 'quarantine', label: '已恢复', data: { id } } };
    }
    // ── 安全 ──
    case 'vault_encrypt': {
      const { vaultEncrypt } = await import('./file.service');
      const path = (p.path as string) || '';
      const pwd = (p.password as string) || '';
      if (!path || !pwd) return { observation: '错误：需要文件路径和密码。', result: { type: 'vault', label: '加密', data: null } };
      await vaultEncrypt(path, pwd);
      return { observation: `已加密文件：${path}`, result: { type: 'vault', label: '已加密', data: { path }, navigateTo: 'security' } };
    }
    case 'vault_decrypt': {
      const { vaultDecrypt } = await import('./file.service');
      const id = (p.id as number) || 0;
      const pwd = (p.password as string) || '';
      const target = (p.target_dir as string) || '';
      if (!id || !pwd) return { observation: '错误：需要ID和密码。', result: { type: 'vault', label: '解密', data: null } };
      await vaultDecrypt(id, pwd, target);
      return { observation: `已解密文件 ID=${id}`, result: { type: 'vault', label: '已解密', data: { id } } };
    }
    case 'vault_list': {
      const { vaultList } = await import('./file.service');
      const items = await vaultList();
      return { observation: items.length === 0 ? '保险箱为空。' : `保险箱 ${items.length} 个文件。`, result: { type: 'vault', label: '保险箱', data: items, navigateTo: 'security' } };
    }
    case 'scan_sensitive': {
      const { scanSensitiveFiles } = await import('./file.service');
      const path = (p.path as string) || await getHomePath();
      onProgress(`正在扫描敏感信息: ${path} ...`);
      const results = await scanSensitiveFiles(path);
      return { observation: results.length === 0 ? '未发现敏感信息。' : `发现 ${results.length} 个敏感文件。`, result: { type: 'security', label: '敏感扫描', data: results, navigateTo: 'security' } };
    }
    case 'check_integrity': {
      const { checkIntegrity } = await import('./file.service');
      const path = (p.path as string) || '';
      if (!path) return { observation: '错误：未指定路径。', result: { type: 'security', label: '完整性', data: null } };
      onProgress(`正在校验文件完整性: ${path} ...`);
      const result = await checkIntegrity(path);
      return { observation: `完整性检查完成：${JSON.stringify(result)}`, result: { type: 'security', label: '完整性校验', data: result } };
    }
    // ── 监控与自动化 ──
    case 'watch_directory': {
      const { watchDirectory } = await import('./file.service');
      const path = (p.path as string) || '';
      if (!path) return { observation: '错误：未指定监控目录。', result: { type: 'watcher', label: '监控', data: null } };
      await watchDirectory(path);
      return { observation: `已开始监控目录：${path}`, result: { type: 'watcher', label: '目录监控', data: { path } } };
    }
    case 'stop_watcher': {
      const { stopWatcher } = await import('./file.service');
      await stopWatcher();
      return { observation: '已停止目录监控。', result: { type: 'watcher', label: '停止监控', data: null } };
    }
    case 'create_rule': {
      const name = (p.name as string) || '新规则';
      const triggerType = (p.trigger_type as string) || 'file_created';
      const triggerConfig = JSON.stringify(p.trigger_config || {});
      const actionType = (p.action_type as string) || 'notify';
      const actionConfig = JSON.stringify(p.action_config || {});
      const rule = await createAutomationRule(name, triggerType, triggerConfig, actionType, actionConfig);
      return { observation: `已创建规则「${rule.name}」(ID=${rule.id})`, result: { type: 'automation', label: '创建规则', data: rule } };
    }
    // ── 图片标签 ──
    case 'tag_images': {
      const path = (p.path as string) || '';
      const model = (p.model as string) || undefined;
      if (!path) return { observation: '错误：未指定图片目录。', result: { type: 'image', label: '标注', data: null } };
      onProgress(`正在用 AI 标注图片: ${path}（逐张分析中，可能较慢）...`);
      const progress = await tagImages(path, model);
      return { observation: `图片标注完成：共 ${progress.total} 张，已完成 ${progress.completed} 张。`, result: { type: 'image', label: '图片标注', data: progress, navigateTo: 'image' } };
    }
    case 'search_images': {
      const keyword = (p.keyword as string) || '';
      if (!keyword) return { observation: '错误：未指定搜索关键词。', result: { type: 'image', label: '图片搜索', data: [] } };
      const images = await searchImagesByTag(keyword);
      return { observation: images.length === 0 ? `未找到标签含「${keyword}」的图片。` : `找到 ${images.length} 张匹配图片。`, result: { type: 'image', label: '图片搜索', data: images, navigateTo: 'image' } };
    }
    // ── 视觉对话 ──
    case 'analyze_image': {
      const imagePath = (p.path as string) || '';
      const prompt = (p.prompt as string) || '请描述这张图片的内容，并建议合适的标签和归档目录。';
      if (!imagePath) return { observation: '错误：未指定图片路径。', result: { type: 'image', label: '图片分析', data: null } };
      onProgress('AI 正在分析图片内容...');
      const desc = await aiVisionChat(imagePath, prompt);
      return { observation: `图片分析结果：\n${desc}`, result: { type: 'image', label: '图片分析', data: { path: imagePath, description: desc } } };
    }
    // ── 任务规划 ──
    case 'plan_tasks': {
      return { observation: '请根据用户需求生成分步执行计划。', result: { type: 'plan', label: '任务规划', data: null } };
    }
    default:
      return { observation: `未知工具：${action.tool}`, result: { type: 'navigate', label: '未知', data: null } };
  }
}
