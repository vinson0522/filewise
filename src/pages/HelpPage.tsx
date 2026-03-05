import { useState } from 'react';
import { Tabs, Button } from 'antd';
import {
  BookOutlined, FileProtectOutlined, LockOutlined,
  DesktopOutlined, SearchOutlined, DeleteOutlined,
  FolderOpenOutlined, RobotOutlined, DashboardOutlined,
  SafetyOutlined, CompassOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/useAppStore';

const sectionStyle: React.CSSProperties = { fontSize: 14, lineHeight: 2, color: '#595959' };
const h3Style: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: '#262626', margin: '20px 0 8px' };
const h4Style: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#262626', margin: '14px 0 6px' };

function GuideContent() {
  return (
    <div style={sectionStyle}>
      <h3 style={{ ...h3Style, marginTop: 0 }}><DashboardOutlined /> 概览仪表盘</h3>
      <p>首页展示文件系统整体状态：索引文件数、总大小、可释放空间、健康评分。磁盘使用和文件分类分布一目了然。</p>

      <h3 style={h3Style}><FolderOpenOutlined /> 智能整理</h3>
      <p>选择目标目录后，FileWise 会扫描其中的文件，按类型（文档/图片/视频/音频/代码/压缩包等）或日期自动归档到子文件夹。操作前自动创建快照，支持一键撤销。</p>
      <h4 style={h4Style}>操作步骤</h4>
      <ol>
        <li>点击左侧「智能整理」进入整理页面</li>
        <li>点击「选择目录」选择要整理的文件夹</li>
        <li>选择整理模式：按类型 或 按日期</li>
        <li>确认后自动完成归档</li>
      </ol>

      <h3 style={h3Style}><DeleteOutlined /> 智能清理</h3>
      <p>一键扫描系统临时文件、浏览器缓存、开发缓存（node_modules/.gradle等）、空文件夹、回收站，显示可释放空间并安全清理。</p>
      <h4 style={h4Style}>附加功能</h4>
      <ul>
        <li><strong>重复文件检测</strong>：使用 BLAKE3 哈希精确查找重复文件，显示每组重复文件的浪费空间</li>
        <li><strong>大文件扫描</strong>：扫描超过阈值的大文件（默认100MB，可在设置中调整）</li>
      </ul>

      <h3 style={h3Style}><SearchOutlined /> 智能搜索</h3>
      <p>对已索引目录进行全文件名搜索，支持按类型、大小范围、日期范围筛选。首次使用需先建立索引。</p>
      <h4 style={h4Style}>建立索引</h4>
      <ol>
        <li>在搜索页面点击「索引目录」</li>
        <li>选择要索引的文件夹（如 D:\）</li>
        <li>等待扫描完成后即可快速搜索</li>
      </ol>

      <h3 style={h3Style}><RobotOutlined /> AI 助手</h3>
      <p>内置 AI 助手可以理解自然语言，自动执行文件管理操作。支持本地 Ollama 模型和云端 AI（通义千问/DeepSeek/Moonshot等）。</p>
      <h4 style={h4Style}>支持的指令示例</h4>
      <ul>
        <li>「分析磁盘空间占用」→ 自动扫描并展示磁盘使用详情</li>
        <li>「清理临时文件」→ 自动扫描可清理内容</li>
        <li>「扫描重复文件」→ 自动查找重复文件</li>
        <li>「整理桌面文件」→ 自动扫描并分类</li>
        <li>「搜索 报告.pdf」→ 在索引中搜索文件</li>
      </ul>

      <h3 style={h3Style}><SafetyOutlined /> 安全机制</h3>
      <ul>
        <li><strong>操作快照</strong>：每次文件操作前自动创建快照，可在报告页面一键恢复</li>
        <li><strong>隔离区</strong>：删除的文件先移入隔离区保留30天，随时可恢复原位</li>
        <li><strong>路径保护</strong>：系统关键目录（Windows/Program Files）受保护，不会被误操作</li>
        <li><strong>完整性校验</strong>：文件移动后使用 BLAKE3 校验，确保数据完整</li>
      </ul>

      <h3 style={h3Style}><DesktopOutlined /> 系统设置</h3>
      <ul>
        <li>AI 模型切换（本地/云端）</li>
        <li>监控目录和排除规则配置</li>
        <li>索引存放路径和隔离区目录可自定义</li>
        <li>大文件阈值调整</li>
        <li>开机自启动 / 最小化到托盘</li>
      </ul>
    </div>
  );
}

