import { useState, useEffect, useRef } from 'react';
import { Badge, Tour } from 'antd';
import type { TourProps } from 'antd';
import {
  DashboardOutlined, AppstoreOutlined, ClearOutlined,
  SearchOutlined, MessageOutlined, BarChartOutlined,
  SettingOutlined, FolderOpenOutlined, BellOutlined,
  QuestionCircleOutlined, LockOutlined, SafetyCertificateOutlined,
  PictureOutlined, SunOutlined, MoonOutlined, ToolOutlined,
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

interface NavItem { key: PageKey; label: string; icon: React.ReactNode; }

interface Section {
  key: string;
  label: string;
  icon: React.ReactNode;
  pages: NavItem[];
}

const SECTIONS: Section[] = [
  {
    key: 'overview', label: '概览', icon: <DashboardOutlined />,
    pages: [{ key: 'dashboard', label: '仪表盘', icon: <DashboardOutlined /> }],
  },
  {
    key: 'files', label: '文件管理', icon: <AppstoreOutlined />,
    pages: [
      { key: 'organize', label: '智能整理', icon: <AppstoreOutlined /> },
      { key: 'search',   label: '智能搜索', icon: <SearchOutlined /> },
      { key: 'image',    label: '图片标签', icon: <PictureOutlined /> },
    ],
  },
  {
    key: 'tools', label: '系统工具', icon: <ToolOutlined />,
    pages: [{ key: 'clean', label: '智能清理', icon: <ClearOutlined /> }],
  },
  {
    key: 'ai', label: 'AI 助手', icon: <MessageOutlined />,
    pages: [{ key: 'chat', label: 'AI 对话', icon: <MessageOutlined /> }],
  },
  {
    key: 'data', label: '数据管理', icon: <BarChartOutlined />,
    pages: [
      { key: 'report',   label: '操作报告', icon: <BarChartOutlined /> },
      { key: 'security', label: '安全中心', icon: <SafetyCertificateOutlined /> },
    ],
  },
];

const PAGE_TO_SECTION: Record<string, string> = {};
SECTIONS.forEach(s => s.pages.forEach(p => { PAGE_TO_SECTION[p.key] = s.key; }));

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

  const refRail = useRef<HTMLElement>(null);
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
    { title: '功能分区', description: '左侧图标栏按分类快速切换：概览、文件管理、系统工具、AI 助手、数据管理。', target: () => refRail.current!, placement: 'right' },
    { title: '导航菜单', description: '侧边栏显示当前分类下的具体功能页面，点击即可切换。', target: () => refNav.current!, placement: 'right' },
    { title: '帮助与锁定', description: '底部可以查看帮助中心或锁定应用。', target: () => refBottom.current!, placement: 'right' },
    { title: '一键体检', description: '在仪表盘点击「一键体检」全面检测系统健康状态。', target: () => refHero.current!, placement: 'bottom' },
    { title: '开始探索', description: '试试左侧图标栏，切换不同功能区吧！', target: () => refContent.current!, placement: 'left' },
  ];

  function closeTour() { setTourOpen(false); localStorage.setItem(TOUR_KEY, '1'); }

  /* Determine active section from current page */
  const activeSection = PAGE_TO_SECTION[currentPage] ?? 'overview';
  const currentSectionData = SECTIONS.find(s => s.key === activeSection);

  function handleSectionClick(section: Section) {
    /* If already in this section, do nothing. Otherwise navigate to first page. */
    if (activeSection !== section.key) {
      setCurrentPage(section.pages[0].key);
    }
  }

  return (
    <div className="shell">
      {/* ── Column 1: Activity Bar (48px icon rail) ── */}
      <aside className="activity-bar" ref={refRail}>
        {SECTIONS.map(section => (
          <div key={section.key}
            className={`rail-icon${activeSection === section.key ? ' active' : ''}`}
            onClick={() => handleSectionClick(section)}
            title={section.label}>
            {section.icon}
          </div>
        ))}
        <div className="rail-spacer" />
        <div className="rail-icon"
          onClick={toggleTheme}
          title={themeMode === 'dark' ? '亮色模式' : '暗色模式'}>
          {themeMode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
        </div>
        <div className={`rail-icon${currentPage === 'settings' ? ' active' : ''}`}
          onClick={() => setCurrentPage('settings')}
          title="设置">
          <SettingOutlined />
        </div>
      </aside>

      {/* ── Column 2: Navigation Sidebar (220px) ── */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <FolderOpenOutlined />
          </div>
          <span className="brand-name">FileWise</span>
          {updateInfo?.has_update && (
            <Badge dot offset={[-2, 2]}>
              <button className="sidebar-icon-btn" onClick={() => setCurrentPage('changelog')}>
                <BellOutlined />
              </button>
            </Badge>
          )}
        </div>

        <div className="sidebar-nav" ref={refNav}>
          <p className="nav-group-label">{currentSectionData?.label ?? '导航'}</p>
          {(currentSectionData?.pages ?? []).map((item: NavItem) => (
            <div key={item.key}
              className={`nav-item${currentPage === item.key ? ' active' : ''}`}
              onClick={() => setCurrentPage(item.key)}>
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="sidebar-foot" ref={refBottom}>
          <button className="sidebar-icon-btn" onClick={() => setCurrentPage('help')} title="帮助中心">
            <QuestionCircleOutlined />
          </button>
          {hasPwd && (
            <button className="sidebar-icon-btn" onClick={() => setLockRequested(true)} title="锁定">
              <LockOutlined />
            </button>
          )}
        </div>
      </nav>

      {/* ── Column 3: Main Content ── */}
      <main className={`content${currentPage === 'chat' ? ' content--chat' : ''}`} ref={refContent}>
        <div ref={refHero} style={{ height: '100%' }}>
          {PAGE_MAP[currentPage]}
        </div>
      </main>

      <Tour open={tourOpen} onClose={closeTour} steps={tourSteps} />
    </div>
  );
}
