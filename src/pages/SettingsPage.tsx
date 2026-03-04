import { useState, useEffect } from 'react';
import { Button, Select, Switch, message, Spin, Input, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { getSettings, saveSettings, listOllamaModels } from '../services/file.service';
import type { AppSettings, OllamaModel } from '../services/file.service';

const DEFAULT: AppSettings = {
  local_ai: true, auto_organize: false, snapshot_before_op: true,
  auto_start: false, minimize_to_tray: true,
  excluded_paths: ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'],
  watch_dirs: [],
  large_file_threshold_mb: 100,
  ai_model: 'qwen2.5:7b',
};

export default function SettingsPage() {
  const [cfg, setCfg] = useState<AppSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newWatchDir, setNewWatchDir] = useState('');
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);

  useEffect(() => {
    getSettings().then(s => { setCfg(s); setLoading(false); })
      .catch(() => setLoading(false));
    listOllamaModels().then(setOllamaModels).catch(() => setOllamaModels([]));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await saveSettings(cfg);
      message.success('设置已保存');
    } catch (e) {
      message.error('保存失败：' + String(e));
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof AppSettings>(k: K, v: AppSettings[K]) {
    setCfg(prev => ({ ...prev, [k]: v }));
  }

  function addExclude() {
    const p = newPath.trim();
    if (!p || cfg.excluded_paths.includes(p)) return;
    set('excluded_paths', [...cfg.excluded_paths, p]);
    setNewPath('');
  }

  function addWatchDir() {
    const p = newWatchDir.trim();
    if (!p || cfg.watch_dirs.includes(p)) return;
    set('watch_dirs', [...cfg.watch_dirs, p]);
    setNewWatchDir('');
  }

  if (loading) return <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin /></div>;

  const [localAI, setLocalAI] = [cfg.local_ai, (v: boolean) => set('local_ai', v)];
  const [autoOrg, setAutoOrg] = [cfg.auto_organize, (v: boolean) => set('auto_organize', v)];
  const [snapshot, setSnapshot] = [cfg.snapshot_before_op, (v: boolean) => set('snapshot_before_op', v)];
  const [autoStart, setAutoStart] = [cfg.auto_start, (v: boolean) => set('auto_start', v)];
  const [toTray, setToTray] = [cfg.minimize_to_tray, (v: boolean) => set('minimize_to_tray', v)];

  const row = (label: string, desc: string | null, control: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
      <div>
        <div style={{ fontSize: 14, color: '#595959' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: '#bfbfbf', marginTop: 2 }}>{desc}</div>}
      </div>
      {control}
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h2>系统设置</h2>
        <p>配置 AI 模型、监控规则与个人偏好</p>
      </div>

      <div className="grid-2">
        {/* AI Model */}
        <div className="section-card">
          <div className="section-card-header"><h3>AI 模型配置</h3></div>
          <div className="section-card-body">
            {row('本地模型推理', '使用 Ollama 在本地运行 AI 模型', <Switch checked={localAI} onChange={setLocalAI} />)}
            {localAI && row('模型选择', ollamaModels.length > 0 ? `已检测到 ${ollamaModels.length} 个本地模型` : 'Ollama 未运行或无已安装模型',
              <Select value={cfg.ai_model} onChange={v => set('ai_model', v)} style={{ width: 220 }}
                options={ollamaModels.length > 0
                  ? ollamaModels.map(m => ({ value: m.name, label: m.name }))
                  : [
                      { value: 'qwen2.5:7b',  label: 'Qwen 2.5-7B（推荐）' },
                      { value: 'llama3.2:3b', label: 'Llama 3.2-3B（轻量）' },
                      { value: 'minicpm-v',   label: 'MiniCPM-V（视觉）' },
                    ]} />
            )}
            {row('云端 API', '用于复杂任务的云端模型（可选）', <Button size="small">配置 API Key</Button>)}
          </div>
        </div>

        {/* Organize & Clean */}
        <div className="section-card">
          <div className="section-card-header"><h3>整理与清理</h3></div>
          <div className="section-card-body">
            {row('自动归档', '监控目录中新文件自动分类', <Switch checked={autoOrg} onChange={setAutoOrg} />)}
            {row('操作快照', '操作前自动创建恢复快照', <Switch checked={snapshot} onChange={setSnapshot} />)}
            {row('大文件阈值 (MB)', null,
              <Select value={String(cfg.large_file_threshold_mb)}
                onChange={v => set('large_file_threshold_mb', Number(v))}
                style={{ width: 120 }} options={[
                  { value: '50', label: '50 MB' }, { value: '100', label: '100 MB' },
                  { value: '200', label: '200 MB' }, { value: '500', label: '500 MB' },
                ]} />
            )}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 0 }}>
        {/* Watch dirs */}
        <div className="section-card">
          <div className="section-card-header">
            <h3>监控目录</h3>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>新文件自动归档（需开启自动归档）</span>
          </div>
          <div className="section-card-body">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Input
                size="small" placeholder="输入要监控的目录，如 D:\\项目"
                value={newWatchDir} onChange={e => setNewWatchDir(e.target.value)}
                onPressEnter={addWatchDir} style={{ flex: 1 }}
              />
              <Button size="small" icon={<PlusOutlined />} onClick={addWatchDir}>添加</Button>
            </div>
            {cfg.watch_dirs.length === 0 && (
              <div style={{ color: '#bfbfbf', fontSize: 13, padding: '8px 0' }}>暂无监控目录</div>
            )}
            {cfg.watch_dirs.map((p: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < cfg.watch_dirs.length - 1 ? '1px solid #fafafa' : 'none' }}>
                <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{p}</Tag>
                <Button type="link" size="small" danger icon={<DeleteOutlined />}
                  onClick={() => set('watch_dirs', cfg.watch_dirs.filter((_: string, j: number) => j !== i))}
                >移除</Button>
              </div>
            ))}
          </div>
        </div>

        {/* Excluded paths */}
        <div className="section-card">
          <div className="section-card-header">
            <h3>排除规则</h3>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>这些路径不会被扫描或整理</span>
          </div>
          <div className="section-card-body">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Input
                size="small" placeholder="输入要排除的路径，如 D:\\私人"
                value={newPath} onChange={e => setNewPath(e.target.value)}
                onPressEnter={addExclude}
                style={{ flex: 1 }}
              />
              <Button size="small" icon={<PlusOutlined />} onClick={addExclude}>添加</Button>
            </div>
            {cfg.excluded_paths.map((p: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < cfg.excluded_paths.length - 1 ? '1px solid #fafafa' : 'none' }}>
                <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{p}</Tag>
                <Button type="link" size="small" danger icon={<DeleteOutlined />}
                  onClick={() => set('excluded_paths', cfg.excluded_paths.filter((_: string, j: number) => j !== i))}
                >移除</Button>
              </div>
            ))}
          </div>
        </div>

        {/* General */}
        <div className="section-card">
          <div className="section-card-header"><h3>通用设置</h3></div>
          <div className="section-card-body">
            {row('语言', null, <Select value="zh" style={{ width: 160 }} options={[{ value: 'zh', label: '简体中文' }, { value: 'en', label: 'English' }]} />)}
            {row('开机自启动', null, <Switch checked={autoStart} onChange={setAutoStart} />)}
            {row('最小化到托盘', null, <Switch checked={toTray} onChange={setToTray} />)}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>FileWise v1.0.0</span>
              <Button type="primary" size="small" icon={<SaveOutlined />}
                loading={saving} onClick={handleSave}>保存设置</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
