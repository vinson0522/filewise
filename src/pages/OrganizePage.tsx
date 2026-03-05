import { useState } from 'react';
import { Button, Checkbox, Select, Tag, Spin, message } from 'antd';
import {
  ArrowRightOutlined, CheckOutlined, FolderOutlined,
  SafetyOutlined, ThunderboltOutlined, FileOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { scanDirectoryShallow, moveFiles, pickFolder } from '../services/file.service';
import type { FileEntry, MoveOperation } from '../types';
import { inferCategory, formatSize } from '../utils/path.util';

// 根据文件扩展名推断目标子目录
function getTargetSubdir(name: string, strategy: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (strategy === 'date') {
    const now = new Date();
    return `${now.getFullYear()}\\${String(now.getMonth() + 1).padStart(2, '0')}\\`;
  }
  // 按类型分类（Windows 使用反斜杠）
  if (['docx','doc','pdf','txt','md','pptx','ppt'].includes(ext)) return '文档\\';
  if (['xlsx','xls','csv'].includes(ext)) return '表格\\';
  if (['jpg','jpeg','png','gif','bmp','webp','svg','heic'].includes(ext)) return '图片\\';
  if (['mp4','avi','mov','mkv','wmv','flv'].includes(ext)) return '视频\\';
  if (['mp3','wav','flac','aac','ogg'].includes(ext)) return '音频\\';
  if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) return '压缩包\\';
  if (['js','ts','jsx','tsx','py','rs','go','java','cpp','c','sh'].includes(ext)) return '代码\\';
  if (['exe','msi','dmg','deb'].includes(ext)) return '安装包\\';
  return '其他\\';
}


interface OrganizeItem {
  entry: FileEntry;
  targetDir: string;
  category: string;
  selected: boolean;
}

