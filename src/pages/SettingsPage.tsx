import { useState } from 'react';
import { Button, Select, Switch } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

const EXCLUDED_PATHS = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', '*.sys', '*.dll'];

export default function SettingsPage() {
  const [localAI, setLocalAI]     = useState(true);
  const [autoOrg, setAutoOrg]     = useState(false);
  const [snapshot, setSnapshot]   = useState(true);
  const [autoStart, setAutoStart] = useState(false);
  const [toTray, setToTray]       = useState(true);

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
            {localAI && row('模型选择', null,
              <Select value="qwen2.5:7b" style={{ width: 200 }} options={[
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
            {row('监控目录', null,
              <Select mode="multiple" value={['桌面', '下载']} style={{ width: 200 }} options={[
                { value: '桌面', label: '桌面' }, { value: '下载', label: '下载' }, { value: 'D盘', label: 'D:/' },
              ]} />
            )}
            {row('操作快照', '操作前自动创建恢复快照', <Switch checked={snapshot} onChange={setSnapshot} />)}
            {row('隔离区保留天数', null,
              <Select value="30" style={{ width: 120 }} options={[
                { value: '7', label: '7 天' }, { value: '15', label: '15 天' },
                { value: '30', label: '30 天' }, { value: '90', label: '90 天' },
              ]} />
            )}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 0 }}>
        {/* Excluded paths */}
        <div className="section-card">
          <div className="section-card-header">
            <h3>排除规则</h3>
            <Button size="small" icon={<PlusOutlined />}>添加</Button>
          </div>
          <div className="section-card-body">
            {EXCLUDED_PATHS.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < EXCLUDED_PATHS.length - 1 ? '1px solid #fafafa' : 'none' }}>
                <span style={{ fontSize: 13, color: '#595959', fontFamily: 'monospace' }}>{p}</span>
                <Button type="link" size="small" danger>移除</Button>
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
              <Button size="small">检查更新</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
