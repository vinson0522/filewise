import { useState } from 'react';
import { Button } from 'antd';
import {
  SearchOutlined, FileWordOutlined, FilePdfOutlined,
  FileExcelOutlined, FileImageOutlined, FileOutlined,
} from '@ant-design/icons';

const SUGGESTIONS = ['找到合同文件', '上周修改的PPT', '大于100MB的视频'];

const RESULTS = [
  { name: '2026年Q1销售合同.docx', path: 'D:/文档/合同/', size: '2.3 MB', date: '2026-03-01', type: 'word' },
  { name: '供应商合同_模板.docx',   path: 'D:/文档/模板/', size: '156 KB', date: '2026-02-15', type: 'word' },
  { name: '租赁合同_2026.pdf',     path: 'D:/文档/行政/', size: '4.1 MB', date: '2026-01-20', type: 'pdf' },
  { name: '合同管理流程.xlsx',      path: 'D:/文档/流程/', size: '89 KB',  date: '2025-12-10', type: 'excel' },
  { name: '合同审批截图.png',       path: 'D:/图片/工作/', size: '1.2 MB', date: '2026-02-28', type: 'image' },
];

const FILE_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  word:  { icon: <FileWordOutlined />,  color: '#1677ff' },
  pdf:   { icon: <FilePdfOutlined />,   color: '#ff4d4f' },
  excel: { icon: <FileExcelOutlined />, color: '#52c41a' },
  image: { icon: <FileImageOutlined />, color: '#722ed1' },
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);

  function doSearch() { if (query.trim()) setSearched(true); }

  const fi = (type: string) => FILE_ICON[type] ?? { icon: <FileOutlined />, color: '#8c8c8c' };

  return (
    <div>
      <div className="page-header">
        <h2>智能搜索</h2>
        <p>自然语言搜索，支持文件名与内容全文检索</p>
      </div>

      <div className="section-card mb-16">
        <div className="section-card-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <input
              style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none' }}
              placeholder='输入搜索内容，如"找到上周的合同文件"'
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={doSearch}>搜索</Button>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#8c8c8c', alignItems: 'center' }}>
            <span>试试：</span>
            {SUGGESTIONS.map(s => (
              <span key={s} style={{ color: '#1677ff', cursor: 'pointer', padding: '2px 8px', background: '#f0f5ff', borderRadius: 4 }}
                onClick={() => { setQuery(s); setSearched(true); }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      {searched && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>搜索结果</h3>
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>找到 {RESULTS.length} 个相关文件</span>
          </div>
          <div>
            {RESULTS.map((r, i) => {
              const f = fi(r.type);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderBottom: i < RESULTS.length - 1 ? '1px solid #fafafa' : 'none',
                  cursor: 'pointer', transition: 'background 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span style={{ fontSize: 24, color: f.color }}>{f.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#262626', fontWeight: 500, marginBottom: 3 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.path}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: '#595959' }}>{r.size}</div>
                    <div style={{ fontSize: 12, color: '#bfbfbf' }}>{r.date}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#bfbfbf' }}>
          <SearchOutlined style={{ fontSize: 48, marginBottom: 12, display: 'block' }} />
          <p style={{ fontSize: 14 }}>输入关键词开始搜索</p>
        </div>
      )}
    </div>
  );
}
