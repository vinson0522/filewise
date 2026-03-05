import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Spin } from 'antd';
import {
  AppstoreOutlined, ClearOutlined, CopyOutlined, DeleteOutlined,
  CheckCircleFilled, WarningFilled, CloseCircleFilled,
  ThunderboltOutlined, SearchOutlined,
  FolderOutlined, UndoOutlined, ExclamationCircleOutlined,
  DatabaseOutlined, FileOutlined,
} from '@ant-design/icons';
import { useState, useCallback } from 'react';
import {
  getDiskInfo, getIndexStats, getHealthScore, getCategoryStats,
  getCategoryStatsByPath, listAuditLog, scanCleanTargets,
} from '../services/file.service';
import type { HealthReport, CategoryStat, AuditEntry, CleanTarget } from '../services/file.service';
import { formatSize, formatDate } from '../utils/path.util';
import { useAppStore } from '../stores/useAppStore';

interface CheckItem {
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  action?: { label: string; page: string };
}

export default function DashboardPage() {
  const { setCurrentPage } = useAppStore();
  const qc = useQueryClient();

  /* ---------- queries ---------- */
  const { data: disks = [] } = useQuery({ queryKey: ['disk-info'], queryFn: getDiskInfo, refetchInterval: 60_000 });
  const { data: indexStats } = useQuery({ queryKey: ['index-stats'], queryFn: getIndexStats });
  const { data: health } = useQuery<HealthReport>({ queryKey: ['health-score'], queryFn: getHealthScore, staleTime: 5 * 60_000 });
  const [selectedDisk, setSelectedDisk] = useState('');
  const { data: catStats = [] } = useQuery<CategoryStat[]>({
    queryKey: ['category-stats', selectedDisk],
    queryFn: () => selectedDisk ? getCategoryStatsByPath(selectedDisk) : getCategoryStats(),
    staleTime: 5 * 60_000,
  });
  const { data: recentLogs = [] } = useQuery<AuditEntry[]>({ queryKey: ['audit-log'], queryFn: listAuditLog, staleTime: 60_000 });

  /* ---------- health check ---------- */
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);   // 0=idle 1-4=steps 5=done
  const [checkItems, setCheckItems] = useState<CheckItem[]>([]);
  const [scanScore, setScanScore] = useState<number | null>(null);

  const STEPS = ['检测磁盘状态', '扫描可清理空间', '检查文件索引', '计算健康评分'];

  const runHealthCheck = useCallback(async () => {
    setScanning(true);
    setCheckItems([]);
    setScanScore(null);
    const items: CheckItem[] = [];

    try {
      // Step 1: Disk
      setScanStep(1);
      const diskData = await getDiskInfo();
      const warnDisks = diskData.filter(d => d.used_space / d.total_space > 0.85);
      items.push(warnDisks.length > 0
        ? { label: '磁盘空间', status: 'warn', detail: `${warnDisks.map(d => (d.name || d.mount_point.replace(/\\/g, '')) + ' ' + Math.round(d.used_space / d.total_space * 100) + '%').join('、')} 使用率较高`, action: { label: '去清理', page: 'clean' } }
        : { label: '磁盘空间', status: 'ok', detail: '所有磁盘使用率正常' });

      // Step 2: Clean targets
      setScanStep(2);
      const targets: CleanTarget[] = await scanCleanTargets();
      const cleanable = targets.reduce((s, t) => s + t.size, 0);
      items.push(cleanable > 100 * 1024 * 1024
        ? { label: '可清理空间', status: 'warn', detail: `发现 ${formatSize(cleanable)} 可清理（${targets.length} 项）`, action: { label: '去清理', page: 'clean' } }
        : { label: '可清理空间', status: 'ok', detail: cleanable > 0 ? `仅 ${formatSize(cleanable)}，状态良好` : '无可清理项' });

      // Step 3: Index
      setScanStep(3);
      const idxStats = await getIndexStats();
      items.push(!idxStats || idxStats.total_files === 0
        ? { label: '文件索引', status: 'error', detail: '尚未建立文件索引，搜索和重复检测不可用', action: { label: '去建立', page: 'search' } }
        : { label: '文件索引', status: 'ok', detail: `已索引 ${idxStats.total_files.toLocaleString()} 个文件（${formatSize(idxStats.total_size)}）` });

      // Step 4: Health score
      setScanStep(4);
      const h = await getHealthScore();
      const sc = h.score;
      items.push(sc >= 80
        ? { label: '健康评分', status: 'ok', detail: `${sc} 分 — 状态良好` }
        : sc >= 60
          ? { label: '健康评分', status: 'warn', detail: `${sc} 分 — 建议优化`, action: { label: '查看建议', page: 'clean' } }
          : { label: '健康评分', status: 'error', detail: `${sc} 分 — 需要关注`, action: { label: '立即处理', page: 'clean' } });

      setScanScore(sc);
    } catch (e) {
      items.push({ label: '检测异常', status: 'error', detail: String(e) });
    }

    setCheckItems(items);
    setScanStep(5);
    setScanning(false);
    qc.refetchQueries({ queryKey: ['health-score'] });
    qc.refetchQueries({ queryKey: ['disk-info'] });
    qc.refetchQueries({ queryKey: ['index-stats'] });
  }, [qc]);

  /* ---------- helpers ---------- */
  const actionLabel: Record<string, string> = { move: '移动', clean: '清理', quarantine: '隔离', index: '索引', restore: '恢复' };

  const scoreColor = (s: number) => s >= 80 ? '#52c41a' : s >= 60 ? '#faad14' : '#ff4d4f';
  const statusIcon = (s: string) =>
    s === 'ok' ? <CheckCircleFilled style={{ color: '#52c41a' }} />
    : s === 'warn' ? <WarningFilled style={{ color: '#faad14' }} />
    : <CloseCircleFilled style={{ color: '#ff4d4f' }} />;

  const quickActions = [
    { icon: <AppstoreOutlined />, title: '智能整理', desc: '按类型自动分类归档', page: 'organize' as const },
    { icon: <ClearOutlined />,    title: '系统清理', desc: '清理临时/缓存文件', page: 'clean' as const },
    { icon: <CopyOutlined />,     title: '查找重复',  desc: '扫描并去除重复',   page: 'clean' as const },
    { icon: <DeleteOutlined />,   title: '大文件扫描', desc: '发现空间占用大文件', page: 'clean' as const },
    { icon: <SearchOutlined />,   title: '智能搜索', desc: '全文检索已索引文件', page: 'search' as const },
  ];

  const displayScore = scanScore ?? health?.score ?? null;

  /* ---------- KPI computed values ---------- */
  const totalCapacity = disks.reduce((s, d) => s + d.total_space, 0);
  const totalUsed = disks.reduce((s, d) => s + d.used_space, 0);
  const usedPct = totalCapacity > 0 ? Math.round(totalUsed / totalCapacity * 100) : 0;
  const totalFiles = indexStats?.total_files ?? 0;

  /* ---------- render ---------- */
  return (
    <div>
      {/* ========== Page Header ========== */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>仪表盘</h1>
          <p>欢迎回来，这是您的文件系统概览。</p>
        </div>
      </div>

      {/* ========== KPI Stat Cards ========== */}
      <div className="grid-4 mb-24">
        <div className="stat-card">
          <p className="stat-label">健康评分</p>
          <p className="stat-value">{displayScore !== null ? displayScore : '--'}<span className="stat-suffix">分</span></p>
          <p className="stat-extra" style={{ color: displayScore !== null && displayScore >= 80 ? '#16a34a' : displayScore !== null && displayScore >= 60 ? '#d97706' : 'var(--text-3)' }}>
            {displayScore !== null ? (displayScore >= 80 ? '状态良好' : displayScore >= 60 ? '建议优化' : '需要关注') : '未检测'}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">总容量</p>
          <p className="stat-value">{totalCapacity > 0 ? formatSize(totalCapacity) : '--'}</p>
          <div className="stat-bar"><div className="stat-bar-fill" style={{ width: `${usedPct}%`, background: 'var(--accent)' }} /></div>
        </div>
        <div className="stat-card">
          <p className="stat-label">已使用</p>
          <p className="stat-value">{totalUsed > 0 ? formatSize(totalUsed) : '--'}</p>
          <p className="stat-extra" style={{ color: usedPct > 85 ? '#dc2626' : usedPct > 70 ? '#d97706' : '#16a34a' }}>
            {usedPct > 0 ? `${usedPct}% 已使用` : ''}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">文件总数</p>
          <p className="stat-value">{totalFiles > 0 ? totalFiles.toLocaleString() : '--'}</p>
          <p className="stat-extra">{totalFiles > 0 ? '已索引' : '尚未建立索引'}</p>
        </div>
      </div>
      {/* ========== Hero: Health Check ========== */}
      <div className="hero-card mb-20">
        <div className="hero-left">
          {/* Score Circle */}
          <div className="score-ring-wrap">
            <svg viewBox="0 0 120 120" className="score-ring">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
              {displayScore !== null && (
                <circle cx="60" cy="60" r="52" fill="none"
                  stroke={scoreColor(displayScore)} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${displayScore * 3.267} 326.7`}
                  transform="rotate(-90 60 60)"
                  style={{ transition: 'stroke-dasharray 1s ease' }} />
              )}
            </svg>
            <div className="score-ring-text">
              {scanning ? (
                <Spin />
              ) : displayScore !== null ? (
                <>
                  <span className="score-num" style={{ color: scoreColor(displayScore) }}>{displayScore}</span>
                  <span className="score-label">健康评分</span>
                </>
              ) : (
                <span className="score-label" style={{ fontSize: 14 }}>未检测</span>
              )}
            </div>
          </div>
          <Button type="primary" size="large" shape="round"
            icon={<ThunderboltOutlined />}
            loading={scanning}
            onClick={runHealthCheck}
            style={{ marginTop: 16, fontWeight: 500, height: 44, paddingInline: 32 }}>
            {scanning ? STEPS[scanStep - 1] ?? '检测中' : scanStep === 5 ? '重新体检' : '一键体检'}
          </Button>
        </div>

        <div className="hero-right">
          {scanStep === 0 && !scanning ? (
            <div className="hero-empty">
              <ThunderboltOutlined style={{ fontSize: 28, color: 'var(--text-3)', marginBottom: 6 }} />
              <p>点击「一键体检」全面检测系统健康状态</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>将自动检测磁盘空间、可清理项、文件索引和健康评分</p>
            </div>
          ) : scanning ? (
            <div className="hero-steps">
              {STEPS.map((step, i) => (
                <div key={i} className={`hero-step ${i + 1 < scanStep ? 'done' : i + 1 === scanStep ? 'active' : ''}`}>
                  <span className="hero-step-dot">
                    {i + 1 < scanStep ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : i + 1 === scanStep ? <Spin size="small" /> : <span className="dot-empty" />}
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="hero-results">
              {checkItems.map((item, i) => (
                <div key={i} className="hero-result-row">
                  <span className="hero-result-icon">{statusIcon(item.status)}</span>
                  <span className="hero-result-label">{item.label}</span>
                  <span className="hero-result-detail">{item.detail}</span>
                  {item.action && (
                    <Button type="link" size="small"
                      onClick={() => setCurrentPage(item.action!.page as any)}>
                      {item.action.label} &gt;
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========== Quick Actions (horizontal) ========== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }} className="mb-20">
        {quickActions.map(a => (
          <div className="quick-action" key={a.title} onClick={() => setCurrentPage(a.page)}
            style={{ flexDirection: 'column', textAlign: 'center', padding: '16px 12px' }}>
            <div className="quick-action-icon" style={{ color: 'var(--accent)', marginBottom: 6 }}>{a.icon}</div>
            <div className="quick-action-text" style={{ textAlign: 'center' }}>
              <h4>{a.title}</h4>
              <p>{a.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ========== Disk + Distribution + Activity ========== */}
      <div className="grid-3 mb-20">
        <div className="section-card">
          <div className="section-card-header">
            <h3>磁盘使用</h3>
            <Button type="link" size="small" onClick={() => qc.refetchQueries({ queryKey: ['disk-info'] })}>刷新</Button>
          </div>
          <div className="section-card-body">
            {disks.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>加载中...</div>
            ) : disks.map(d => {
              const pct = Math.round(d.used_space / d.total_space * 100);
              const color = pct > 85 ? '#ff4d4f' : pct > 70 ? '#faad14' : '#1677ff';
              const label = d.name || d.mount_point.replace(/\\/g, '');
              const isSelected = selectedDisk === d.mount_point;
              return (
                <div className="disk-bar-wrap" key={d.mount_point}
                  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, margin: '0 -8px',
                    background: isSelected ? 'var(--accent-dim)' : 'transparent',
                    border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                    transition: 'all 0.12s' }}
                  onClick={() => setSelectedDisk(isSelected ? '' : d.mount_point)}>
                  <div className="disk-bar-label">
                    <span style={{ fontWeight: 500, color: isSelected ? 'var(--accent)' : undefined }}>{label}</span>
                    <span>{formatSize(d.used_space)} / {formatSize(d.total_space)} ({pct}%)</span>
                  </div>
                  <div className="disk-bar"><div className="disk-bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <h3>文件分布{selectedDisk ? ` (${selectedDisk.replace(/\\/g, '')})` : ''}</h3>
            {selectedDisk && <Button type="link" size="small" onClick={() => setSelectedDisk('')}>显示全部</Button>}
          </div>
          <div className="section-card-body">
            {catStats.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>建立索引后显示</div>
            ) : (() => {
              const totalSize = catStats.reduce((s, c) => s + c.total_size, 0) || 1;
              const COLORS: Record<string, string> = {
                '文档': '#1677ff', '表格': '#52c41a', '演示文稿': '#13c2c2',
                '图片': '#722ed1', '视频': '#eb2f96', '音频': '#fa541c',
                '代码': '#faad14', '压缩包': '#a0d911', '安装包': '#f5222d',
                '数据库': '#fa8c16', '其他': '#8c8c8c',
              };
              return catStats.slice(0, 8).map(c => {
                const pct = Math.round(c.total_size / totalSize * 100);
                const color = COLORS[c.category] ?? '#8c8c8c';
                return (
                  <div className="disk-bar-wrap" key={c.category}>
                    <div className="disk-bar-label">
                      <span style={{ fontWeight: 500 }}>{c.category}</span>
                      <span>{c.file_count.toLocaleString()} 个 &nbsp; {formatSize(c.total_size)} ({pct}%)</span>
                    </div>
                    <div className="disk-bar"><div className="disk-bar-fill" style={{ width: `${Math.max(pct, 1)}%`, background: color }} /></div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        <div className="section-card">
          <div className="section-card-header">
            <h3>最近活动</h3>
            <Button type="link" size="small" onClick={() => setCurrentPage('report')}>查看全部</Button>
          </div>
          <div className="section-card-body">
            {recentLogs.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>暂无操作记录</div>
            ) : recentLogs.slice(0, 6).map((r) => {
              const iconBg: Record<string, string> = { move: '#dbeafe', clean: '#dcfce7', quarantine: '#fef3c7', index: '#f3e8ff', restore: '#ccfbf1' };
              const iconFg: Record<string, string> = { move: '#2563eb', clean: '#16a34a', quarantine: '#d97706', index: '#7c3aed', restore: '#0d9488' };
              const iconMap: Record<string, React.ReactNode> = {
                move: <FolderOutlined />, clean: <ClearOutlined />,
                quarantine: <ExclamationCircleOutlined />, index: <DatabaseOutlined />,
                restore: <UndoOutlined />,
              };
              return (
                <div key={r.id} className="activity-row">
                  <div className="activity-icon-wrap" style={{ background: iconBg[r.action] ?? '#f1f5f9', color: iconFg[r.action] ?? '#64748b' }}>
                    {iconMap[r.action] ?? <FileOutlined />}
                  </div>
                  <div className="activity-text">
                    <p className="activity-name">{r.path?.split(/[\\/]/).pop() ?? r.detail}</p>
                    <p className="activity-meta">{formatDate(r.ts)} · {actionLabel[r.action] ?? r.action}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
