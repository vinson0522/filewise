import { useState, useEffect } from 'react';
import { Button, Select, Switch, message, Spin, Input, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, EyeInvisibleOutlined, EyeOutlined, DesktopOutlined, CloudOutlined, FolderOpenOutlined, LockOutlined } from '@ant-design/icons';
import { getSettings, saveSettings, listOllamaModels, pickFolder, hasPassword, setPassword } from '../services/file.service';
import type { AppSettings, OllamaModel } from '../services/file.service';

const DEFAULT: AppSettings = {
  local_ai: true, auto_organize: false, snapshot_before_op: true,
  auto_start: false, minimize_to_tray: true,
  excluded_paths: ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'],
  watch_dirs: [],
  large_file_threshold_mb: 100,
  ai_model: 'qwen2.5:7b',
  index_dir: '',
  quarantine_dir: '',
  cloud_ai_provider: '',
  cloud_ai_model: '',
  cloud_ai_api_key: '',
  cloud_ai_base_url: '',
};

const CLOUD_PROVIDERS = [
  { value: 'qwen', label: '通义千问 (Qwen)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'moonshot', label: 'Moonshot (Kimi)' },
  { value: 'zhipu', label: '智谱 (GLM)' },
  { value: 'openai', label: 'OpenAI' },
];

function PasswordSection() {
  const [hasPwd, setHasPwd] = useState<boolean | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    hasPassword().then(v => setHasPwd(v)).catch(() => setHasPwd(false));
  }, []);

  async function handleSetPassword() {
    if (!newPwd.trim()) { message.warning('请输入密码'); return; }
    if (newPwd.length < 4) { message.warning('密码至少 4 位'); return; }
    if (newPwd !== confirmPwd) { message.warning('两次密码不一致'); return; }
    setSaving(true);
    try {
      await setPassword(newPwd);
      message.success(hasPwd ? '密码已修改' : '密码已设置，下次启动生效');
      setHasPwd(true);
      setNewPwd('');
      setConfirmPwd('');
    } catch { message.error('设置失败'); }
    finally { setSaving(false); }
  }

  async function handleRemovePassword() {
    setSaving(true);
    try {
      await setPassword('');
      message.success('密码已移除');
      setHasPwd(false);
    } catch { message.error('操作失败'); }
    finally { setSaving(false); }
  }

  if (hasPwd === null) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
        <div>
          <div style={{ fontSize: 14, color: '#595959' }}>启动密码</div>
          <div style={{ fontSize: 12, color: '#bfbfbf', marginTop: 2 }}>
            {hasPwd ? '已设置 — 每次启动需要输入密码' : '未设置 — 点击右侧设置密码保护应用'}
          </div>
        </div>
        <Tag color={hasPwd ? 'green' : 'default'}>{hasPwd ? '已开启' : '未开启'}</Tag>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
        <Input.Password size="small" prefix={<LockOutlined />} placeholder={hasPwd ? '输入新密码' : '设置密码（至少4位）'}
          value={newPwd} onChange={e => setNewPwd(e.target.value)} style={{ width: 280 }} />
        <Input.Password size="small" prefix={<LockOutlined />} placeholder="确认密码"
          value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} style={{ width: 280 }}
          onPressEnter={handleSetPassword} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" size="small" loading={saving} onClick={handleSetPassword}>
            {hasPwd ? '修改密码' : '设置密码'}
          </Button>
          {hasPwd && (
            <Button size="small" danger loading={saving} onClick={handleRemovePassword}>
              移除密码
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [cfg, setCfg] = useState<AppSettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newWatchDir, setNewWatchDir] = useState('');
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);

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

  const localAI = cfg.local_ai;
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

      {/* AI Model - unified card */}
      <div className="section-card mb-16">
        <div className="section-card-header"><h3>AI 模型配置</h3></div>
        <div className="section-card-body">
          {row('推理模式', '选择使用本地模型或云端模型',
            <Select value={localAI ? 'local' : 'cloud'}
              onChange={v => set('local_ai', v === 'local')}
              style={{ width: 180 }}
              options={[
                { value: 'local', label: <span><DesktopOutlined /> 本地模型 (Ollama)</span> },
                { value: 'cloud', label: <span><CloudOutlined /> 云端模型</span> },
              ]} />
          )}

          {localAI ? (
            <>
              {row('本地模型', ollamaModels.length > 0 ? `已检测到 ${ollamaModels.length} 个模型` : 'Ollama 未运行或无模型',
                <Select value={cfg.ai_model} onChange={v => set('ai_model', v)} style={{ width: 220 }}
                  options={ollamaModels.length > 0
                    ? ollamaModels.map(m => ({ value: m.name, label: m.name }))
                    : [
                        { value: 'qwen2.5:7b',  label: 'Qwen 2.5-7B（推荐）' },
                        { value: 'llama3.2:3b', label: 'Llama 3.2-3B（轻量）' },
                        { value: 'minicpm-v',   label: 'MiniCPM-V（视觉）' },
                      ]} />
              )}
              <div style={{ fontSize: 12, color: '#8c8c8c', padding: '4px 0 0', lineHeight: 1.6 }}>
                需先安装 <a href="https://ollama.ai" target="_blank" rel="noreferrer">Ollama</a> 并运行 <code>ollama serve</code>，然后拉取模型如 <code>ollama pull qwen2.5:7b</code>
              </div>
            </>
          ) : (
            <>
              {row('云端厂商', null,
                <Select value={cfg.cloud_ai_provider || undefined} onChange={v => set('cloud_ai_provider', v)}
                  placeholder="选择厂商" style={{ width: 220 }} options={CLOUD_PROVIDERS} />
              )}
              {row('API Key', null,
                <Input
                  size="small" style={{ width: 220 }}
                  type={showApiKey ? 'text' : 'password'}
                  value={cfg.cloud_ai_api_key}
                  onChange={e => set('cloud_ai_api_key', e.target.value)}
                  placeholder="sk-..."
                  suffix={<span style={{ cursor: 'pointer' }} onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                  </span>}
                />
              )}
              {row('模型名称', '留空使用厂商默认模型',
                <Input size="small" style={{ width: 220 }} value={cfg.cloud_ai_model}
                  onChange={e => set('cloud_ai_model', e.target.value)} placeholder="如 deepseek-chat" />
              )}
              {row('自定义 Base URL', '留空使用厂商默认地址',
                <Input size="small" style={{ width: 220 }} value={cfg.cloud_ai_base_url}
                  onChange={e => set('cloud_ai_base_url', e.target.value)} placeholder="https://api.example.com" />
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid-2">
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

        {/* Storage paths */}
        <div className="section-card">
          <div className="section-card-header"><h3>存储路径</h3></div>
          <div className="section-card-body">
            {row('索引存放目录', cfg.index_dir || '默认: AppData/filewise',
              <Button size="small" icon={<FolderOpenOutlined />}
                onClick={async () => { const p = await pickFolder(); if (p) set('index_dir', p); }}>
                {cfg.index_dir ? '更换' : '选择目录'}
              </Button>
            )}
            {cfg.index_dir && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{cfg.index_dir}</Tag>
                <Button type="link" size="small" danger onClick={() => set('index_dir', '')}>重置默认</Button>
              </div>
            )}
            {row('隔离区目录', cfg.quarantine_dir || '默认: 文件所在盘符',
              <Button size="small" icon={<FolderOpenOutlined />}
                onClick={async () => { const p = await pickFolder(); if (p) set('quarantine_dir', p); }}>
                {cfg.quarantine_dir ? '更换' : '选择目录'}
              </Button>
            )}
            {cfg.quarantine_dir && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                <Tag style={{ fontFamily: 'monospace', margin: 0 }}>{cfg.quarantine_dir}</Tag>
                <Button type="link" size="small" danger onClick={() => set('quarantine_dir', '')}>重置默认</Button>
              </div>
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
              <span style={{ fontSize: 13, color: '#8c8c8c' }}>FileWise v1.4.0</span>
              <Button type="primary" size="small" icon={<SaveOutlined />}
                loading={saving} onClick={handleSave}>保存设置</Button>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="section-card">
          <div className="section-card-header"><h3><LockOutlined /> 安全设置</h3></div>
          <div className="section-card-body">
            <PasswordSection />
          </div>
        </div>
      </div>
    </div>
  );
}
