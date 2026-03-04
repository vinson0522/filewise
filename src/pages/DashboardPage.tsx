import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd';
import {
  AppstoreOutlined, ClearOutlined,
  CopyOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { getDiskInfo, getIndexStats } from '../services/file.service';
import { formatSize } from '../utils/path.util';

export default function DashboardPage() {
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
    { icon: <AppstoreOutlined />, title: '一键整理桌面',   desc: '智能分类桌面文件',   bg: '#e6f4ff', color: '#1677ff' },
    { icon: <ClearOutlined />,    title: '清理下载文件夹', desc: '清理过期下载文件',   bg: '#f6ffed', color: '#52c41a' },
    { icon: <CopyOutlined />,     title: '查找重复文件',   desc: '扫描并去除重复',     bg: '#fff7e6', color: '#fa8c16' },
    { icon: <DeleteOutlined />,   title: '清理系统缓存',   desc: '释放系统空间',       bg: '#f9f0ff', color: '#722ed1' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>概览</h2>
        <p>文件系统状态一览</p>
      </div>

      {/* Stats */}
      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-label">总文件数</div>
          <div><span className="stat-value">{stats?.total_files.toLocaleString() ?? '--'}</span></div>
          <div className="stat-extra">索引中</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">总占用空间</div>
          <div>
            <span className="stat-value">{stats ? formatSize(stats.total_size) : '--'}</span>
          </div>
          <div className="stat-extra">已索引</div>
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
            <Button type="link" size="small">刷新</Button>
          </div>
          <div className="section-card-body">
            {disks.length === 0 ? (
              <div style={{ color: '#bfbfbf', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                加载中...
              </div>
            ) : disks.map((d) => {
              const used = d.total_space - d.available_space;
              const pct = Math.round(used / d.total_space * 100);
              const color = pct > 85 ? '#ff4d4f' : pct > 70 ? '#faad14' : '#1677ff';
              return (
                <div className="disk-bar-wrap" key={d.mount_point}>
                  <div className="disk-bar-label">
                    <span>{d.name} {d.mount_point}</span>
                    <span>{formatSize(used)} / {formatSize(d.total_space)} ({pct}%)</span>
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
              <div className="quick-action" key={a.title}>
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
