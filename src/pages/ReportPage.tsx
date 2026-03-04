import { Button, Tag } from 'antd';
import { CameraOutlined } from '@ant-design/icons';

const HISTORY = [
  { time: '03-04 14:30', type: '智能整理', target: '桌面',   result: '47 个文件已归档', undone: false },
  { time: '03-04 10:15', type: '系统清理', target: 'C:/',    result: '释放 3.2 GB',    undone: false },
  { time: '03-03 16:40', type: '重复检测', target: '全盘',   result: '23 组 / 14.2 GB', undone: false },
  { time: '03-03 09:00', type: '自动归档', target: '下载',   result: '8 个文件',        undone: false },
  { time: '03-02 15:20', type: '智能整理', target: 'D:/项目', result: '126 个文件',      undone: true  },
  { time: '03-01 11:00', type: '大文件清理', target: 'E:/',  result: '释放 8.5 GB',    undone: false },
];

const SNAPSHOTS = [
  { time: '03-04 14:30', desc: '桌面整理',   size: '2.3 MB', files: 47 },
  { time: '03-04 10:15', desc: '系统清理',   size: '1.1 MB', files: 1243 },
  { time: '03-03 09:00', desc: '自动归档',   size: '0.5 MB', files: 8 },
  { time: '03-02 15:20', desc: '项目整理',   size: '4.2 MB', files: 126 },
  { time: '03-01 11:00', desc: '大文件清理', size: '0.8 MB', files: 6 },
];

export default function ReportPage() {
  const typeColor = (t: string) =>
    t.includes('整理') ? 'blue' : t.includes('清理') ? 'green' : 'default';

  return (
    <div>
      <div className="page-header">
        <h2>操作报告</h2>
        <p>查看历史操作记录与空间变化</p>
      </div>

      <div className="grid-4 mb-20">
        {[
          { label: '本月整理文件', value: '1,247', sub: '47 次操作' },
          { label: '本月释放空间', value: '28.5 GB', sub: '12 次清理' },
          { label: '撤销操作',     value: '3',       sub: '100% 恢复' },
          { label: '平均准确率',   value: '94%',     sub: '优秀', color: '#52c41a' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div><span className="stat-value" style={s.color ? { color: s.color } : {}}>{s.value}</span></div>
            <div className="stat-extra" style={s.color ? { color: s.color } : {}}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Operation history */}
        <div className="section-card">
          <div className="section-card-header">
            <h3>操作历史</h3>
            <Button size="small">导出</Button>
          </div>
          <div style={{ padding: '8px 20px' }}>
            {HISTORY.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < HISTORY.length - 1 ? '1px solid #fafafa' : 'none', fontSize: 13 }}>
                <div style={{ width: 100, color: '#8c8c8c' }}>{r.time}</div>
                <div style={{ width: 84 }}><Tag bordered={false} color={typeColor(r.type)}>{r.type}</Tag></div>
                <div style={{ width: 72, color: '#595959' }}>{r.target}</div>
                <div style={{ flex: 1, color: '#262626' }}>{r.result}</div>
                <div style={{ width: 72, textAlign: 'right' }}>
                  {r.undone
                    ? <Tag color="orange" bordered={false}>已撤销</Tag>
                    : <Button type="link" size="small">撤销</Button>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Snapshots */}
        <div className="section-card">
          <div className="section-card-header">
            <h3>快照管理</h3>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>共 {SNAPSHOTS.length} 个快照</span>
          </div>
          <div style={{ padding: '8px 20px' }}>
            {SNAPSHOTS.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < SNAPSHOTS.length - 1 ? '1px solid #fafafa' : 'none', fontSize: 13 }}>
                <CameraOutlined style={{ color: '#8c8c8c', marginRight: 10 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#262626', fontWeight: 500 }}>{s.desc}</div>
                  <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 2 }}>
                    {s.time} | {s.files} 个文件 | {s.size}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small">恢复</Button>
                  <Button size="small" danger>删除</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
