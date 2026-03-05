import { useState } from 'react';
import { Button, Input, message } from 'antd';
import { LockOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { verifyPassword } from '../../services/file.service';

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [pwd, setPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  async function handleUnlock() {
    if (!pwd.trim()) return;
    setLoading(true);
    try {
      const ok = await verifyPassword(pwd);
      if (ok) {
        onUnlock();
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        message.error('密码错误，请重试');
        setPwd('');
      }
    } catch {
      message.error('验证失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <div
        className={shake ? 'lock-shake' : ''}
        style={{
          background: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: '48px 40px',
          width: 380, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <FolderOpenOutlined style={{ fontSize: 40, color: '#667eea' }} />
          <h2 style={{ margin: '12px 0 4px', fontSize: 22, fontWeight: 600, color: '#1a1a2e' }}>FileWise</h2>
          <p style={{ color: '#8c8c8c', fontSize: 13 }}>请输入密码以解锁应用</p>
        </div>

        <Input.Password
          size="large"
          prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
          placeholder="输入密码"
          value={pwd}
          onChange={e => setPwd(e.target.value)}
          onPressEnter={handleUnlock}
          style={{ marginBottom: 20, borderRadius: 8 }}
          autoFocus
        />

        <Button
          type="primary" block size="large"
          loading={loading}
          onClick={handleUnlock}
          style={{ borderRadius: 8, height: 44, fontWeight: 500,
            background: 'linear-gradient(135deg, #667eea, #764ba2)', border: 'none' }}
        >
          解锁
        </Button>
      </div>

      <style>{`
        .lock-shake {
          animation: shake 0.4s ease-in-out;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-10px); }
          40%, 80% { transform: translateX(10px); }
        }
      `}</style>
    </div>
  );
}
