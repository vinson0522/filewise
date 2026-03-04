import { useRef, useEffect } from 'react';
import { Button } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { useAppStore } from '../stores/useAppStore';

const QUICK_CMDS = ['帮我整理桌面', '清理C盘临时文件', '查找重复文件', '分析磁盘空间'];

export default function ChatPage() {
  const { chatMessages, appendChatMessage } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  function send() {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    if (inputRef.current) inputRef.current.value = '';
    appendChatMessage({ role: 'user', text, timestamp: Date.now() });
    setTimeout(() => {
      appendChatMessage({
        role: 'ai',
        text: `收到！正在分析「${text}」...\n\n请稍候，我将为您生成操作方案。`,
        timestamp: Date.now(),
      });
    }, 600);
  }

  function sendQuick(cmd: string) {
    appendChatMessage({ role: 'user', text: cmd, timestamp: Date.now() });
    setTimeout(() => {
      appendChatMessage({ role: 'ai', text: `正在处理：${cmd}...\n\n已开始分析，请稍候。`, timestamp: Date.now() });
    }, 600);
  }

  return (
    <div>
      <div className="page-header">
        <h2>AI 助手</h2>
        <p>用自然语言管理你的文件</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
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
                maxWidth: '70%', padding: '12px 16px', borderRadius: 8, fontSize: 14,
                lineHeight: 1.7, whiteSpace: 'pre-line',
                background: m.role === 'ai' ? '#fafafa' : '#1677ff',
                color: m.role === 'ai' ? '#262626' : '#fff',
              }}>
                {m.text}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Quick commands */}
        <div style={{ padding: '8px 20px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {QUICK_CMDS.map(cmd => (
            <span key={cmd} style={{ padding: '4px 10px', background: '#f5f5f5', borderRadius: 4, fontSize: 12, color: '#595959', cursor: 'pointer' }}
              onClick={() => sendQuick(cmd)}>{cmd}</span>
          ))}
        </div>

        {/* Input */}
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '16px 20px', display: 'flex', gap: 12 }}>
          <input
            ref={inputRef}
            style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, padding: '8px 12px', fontSize: 14, outline: 'none' }}
            placeholder='输入指令，如"帮我清理C盘临时文件"...'
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <Button type="primary" onClick={send} icon={<SendOutlined />}>发送</Button>
        </div>
      </div>
    </div>
  );
}
