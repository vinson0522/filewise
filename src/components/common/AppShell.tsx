import { useState, useEffect, useRef } from 'react';
import { Badge, Button, Tooltip, Tour } from 'antd';
import type { TourProps } from 'antd';
import {
  DashboardOutlined, AppstoreOutlined, ClearOutlined,
  SearchOutlined, MessageOutlined, BarChartOutlined,
  SettingOutlined, FolderOpenOutlined, BellOutlined,
  QuestionCircleOutlined, LockOutlined, SafetyCertificateOutlined,
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
import '../../styles/app-shell.css';

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ReactNode;
  section: string;
}

const NAV_MAIN: NavItem[] = [
  { key: 'dashboard', label: '概览',    icon: <DashboardOutlined />, section: '' },
  { key: 'organize',  label: '智能整理', icon: <AppstoreOutlined />,  section: '' },
  { key: 'clean',     label: '智能清理', icon: <ClearOutlined />,     section: '' },
  { key: 'search',    label: '智能搜索', icon: <SearchOutlined />,    section: '' },
  { key: 'chat',      label: 'AI 助手', icon: <MessageOutlined />,   section: '' },
];

const NAV_MORE: NavItem[] = [
  { key: 'report',    label: '操作报告', icon: <BarChartOutlined />,  section: '' },
  { key: 'security',  label: '安全中心', icon: <SafetyCertificateOutlined />, section: '' },
  { key: 'settings',  label: '系统设置', icon: <SettingOutlined />,   section: '' },
  { key: 'help',      label: '帮助',    icon: <QuestionCircleOutlined />, section: '' },
  { key: 'changelog', label: '版本',    icon: <BarChartOutlined />,  section: '' },
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
};

const TOUR_KEY = 'filewise_tour_done';

export default function AppShell() {
  const { currentPage, setCurrentPage, requestTour, setRequestTour, setLockRequested } = useAppStore();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [hasPwd, setHasPwd] = useState(false);

  const refHero = useRef<HTMLDivElement>(null);
  const refNav = useRef<HTMLDivElement>(null);
  const refMore = useRef<HTMLDivElement>(null);
  const refHeader = useRef<HTMLDivElement>(null);
  const refContent = useRef<HTMLElement>(null);

  useEffect(() => {
    checkUpdate()
      .then(info => setUpdateInfo(info))
      .catch(() => {});
    hasPassword().then(setHasPwd).catch(() => {});
    // Show tour on first visit
    if (!localStorage.getItem(TOUR_KEY)) {
      const timer = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  // React to tour replay request from HelpPage
  useEffect(() => {
    if (requestTour) {
      setTourOpen(true);
      setRequestTour(false);
    }
  }, [requestTour, setRequestTour]);

  const tourSteps: TourProps['steps'] = [
    {
      title: '欢迎使用 FileWise！',
      description: '让我带你快速了解主要功能，只需 30 秒。',
      target: null,
    },
    {
      title: '一键体检',
      description: '点击这里全面检测系统健康状态，包括磁盘空间、可清理项、文件索引和健康评分。',
      target: () => refHero.current!,
      placement: 'bottom',
    },
    {
      title: '核心功能导航',
      description: '在这里切换主要功能：智能整理、智能清理、智能搜索和 AI 助手。',
      target: () => refNav.current!,
      placement: 'right',
    },
    {
      title: '更多工具',
      description: '展开查看操作报告、安全中心、系统设置等高级功能。',
      target: () => refMore.current!,
      placement: 'right',
    },
    {
      title: '版本更新 & 帮助',
      description: '查看版本更新提醒和帮助文档。红点表示有新版本可用。',
      target: () => refHeader.current!,
      placement: 'bottomRight',
    },
    {
      title: '开始体验！',
      description: '现在试试点击「一键体检」吧！如需再次查看引导，可在帮助中心找到。',
      target: () => refContent.current!,
      placement: 'left',
    },
  ];

  function closeTour() {
    setTourOpen(false);
    localStorage.setItem(TOUR_KEY, '1');
  }

  const renderNavItem = (item: NavItem) => (
    <div key={item.key}
      className={`nav-item${currentPage === item.key ? ' active' : ''}`}
      onClick={() => setCurrentPage(item.key)}>
      {item.icon}
      <span>{item.label}</span>
    </div>
  );

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <FolderOpenOutlined style={{ fontSize: 20 }} />
          <span>FileWise</span>
        </div>
        <div className="header-actions" ref={refHeader}>
          <Tooltip title={updateInfo?.has_update ? `新版本 v${updateInfo.latest_version} 可用` : '版本更新'}>
            <Badge dot={!!updateInfo?.has_update} offset={[-4, 4]}>
              <Button type="text" size="small" icon={<BellOutlined />}
                onClick={() => setCurrentPage('changelog')} />
            </Badge>
          </Tooltip>
          <Tooltip title="帮助">
            <Button type="text" size="small" icon={<QuestionCircleOutlined />}
              onClick={() => setCurrentPage('help')} />
          </Tooltip>
          {hasPwd && (<>
            <div className="header-divider" />
            <Tooltip title="锁定屏幕">
              <Button type="text" size="small" icon={<LockOutlined />}
                onClick={() => setLockRequested(true)} />
            </Tooltip>
          </>)}
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar */}
        <aside className="app-sider">
          <div className="nav-sider-main" ref={refNav}>
            {NAV_MAIN.map(renderNavItem)}
          </div>
          <div className="nav-sider-more" ref={refMore}>
            <div className="nav-section" style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowMore(!showMore)}>
              {showMore ? '收起 ▴' : '更多 ▾'}
            </div>
            {showMore && NAV_MORE.map(renderNavItem)}
          </div>
        </aside>

        {/* Content */}
        <main className="app-content" ref={refContent}>
          <div ref={refHero}>
            {PAGE_MAP[currentPage]}
          </div>
        </main>
      </div>

      {/* Onboarding Tour */}
      <Tour open={tourOpen} onClose={closeTour} steps={tourSteps} />
    </div>
  );
}
