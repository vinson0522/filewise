import { Badge, Button, Tooltip } from 'antd';
import {
  DashboardOutlined, AppstoreOutlined, ClearOutlined,
  SearchOutlined, MessageOutlined, BarChartOutlined,
  SettingOutlined, FolderOpenOutlined, BellOutlined,
  QuestionCircleOutlined, UserOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../stores/useAppStore';
import type { PageKey } from '../../types';
import DashboardPage from '../../pages/DashboardPage';
import PlaceholderPage from './PlaceholderPage';
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
];

const PAGE_MAP: Record<PageKey, React.ReactNode> = {
  dashboard: <DashboardPage />,
  organize:  <PlaceholderPage title="智能整理" desc="AI 自动分析文件内容，智能分类归档" />,
  clean:     <PlaceholderPage title="智能清理" desc="安全释放磁盘空间，所有操作可撤销" />,
  search:    <PlaceholderPage title="智能搜索" desc="自然语言搜索，支持全文检索" />,
  chat:      <PlaceholderPage title="AI 助手"  desc="用自然语言管理你的文件" />,
  report:    <PlaceholderPage title="操作报告" desc="查看历史操作记录与空间变化" />,
  settings:  <PlaceholderPage title="系统设置" desc="配置 AI 模型、监控规则与个人偏好" />,
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
          <Tooltip title="通知">
            <Badge count={3} size="small">
              <Button type="text" size="small" icon={<BellOutlined />} />
            </Badge>
          </Tooltip>
          <Tooltip title="帮助">
            <Button type="text" size="small" icon={<QuestionCircleOutlined />} />
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
