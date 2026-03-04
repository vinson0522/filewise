import { useState } from 'react';
import { Button, Checkbox, Tag, Tabs } from 'antd';
import { DeleteOutlined, FileOutlined } from '@ant-design/icons';

type Level = 'safe' | 'warn' | 'danger';

const CLEAN_ITEMS = [
  { name: '系统临时文件',   desc: 'Windows 临时目录、日志文件',    size: '3.2 GB', level: 'safe' as Level, count: 1243 },
  { name: '浏览器缓存',     desc: 'Chrome、Edge 缓存数据',         size: '2.8 GB', level: 'safe' as Level, count: 8921 },
  { name: '缩略图缓存',     desc: 'Windows 缩略图数据库',          size: '1.1 GB', level: 'safe' as Level, count: 45 },
  { name: '回收站',         desc: '已删除但未清空的文件',            size: '5.6 GB', level: 'warn' as Level, count: 234 },
  { name: '旧版更新文件',   desc: 'Windows Update 历史文件',        size: '8.2 GB', level: 'safe' as Level, count: 67 },
  { name: '30天未访问文件', desc: '下载文件夹中长期未使用',          size: '12.4 GB', level: 'warn' as Level, count: 156 },
];

const DUP_GROUPS = [
  { hash: 'a3f2…8d1c', size: '156 MB', files: [
    { path: 'D:/下载/项目演示.mp4', date: '2026-02-15', keep: true },
    { path: 'D:/视频/项目演示.mp4', date: '2026-02-20', keep: false },
    { path: 'E:/备份/项目演示.mp4', date: '2026-01-30', keep: false },
  ]},
  { hash: 'b7e1…4a2f', size: '23 MB', files: [
    { path: 'C:/Users/桌面/产品方案.pptx', date: '2026-03-01', keep: true },
    { path: 'D:/文档/产品方案.pptx',      date: '2026-02-28', keep: false },
  ]},
  { hash: 'c9d3…6b5e', size: '8.5 MB', files: [
    { path: 'C:/Users/桌面/logo_final.png', date: '2026-02-10', keep: true },
    { path: 'D:/设计/logo_final.png',       date: '2026-02-10', keep: false },
  ]},
];

const LARGE_FILES = [
  { name: '系统备份_20260101.zip', path: 'E:/备份/', size: '8.2 GB', date: '2026-01-01' },
  { name: '项目录屏.mp4',          path: 'D:/视频/', size: '4.5 GB', date: '2026-02-10' },
  { name: 'VM-Ubuntu.vmdk',        path: 'D:/虚拟机/', size: '3.8 GB', date: '2025-11-20' },
  { name: 'dataset_train.csv',     path: 'D:/数据/',  size: '2.1 GB', date: '2026-01-15' },
  { name: 'PhotoLibrary.db',       path: 'E:/照片/',  size: '1.6 GB', date: '2026-03-01' },
];

const LEVEL_STYLE: Record<Level, React.CSSProperties> = {
  safe:   { background: '#f6ffed', color: '#52c41a', border: '1px solid #b7eb8f', borderRadius: 4, padding: '1px 8px', fontSize: 12 },
  warn:   { background: '#fffbe6', color: '#faad14', border: '1px solid #ffe58f', borderRadius: 4, padding: '1px 8px', fontSize: 12 },
  danger: { background: '#fff2f0', color: '#ff4d4f', border: '1px solid #ffccc7', borderRadius: 4, padding: '1px 8px', fontSize: 12 },
};
const LEVEL_LABEL: Record<Level, string> = { safe: '安全', warn: '谨慎', danger: '危险' };

