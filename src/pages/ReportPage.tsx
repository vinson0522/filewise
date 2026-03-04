import { Button, Tag, Spin, message, Tabs } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSnapshots, restoreSnapshot, deleteSnapshot,
  listQuarantine, restoreQuarantine,
} from '../services/file.service';
import type { SnapshotInfo, QuarantineItem } from '../types';
import { formatDate, formatSize } from '../utils/path.util';

const HISTORY = [
  { time: '03-04 14:30', type: '智能整理', target: '桌面',   result: '47 个文件已归档', undone: false },
  { time: '03-04 10:15', type: '系统清理', target: 'C:/',    result: '释放 3.2 GB',    undone: false },
  { time: '03-03 16:40', type: '重复检测', target: '全盘',   result: '23 组 / 14.2 GB', undone: false },
  { time: '03-03 09:00', type: '自动归档', target: '下载',   result: '8 个文件',        undone: false },
  { time: '03-02 15:20', type: '智能整理', target: 'D:/项目', result: '126 个文件',      undone: true  },
  { time: '03-01 11:00', type: '大文件清理', target: 'E:/',  result: '释放 8.5 GB',    undone: false },
];

export default function ReportPage() {
  const qc = useQueryClient();
  const typeColor = (t: string) =>
    t.includes('整理') ? 'blue' : t.includes('清理') ? 'green' : 'default';

  const { data: snapshots = [], isLoading: loadingSnaps } = useQuery<SnapshotInfo[]>({
    queryKey: ['snapshots'],
    queryFn: listSnapshots,
  });

  const { data: quarantineItems = [], isLoading: loadingQuar } = useQuery<QuarantineItem[]>({
    queryKey: ['quarantine'],
    queryFn: listQuarantine,
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => restoreSnapshot(id),
    onSuccess: (msg) => { message.success(msg); qc.invalidateQueries({ queryKey: ['snapshots'] }); },
    onError: (e: Error) => message.error('恢复失败：' + e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSnapshot(id),
    onSuccess: (msg) => { message.success(msg); qc.invalidateQueries({ queryKey: ['snapshots'] }); },
    onError: (e: Error) => message.error('删除失败：' + e.message),
  });

  const quarRestoreMut = useMutation({
    mutationFn: (id: number) => restoreQuarantine(id),
    onSuccess: (r) => { message.success(r.message); qc.invalidateQueries({ queryKey: ['quarantine'] }); },
    onError: (e: Error) => message.error('恢复失败：' + e.message),
  });

  return (
    <div>
      <div className="page-header">
        <h2>操作报告</h2>
        <p>查看历史操作记录与快照管理</p>
      </div>

      <div className="grid-4 mb-20">
        {[
          { label: '快照总数', value: String(snapshots.length), sub: '可随时恢复' },
          { label: '可恢复操作', value: String(snapshots.filter(s => s.status === 'active').length), sub: '待恢复快照' },
          { label: '已恢复', value: '0', sub: '本次会话' },
          { label: '索引文件', value: '--', sub: '前往搜索页扫描' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div><span className="stat-value">{s.value}</span></div>
            <div className="stat-extra">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="section-card">
        <Tabs
          style={{ padding: '0 20px' }}
          items={[
            {
              key: 'history',
              label: '操作历史',
              children: (
                <div>
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
              ),
            },
            {
              key: 'snapshots',
              label: `快照管理 ${snapshots.length > 0 ? `(${snapshots.length})` : ''}`,
              children: loadingSnaps ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
              ) : snapshots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 13 }}>
                  暂无快照，执行文件移动或整理后自动创建
                </div>
              ) : (
                <div>
                  {snapshots.map((s, i) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < snapshots.length - 1 ? '1px solid #fafafa' : 'none', fontSize: 13 }}>
                      <CameraOutlined style={{ color: '#8c8c8c', marginRight: 10, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#262626', fontWeight: 500 }}>{s.description || '文件操作'}</div>
                        <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 2 }}>
                          {formatDate(s.created_at)} | {s.file_count} 个文件 | ID: {s.id.slice(0, 8)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button size="small" loading={restoreMut.isPending}
                          onClick={() => restoreMut.mutate(s.id)}>恢复</Button>
                        <Button size="small" danger loading={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(s.id)}>删除</Button>
                      </div>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'quarantine',
              label: `隔离区 ${quarantineItems.length > 0 ? `(${quarantineItems.length})` : ''}`,
              children: loadingQuar ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
              ) : quarantineItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 13 }}>
                  隔离区为空，文件在此安全保存 30 天后永久删除
                </div>
              ) : (
                <div>
                  {quarantineItems.map((q, i) => (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: i < quarantineItems.length - 1 ? '1px solid #fafafa' : 'none', fontSize: 13 }}>
                      <DeleteOutlined style={{ color: '#ff4d4f', marginRight: 10, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#262626', fontWeight: 500 }}>{q.name}</div>
                        <div style={{ color: '#8c8c8c', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatSize(q.size)} | 删除于 {formatDate(q.deleted_at)} | 到期 {formatDate(q.expires_at)}
                        </div>
                      </div>
                      <Button size="small" loading={quarRestoreMut.isPending}
                        onClick={() => quarRestoreMut.mutate(q.id)}>恢复原位</Button>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
