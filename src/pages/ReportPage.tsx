import { Button, Tag, Spin, message, Tabs } from 'antd';
import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSnapshots, restoreSnapshot, deleteSnapshot,
  listQuarantine, restoreQuarantine, listAuditLog, getIndexStats,
} from '../services/file.service';
import type { AuditEntry } from '../services/file.service';
import type { SnapshotInfo, QuarantineItem, IndexStats } from '../types';
import { formatDate, formatSize } from '../utils/path.util';

export default function ReportPage() {
  const qc = useQueryClient();
  const actionColor = (a: string) =>
    a === 'move' ? 'blue' : a === 'clean' ? 'green' : a === 'quarantine' ? 'orange' : a === 'index' ? 'purple' : 'default';
  const actionLabel: Record<string, string> = {
    move: '文件移动', clean: '清理', quarantine: '隔离', index: '索引', restore: '恢复',
  };

  const { data: auditLog = [], isLoading: loadingAudit } = useQuery<AuditEntry[]>({
    queryKey: ['audit-log'],
    queryFn: listAuditLog,
  });

  const { data: snapshots = [], isLoading: loadingSnaps } = useQuery<SnapshotInfo[]>({
    queryKey: ['snapshots'],
    queryFn: listSnapshots,
  });

  const { data: quarantineItems = [], isLoading: loadingQuar } = useQuery<QuarantineItem[]>({
    queryKey: ['quarantine'],
    queryFn: listQuarantine,
  });

  const { data: indexStats } = useQuery<IndexStats>({
    queryKey: ['index-stats'],
    queryFn: getIndexStats,
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
          { label: '快照总数',   value: String(snapshots.length), sub: '可随时恢复' },
          { label: '隔离文件',   value: String(quarantineItems.length), sub: '30天内可恢复' },
          { label: '操作记录',   value: String(auditLog.length), sub: '审计日志条数' },
          { label: '索引文件',   value: indexStats ? indexStats.total_files.toLocaleString() : '--', sub: indexStats ? formatSize(indexStats.total_size) : '前往搜索页建立索引' },
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
            {key: 'history',
              label: `操作历史 ${auditLog.length > 0 ? `(${auditLog.length})` : ''}`,
              children: loadingAudit ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
              ) : auditLog.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', fontSize: 13 }}>
                  暂无操作记录，执行文件移动、清理、隔离后自动记录
                </div>
              ) : (
                <div>
                  {auditLog.map((r, i) => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: i < auditLog.length - 1 ? '1px solid #fafafa' : 'none', fontSize: 13 }}>
                      <div style={{ width: 100, color: '#8c8c8c', flexShrink: 0 }}>{formatDate(r.ts)}</div>
                      <div style={{ width: 72, flexShrink: 0 }}>
                        <Tag bordered={false} color={actionColor(r.action)}>
                          {actionLabel[r.action] ?? r.action}
                        </Tag>
                      </div>
                      <div style={{ flex: 2, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.path}>{r.path.split(/[\\/]/).pop()}</div>
                      <div style={{ flex: 1, color: '#8c8c8c', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail}</div>
                      <div style={{ width: 52, textAlign: 'right', flexShrink: 0 }}>
                        <Tag color={r.result === 'success' ? 'green' : 'red'} bordered={false}>
                          {r.result === 'success' ? '成功' : '失败'}
                        </Tag>
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
