import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Alert } from 'antd';
import {
  AppstoreOutlined, ClearOutlined,
  CopyOutlined, DeleteOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { getDiskInfo, getIndexStats, getHealthScore, getCategoryStats, getCategoryStatsByPath, listAuditLog } from '../services/file.service';
import type { HealthReport, CategoryStat, AuditEntry } from '../services/file.service';
import { formatSize, formatDate } from '../utils/path.util';
import { useAppStore } from '../stores/useAppStore';

export default function DashboardPage() {
  const { setCurrentPage } = useAppStore();
  const qc = useQueryClient();

  const { data: disks = [] } = useQuery({
    queryKey: ['disk-info'],
    queryFn: getDiskInfo,
    refetchInterval: 60_000,
  });

  const { data: stats } = useQuery({
    queryKey: ['index-stats'],
    queryFn: getIndexStats,
  });

  const { data: health } = useQuery<HealthReport>({
    queryKey: ['health-score'],
    queryFn: getHealthScore,
    staleTime: 5 * 60_000,
  });

  const [selectedDisk, setSelectedDisk] = useState<string>('');

  const { data: catStats = [] } = useQuery<CategoryStat[]>({
    queryKey: ['category-stats', selectedDisk],
    queryFn: () => selectedDisk ? getCategoryStatsByPath(selectedDisk) : getCategoryStats(),
    staleTime: 5 * 60_000,
  });

  const { data: recentLogs = [] } = useQuery<AuditEntry[]>({
    queryKey: ['audit-log'],
    queryFn: listAuditLog,
    staleTime: 60_000,
  });

  const actionLabel: Record<string, string> = {
    move: '移动', clean: '清理', quarantine: '隔离', index: '索引', restore: '恢复',
  };
  const actionColor: Record<string, string> = {
    move: '#1677ff', clean: '#52c41a', quarantine: '#fa8c16', index: '#722ed1', restore: '#13c2c2',
  };

  const quickActions = [
    { icon: <AppstoreOutlined />, title: '智能整理',       desc: '按类型自动分类归档', bg: '#e6f4ff', color: '#1677ff', page: 'organize' as const },
    { icon: <ClearOutlined />,    title: '系统清理',       desc: '清理临时/缓存文件',   bg: '#f6ffed', color: '#52c41a', page: 'clean' as const },
    { icon: <CopyOutlined />,     title: '查找重复文件',   desc: '扫描并去除重复',     bg: '#fff7e6', color: '#fa8c16', page: 'clean' as const },
    { icon: <DeleteOutlined />,   title: '大文件扫描',     desc: '发现空间占用大文件', bg: '#f9f0ff', color: '#722ed1', page: 'clean' as const },
  ];

  const notIndexed = !stats || stats.total_files === 0;

  return (
    <div>
      <div className="page-header">
        <h2>概览</h2>
        <p>文件系统状态一览</p>
      </div>

      {notIndexed && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="尚未建立文件索引"
          description="前往搜索页选择目录并执行“建立索引”，之后可使用全文搜索、重复检测、大文件扫描等功能。"
          action={
            <Button size="small" icon={<SearchOutlined />}
              onClick={() => setCurrentPage('search')}>前往搜索页</Button>
          }
        />
      )}

      {/* Stats */}
      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-label">索引文件数</div>
          <div><span className="stat-value">{stats?.total_files.toLocaleString() ?? '--'}</span></div>
          <div className="stat-extra">上次扫描: {formatDate(stats?.last_indexed)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">索引总大小</div>
          <div>
            <span className="stat-value">{stats ? formatSize(stats.total_size) : '--'}</span>
          </div>
          <div className="stat-extra">已建立索引</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">可释放空间</div>
          <div><span className="stat-value" style={{ color: '#1677ff' }}>
            {health ? formatSize(health.freeable_bytes) : '--'}
          </span></div>
          <div className="stat-extra">{health?.issues[0] ?? '计算中...'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">健康评分</div>
          <div>
            <span className="stat-value" style={{
              color: health
                ? health.score >= 80 ? '#52c41a' : health.score >= 60 ? '#faad14' : '#ff4d4f'
                : '#faad14'
            }}>{health?.score ?? '--'}</span>
            <span className="stat-suffix">/ 100</span>
          </div>
          <div className="stat-extra" style={{
            color: health ? (health.score >= 80 ? '#52c41a' : health.score >= 60 ? '#faad14' : '#ff4d4f') : '#faad14'
          }}>{health ? (health.score >= 80 ? '状况良好' : health.score >= 60 ? '建议优化' : '需要关注') : '计算中...'}</div>
        </div>
      </div>

      <div className="grid-2 mb-20">
        {/* Disk Usage */}
        <div className="section-card">
          <div className="section-card-header">
            <h3>磁盘使用</h3>
            <Button type="link" size="small" onClick={() => qc.invalidateQueries({ queryKey: ['disk-info'] })}>刷新</Button>
          </div>
          <div className="section-card-body">
            {disks.length === 0 ? (
              <div style={{ color: '#bfbfbf', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                加载中...
              </div>
            ) : disks.map((d) => {
              const pct = Math.round(d.used_space / d.total_space * 100);
              const color = pct > 85 ? '#ff4d4f' : pct > 70 ? '#faad14' : '#1677ff';
              const label = d.name || d.mount_point.replace(/\\/g, '');
              const isSelected = selectedDisk === d.mount_point;
              return (
                <div className="disk-bar-wrap" key={d.mount_point}
                  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, margin: '0 -8px',
                    background: isSelected ? '#e6f4ff' : 'transparent',
                    border: isSelected ? '1px solid #91caff' : '1px solid transparent',
                    transition: 'all 0.15s' }}
                  onClick={() => setSelectedDisk(isSelected ? '' : d.mount_point)}>
                  <div className="disk-bar-label">
                    <span style={{ fontWeight: 500, color: isSelected ? '#1677ff' : undefined }}>{label}</span>
                    <span>{formatSize(d.used_space)} / {formatSize(d.total_space)} ({pct}%)</span>
                  </div>
                  <div className="disk-bar">
                    <div className="disk-bar-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* File Distribution */}
        <div className="section-card">
          <div className="section-card-header">
            <h3>文件分布{selectedDisk ? ` (${selectedDisk.replace(/\\/g, '')})` : ''}</h3>
            {selectedDisk && <Button type="link" size="small" onClick={() => setSelectedDisk('')}>显示全部</Button>}
          </div>
          <div className="section-card-body">
            {catStats.length === 0 ? (
              <div style={{ color: '#bfbfbf', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>建立索引后显示</div>
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
                    <div className="disk-bar">
                      <div className="disk-bar-fill" style={{ width: `${Math.max(pct, 1)}%`, background: color }} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      <div className="grid-2 mb-20">
        {/* Quick Actions */}
        <div className="section-card">
          <div className="section-card-header"><h3>快捷操作</h3></div>
          <div className="section-card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {quickActions.map((a) => (
              <div className="quick-action" key={a.title} onClick={() => setCurrentPage(a.page)}>
                <div className="quick-action-icon" style={{ background: a.bg, color: a.color }}>
                  {a.icon}
                </div>
                <div className="quick-action-text">
                  <h4>{a.title}</h4>
                  <p>{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="section-card">
          <div className="section-card-header">
            <h3>最近活动</h3>
            <Button type="link" size="small" onClick={() => setCurrentPage('report')}>查看全部</Button>
          </div>
          <div className="section-card-body">
            {recentLogs.length === 0 ? (
              <div style={{ color: '#bfbfbf', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>暂无操作记录</div>
            ) : recentLogs.slice(0, 6).map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                borderBottom: i < Math.min(recentLogs.length, 6) - 1 ? '1px solid #fafafa' : 'none', fontSize: 13 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: actionColor[r.action] ?? '#8c8c8c' }} />
                <span style={{ color: '#595959', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {actionLabel[r.action] ?? r.action}: {r.path?.split(/[\\/]/).pop() ?? r.detail}
                </span>
                <span style={{ color: '#bfbfbf', fontSize: 11, flexShrink: 0 }}>{formatDate(r.ts)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