export default function OrganizePage() {
  const [scanPath, setScanPath] = useState('');
  const [strategy, setStrategy] = useState('type');
  const [items, setItems] = useState<OrganizeItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [outputBase, setOutputBase] = useState('C:\\Users\\Organized');

  async function handleScan() {
    if (!scanPath.trim()) {
      message.warning('请输入要扫描的目录路径');
      return;
    }
    setScanning(true);
    try {
      const entries = await scanDirectoryShallow(scanPath);
      const fileEntries = entries.filter(e => !e.is_dir);
      const newItems: OrganizeItem[] = fileEntries.map(e => {
        const sub = getTargetSubdir(e.name, strategy);
        const category = inferCategory(e.extension);
        return { entry: e, targetDir: outputBase + '\\' + sub, category, selected: true };
      });
      setItems(newItems);
      if (newItems.length === 0) {
        message.info('该目录下无文件，请选择其他目录');
      }
    } catch (e) {
      message.error('扫描失败：' + String(e));
    } finally {
      setScanning(false);
    }
  }

  const moveMutation = useMutation({
    mutationFn: (ops: MoveOperation[]) =>
      moveFiles(ops, `整理 ${scanPath}  [策略: ${strategy}]`),
    onSuccess: (result) => {
      message.success(result.message);
      setItems([]);
    },
    onError: (e: Error) => message.error('整理失败：' + e.message),
  });

  function toggleItem(i: number) {
    setItems(prev => prev.map((item, idx) =>
      idx === i ? { ...item, selected: !item.selected } : item
    ));
  }
  function toggleAll(v: boolean) {
    setItems(prev => prev.map(item => ({ ...item, selected: v })));
  }

  const selected = items.filter(it => it.selected);
  const allChecked = items.length > 0 && items.every(it => it.selected);

  function handleExecute() {
    const ops: MoveOperation[] = selected.map(it => ({
      source: it.entry.path,
      target: it.targetDir + it.entry.name,
    }));
    moveMutation.mutate(ops);
  }

  return (
    <div>
      <div className="page-header">
        <h2>智能整理</h2>
        <p>扫描目录，按类型自动分类归档</p>
      </div>

      {/* Config bar */}
      <div className="section-card mb-16">
        <div className="section-card-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#595959', flexShrink: 0 }}>扫描目录：</span>
            {scanPath && <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{scanPath}</Tag>}
            <Button icon={<FolderOpenOutlined />}
              onClick={async () => { const p = await pickFolder(); if (p) setScanPath(p); }}>
              {scanPath ? '更换目录' : '选择目录'}
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#595959', flexShrink: 0 }}>整理策略：</span>
            <Select value={strategy} onChange={setStrategy} style={{ width: 120 }} options={[
              { value: 'type', label: '按文件类型' },
              { value: 'date', label: '按日期' },
            ]} />
            <span style={{ fontSize: 13, color: '#595959', flexShrink: 0 }}>输出目录：</span>
            {outputBase && <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{outputBase}</Tag>}
            <Button icon={<FolderOpenOutlined />}
              onClick={async () => { const p = await pickFolder(); if (p) setOutputBase(p); }}>
              {outputBase ? '更换' : '选择目录'}
            </Button>
            <Button type="primary" icon={<ThunderboltOutlined />}
              loading={scanning} onClick={handleScan}>开始扫描</Button>
          </div>
        </div>
      </div>

      {/* Preview */}
      {scanning ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bfbfbf' }}>
          <Spin size="large" />
          <p style={{ marginTop: 12 }}>正在扫描 {scanPath}...</p>
        </div>
      ) : items.length > 0 ? (
        <div className="section-card mb-16">
          <div className="section-card-header">
            <h3>整理预览</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Checkbox checked={allChecked}
                onChange={e => toggleAll(e.target.checked)}>全选</Checkbox>
              <Tag color="blue">{selected.length} / {items.length} 个文件</Tag>
              <Button type="primary" size="small" icon={<CheckOutlined />}
                disabled={selected.length === 0} loading={moveMutation.isPending}
                onClick={handleExecute}>
                确认整理
              </Button>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', padding: '8px 16px', background: '#fafafa', fontSize: 12, color: '#8c8c8c', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ width: 32 }} />
              <div style={{ flex: 2 }}>原始文件</div>
              <div style={{ width: 80, textAlign: 'right' }}>大小</div>
              <div style={{ width: 40, textAlign: 'center' }} />
              <div style={{ flex: 2 }}>目标目录</div>
              <div style={{ width: 64, textAlign: 'center' }}>类别</div>
            </div>
            {items.map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', padding: '10px 16px',
                borderBottom: i < items.length - 1 ? '1px solid #fafafa' : 'none', fontSize: 13,
              }}>
                <div style={{ width: 32 }}>
                  <Checkbox checked={item.selected} onChange={() => toggleItem(i)} />
                </div>
                <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8, color: '#595959',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <FileOutlined style={{ color: '#8c8c8c', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.entry.name}</span>
                </div>
                <div style={{ width: 80, textAlign: 'right', color: '#8c8c8c', flexShrink: 0 }}>
                  {formatSize(item.entry.size)}
                </div>
                <div style={{ width: 40, textAlign: 'center', color: '#bfbfbf', flexShrink: 0 }}>
                  <ArrowRightOutlined />
                </div>
                <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8, color: '#1677ff',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <FolderOutlined style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.targetDir}</span>
                </div>
                <div style={{ width: 64, textAlign: 'center', flexShrink: 0 }}>
                  <Tag bordered={false}>{item.category}</Tag>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bfbfbf' }}>
          <ThunderboltOutlined style={{ fontSize: 40, display: 'block', marginBottom: 10 }} />
          <p style={{ fontSize: 14 }}>输入目录路径，点击「开始扫描」</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, fontSize: 13, color: '#8c8c8c', alignItems: 'center' }}>
        <SafetyOutlined />
        <span>整理前自动创建快照，所有操作均可一键撤销，快照在“操作报告”页管理</span>
      </div>
    </div>
  );
}
