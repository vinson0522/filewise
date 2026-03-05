import { useState, useEffect, useRef } from 'react';
import { Badge, Tour } from 'antd';
import type { TourProps } from 'antd';
import {
  DashboardOutlined, AppstoreOutlined, ClearOutlined,
  SearchOutlined, MessageOutlined, BarChartOutlined,
  SettingOutlined, FolderOpenOutlined, BellOutlined,
  QuestionCircleOutlined, LockOutlined, SafetyCertificateOutlined,
  PictureOutlined, SunOutlined, MoonOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../stores/useAppStore';
import { checkUpdate, hasPassword } from '../../services/file.service';
import type { UpdateInfo } from '../../services/file.service';
import type { PageKey } from '../../types';
import DashboardPage  from '../../pages/DashboardPage';
import OrganizePage   from '../../pages/OrganizePage';
import CleanPage      from '../../pages/CleanPage';
import SearchPage     from '../../pages/SearchPage';
import ChatPage       from '../../pages/ChatPage';
import ReportPage     from '../../pages/ReportPage';
import SettingsPage   from '../../pages/SettingsPage';
import HelpPage       from '../../pages/HelpPage';
import ChangelogPage  from '../../pages/ChangelogPage';
import SecurityPage  from '../../pages/SecurityPage';
import ImagePage     from '../../pages/ImagePage';
import '../../styles/app-shell.css';

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ReactNode;
}

const NAV_MAIN: NavItem[] = [
  { key: 'dashboard', label: '概览',    icon: <DashboardOutlined /> },
  { key: 'organize',  label: '智能整理', icon: <AppstoreOutlined /> },
  { key: 'clean',     label: '智能清理', icon: <ClearOutlined /> },
  { key: 'search',    label: '智能搜索', icon: <SearchOutlined /> },
  { key: 'chat',      label: 'AI 助手', icon: <MessageOutlined /> },
  { key: 'image',     label: '图片标签', icon: <PictureOutlined /> },
];

const NAV_SECONDARY: NavItem[] = [
  { key: 'report',    label: '操作报告', icon: <BarChartOutlined /> },
  { key: 'security',  label: '安全中心', icon: <SafetyCertificateOutlined /> },
];

const PAGE_MAP: Record<PageKey, React.ReactNode> = {
  dashboard: <DashboardPage />,
  organize:  <OrganizePage />,
  clean:     <CleanPage />,
  search:    <SearchPage />,
  chat:      <ChatPage />,
  report:    <ReportPage />,
  settings:  <SettingsPage />,
  help:      <HelpPage />,
  changelog: <ChangelogPage />,
  security:  <SecurityPage />,
  image:     <ImagePage />,
};

const TOUR_KEY = 'filewise_tour_done';

export default function AppShell() {
  const { currentPage, setCurrentPage, requestTour, setRequestTour, setLockRequested, themeMode, toggleTheme } = useAppStore();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [hasPwd, setHasPwd] = useState(false);

  const refHero = useRef<HTMLDivElement>(null);
  const refNav = useRef<HTMLDivElement>(null);
  const refBottom = useRef<HTMLDivElement>(null);
  const refContent = useRef<HTMLElement>(null);

  useEffect(() => {
    checkUpdate().then(info => setUpdateInfo(info)).catch(() => {});
    hasPassword().then(setHasPwd).catch(() => {});
    if (!localStorage.getItem(TOUR_KEY)) {
      const timer = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (requestTour) { setTourOpen(true); setRequestTour(false); }
  }, [requestTour, setRequestTour]);

  const tourSteps: TourProps['steps'] = [
    { title: '欢迎使用 FileWise！', description: '让我带你快速了解主要功能，只需 30 秒。', target: null },
    { title: '一键体检', description: '点击这里全面检测系统健康状态。', target: () => refHero.current!, placement: 'bottom' },
    { title: '核心功能', description: '在侧边栏切换主要功能。', target: () => refNav.current!, placement: 'right' },
    { title: '设置与帮助', description: '底部可以切换主题、设置和帮助。', target: () => refBottom.current!, placement: 'right' },
    { title: '开始使用', description: '试试点击「一键体检」吧！', target: () => refContent.current!, placement: 'left' },
  ];

  function closeTour() { setTourOpen(false); localStorage.setItem(TOUR_KEY, '1'); }

  const navItem = (item: NavItem) => (
    <div key={item.key}
      className={`nav-item${currentPage === item.key ? ' active' : ''}`}
      onClick={() => setCurrentPage(item.key)}>
      {item.icon}
      <span>{item.label}</span>
    </div>
  );

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Workspace header */}
        <div className="sidebar-head">
          <div className="ws-logo"><FolderOpenOutlined /></div>
          <span className="ws-name">FileWise</span>
          {updateInfo?.has_update && (
            <Badge dot offset={[-2, 2]}>
              <button className="sidebar-icon-btn" onClick={() => setCurrentPage('changelog')}>
                <BellOutlined />
              </button>
            </Badge>
          )}
        </div>

        {/* Main nav */}
        <div className="sidebar-nav" ref={refNav}>
          <div className="nav-group-label">工作区</div>
          {NAV_MAIN.map(navItem)}

          <div className="nav-group-label" style={{ marginTop: 16 }}>工具</div>
          {NAV_SECONDARY.map(navItem)}
        </div>

        {/* Bottom controls */}
        <div className="sidebar-foot" ref={refBottom}>
          <button className="sidebar-icon-btn" onClick={toggleTheme} title={themeMode === 'dark' ? '亮色模式' : '暗色模式'}>
            {themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          </button>
          <button className="sidebar-icon-btn" onClick={() => setCurrentPage('settings')} title="设置">
            <SettingOutlined />
          </button>
          <button className="sidebar-icon-btn" onClick={() => setCurrentPage('help')} title="帮助">
            <QuestionCircleOutlined />
          </button>
          {hasPwd && (
            <button className="sidebar-icon-btn" onClick={() => setLockRequested(true)} title="锁定">
              <LockOutlined />
            </button>
          )}
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="content" ref={refContent}>
        <div ref={refHero}>
          {PAGE_MAP[currentPage]}
        </div>
      </main>

      <Tour open={tourOpen} onClose={closeTour} steps={tourSteps} />
    </div>
  );
}
