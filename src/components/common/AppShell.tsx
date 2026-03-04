import { Badge, Button, Tooltip } from 'antd';
import {
  DashboardOutlined, AppstoreOutlined, ClearOutlined,
  SearchOutlined, MessageOutlined, BarChartOutlined,
  SettingOutlined, FolderOpenOutlined, BellOutlined,
  QuestionCircleOutlined, UserOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../stores/useAppStore';
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
import '../../styles/app-shell.css';

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ReactNode;
  section: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: '概览',    icon: <DashboardOutlined />, section: '主要' },
  { key: 'organize',  label: '智能整理', icon: <AppstoreOutlined />,  section: '主要' },
  { key: 'clean',     label: '智能清理', icon: <ClearOutlined />,     section: '主要' },
  { key: 'search',    label: '智能搜索', icon: <SearchOutlined />,    section: '主要' },
  { key: 'chat',      label: 'AI 助手', icon: <MessageOutlined />,   section: '主要' },
  { key: 'report',    label: '操作报告', icon: <BarChartOutlined />,  section: '工具' },
  { key: 'settings',  label: '系统设置', icon: <SettingOutlined />,   section: '工具' },
  { key: 'help',      label: '帮助中心', icon: <QuestionCircleOutlined />, section: '工具' },
  { key: 'changelog', label: '版本中心', icon: <BarChartOutlined />,  section: '工具' },
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
};

export default function AppShell() {
  const { currentPage, setCurrentPage } = useAppStore();
  let lastSection = '';

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <FolderOpenOutlined style={{ fontSize: 20 }} />
          <span>FileWise</span>
        </div>
        <div className="header-actions">
          <Tooltip title="版本更新">
            <Badge count={0} size="small">
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
          {NAV_ITEMS.map((item) => {
            const showSection = item.section !== lastSection;
            if (showSection) lastSection = item.section;
            return (
              <div key={item.key}>
                {showSection && (
                  <div className="nav-section">{item.section}</div>
                )}
                <div
                  className={`nav-item${currentPage === item.key ? ' active' : ''}`}
                  onClick={() => setCurrentPage(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </div>
              </div>
            );
          })}
        </aside>

        {/* Content */}
        <main className="app-content">
          {PAGE_MAP[currentPage]}
        </main>
      </div>
    </div>
  );
}
