import { create } from 'zustand';
import type { PageKey, ChatMessage } from '../types';

type ThemeMode = 'light' | 'dark';

interface AppState {
  // 当前页面
  currentPage: PageKey;
  setCurrentPage: (page: PageKey) => void;

  // 全局加载状态
  loading: boolean;
  setLoading: (v: boolean) => void;

  // AI 对话历史
  chatMessages: ChatMessage[];
  appendChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;

  // 当前选中路径
  selectedPath: string;
  setSelectedPath: (path: string) => void;

  // 新手引导
  requestTour: boolean;
  setRequestTour: (v: boolean) => void;

  // 锁屏请求
  lockRequested: boolean;
  setLockRequested: (v: boolean) => void;

  // 主题
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  setCurrentPage: (page) => set({ currentPage: page }),

  loading: false,
  setLoading: (loading) => set({ loading }),

  chatMessages: [
    {
      role: 'ai',
      text: '你好，我是 FileWise 智能助手。你可以告诉我你想做什么，比如"整理桌面文件"或"清理C盘空间"。',
      timestamp: Date.now(),
    },
  ],
  appendChatMessage: (msg) =>
    set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  clearChat: () => set({ chatMessages: [] }),

  selectedPath: '',
  setSelectedPath: (path) => set({ selectedPath: path }),

  requestTour: false,
  setRequestTour: (v) => set({ requestTour: v }),

  lockRequested: false,
  setLockRequested: (v) => set({ lockRequested: v }),

  themeMode: (localStorage.getItem('filewise_theme') as ThemeMode) || 'light',
  toggleTheme: () =>
    set((s) => {
      const next = s.themeMode === 'light' ? 'dark' : 'light';
      localStorage.setItem('filewise_theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return { themeMode: next };
    }),
  setThemeMode: (mode) => {
    localStorage.setItem('filewise_theme', mode);
    document.documentElement.setAttribute('data-theme', mode);
    set({ themeMode: mode });
  },
}));
