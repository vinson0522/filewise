import { useState, useEffect } from 'react';
import { Button, Input, message, Tag, Tabs, Table, Modal, Empty, Spin, Popconfirm } from 'antd';
import {
  LockOutlined, ScanOutlined, AuditOutlined, SafetyCertificateOutlined,
  FolderOpenOutlined, DeleteOutlined, PlusOutlined, ExportOutlined,
  UnlockOutlined, SecurityScanOutlined, EyeOutlined, FileProtectOutlined,
  ImportOutlined, DownloadOutlined,
} from '@ant-design/icons';
import {
  vaultEncrypt, vaultDecrypt, vaultList, vaultRemove, vaultExport, vaultImport,
  scanSensitiveFiles, exportAuditCsv, exportAuditJson,
  createIntegrityBaseline, checkIntegrity,
  addProtectedDir, removeProtectedDir, listProtectedDirs,
  pickFolder, pickFile,
} from '../services/file.service';
import type { VaultEntry, SensitiveMatch, IntegrityEntry } from '../services/file.service';
import { formatSize } from '../utils/path.util';

// ===================== S1: 保险箱 =====================
function VaultTab() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [pwd, setPwd] = useState('');
  const [decryptId, setDecryptId] = useState<number | null>(null);
  const [decryptPwd, setDecryptPwd] = useState('');

  const load = async () => {
    setLoading(true);
    try { setEntries(await vaultList()); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const [encryptPath, setEncryptPath] = useState('');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [importPwd, setImportPwd] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  const handleExportEntry = async (entry: VaultEntry) => {
    const folder = await pickFolder();
    if (!folder) return;
    try {
      const out = await vaultExport(entry.id, folder);
      message.success(`已导出到: ${out}`);
    } catch (e: any) { message.error(e.message || '导出失败'); }
  };

  const handleImport = async () => {
    if (!importPath || !importPwd.trim()) { message.warning('请选择文件并输入密码'); return; }
    setImportLoading(true);
    try {
      const res = await vaultImport(importPath, importPwd);
      message.success(res);
      setImportModalOpen(false);
      setImportPath('');
      setImportPwd('');
    } catch (e: any) { message.error(e.message || '导入解密失败'); }
    finally { setImportLoading(false); }
  };

  const handlePickAndEncrypt = async () => {
    const filePath = await pickFile();
    if (!filePath) return;
    setEncryptPath(filePath);
    if (!pwd.trim()) { message.warning('请先设置保险箱密码'); return; }
    try {
      const res = await vaultEncrypt(filePath, pwd);
      message.success(res);
      setPwd('');
      setEncryptPath('');
      load();
    } catch (e: any) { message.error(e.message || '加密失败'); }
  };

  const handleDecrypt = async () => {
    if (!decryptId || !decryptPwd.trim()) return;
    try {
      const res = await vaultDecrypt(decryptId, decryptPwd);
      message.success(res);
      setDecryptId(null);
      setDecryptPwd('');
      load();
    } catch (e: any) { message.error(e.message || '解密失败'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="small" icon={<FolderOpenOutlined />} onClick={async () => {
          const f = await pickFile(); if (f) setEncryptPath(f);
        }}>选择文件</Button>
        {encryptPath && <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{encryptPath}</Tag>}
        <Input.Password size="small" placeholder="设置保险箱密码" value={pwd}
          onChange={e => setPwd(e.target.value)} style={{ width: 180 }} />
        <Button type="primary" size="small" icon={<LockOutlined />}
          onClick={encryptPath ? handlePickAndEncrypt : async () => {
            const f = await pickFile(); if (!f) return; setEncryptPath(f);
            if (!pwd.trim()) { message.warning('请先设置密码'); return; }
            try { const res = await vaultEncrypt(f, pwd); message.success(res); setPwd(''); setEncryptPath(''); load(); }
            catch (e: any) { message.error(e.message || '加密失败'); }
          }}>加密入箱</Button>
        <div style={{ flex: 1 }} />
        <Button size="small" icon={<ImportOutlined />} onClick={() => setImportModalOpen(true)}>
          导入 .fwvault 文件
        </Button>
      </div>

      <Table size="small" loading={loading} dataSource={entries} rowKey="id" pagination={false}
        locale={{ emptyText: <Empty description="保险箱为空" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        columns={[
          { title: '文件名', dataIndex: 'original_name', key: 'name', ellipsis: true },
          { title: '原路径', dataIndex: 'original_path', key: 'path', ellipsis: true,
            render: (t: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{t}</span> },
          { title: '大小', dataIndex: 'size', key: 'size', width: 90, render: (s: number) => formatSize(s) },
          { title: '加密时间', dataIndex: 'encrypted_at', key: 'time', width: 150 },
          { title: '操作', key: 'actions', width: 200, render: (_: any, r: VaultEntry) => (
            <div style={{ display: 'flex', gap: 4 }}>
              <Button type="link" size="small" icon={<UnlockOutlined />}
                onClick={() => setDecryptId(r.id)}>解密</Button>
              <Button type="link" size="small" icon={<DownloadOutlined />}
                onClick={() => handleExportEntry(r)}>导出</Button>
              <Popconfirm title="永久删除此加密文件？" onConfirm={async () => {
                await vaultRemove(r.id); message.success('已删除'); load();
              }}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
            </div>
          )},
        ]}
      />

      <Modal title="解密文件" open={decryptId !== null} onCancel={() => { setDecryptId(null); setDecryptPwd(''); }}
        onOk={handleDecrypt} okText="解密恢复">
        <Input.Password prefix={<LockOutlined />} placeholder="输入加密时设置的密码"
          value={decryptPwd} onChange={e => setDecryptPwd(e.target.value)} onPressEnter={handleDecrypt} />
      </Modal>

      <Modal title="导入加密文件" open={importModalOpen}
        onCancel={() => { setImportModalOpen(false); setImportPath(''); setImportPwd(''); }}
        onOk={handleImport} okText="解密导入" confirmLoading={importLoading}>
        <p style={{ color: '#8c8c8c', fontSize: 13, marginBottom: 12 }}>
          选择他人发来的 .fwvault 加密文件，输入密码即可解密还原。解密后的文件默认保存到下载目录。
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Button icon={<FolderOpenOutlined />} onClick={async () => {
            const f = await pickFile(); if (f) setImportPath(f);
          }}>选择 .fwvault 文件</Button>
          {importPath && <Tag style={{ fontFamily: 'monospace', margin: 0, maxWidth: 300 }} title={importPath}>
            {importPath.replace(/^.*[\\/]/, '')}
          </Tag>}
        </div>
        <Input.Password prefix={<LockOutlined />} placeholder="输入发送方设置的密码"
          value={importPwd} onChange={e => setImportPwd(e.target.value)} onPressEnter={handleImport} />
      </Modal>
    </div>
  );
}

// ===================== S2: 敏感文件扫描 =====================
function SensitiveScanTab() {
  const [results, setResults] = useState<SensitiveMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanPath, setScanPath] = useState('');

  const handleScan = async () => {
    const path = scanPath || await pickFolder();
    if (!path) return;
    setScanPath(path);
    setLoading(true);
    try {
      const res = await scanSensitiveFiles(path);
      setResults(res);
      if (res.length === 0) message.success('未发现敏感信息');
      else message.warning(`发现 ${res.length} 处敏感信息`);
    } catch (e: any) { message.error(e.message || '扫描失败'); }
    finally { setLoading(false); }
  };

  const typeColor: Record<string, string> = {
    '身份证号': 'red', '银行卡号': 'orange', '密码/密钥': 'volcano',
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <Button size="small" icon={<FolderOpenOutlined />} onClick={async () => {
          const p = await pickFolder(); if (p) setScanPath(p);
        }}>选择目录</Button>
        {scanPath && <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{scanPath}</Tag>}
        <Button type="primary" size="small" icon={<ScanOutlined />} loading={loading}
          onClick={handleScan}>开始扫描</Button>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="正在扫描文件内容..." /></div> : (
        <Table size="small" dataSource={results} rowKey={(r, i) => `${r.file_path}-${r.match_type}-${i}`}
          pagination={{ pageSize: 20 }}
          locale={{ emptyText: <Empty description="点击扫描开始检测" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          columns={[
            { title: '文件名', dataIndex: 'file_name', key: 'name', width: 200, ellipsis: true },
            { title: '敏感类型', dataIndex: 'match_type', key: 'type', width: 110,
              render: (t: string) => <Tag color={typeColor[t] || 'default'}>{t}</Tag> },
            { title: '匹配数', dataIndex: 'match_count', key: 'count', width: 80, align: 'center' as const },
            { title: '示例（脱敏）', dataIndex: 'sample', key: 'sample', ellipsis: true,
              render: (s: string) => <code style={{ fontSize: 12 }}>{s}</code> },
            { title: '路径', dataIndex: 'file_path', key: 'path', ellipsis: true,
              render: (t: string) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{t}</span> },
          ]}
        />
      )}
    </div>
  );
}

// ===================== S3: 审计导出 =====================
function AuditExportTab() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: 'csv' | 'json') => {
    const folder = await pickFolder();
    if (!folder) return;
    const ext = format === 'csv' ? 'csv' : 'json';
    const savePath = `${folder}\\filewise_audit_${Date.now()}.${ext}`;
    setExporting(true);
    try {
      const res = format === 'csv' ? await exportAuditCsv(savePath) : await exportAuditJson(savePath);
      message.success(res);
    } catch (e: any) { message.error(e.message || '导出失败'); }
    finally { setExporting(false); }
  };

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
        <AuditOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
        <h3 style={{ marginBottom: 8 }}>导出操作审计日志</h3>
        <p style={{ color: '#8c8c8c', marginBottom: 24 }}>
          将所有文件操作记录导出为 CSV 或 JSON 格式，可用于安全审计和合规检查
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Button type="primary" size="large" icon={<ExportOutlined />}
            loading={exporting} onClick={() => handleExport('csv')}>导出 CSV</Button>
          <Button size="large" icon={<ExportOutlined />}
            loading={exporting} onClick={() => handleExport('json')}>导出 JSON</Button>
        </div>
      </div>
    </div>
  );
}

// ===================== S4: 完整性校验 =====================
function IntegrityTab() {
  const [results, setResults] = useState<IntegrityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState('');

  const handleBaseline = async () => {
    const dir = path || await pickFolder();
    if (!dir) return;
    setPath(dir);
    setLoading(true);
    try {
      const res = await createIntegrityBaseline(dir);
      message.success(res);
    } catch (e: any) { message.error(e.message || '创建基线失败'); }
    finally { setLoading(false); }
  };

  const handleCheck = async () => {
    const dir = path || await pickFolder();
    if (!dir) return;
    setPath(dir);
    setLoading(true);
    try {
      const res = await checkIntegrity(dir);
      setResults(res);
      const modified = res.filter(r => r.status !== 'ok').length;
      if (modified === 0) message.success(`${res.length} 个文件校验通过`);
      else message.warning(`发现 ${modified} 个文件有变更`);
    } catch (e: any) { message.error(e.message || '校验失败'); }
    finally { setLoading(false); }
  };

  const statusMap: Record<string, { color: string; label: string }> = {
    ok: { color: 'green', label: '正常' },
    modified: { color: 'red', label: '已修改' },
    missing: { color: 'volcano', label: '已删除' },
    error: { color: 'default', label: '错误' },
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <Button size="small" icon={<FolderOpenOutlined />} onClick={async () => {
          const p = await pickFolder(); if (p) setPath(p);
        }}>选择目录</Button>
        {path && <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{path}</Tag>}
        <Button size="small" icon={<SafetyCertificateOutlined />} loading={loading}
          onClick={handleBaseline}>创建基线</Button>
        <Button type="primary" size="small" icon={<EyeOutlined />} loading={loading}
          onClick={handleCheck}>校验完整性</Button>
      </div>

      <Table size="small" dataSource={results} rowKey="path" pagination={{ pageSize: 20 }}
        locale={{ emptyText: <Empty description="先创建基线，再校验完整性" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        columns={[
          { title: '文件名', dataIndex: 'name', key: 'name', width: 200, ellipsis: true },
          { title: '状态', dataIndex: 'status', key: 'status', width: 90,
            render: (s: string) => {
              const m = statusMap[s] || { color: 'default', label: s };
              return <Tag color={m.color}>{m.label}</Tag>;
            },
            filters: [
              { text: '正常', value: 'ok' },
              { text: '已修改', value: 'modified' },
              { text: '已删除', value: 'missing' },
            ],
            onFilter: (v: any, r: IntegrityEntry) => r.status === v,
          },
          { title: '路径', dataIndex: 'path', key: 'path', ellipsis: true,
            render: (t: string) => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{t}</span> },
        ]}
      />
    </div>
  );
}

// ===================== S5: 目录保护 =====================
function ProtectedDirsTab() {
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setDirs(await listProtectedDirs()); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const p = await pickFolder();
    if (!p) return;
    try {
      await addProtectedDir(p);
      message.success(`已保护: ${p}`);
      load();
    } catch (e: any) { message.error(e.message || '添加失败'); }
  };

  const handleRemove = async (path: string) => {
    try {
      await removeProtectedDir(path);
      message.success('已移除保护');
      load();
    } catch (e: any) { message.error(e.message || '移除失败'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#8c8c8c', margin: 0, fontSize: 13 }}>
          受保护目录下的文件将在整理/清理/删除操作前被拦截，防止误操作
        </p>
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd}>
          添加保护目录
        </Button>
      </div>

      {loading ? <Spin /> : dirs.length === 0 ? (
        <Empty description="暂无受保护目录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dirs.map(d => (
            <div key={d} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SecurityScanOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{d}</span>
              </div>
              <Popconfirm title="确认移除保护？" onConfirm={() => handleRemove(d)}>
                <Button type="link" size="small" danger>移除</Button>
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== Main SecurityPage =====================
export default function SecurityPage() {
  const items = [
    { key: 'vault', label: <span><LockOutlined /> 文件保险箱</span>, children: <VaultTab /> },
    { key: 'sensitive', label: <span><ScanOutlined /> 敏感扫描</span>, children: <SensitiveScanTab /> },
    { key: 'audit', label: <span><AuditOutlined /> 审计导出</span>, children: <AuditExportTab /> },
    { key: 'integrity', label: <span><FileProtectOutlined /> 完整性校验</span>, children: <IntegrityTab /> },
    { key: 'protect', label: <span><SecurityScanOutlined /> 目录保护</span>, children: <ProtectedDirsTab /> },
  ];

  return (
    <div>
      <div className="page-header">
        <h2><SafetyCertificateOutlined /> 安全中心</h2>
        <p>文件加密、敏感检测、完整性校验、目录保护与审计导出</p>
      </div>
      <div className="section-card">
        <Tabs items={items} />
      </div>
    </div>
  );
}
