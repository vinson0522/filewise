import { useState, useEffect } from 'react';
import { Badge, Button, Tooltip } from 'antd';
import {
  DashboardOutlined, AppstoreOutlined, ClearOutlined,
  SearchOutlined, MessageOutlined, BarChartOutlined,
  SettingOutlined, FolderOpenOutlined, BellOutlined,
  QuestionCircleOutlined, UserOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../stores/useAppStore';
import { checkUpdate } from '../../services/file.service';
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

export default function AppShell() {
  const { currentPage, setCurrentPage } = useAppStore();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    checkUpdate()
      .then(info => setUpdateInfo(info))
      .catch(() => {});
  }, []);

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
        <div className="header-actions">
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
          <div className="header-divider" />
          <div className="header-user">
            <div className="user-avatar"><UserOutlined /></div>
            <span className="user-name">用户</span>
          </div>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar */}
        <aside className="app-sider">
          <div className="nav-sider-main">
            {NAV_MAIN.map(renderNavItem)}
          </div>
          <div className="nav-sider-more">
            <div className="nav-section" style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowMore(!showMore)}>
              {showMore ? '收起 ▴' : '更多 ▾'}
            </div>
            {showMore && NAV_MORE.map(renderNavItem)}
          </div>
        </aside>

        {/* Content */}
        <main className="app-content">
          {PAGE_MAP[currentPage]}
        </main>
      </div>
    </div>
  );
}
