import { Tag } from 'antd';
import { RocketOutlined, BugOutlined, StarOutlined } from '@ant-design/icons';

interface ChangelogEntry {
  version: string;
  date: string;
  tag: 'major' | 'minor' | 'patch';
  features: string[];
  fixes?: string[];
  improvements?: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.4.0',
    date: '2026-03-04',
    tag: 'minor',
    features: [
      'AI Agent 系统：AI 助手可自动识别意图并执行文件管理操作',
      '云端 AI 模型支持：接入通义千问/DeepSeek/Moonshot/智谱/OpenAI',
      'AI 对话支持 Markdown 渲染',
      '帮助中心：使用教程、用户协议、隐私政策',
      '版本中心：查看历史版本更新记录',
      '索引存放路径可配置',
      '隔离区目录可配置',
    ],
    fixes: [
      '修复隔离文件跨盘操作失败的问题',
      '修复隔离区默认使用 C 盘的问题，改为文件同盘',
    ],
    improvements: [
      '设置页面新增云端 AI 配置区域',
      '设置页面新增存储路径配置',
      '快捷指令更新为可直接执行的 Agent 命令',
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026-03-03',
    tag: 'minor',
    features: [
      'AI 助手增强：系统提示词深度集成 FileWise 功能',
      'AI 上下文注入：实时磁盘/索引/隔离区状态',
      'Ollama 代理修复：解决 Windows 系统代理导致连接失败',
    ],
    fixes: [
      '修复 Ollama 在 Windows 下无法连接的问题（系统代理绕过）',
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026-03-02',
    tag: 'minor',
    features: [
      '系统托盘支持：最小化到托盘，双击恢复',
      '仪表盘「最近活动」卡片',
      '搜索结果显示文件分类标签',
    ],
    improvements: [
      '清除无用代码模块',
      '验证并确认 settings 表结构',
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026-03-01',
    tag: 'minor',
    features: [
      '仪表盘磁盘健康评分',
      '仪表盘文件分布可视化',
      '操作报告页面：快照管理 + 隔离区 + 审计日志',
      '设置持久化到 SQLite',
    ],
    fixes: [
      '修复 execute_clean 清理目标路径问题',
      '修复主窗口尺寸和标题',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026-02-28',
    tag: 'major',
    features: [
      '智能文件整理：按类型/日期自动归档',
      '系统清理：临时文件、缓存、空文件夹一键清理',
      '重复文件检测（BLAKE3 哈希）',
      '大文件扫描',
      '全文件名智能搜索 + 索引建立',
      '文件监听：实时监控目录变化',
      '操作快照与一键回滚',
      '隔离区：安全删除 + 30天可恢复',
      'AI 助手对话（Ollama 本地模型）',
      '磁盘信息展示',
    ],
  },
];

const tagColor = { major: 'red', minor: 'blue', patch: 'green' };
const tagLabel = { major: '重大版本', minor: '功能更新', patch: '修复补丁' };

export default function ChangelogPage() {
  return (
    <div>
      <div className="page-header">
        <h2>版本中心</h2>
        <p>查看 FileWise 的版本更新记录</p>
      </div>

      {CHANGELOG.map((entry, idx) => (
        <div key={entry.version} className="section-card" style={{ marginBottom: 16 }}>
          <div className="section-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}>{entry.version}</h3>
              <Tag color={tagColor[entry.tag]}>{tagLabel[entry.tag]}</Tag>
              {idx === 0 && <Tag color="green">当前版本</Tag>}
            </div>
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>{entry.date}</span>
          </div>
          <div className="section-card-body" style={{ fontSize: 14, lineHeight: 1.9, color: '#595959' }}>
            {entry.features.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1677ff', marginBottom: 6 }}>
                  <StarOutlined /> 新功能
                </div>
                <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                  {entry.features.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </>
            )}
            {entry.fixes && entry.fixes.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#52c41a', marginBottom: 6 }}>
                  <BugOutlined /> 修复
                </div>
                <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                  {entry.fixes.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </>
            )}
            {entry.improvements && entry.improvements.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#722ed1', marginBottom: 6 }}>
                  <RocketOutlined /> 改进
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {entry.improvements.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
