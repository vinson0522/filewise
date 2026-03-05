import { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from './components/common/AppShell';
import LockScreen from './components/common/LockScreen';
import { hasPassword } from './services/file.service';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function App() {
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    hasPassword()
      .then(has => setLocked(has))
      .catch(() => setLocked(false));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          },
        }}
      >
        {locked === null ? null : locked ? (
          <LockScreen onUnlock={() => setLocked(false)} />
        ) : (
          <AppShell />
        )}
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
