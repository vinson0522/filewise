import {
  getDiskInfo, scanCleanTargets, scanLargeFiles, scanDuplicates,
  searchFiles, scanAndIndex, getCategoryStats,
} from './file.service';
import type { AgentActionResult } from '../types';
import { formatSize } from '../utils/path.util';

interface AgentAction {
  patterns: RegExp[];
  execute: (msg: string) => Promise<{ text: string; result: AgentActionResult }>;
}

async function extractPath(msg: string): Promise<string> {
  const m = msg.match(/([A-Z]:\\[^\s"'，。、]+)/i);
  if (m) return m[1];
  const home = await getHomePath();
  if (/桌面/.test(msg)) return `${home}\\Desktop`;
  if (/下载/.test(msg)) return `${home}\\Downloads`;
  if (/文档/.test(msg)) return `${home}\\Documents`;
  return '';
}

const actions: AgentAction[] = [
  // 磁盘分析
  {
    patterns: [/磁盘|硬盘|空间|容量|占用|C盘|D盘|存储/],
    execute: async () => {
      const disks = await getDiskInfo();
      const lines = disks.map(d => {
        const pct = d.total_space > 0 ? Math.round((d.total_space - d.available_space) / d.total_space * 100) : 0;
        return `${d.mount_point}  已用 ${formatSize(d.total_space - d.available_space)} / ${formatSize(d.total_space)} (${pct}%)  可用 ${formatSize(d.available_space)}`;
      });
      let catInfo = '';
      try {
        const cats = await getCategoryStats();
        if (cats.length > 0) {
          catInfo = '\n\n📊 文件分类统计：\n' + cats.slice(0, 6).map(c =>
            `  ${c.category}: ${c.file_count} 个文件, ${formatSize(c.total_size)}`
          ).join('\n');
        }
      } catch { /* no index yet */ }
      return {
        text: `🔍 已扫描磁盘信息：\n\n${lines.join('\n')}${catInfo}`,
        result: { type: 'disk_info', label: '磁盘分析', data: disks },
      };
    },
  },
  // 清理扫描
  {
    patterns: [/清理|清除|临时文件|缓存|垃圾|temp|cache/],
    execute: async () => {
      const targets = await scanCleanTargets();
      const total = targets.reduce((s, t) => s + t.size, 0);
      const lines = targets.map(t =>
        `  ${t.name}: ${formatSize(t.size)} (${t.file_count} 项)`
      );
      return {
        text: `🧹 已扫描可清理内容，共可释放 **${formatSize(total)}**：\n\n${lines.join('\n')}\n\n点击下方按钮前往清理页面一键清理。`,
        result: { type: 'clean_scan', label: '清理扫描', data: { targets, total }, navigateTo: 'clean' },
      };
    },
  },
  // 大文件
  {
    patterns: [/大文件|大的文件|占空间/],
    execute: async (msg) => {
      let path = await extractPath(msg);
      if (!path) path = await getHomePath();
      const files = await scanLargeFiles(path, 50);
      const top = files.slice(0, 10);
      const lines = top.map((f, i) =>
        `  ${i + 1}. ${f.name}  ${formatSize(f.size)}  (${f.path.split(/[\\/]/).slice(0, -1).join('\\')})`
      );
      return {
        text: files.length === 0
          ? `✅ 在 ${path} 中未发现超过 50MB 的大文件。`
          : `📦 发现 ${files.length} 个大文件（>50MB），前 ${top.length} 个：\n\n${lines.join('\n')}\n\n可前往清理页面处理这些文件。`,
        result: { type: 'large_files', label: '大文件扫描', data: files, navigateTo: 'clean' },
      };
    },
  },
  // 重复文件
  {
    patterns: [/重复|duplicate|去重|相同/],
    execute: async (msg) => {
      let path = await extractPath(msg);
      if (!path) path = await getHomePath();
      const groups = await scanDuplicates(path);
      const totalWaste = groups.reduce((s, g) => s + g.total_wasted, 0);
      return {
        text: groups.length === 0
          ? `✅ 在 ${path} 中未发现重复文件。`
          : `🔁 发现 ${groups.length} 组重复文件，可释放 **${formatSize(totalWaste)}**。\n\n前 ${Math.min(5, groups.length)} 组：\n${groups.slice(0, 5).map((g, i) => `  ${i + 1}. ${g.files[0].split(/[\\/]/).pop()} (${formatSize(g.size)} × ${g.files.length} 份)`).join('\n')}\n\n可前往清理页面逐一处理。`,
        result: { type: 'duplicates', label: '重复文件检测', data: groups, navigateTo: 'clean' },
      };
    },
  },
  // 整理文件
  {
    patterns: [/整理|归档|分类|归类|organize/],
    execute: async (msg) => {
      let path = await extractPath(msg);
      if (!path) path = `${await getHomePath()}\\Desktop`;
      // 先建索引获取统计
      const stats = await scanAndIndex(path);
      const cats = await getCategoryStats();
      const catLines = cats.slice(0, 6).map(c => `  ${c.category}: ${c.file_count} 个`).join('\n');
      return {
        text: `📂 已扫描 **${path}**，共 ${stats.total_files} 个文件 (${formatSize(stats.total_size)})。\n\n文件分类：\n${catLines}\n\n点击下方按钮前往整理页面，选择按类型或日期自动归档。`,
        result: { type: 'index_stats', label: '文件扫描', data: { stats, cats }, navigateTo: 'organize' },
      };
    },
  },
  // 搜索文件
  {
    patterns: [/搜索|查找|找一下|找到|搜一下|search|在哪/],
    execute: async (msg) => {
      // 提取搜索关键词（去掉动词）
      const kw = msg.replace(/搜索|查找|找一下|找到|搜一下|search|在哪|帮我|文件|一下|请/g, '').trim();
      if (!kw) {
        return {
          text: '🔍 请告诉我你要搜索什么文件，例如"搜索报告.pdf"或"找一下图片文件"。',
          result: { type: 'search', label: '搜索', data: [] },
        };
      }
      const results = await searchFiles(kw, 10);
      if (results.length === 0) {
        return {
          text: `🔍 未找到「${kw}」相关文件。请先到搜索页面建立索引，然后再搜索。`,
          result: { type: 'search', label: '搜索', data: [], navigateTo: 'search' },
        };
      }
      const lines = results.slice(0, 8).map((r, i) =>
        `  ${i + 1}. **${r.name}** (${formatSize(r.size)}) — ${r.path}`
      );
      return {
        text: `🔍 找到 ${results.length} 个匹配「${kw}」的文件：\n\n${lines.join('\n')}`,
        result: { type: 'search', label: '搜索结果', data: results, navigateTo: 'search' },
      };
    },
  },
  // 建索引
  {
    patterns: [/索引|扫描全部|建立索引|index/],
    execute: async (msg) => {
      let path = await extractPath(msg);
      if (!path) path = await getHomePath();
      const stats = await scanAndIndex(path);
      return {
        text: `📋 索引建立完成！已索引 **${stats.total_files}** 个文件，总大小 **${formatSize(stats.total_size)}**。\n\n现在可以使用搜索功能快速查找文件了。`,
        result: { type: 'index_stats', label: '索引完成', data: stats },
      };
    },
  },
];

async function getHomePath(): Promise<string> {
  // Windows USERPROFILE
  try {
    const { homeDir } = await import('@tauri-apps/api/path');
    return await homeDir();
  } catch {
    return 'C:\\Users\\User';
  }
}

export async function detectAndExecute(msg: string): Promise<{ text: string; result: AgentActionResult } | null> {
  const lower = msg.toLowerCase();
  for (const action of actions) {
    for (const pat of action.patterns) {
      if (pat.test(lower) || pat.test(msg)) {
        try {
          return await action.execute(msg);
        } catch (e) {
          return {
            text: `⚠️ 执行操作时出错：${String(e)}`,
            result: { type: 'navigate', label: '错误', data: null },
          };
        }
      }
    }
  }
  return null;
}

// ——————————————————————————————————————————————
// AI-driven action parsing & execution (ReAct)
// ——————————————————————————————————————————————

export interface ParsedAction {
  tool: string;
  params: Record<string, unknown>;
}

/** Parse ```action blocks from AI response text */
export function parseAIActions(text: string): ParsedAction[] {
  const results: ParsedAction[] = [];
  // Match ```action ... ``` blocks
  const blockRegex = /```action\s*\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed.tool) results.push(parsed as ParsedAction);
    } catch { /* ignore malformed JSON */ }
  }
  // Also try inline {"tool": ...} patterns if no blocks found
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

/** Strip action blocks from AI text for clean display */
export function stripActionBlocks(text: string): string {
  return text
    .replace(/```action\s*\n?[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Execute a single AI-parsed action, returns observation text for ReAct */
export async function executeAIAction(action: ParsedAction): Promise<{
  observation: string;
  result: AgentActionResult;
}> {
  const p = action.params || {};
  switch (action.tool) {
    case 'navigate': {
      const page = (p.page as string) || 'dashboard';
      return {
        observation: `已跳转到「${page}」页面。`,
        result: { type: 'navigate', label: page, data: null, navigateTo: page as AgentActionResult['navigateTo'] },
      };
    }
    case 'health_check': {
      const { getHealthScore } = await import('./file.service');
      const health = await getHealthScore();
      return {
        observation: `健康评分: ${health.score}/100。可释放空间: ${formatSize(health.freeable_bytes)}。问题: ${health.issues.join('; ')}`,
        result: { type: 'navigate', label: '健康检查', data: health, navigateTo: 'dashboard' },
      };
    }
    case 'scan_clean': {
      const targets = await scanCleanTargets();
      const total = targets.reduce((s, t) => s + t.size, 0);
      const lines = targets.map(t => `${t.name}: ${formatSize(t.size)} (${t.file_count}项, level=${t.level})`);
      return {
        observation: `扫描完成，发现 ${targets.length} 个可清理项，共可释放 ${formatSize(total)}：\n${lines.join('\n')}`,
        result: { type: 'clean_scan', label: '清理扫描', data: { targets, total }, navigateTo: 'clean' },
      };
    }
    case 'execute_clean': {
      const { executeClean } = await import('./file.service');
      const paths = (p.paths as string[]) || [];
      if (paths.length === 0) return { observation: '错误：未指定清理路径。请先执行 scan_clean 获取路径列表。', result: { type: 'clean_scan', label: '清理', data: null } };
      const res = await executeClean(paths);
      return {
        observation: `清理完成！已释放 ${formatSize(res.freed_bytes)}，删除 ${res.deleted_count} 个文件。${res.failed.length > 0 ? `失败 ${res.failed.length} 个。` : ''}`,
        result: { type: 'clean_scan', label: '清理执行', data: res },
      };
    }
    case 'scan_directory': {
      const { scanDirectoryShallow } = await import('./file.service');
      const path = (p.path as string) || '';
      if (!path) return { observation: '错误：未指定目录路径。', result: { type: 'navigate', label: '扫描', data: null } };
      const files = await scanDirectoryShallow(path);
      return {
        observation: `目录 ${path} 包含 ${files.length} 个项目（${files.filter(f => f.is_dir).length} 个文件夹, ${files.filter(f => !f.is_dir).length} 个文件）。`,
        result: { type: 'index_stats', label: '目录扫描', data: files },
      };
    }
    case 'search_files': {
      const keyword = (p.keyword as string) || '';
      if (!keyword) return { observation: '错误：未指定搜索关键词。', result: { type: 'search', label: '搜索', data: [] } };
      const results = await searchFiles(keyword, 10);
      if (results.length === 0) return { observation: `未找到匹配「${keyword}」的文件。可能需要先建立索引。`, result: { type: 'search', label: '搜索', data: [], navigateTo: 'search' } };
      const lines = results.slice(0, 8).map((r, i) => `${i + 1}. ${r.name} (${formatSize(r.size)}) — ${r.path}`);
      return {
        observation: `找到 ${results.length} 个匹配「${keyword}」的文件：\n${lines.join('\n')}`,
        result: { type: 'search', label: '搜索结果', data: results, navigateTo: 'search' },
      };
    }
    case 'scan_large_files': {
      const path = (p.path as string) || await getHomePath();
      const minSize = (p.min_size_mb as number) || 100;
      const files = await scanLargeFiles(path, minSize);
      const top = files.slice(0, 10);
      const lines = top.map((f, i) => `${i + 1}. ${f.name} (${formatSize(f.size)})`);
      return {
        observation: files.length === 0
          ? `在 ${path} 中未发现超过 ${minSize}MB 的大文件。`
          : `发现 ${files.length} 个大文件（>${minSize}MB）：\n${lines.join('\n')}`,
        result: { type: 'large_files', label: '大文件扫描', data: files, navigateTo: 'clean' },
      };
    }
    case 'scan_duplicates': {
      const path = (p.path as string) || await getHomePath();
      const groups = await scanDuplicates(path);
      const totalWaste = groups.reduce((s, g) => s + g.total_wasted, 0);
      return {
        observation: groups.length === 0
          ? `在 ${path} 中未发现重复文件。`
          : `发现 ${groups.length} 组重复文件，可释放 ${formatSize(totalWaste)}。`,
        result: { type: 'duplicates', label: '重复文件', data: groups, navigateTo: 'clean' },
      };
    }
    case 'get_disk_info': {
      const disks = await getDiskInfo();
      const lines = disks.map(d => {
        const pct = d.total_space > 0 ? Math.round((d.total_space - d.available_space) / d.total_space * 100) : 0;
        return `${d.mount_point} 已用${pct}% 可用${formatSize(d.available_space)}`;
      });
      return {
        observation: `磁盘信息：\n${lines.join('\n')}`,
        result: { type: 'disk_info', label: '磁盘信息', data: disks },
      };
    }
    case 'get_index_stats': {
      const { getIndexStats } = await import('./file.service');
      const stats = await getIndexStats();
      return {
        observation: `索引统计：${stats.total_files} 个文件，总大小 ${formatSize(stats.total_size)}。`,
        result: { type: 'index_stats', label: '索引统计', data: stats },
      };
    }
    default:
      return {
        observation: `未知工具：${action.tool}`,
        result: { type: 'navigate', label: '未知', data: null },
      };
  }
}
