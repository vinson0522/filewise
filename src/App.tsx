import { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from './components/common/AppShell';
import LockScreen from './components/common/LockScreen';
import { hasPassword } from './services/file.service';
import { useAppStore } from './stores/useAppStore';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function App() {
  const [locked, setLocked] = useState<boolean | null>(null);
  const { lockRequested, setLockRequested, themeMode } = useAppStore();

  // Set data-theme attribute on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    hasPassword()
      .then(has => setLocked(has))
      .catch(() => setLocked(false));
  }, []);

  useEffect(() => {
    if (lockRequested) {
      setLocked(true);
      setLockRequested(false);
    }
  }, [lockRequested, setLockRequested]);

  const isDark = themeMode === 'dark';

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: '#5b5bd6',
            borderRadius: 6,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
            ...(isDark ? {
              colorBgContainer: '#19191c',
              colorBgElevated: '#232326',
              colorBorder: '#2c2c30',
              colorText: '#ececee',
              colorTextSecondary: '#8b8d98',
            } : {}),
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
