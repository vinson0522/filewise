import { useState, useRef, useEffect } from 'react';
import { Button, Tag, Spin, Alert } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAppStore } from '../stores/useAppStore';
import { aiChat, checkOllama } from '../services/file.service';
import type { ChatMessage } from '../services/file.service';

const QUICK_CMDS = [
  '帮我整理桌面文件',
  '如何清理C盘临时文件？',
  '查找重复文件的步骤',
  '分析磁盘空间占用',
  '大文件如何处理？',
];

export default function ChatPage() {
  const { chatMessages, appendChatMessage } = useAppStore();
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  useEffect(() => {
    checkOllama().then(setOllamaOnline).catch(() => setOllamaOnline(false));
  }, []);

  async function send(text?: string) {
    const msg = (text ?? inputText).trim();
    if (!msg || sending) return;
    setInputText('');
    setSending(true);

    appendChatMessage({ role: 'user', text: msg, timestamp: Date.now() });

    try {
      // 将 store 格式转换为 Ollama 格式
      const history: ChatMessage[] = chatMessages
        .concat([{ role: 'user', text: msg, timestamp: Date.now() }])
        .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }));

      const reply = await aiChat(history);
      appendChatMessage({ role: 'ai', text: reply, timestamp: Date.now() });
    } catch (e) {
      appendChatMessage({
        role: 'ai',
        text: `⚠️ AI 响应失败：${String(e)}\n\n请确保已安装并运行 Ollama（https://ollama.ai）且已拉取所选模型。`,
        timestamp: Date.now(),
      });
    } finally {
      setSending(false);
    }
  }

  const statusTag = ollamaOnline === null
    ? <Tag color="default"><Spin size="small" /> 检测中...</Tag>
    : ollamaOnline
      ? <Tag color="success">Ollama 在线</Tag>
      : <Tag color="error">Ollama 离线</Tag>;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2>AI 助手</h2>
          <p>用自然语言管理你的文件</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          {statusTag}
          <Button size="small" icon={<ReloadOutlined />}
            onClick={() => { setOllamaOnline(null); checkOllama().then(setOllamaOnline).catch(() => setOllamaOnline(false)); }}>
            重检
          </Button>
        </div>
      </div>

      {ollamaOnline === false && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Ollama 未运行"
          description="请先安装 Ollama（https://ollama.ai）并运行 `ollama serve`，然后拉取模型如 `ollama pull qwen2.5:7b`。未安装时 AI 对话不可用。"
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        {/* 消息列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {chatMessages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 60, color: '#bfbfbf' }}>
              <RobotOutlined style={{ fontSize: 48, marginBottom: 12, display: 'block' }} />
              <p style={{ fontSize: 14 }}>你好！我是 FileWise AI 助手，请描述你的文件管理需求。</p>
            </div>
          )}
          {chatMessages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 20, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: m.role === 'ai' ? '#e6f4ff' : '#f0f0f0',
                color: m.role === 'ai' ? '#1677ff' : '#595959',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>
                {m.role === 'ai' ? <RobotOutlined /> : <UserOutlined />}
              </div>
              <div style={{
                maxWidth: '72%', padding: '12px 16px', borderRadius: 8, fontSize: 14,
                lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: m.role === 'ai' ? '#fafafa' : '#1677ff',
                color: m.role === 'ai' ? '#262626' : '#fff',
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e6f4ff', color: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RobotOutlined />
              </div>
              <div style={{ padding: '14px 16px', background: '#fafafa', borderRadius: 8 }}>
                <Spin size="small" /> <span style={{ marginLeft: 8, fontSize: 13, color: '#8c8c8c' }}>AI 思考中...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* 快捷指令 */}
        <div style={{ padding: '8px 16px 4px', display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #f5f5f5' }}>
          {QUICK_CMDS.map(cmd => (
            <span key={cmd}
              style={{ padding: '3px 10px', background: '#f0f5ff', borderRadius: 12, fontSize: 12, color: '#1677ff', cursor: 'pointer', border: '1px solid #d6e4ff' }}
              onClick={() => send(cmd)}>{cmd}</span>
          ))}
        </div>

        {/* 输入框 */}
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 16px', display: 'flex', gap: 10 }}>
          <input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none' }}
            placeholder='输入文件管理需求，如"帮我整理下载文件夹"...'
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            disabled={sending}
          />
          <Button type="primary" onClick={() => send()} icon={<SendOutlined />}
            loading={sending} disabled={!inputText.trim()}>发送</Button>
        </div>
      </div>
    </div>
  );
}
