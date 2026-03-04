import { useState } from 'react';
import { Button, Checkbox, Select, Tag } from 'antd';
import {
  ArrowRightOutlined, CheckOutlined, FolderOutlined,
  SafetyOutlined, ThunderboltOutlined,
  FileWordOutlined, FileImageOutlined, FileExcelOutlined,
  FilePdfOutlined, FileOutlined, DatabaseOutlined,
} from '@ant-design/icons';

const ICON_MAP: Record<string, React.ReactNode> = {
  FileWordOutlined: <FileWordOutlined />, FileImageOutlined: <FileImageOutlined />,
  FileExcelOutlined: <FileExcelOutlined />, FilePdfOutlined: <FilePdfOutlined />,
  DatabaseOutlined: <DatabaseOutlined />, FileOutlined: <FileOutlined />,
};

const PREVIEW_DATA = [
  { file: '合同_2026修订版.docx',  from: '桌面', to: '文档/合同/',     icon: 'FileWordOutlined',  tag: '合同' },
  { file: 'IMG_20260301.jpg',      from: '下载', to: '图片/2026/03/', icon: 'FileImageOutlined',  tag: '照片' },
  { file: '2026Q1财报.xlsx',       from: '桌面', to: '文档/财务/',     icon: 'FileExcelOutlined', tag: '财务' },
  { file: 'project_v3.psd',        from: '下载', to: '设计/项目/',     icon: 'FileOutlined',      tag: '设计' },
  { file: '会议纪要0228.pdf',       from: '桌面', to: '文档/会议/',     icon: 'FilePdfOutlined',   tag: '会议' },
  { file: 'backup_db.sql',         from: '下载', to: '开发/数据库/',   icon: 'DatabaseOutlined',  tag: '开发' },
  { file: '产品需求v2.docx',        from: '桌面', to: '文档/产品/',     icon: 'FileWordOutlined',  tag: '产品' },
  { file: 'screenshot_0302.png',   from: '桌面', to: '图片/截图/',     icon: 'FileImageOutlined', tag: '截图' },
];

export default function OrganizePage() {
  const [dir, setDir] = useState('桌面');
  const [strategy, setStrategy] = useState('ai');
  const [allChecked, setAllChecked] = useState(true);
  const [checked, setChecked] = useState<Record<number, boolean>>(
    Object.fromEntries(PREVIEW_DATA.map((_, i) => [i, true]))
  );

  const selectedCount = Object.values(checked).filter(Boolean).length;

  function toggle(i: number) {
    const next = { ...checked, [i]: !checked[i] };
    setChecked(next);
    setAllChecked(Object.values(next).every(Boolean));
  }
  function toggleAll(v: boolean) {
    setAllChecked(v);
    setChecked(Object.fromEntries(PREVIEW_DATA.map((_, i) => [i, v])));
  }

  return (
    <div>
      <div className="page-header">
        <h2>智能整理</h2>
        <p>AI 自动分析文件内容，智能分类归档</p>
      </div>

      {/* Config bar */}
      <div className="section-card mb-16">
        <div className="section-card-body" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959' }}>目标目录：</span>
            <Select value={dir} onChange={setDir} style={{ width: 180 }} options={[
              { value: '桌面', label: 'C:/Users/桌面' },
              { value: '下载', label: 'C:/Users/下载' },
              { value: 'D盘', label: 'D:/' },
            ]} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#595959' }}>整理策略：</span>
            <Select value={strategy} onChange={setStrategy} style={{ width: 140 }} options={[
              { value: 'ai',      label: 'AI 推荐' },
              { value: 'type',    label: '按类型' },
              { value: 'date',    label: '按日期' },
              { value: 'project', label: '按项目' },
            ]} />
          </div>
          <div style={{ flex: 1 }} />
          <Button type="primary" icon={<ThunderboltOutlined />}>开始扫描</Button>
        </div>
      </div>

      {/* Preview */}
      <div className="section-card mb-16">
        <div className="section-card-header">
          <h3>整理预览</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Checkbox checked={allChecked} onChange={e => toggleAll(e.target.checked)}>全选</Checkbox>
            <Tag color="blue">{selectedCount} 个文件</Tag>
            <Button type="primary" size="small" icon={<CheckOutlined />} disabled={selectedCount === 0}>
              确认整理
            </Button>
          </div>
        </div>
        <div style={{ padding: 0 }}>
          <div style={{ display: 'flex', padding: '8px 16px', background: '#fafafa', fontSize: 12, color: '#8c8c8c', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ width: 32 }} />
            <div style={{ flex: 1 }}>原始文件</div>
            <div style={{ width: 40 }} />
            <div style={{ flex: 1 }}>目标位置</div>
            <div style={{ width: 72, textAlign: 'center' }}>类别</div>
          </div>
          {PREVIEW_DATA.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', padding: '10px 16px',
              borderBottom: i < PREVIEW_DATA.length - 1 ? '1px solid #fafafa' : 'none',
              fontSize: 13, cursor: 'default',
            }}>
              <div style={{ width: 32 }}><Checkbox checked={!!checked[i]} onChange={() => toggle(i)} /></div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                <span style={{ color: '#8c8c8c' }}>{ICON_MAP[item.icon]}</span>
                <span>{item.file}</span>
                <span style={{ color: '#bfbfbf', fontSize: 12 }}>{item.from}</span>
              </div>
              <div style={{ width: 40, textAlign: 'center', color: '#bfbfbf' }}><ArrowRightOutlined /></div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, color: '#1677ff' }}>
                <FolderOutlined />
                <span>{item.to}</span>
              </div>
              <div style={{ width: 72, textAlign: 'center' }}>
                <Tag bordered={false}>{item.tag}</Tag>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, fontSize: 13, color: '#8c8c8c', alignItems: 'center' }}>
        <SafetyOutlined />
        <span>整理前自动创建快照，所有操作均可一键撤销</span>
      </div>
    </div>
  );
}
