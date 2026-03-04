import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Alert } from 'antd';
import {
  AppstoreOutlined, ClearOutlined,
  CopyOutlined, DeleteOutlined, SearchOutlined,
} from '@ant-design/icons';
import { getDiskInfo, getIndexStats } from '../services/file.service';
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
          <div><span className="stat-value" style={{ color: '#1677ff' }}>--</span></div>
          <div className="stat-extra">扫描后获得</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">健康评分</div>
          <div><span className="stat-value" style={{ color: '#faad14' }}>--</span><span className="stat-suffix">/ 100</span></div>
          <div className="stat-extra" style={{ color: '#faad14' }}>完成扫描后评估</div>
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
              return (
                <div className="disk-bar-wrap" key={d.mount_point}>
                  <div className="disk-bar-label">
                    <span style={{ fontWeight: 500 }}>{label}</span>
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
      </div>
    </div>
  );
}