function UserAgreement() {
  return (
    <div style={sectionStyle}>
      <h3 style={{ ...h3Style, marginTop: 0 }}>FileWise 用户服务协议</h3>
      <p style={{ color: '#8c8c8c', fontSize: 12 }}>最后更新：2026 年 3 月 4 日</p>

      <h4 style={h4Style}>一、服务说明</h4>
      <p>FileWise 是一款本地运行的智能文件管理桌面应用程序（以下简称「本软件」），提供文件整理、清理、搜索、AI 辅助等功能。本软件所有核心功能均在用户本地设备上运行，不强制要求联网。</p>

      <h4 style={h4Style}>二、用户责任</h4>
      <ol>
        <li>用户应确保对操作的文件和目录拥有合法的访问和修改权限。</li>
        <li>用户应在使用清理、整理等功能前确认操作范围，避免误删重要文件。</li>
        <li>虽然本软件提供快照和隔离区等安全机制，但用户仍应自行备份重要数据。</li>
        <li>用户不得将本软件用于任何违反当地法律法规的活动。</li>
      </ol>

      <h4 style={h4Style}>三、免责声明</h4>
      <ol>
        <li>本软件按「现状」提供，不对因使用本软件导致的任何数据损失承担责任。</li>
        <li>AI 功能（包括本地和云端模型）的输出结果仅供参考，用户应自行判断其准确性。</li>
        <li>使用云端 AI 服务时，相关 API 调用费用由用户自行承担。</li>
      </ol>

      <h4 style={h4Style}>四、知识产权</h4>
      <p>本软件的界面设计、代码、文档等知识产权归开发者所有。用户可按授权许可范围使用本软件。</p>

      <h4 style={h4Style}>五、协议变更</h4>
      <p>本协议可能因功能更新而调整，更新后的协议将在软件内公示。继续使用即视为同意变更后的协议。</p>
    </div>
  );
}

function PrivacyPolicy() {
  return (
    <div style={sectionStyle}>
      <h3 style={{ ...h3Style, marginTop: 0 }}>FileWise 隐私政策</h3>
      <p style={{ color: '#8c8c8c', fontSize: 12 }}>最后更新：2026 年 3 月 4 日</p>

      <h4 style={h4Style}>一、数据收集</h4>
      <p>FileWise 重视用户隐私。本软件的核心原则是：<strong>所有数据保留在用户本地设备</strong>。</p>
      <ul>
        <li><strong>文件索引数据</strong>：文件名、路径、大小、修改时间等元信息仅存储在本地 SQLite 数据库中。</li>
        <li><strong>操作日志</strong>：文件操作的审计日志仅存储在本地数据库中，不上传至任何服务器。</li>
        <li><strong>设置信息</strong>：用户配置（包括监控目录、排除规则等）存储在本地。</li>
      </ul>

      <h4 style={h4Style}>二、AI 服务</h4>
      <ul>
        <li><strong>本地 AI（Ollama）</strong>：使用本地模型时，所有对话数据不离开用户设备。</li>
        <li><strong>云端 AI</strong>：选择使用云端 AI 服务时，用户的对话内容会发送到所选云端服务商的 API。这些数据受对应服务商的隐私政策约束。用户可在设置中自主选择是否启用云端服务。</li>
      </ul>

      <h4 style={h4Style}>三、API Key 安全</h4>
      <p>用户配置的云端 AI API Key 以明文存储在本地数据库中，不会传输至本软件的开发者或任何第三方（仅发送至用户选择的 AI 服务商）。建议用户妥善保管设备安全。</p>

      <h4 style={h4Style}>四、网络请求</h4>
      <p>本软件仅在以下情况下发起网络请求：</p>
      <ol>
        <li>连接本地 Ollama 服务（localhost:11434）</li>
        <li>用户主动启用云端 AI 时，调用对应厂商 API</li>
        <li>未来版本可能的更新检查（可在设置中关闭）</li>
      </ol>

      <h4 style={h4Style}>五、数据删除</h4>
      <p>用户可随时卸载本软件。卸载后，所有本地存储的索引、日志、设置数据将被清除。隔离区中的文件位于用户磁盘上，需手动清理对应目录。</p>

      <h4 style={h4Style}>六、联系方式</h4>
      <p>如对本隐私政策有任何疑问，请通过软件内反馈渠道或项目仓库联系开发团队。</p>
    </div>
  );
}

export default function HelpPage() {
  const [activeTab, setActiveTab] = useState('guide');
  const { setCurrentPage, setRequestTour } = useAppStore();

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>帮助中心</h2>
          <p>使用说明、用户协议与隐私政策</p>
        </div>
        <Button icon={<CompassOutlined />} onClick={() => {
          localStorage.removeItem('filewise_tour_done');
          setCurrentPage('dashboard');
          setTimeout(() => setRequestTour(true), 400);
        }}>重新查看引导</Button>
      </div>

      <div className="section-card">
        <div className="section-card-body" style={{ padding: '8px 20px 20px' }}>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
            { key: 'guide', label: <span><BookOutlined /> 使用教程</span>, children: <GuideContent /> },
            { key: 'agreement', label: <span><FileProtectOutlined /> 用户协议</span>, children: <UserAgreement /> },
            { key: 'privacy', label: <span><LockOutlined /> 隐私政策</span>, children: <PrivacyPolicy /> },
          ]} />
        </div>
      </div>
    </div>
  );
}
