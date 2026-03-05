import { useState } from 'react';
import { Button, Checkbox, Tag, Tabs, message, Spin } from 'antd';
import { DeleteOutlined, FileOutlined, ScanOutlined, ReloadOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  scanCleanTargets, executeClean,
  scanDuplicates, scanLargeFiles, quarantineFile, pickFolder,
} from '../services/file.service';
import type { CleanTarget, DupGroup, LargeFileEntry } from '../services/file.service';
import { formatSize, formatDate } from '../utils/path.util';

const LEVEL_STYLE: Record<string, React.CSSProperties> = {
  safe: { background: '#f6ffed', color: '#52c41a', border: '1px solid #b7eb8f', borderRadius: 4, padding: '1px 8px', fontSize: 12 },
  warn: { background: '#fffbe6', color: '#faad14', border: '1px solid #ffe58f', borderRadius: 4, padding: '1px 8px', fontSize: 12 },
};
const LEVEL_LABEL: Record<string, string> = { safe: '安全', warn: '谨慎' };

export default function CleanPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('system');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [dupRoot, setDupRoot] = useState('');
  const [largeRoot, setLargeRoot] = useState('');
  const [quarantining, setQuarantining] = useState<string | null>(null);

  async function handleQuarantine(path: string) {
    setQuarantining(path);
    try {
      const r = await quarantineFile(path);
      message.success(r.message);
      qc.invalidateQueries({ queryKey: ['dup-groups', dupRoot] });
      qc.invalidateQueries({ queryKey: ['large-files', largeRoot] });
      qc.invalidateQueries({ queryKey: ['quarantine'] });
      qc.invalidateQueries({ queryKey: ['clean-targets'] });
      qc.invalidateQueries({ queryKey: ['health-score'] });
      qc.invalidateQueries({ queryKey: ['disk-info'] });
    } catch (e) {
      message.error('隔离失败：' + String(e));
    } finally {
      setQuarantining(null);
    }
  }

  // 系统清理目标（自动扫描）
  const { data: targets = [], isLoading: loadingTargets, refetch: refetchTargets } =
    useQuery<CleanTarget[]>({ queryKey: ['clean-targets'], queryFn: scanCleanTargets });

  // 重复文件（手动触发）
  const { data: dups = [], isFetching: scanningDups, refetch: refetchDups } =
    useQuery<DupGroup[]>({ queryKey: ['dup-groups', dupRoot], queryFn: () => scanDuplicates(dupRoot), enabled: false });

  // 大文件（手动触发）
  const { data: largeFiles = [], isFetching: scanningLarge, refetch: refetchLarge } =
    useQuery<LargeFileEntry[]>({ queryKey: ['large-files', largeRoot], queryFn: () => scanLargeFiles(largeRoot, 100), enabled: false });

  // 执行清理
  const cleanMutation = useMutation({
    mutationFn: (paths: string[]) => executeClean(paths),
    onSuccess: (result) => {
      message.success(`清理完成，释放 ${formatSize(result.freed_bytes)}，共 ${result.deleted_count} 个文件`);
      qc.invalidateQueries({ queryKey: ['clean-targets'] });
      qc.invalidateQueries({ queryKey: ['health-score'] });
      qc.invalidateQueries({ queryKey: ['disk-info'] });
      qc.invalidateQueries({ queryKey: ['index-stats'] });
      setChecked({});
    },
    onError: (err: Error) => message.error('清理失败：' + err.message),
  });

  function toggle(name: string) { setChecked(p => ({ ...p, [name]: !p[name] })); }
  function selectAllSafe() {
    setChecked(Object.fromEntries(targets.filter(t => t.level === 'safe').map(t => [t.path, true])));
  }

  const selectedPaths = targets.filter(t => checked[t.path]).map(t => t.path);
  const selectedBytes = targets.filter(t => checked[t.path]).reduce((s, t) => s + t.size, 0);
  const totalBytes = targets.reduce((s, t) => s + t.size, 0);

  return (
    <div>
      <div className="page-header">
        <h2>智能清理</h2>
        <p>安全释放磁盘空间，所有操作可撤销</p>
      </div>

      <div className="grid-4 mb-20">
        <div className="stat-card">
          <div className="stat-label">可清理空间</div>
          <div><span className="stat-value">{formatSize(totalBytes)}</span></div>
          <div className="stat-extra">{loadingTargets ? '扫描中...' : `${targets.length} 个项目`}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">重复文件</div>
          <div><span className="stat-value">{dups.length > 0 ? formatSize(dups.reduce((s, g) => s + g.total_wasted, 0)) : '--'}</span></div>
          <div className="stat-extra">{dups.length > 0 ? `${dups.length} 组重复` : '点击扫描'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">大文件</div>
          <div><span className="stat-value">{largeFiles.length > 0 ? largeFiles.length : '--'}</span>{largeFiles.length > 0 && <span className="stat-suffix">个</span>}</div>
          <div className="stat-extra">{largeFiles.length > 0 ? formatSize(largeFiles.reduce((s, f) => s + f.size, 0)) : '点击扫描'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">已选清理</div>
          <div><span className="stat-value" style={{ color: '#1677ff' }}>{formatSize(selectedBytes)}</span></div>
          <div className="stat-extra">勾选项目以选择</div>
        </div>
      </div>

      <Tabs activeKey={tab} onChange={setTab} items={[
        { key: 'system', label: '系统清理' },
        { key: 'duplicate', label: '重复文件' },
        { key: 'large', label: '大文件' },
      ]} />

      {/* 系统清理 */}
      {tab === 'system' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>清理项目</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchTargets()} loading={loadingTargets}>刷新</Button>
              <Button size="small" onClick={selectAllSafe}>全选安全项</Button>
              <Button type="primary" size="small" icon={<DeleteOutlined />}
                disabled={selectedPaths.length === 0} loading={cleanMutation.isPending}
                onClick={() => cleanMutation.mutate(selectedPaths)}>
                {selectedBytes > 0 ? `清理 ${formatSize(selectedBytes)}` : '清理选中项'}
              </Button>
            </div>
          </div>
          <div style={{ padding: '12px 20px' }}>
            {loadingTargets ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf' }}>
                <Spin /> <span style={{ marginLeft: 8 }}>正在扫描系统...</span>
              </div>
            ) : targets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 14 }}>未发现可清理项</div>
            ) : targets.map(item => (
              <div key={item.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Checkbox checked={!!checked[item.path]} onChange={() => toggle(item.path)} />
                  <div>
                    <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>{item.description} — {item.file_count} 个文件</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={LEVEL_STYLE[item.level]}>{LEVEL_LABEL[item.level]}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#262626', minWidth: 80, textAlign: 'right' }}>{formatSize(item.size)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 重复文件 */}
      {tab === 'duplicate' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>重复文件组</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button size="small" icon={<FolderOpenOutlined />}
                onClick={async () => { const p = await pickFolder(); if (p) setDupRoot(p); }}>
                {dupRoot ? '更换目录' : '选择目录'}
              </Button>
              {dupRoot && <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{dupRoot}</Tag>}
              <Button type="primary" size="small" icon={<ScanOutlined />}
                loading={scanningDups} disabled={!dupRoot} onClick={() => refetchDups()}>开始扫描</Button>
            </div>
          </div>
          <div style={{ padding: '12px 20px' }}>
            {scanningDups ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf' }}>
                <Spin /> <span style={{ marginLeft: 8 }}>正在扫描 {dupRoot}，计算哈希值...</span>
              </div>
            ) : dups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 14 }}>选择目录后点击"开始扫描"</div>
            ) : dups.map((g, gi) => (
              <div key={gi} style={{ border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
                <div style={{ background: '#fafafa', padding: '10px 16px', fontSize: 13, color: '#8c8c8c', display: 'flex', justifyContent: 'space-between' }}>
                  <span>哈希: {g.hash.slice(0, 16)}…  |  {g.files.length} 份副本</span>
                  <span style={{ fontWeight: 500, color: '#ff4d4f' }}>浪费 {formatSize(g.total_wasted)}</span>
                </div>
                {g.files.map((f, fi) => (
                  <div key={fi} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #f5f5f5', fontSize: 13 }}>
                    <FileOutlined style={{ marginRight: 8, color: '#8c8c8c', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f}</span>
                    <span style={{ marginLeft: 8, color: '#8c8c8c', flexShrink: 0 }}>{formatSize(g.size)}</span>
                    {fi === 0
                      ? <Tag color="blue" bordered={false} style={{ marginLeft: 8, flexShrink: 0 }}>保留原件</Tag>
                      : <Button size="small" danger loading={quarantining === f}
                          style={{ marginLeft: 8, flexShrink: 0 }}
                          onClick={() => handleQuarantine(f)}>隔离</Button>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 大文件 */}
      {tab === 'large' && (
        <div className="section-card">
          <div className="section-card-header">
            <h3>大文件（&gt; 100 MB）</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button size="small" icon={<FolderOpenOutlined />}
                onClick={async () => { const p = await pickFolder(); if (p) setLargeRoot(p); }}>
                {largeRoot ? '更换目录' : '选择目录'}
              </Button>
              {largeRoot && <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{largeRoot}</Tag>}
              <Button type="primary" size="small" icon={<ScanOutlined />}
                loading={scanningLarge} disabled={!largeRoot} onClick={() => refetchLarge()}>开始扫描</Button>
              {largeFiles.length > 0 &&
                <span style={{ fontSize: 13, color: '#8c8c8c' }}>共 {largeFiles.length} 个</span>}
            </div>
          </div>
          <div>
            {scanningLarge ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf' }}>
                <Spin /> <span style={{ marginLeft: 8 }}>正在扫描 {largeRoot}...</span>
              </div>
            ) : largeFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 14 }}>选择目录后点击"开始扫描"</div>
            ) : (
              <>
                <div style={{ display: 'flex', padding: '8px 16px', background: '#fafafa', fontSize: 12, color: '#8c8c8c', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ width: 32 }} />
                  <div style={{ flex: 2 }}>文件名</div>
                  <div style={{ flex: 2 }}>路径</div>
                  <div style={{ width: 100, textAlign: 'right' }}>大小</div>
                  <div style={{ width: 100, textAlign: 'right' }}>修改时间</div>
                  <div style={{ width: 64, textAlign: 'center' }}>操作</div>
                </div>
                {largeFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #fafafa', fontSize: 13 }}>
                    <div style={{ width: 32 }}><Checkbox /></div>
                    <div style={{ flex: 2, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div style={{ flex: 2, color: '#8c8c8c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path.replace(f.name, '')}</div>
                    <div style={{ width: 100, textAlign: 'right', fontWeight: 500 }}>{formatSize(f.size)}</div>
                    <div style={{ width: 100, textAlign: 'right', color: '#8c8c8c' }}>{formatDate(f.modified_at)}</div>
                    <div style={{ width: 80, textAlign: 'center' }}>
                      <Button size="small" danger loading={quarantining === f.path}
                        onClick={() => handleQuarantine(f.path)}>隔离</Button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