export default function CleanPage() {
  const [tab, setTab] = useState('system');
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  function toggle(name: string) { setChecked(p => ({ ...p, [name]: !p[name] })); }

  const totalGB = CLEAN_ITEMS.reduce((s, item) =>
    checked[item.name] ? s + parseFloat(item.size) : s, 0);

  return (
    <div>
      <div className="page-header">
        <h2>智能清理</h2>
        <p>安全释放磁盘空间，所有操作可撤销</p>
      </div>

      <div className="grid-4 mb-20">
        {[
          { label: '可清理空间', value: '33.3', suffix: 'GB', sub: '扫描完成' },
          { label: '临时文件',   value: '7.1',  suffix: 'GB', sub: '10,209 个文件' },
          { label: '重复文件',   value: '14.2', suffix: 'GB', sub: '23 组重复' },
          { label: '已选清理',   value: totalGB.toFixed(1), suffix: 'GB', sub: '勾选项目以选择', color: '#1677ff' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div><span className="stat-value" style={s.color ? { color: s.color } : {}}>{s.value}</span><span className="stat-suffix">{s.suffix}</span></div>
            <div className="stat-extra">{s.sub}</div>
          </div>
        ))}
      </div>

      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'system', label: '系统清理' },
        { key: 'duplicate', label: '重复文件' },
        { key: 'large', label: '大文件' },
      ]} />

      {tab === 'system' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>清理项目</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="small" onClick={() => setChecked(Object.fromEntries(CLEAN_ITEMS.filter(i => i.level === 'safe').map(i => [i.name, true])))}>
                全选安全项
              </Button>
              <Button type="primary" size="small" icon={<DeleteOutlined />} disabled={totalGB === 0}>
                {totalGB > 0 ? `清理 ${totalGB.toFixed(1)} GB` : '清理选中项'}
              </Button>
            </div>
          </div>
          <div style={{ padding: '12px 20px' }}>
            {CLEAN_ITEMS.map(item => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Checkbox checked={!!checked[item.name]} onChange={() => toggle(item.name)} />
                  <div>
                    <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>{item.desc} — {item.count} 个文件</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={LEVEL_STYLE[item.level]}>{LEVEL_LABEL[item.level]}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#262626', minWidth: 72, textAlign: 'right' }}>{item.size}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'duplicate' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>重复文件组</h3>
            <Button type="primary" size="small">智能保留最新</Button>
          </div>
          <div style={{ padding: '12px 20px' }}>
            {DUP_GROUPS.map((g, gi) => (
              <div key={gi} style={{ border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ background: '#fafafa', padding: '10px 16px', fontSize: 13, color: '#8c8c8c', display: 'flex', justifyContent: 'space-between' }}>
                  <span>哈希: {g.hash} | {g.files.length} 份副本</span>
                  <span style={{ fontWeight: 500, color: '#262626' }}>{g.size}</span>
                </div>
                {g.files.map((f, fi) => (
                  <div key={fi} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #f5f5f5', fontSize: 13 }}>
                    <Checkbox style={{ marginRight: 8 }} defaultChecked={!f.keep} />
                    <FileOutlined style={{ marginRight: 8, color: '#8c8c8c' }} />
                    <span style={{ flex: 1, color: '#595959' }}>{f.path}</span>
                    <span style={{ color: '#8c8c8c', marginRight: 16 }}>{f.date}</span>
                    {f.keep ? <Tag color="blue" bordered={false}>保留</Tag> : <Tag bordered={false}>可删除</Tag>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'large' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>大文件（&gt; 100 MB）</h3>
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>共发现 {LARGE_FILES.length} 个大文件</span>
          </div>
          <div>
            <div style={{ display: 'flex', padding: '8px 16px', background: '#fafafa', fontSize: 12, color: '#8c8c8c', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ width: 32 }} /><div style={{ flex: 2 }}>文件名</div><div style={{ flex: 2 }}>路径</div>
              <div style={{ width: 100, textAlign: 'right' }}>大小</div><div style={{ width: 100, textAlign: 'right' }}>最后访问</div>
              <div style={{ width: 64, textAlign: 'center' }}>操作</div>
            </div>
            {LARGE_FILES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #fafafa', fontSize: 13 }}>
                <div style={{ width: 32 }}><Checkbox /></div>
                <div style={{ flex: 2, color: '#262626' }}>{f.name}</div>
                <div style={{ flex: 2, color: '#8c8c8c' }}>{f.path}</div>
                <div style={{ width: 100, textAlign: 'right', fontWeight: 500 }}>{f.size}</div>
                <div style={{ width: 100, textAlign: 'right', color: '#8c8c8c' }}>{f.date}</div>
                <div style={{ width: 64, textAlign: 'center' }}>
                  <Button type="link" size="small" danger>删除</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
