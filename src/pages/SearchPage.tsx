import { useState, useRef } from 'react';
import { Button, Spin, message, Select } from 'antd';
import {
  SearchOutlined, FileWordOutlined, FilePdfOutlined,
  FileExcelOutlined, FileImageOutlined, FileOutlined,
  FolderOpenOutlined, DatabaseOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { searchFiles, scanAndIndex, quarantineFile, pickFolder, watchDirectory } from '../services/file.service';
import type { SearchFilter } from '../services/file.service';
import type { SearchResult } from '../types';
import { formatSize, formatDate, getParentDir } from '../utils/path.util';

const SUGGESTIONS = ['合同', 'PPT', '视频', '图片', 'Excel'];
const SCAN_ROOTS = ['C:\\Users', 'D:\\', 'E:\\'];
const CATEGORIES = [
  { value: 'all',   label: '全部类型' },
  { value: '文档',   label: '文档' },
  { value: '表格',   label: '表格' },
  { value: '演示文稿', label: '演示文稿' },
  { value: '图片',   label: '图片' },
  { value: '视频',   label: '视频' },
  { value: '音频',   label: '音频' },
  { value: '代码',   label: '代码' },
  { value: '压缩包', label: '压缩包' },
  { value: '安装包', label: '安装包' },
  { value: '其他',   label: '其他' },
];
const SIZE_OPTIONS = [
  { value: 'all',  label: '全部大小', min: undefined, max: undefined },
  { value: 'tiny', label: '< 1 MB',   min: undefined, max: 1 * 1024 * 1024 },
  { value: 'mid',  label: '1–100 MB', min: 1 * 1024 * 1024, max: 100 * 1024 * 1024 },
  { value: 'big',  label: '> 100 MB', min: 100 * 1024 * 1024, max: undefined },
];
const DATE_OPTIONS = [
  { value: 'all',   label: '全部时间', days: undefined },
  { value: 'today', label: '今天',     days: 1 },
  { value: 'week',  label: '本周',     days: 7 },
  { value: 'month', label: '本月',     days: 30 },
  { value: 'half',  label: '半年内',   days: 180 },
];

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
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [scanRoot, setScanRoot] = useState('C:\\Users');
  const [watchActive, setWatchActive] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const activeFilter: SearchFilter = {
    category: catFilter !== 'all' ? catFilter : undefined,
    sizeMin: SIZE_OPTIONS.find(o => o.value === sizeFilter)?.min,
    sizeMax: SIZE_OPTIONS.find(o => o.value === sizeFilter)?.max,
    daysAgo: DATE_OPTIONS.find(o => o.value === dateFilter)?.days,
  };
  const hasFilter = catFilter !== 'all' || sizeFilter !== 'all' || dateFilter !== 'all';

  async function revealPath(path: string) {
    try {
      const parent = path.replace(/[^\\/]+$/, '').replace(/[\\/]$/, '') || 'C:\\';
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:opener|open_url', { url: parent }).catch(() =>
        invoke('plugin:shell|open', { path: parent })
      );
    } catch { message.warning('打开文件夹需要 Tauri 权限配置'); }
  }

  async function handleQuarantine(path: string) {
    try {
      const r = await quarantineFile(path);
      message.success(r.message);
      qc.invalidateQueries({ queryKey: ['search', submitted] });
      qc.invalidateQueries({ queryKey: ['quarantine'] });
    } catch (e) { message.error('隔离失败：' + String(e)); }
  }

  async function handleWatch() {
    try {
      if (watchActive) {
        const { stopWatcher } = await import('../services/file.service');
        await stopWatcher();
        setWatchActive(false);
        message.info('已停止监听');
      } else {
        await watchDirectory(scanRoot);
        setWatchActive(true);
        message.success('已开始监听: ' + scanRoot);
      }
    } catch (e) { message.error('监听操作失败：' + String(e)); }
  }

  const { data: results = [], isFetching } = useQuery<SearchResult[]>({
    queryKey: ['search', submitted, catFilter, sizeFilter, dateFilter],
    queryFn: () => searchFiles(submitted, 100, activeFilter),
    enabled: submitted.trim().length > 0 || hasFilter,
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
          <div style={{ display: 'flex', gap: 8, fontSize: 12, color: '#8c8c8c', alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <span>快速搜索：</span>
            {SUGGESTIONS.map(s => (
              <span key={s} style={{ color: '#1677ff', cursor: 'pointer', padding: '2px 8px', background: '#f0f5ff', borderRadius: 4 }}
                onClick={() => { setQuery(s); setSubmitted(s); }}>{s}</span>
            ))}
          </div>
          {/* 高级筛选 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>筛选：</span>
            <Select size="small" value={catFilter} onChange={setCatFilter} style={{ width: 110 }}
              options={CATEGORIES} />
            <Select size="small" value={sizeFilter} onChange={setSizeFilter} style={{ width: 110 }}
              options={SIZE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
            <Select size="small" value={dateFilter} onChange={setDateFilter} style={{ width: 90 }}
              options={DATE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
            {hasFilter && (
              <Button size="small" type="link"
                onClick={() => { setCatFilter('all'); setSizeFilter('all'); setDateFilter('all'); }}>
                清除筛选
              </Button>
            )}
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
          <Button icon={<FolderOpenOutlined />} size="small"
            onClick={async () => { const p = await pickFolder(); if (p) setScanRoot(p); }}>浏览</Button>
          <Button icon={<DatabaseOutlined />} loading={indexMutation.isPending}
            onClick={() => indexMutation.mutate(scanRoot)}>
            {indexMutation.isPending ? '索引中...' : '建立索引'}
          </Button>
          <Button
            type={watchActive ? 'default' : 'dashed'}
            danger={watchActive}
            size="small"
            onClick={handleWatch}>
            {watchActive ? '停止监听' : '开始监听'}
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
                  <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 8 }}>
                    <div style={{ fontSize: 13, color: '#595959' }}>{formatSize(r.size)}</div>
                    <div style={{ fontSize: 12, color: '#bfbfbf' }}>{formatDate(r.modified_at)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Button size="small" icon={<FolderOpenOutlined />}
                      onClick={() => revealPath(r.path)}
                      title="在资源管理器中显示">定位</Button>
                    <Button size="small" danger
                      onClick={() => handleQuarantine(r.path)}
                      title="移入隔离区">隔离</Button>
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
