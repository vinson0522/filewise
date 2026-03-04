import { useState, useRef } from 'react';
import { Button, Spin, message } from 'antd';
import {
  SearchOutlined, FileWordOutlined, FilePdfOutlined,
  FileExcelOutlined, FileImageOutlined, FileOutlined,
  FolderOpenOutlined, DatabaseOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { searchFiles, scanAndIndex } from '../services/file.service';
import type { SearchResult } from '../types';
import { formatSize, formatDate, getParentDir } from '../utils/path.util';

const SUGGESTIONS = ['合同', 'PPT', '视频', '图片', 'Excel'];
const SCAN_ROOTS = ['C:\\Users', 'D:\\', 'E:\\'];

function getFileIcon(name: string): { icon: React.ReactNode; color: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['docx', 'doc'].includes(ext)) return { icon: <FileWordOutlined />, color: '#1677ff' };
  if (['pdf'].includes(ext))         return { icon: <FilePdfOutlined />,  color: '#ff4d4f' };
  if (['xlsx', 'xls'].includes(ext)) return { icon: <FileExcelOutlined />, color: '#52c41a' };
  if (['png','jpg','jpeg','gif','bmp','webp'].includes(ext)) return { icon: <FileImageOutlined />, color: '#722ed1' };
  if (['db','sql','sqlite'].includes(ext)) return { icon: <DatabaseOutlined />, color: '#fa8c16' };
  return { icon: <FileOutlined />, color: '#8c8c8c' };
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [scanRoot, setScanRoot] = useState('C:\\Users');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: results = [], isFetching } = useQuery<SearchResult[]>({
    queryKey: ['search', submitted],
    queryFn: () => searchFiles(submitted, 100),
    enabled: submitted.trim().length > 0,
  });

  const indexMutation = useMutation({
    mutationFn: (path: string) => scanAndIndex(path),
    onSuccess: (stats) => message.success(`索引完成，共 ${stats.total_files.toLocaleString()} 个文件`),
    onError: (e: Error) => message.error('索引失败：' + e.message),
  });

  function doSearch() {
    const q = query.trim();
    if (q) setSubmitted(q);
  }

  return (
    <div>
      <div className="page-header">
        <h2>智能搜索</h2>
        <p>输入关键词搜索已索引的文件</p>
      </div>

      {/* 搜索框 */}
      <div className="section-card mb-16">
        <div className="section-card-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <input ref={inputRef}
              style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none' }}
              placeholder='输入文件名关键词，如"合同""报告"'
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={doSearch} loading={isFetching}>搜索</Button>
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#8c8c8c', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>快速搜索：</span>
            {SUGGESTIONS.map(s => (
              <span key={s} style={{ color: '#1677ff', cursor: 'pointer', padding: '2px 8px', background: '#f0f5ff', borderRadius: 4 }}
                onClick={() => { setQuery(s); setSubmitted(s); }}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 索引提示 */}
      <div className="section-card mb-16">
        <div className="section-card-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <FolderOpenOutlined style={{ color: '#8c8c8c' }} />
          <span style={{ fontSize: 13, color: '#595959', flex: 1 }}>
            搜索需要先建立文件索引。选择目录后点击「建立索引」，索引完成后即可搜索。
          </span>
          <select
            value={scanRoot}
            onChange={e => setScanRoot(e.target.value)}
            style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 8px', fontSize: 13, outline: 'none' }}>
            {SCAN_ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button icon={<DatabaseOutlined />} loading={indexMutation.isPending}
            onClick={() => indexMutation.mutate(scanRoot)}>
            {indexMutation.isPending ? '索引中...' : '建立索引'}
          </Button>
        </div>
      </div>

      {/* 搜索结果 */}
      {isFetching ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bfbfbf' }}>
          <Spin size="large" />
          <p style={{ marginTop: 12 }}>搜索中...</p>
        </div>
      ) : submitted && results.length > 0 ? (
        <div className="section-card">
          <div className="section-card-header">
            <h3>搜索结果</h3>
            <span style={{ fontSize: 13, color: '#8c8c8c' }}>找到 {results.length} 个文件</span>
          </div>
          <div>
            {results.map((r, i) => {
              const fi = getFileIcon(r.name);
              const dir = getParentDir(r.path);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderBottom: i < results.length - 1 ? '1px solid #fafafa' : 'none',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span style={{ fontSize: 24, color: fi.color, flexShrink: 0 }}>{fi.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#262626', fontWeight: 500, marginBottom: 3,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, color: '#595959' }}>{formatSize(r.size)}</div>
                    <div style={{ fontSize: 12, color: '#bfbfbf' }}>{formatDate(r.modified_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : submitted ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bfbfbf' }}>
          <SearchOutlined style={{ fontSize: 40, display: 'block', marginBottom: 10 }} />
          <p>未找到「{submitted}」相关文件，请先建立索引</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#bfbfbf' }}>
          <SearchOutlined style={{ fontSize: 48, marginBottom: 12, display: 'block' }} />
          <p style={{ fontSize: 14 }}>输入关键词开始搜索</p>
        </div>
      )}
    </div>
  );
}
