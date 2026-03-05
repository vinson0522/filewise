import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Tag, Spin, Alert, Tooltip, Popconfirm, Empty, Badge, Input } from 'antd';
import {
  SendOutlined, RobotOutlined, UserOutlined, ReloadOutlined, ArrowRightOutlined,
  PlusOutlined, DeleteOutlined, EditOutlined, ClearOutlined,
  FileOutlined, PictureOutlined, ThunderboltOutlined, BulbOutlined,
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
  CloudOutlined, PlayCircleOutlined, PauseOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../stores/useAppStore';
import {
  aiChat, aiChatStream, checkOllama, readFilePreview, aiVisionChat,
  readImageBase64, getUserBehaviorSummary, getProactiveSuggestions,
  createChatSession, listChatSessions, getChatMessages, saveChatMessage,
  deleteChatSession, renameChatSession, clearChatMessages,
} from '../services/file.service';
import type { ChatMessage as BackendChatMsg } from '../services/file.service';
import {
  detectAndExecute, parseAIActions, stripActionBlocks, executeAIAction,
  buildTaskPlan, classifyIntent,
} from '../services/agent';
import type { PageKey, ChatMessage, ChatSession, TaskPlanStep, Suggestion } from '../types';
import Markdown from 'react-markdown';
import { formatSize } from '../utils/path.util';

const MAX_REACT_TURNS = 8;

const QUICK_CMDS = [
  { label: '系统体检', icon: <ThunderboltOutlined />, cmd: '帮我做一次系统健康检查' },
  { label: '清理缓存', icon: <ClearOutlined />, cmd: '清理临时文件和缓存' },
  { label: '重复文件', icon: <FileOutlined />, cmd: '扫描重复文件' },
  { label: '磁盘分析', icon: <CloudOutlined />, cmd: '分析磁盘空间占用' },
  { label: '全面优化', icon: <ThunderboltOutlined />, cmd: '全面体检然后清理' },
  { label: '大文件扫描', icon: <FileOutlined />, cmd: '帮我扫描大文件' },
];

// ————————————————————————————————————————
// 内嵌交互组件：任务计划
// ————————————————————————————————————————
function TaskPlanWidget({ steps, onExecute }: { steps: TaskPlanStep[]; onExecute: (steps: TaskPlanStep[]) => void }) {
  return (
    <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#389e0d' }}>
        <PlayCircleOutlined /> 执行计划（{steps.length} 步）
      </div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
          {s.status === 'done' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> :
           s.status === 'running' ? <Spin size="small" /> :
           s.status === 'error' ? <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} /> :
           <ClockCircleOutlined style={{ color: '#d9d9d9' }} />}
          <span style={{ color: s.status === 'done' ? '#52c41a' : s.status === 'error' ? '#ff4d4f' : '#262626' }}>
            {i + 1}. {s.description}
          </span>
          {s.result && <Tag color="blue" style={{ marginLeft: 'auto', fontSize: 11 }}>{s.result}</Tag>}
        </div>
      ))}
      {steps.every(s => s.status === 'pending') && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => onExecute(steps)}>全部执行</Button>
        </div>
      )}
    </div>
  );
}

// ————————————————————————————————————————
// 内嵌交互组件：建议列表
// ————————————————————————————————————————
function SuggestionWidget({ suggestions, onAction }: { suggestions: Suggestion[]; onAction: (s: Suggestion) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {suggestions.map((s, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', marginBottom: 6,
          background: s.type === 'warning' ? '#fff2e8' : s.type === 'tip' ? '#e6f7ff' : '#f6ffed',
          border: `1px solid ${s.type === 'warning' ? '#ffbb96' : s.type === 'tip' ? '#91d5ff' : '#b7eb8f'}`,
          borderRadius: 6, fontSize: 13, cursor: s.action ? 'pointer' : 'default',
        }} onClick={() => s.action && onAction(s)}>
          <Badge color={s.type === 'warning' ? 'red' : s.type === 'tip' ? 'blue' : 'green'} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{s.title}</div>
            <div style={{ color: '#8c8c8c', fontSize: 12 }}>{s.message}</div>
          </div>
          {s.action && <ArrowRightOutlined style={{ color: '#8c8c8c', marginTop: 4 }} />}
        </div>
      ))}
    </div>
  );
}

// ————————————————————————————————————————
// 主组件
// ————————————————————————————————————————
export default function ChatPage() {
  const { chatMessages, appendChatMessage, clearChat, setCurrentPage } = useAppStore();
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [agentStatus, setAgentStatus] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 会话管理
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // 建议
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  // 拖拽
  const [dragOver, setDragOver] = useState(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [chatMessages.length, streamingText, scrollToBottom]);

  // 初始化
  useEffect(() => {
    checkOllama().then(setOllamaOnline).catch(() => setOllamaOnline(false));
    loadSessions();
    getProactiveSuggestions().then(setSuggestions).catch(() => {});
  }, []);

  // ————————————————————————————————————————
  // 会话管理
  // ————————————————————————————————————————
  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const list = await listChatSessions();
      setSessions(list);
    } catch { /* ignore */ }
    setSessionsLoading(false);
  }

  async function handleNewSession() {
    try {
      const session = await createChatSession();
      setSessions(prev => [session, ...prev]);
      setCurrentSessionId(session.id);
      clearChat();
      appendChatMessage({ role: 'ai', text: '你好！新对话已创建。请告诉我你想做什么。', timestamp: Date.now() });
    } catch { /* ignore */ }
  }

  async function handleSelectSession(id: string) {
    if (id === currentSessionId) return;
    setCurrentSessionId(id);
    clearChat();
    try {
      const msgs = await getChatMessages(id);
      for (const m of msgs) {
        appendChatMessage({
          role: m.role === 'assistant' ? 'ai' : m.role as 'ai' | 'user',
          text: m.content,
          timestamp: new Date(m.created_at).getTime(),
          widget: m.widget_type ? { type: m.widget_type as NonNullable<ChatMessage['widget']>['type'], data: m.widget_data ? JSON.parse(m.widget_data) : null } : undefined,
        });
      }
    } catch { /* ignore */ }
  }

  async function handleDeleteSession(id: string) {
    try {
      await deleteChatSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        clearChat();
        appendChatMessage({ role: 'ai', text: '你好，我是 FileWise 智能助手。你可以告诉我你想做什么，比如"整理桌面文件"或"清理C盘空间"。', timestamp: Date.now() });
      }
    } catch { /* ignore */ }
  }

  async function handleRenameSession(id: string, title: string) {
    try {
      await renameChatSession(id, title);
      setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
      setEditingTitle(null);
    } catch { /* ignore */ }
  }

  // 保存消息到当前会话
  async function persistMessage(role: string, content: string, widgetType?: string, widgetData?: string) {
    if (!currentSessionId) {
      // 自动创建会话
      try {
        const title = content.slice(0, 20) + (content.length > 20 ? '...' : '');
        const session = await createChatSession(title);
        setSessions(prev => [session, ...prev]);
        setCurrentSessionId(session.id);
        await saveChatMessage(session.id, role, content, undefined, undefined, widgetType, widgetData);
      } catch { /* ignore */ }
    } else {
      try {
        await saveChatMessage(currentSessionId, role, content, undefined, undefined, widgetType, widgetData);
      } catch { /* ignore */ }
    }
  }

  // ————————————————————————————————————————
  // 发送消息 (核心逻辑)
  // ————————————————————————————————————————
  async function send(text?: string) {
    const msg = (text ?? inputText).trim();
    if (!msg || sending) return;
    setInputText('');
    setSending(true);
    setAgentStatus('');
    setStreamingText('');

    appendChatMessage({ role: 'user', text: msg, timestamp: Date.now() });
    persistMessage('user', msg);

    try {
      // Step 0: 检查是否是复合任务，生成计划
      const plan = buildTaskPlan(msg);
      if (plan) {
        await executePlan(plan, msg);
        return;
      }

      // Step 1: 意图分类 + 快速执行
      const intent = classifyIntent(msg);
      if (intent !== 'general_chat') {
        setAgentStatus(`识别意图: ${intent}，正在执行...`);
        const agentResult = await detectAndExecute(msg, setAgentStatus);
        if (agentResult) {
          appendChatMessage({ role: 'ai', text: agentResult.text, timestamp: Date.now(), actionResult: agentResult.result });
          persistMessage('assistant', agentResult.text);

          // AI follow-up
          if (ollamaOnline) {
            try {
              const contextMsg = `用户说："${msg}"\n\nFileWise 已执行「${agentResult.result.label}」，结果：\n${agentResult.text}\n\n请给 1-3 条简短后续建议。`;
              const history: BackendChatMsg[] = [{ role: 'user', content: contextMsg }];
              if (useStreaming) {
                await streamReply(history, true);
              } else {
                const reply = await aiChat(history);
                appendChatMessage({ role: 'ai', text: reply, timestamp: Date.now() });
                persistMessage('assistant', reply);
              }
            } catch { /* skip */ }
          }
          return;
        }
      }

      // Step 2: AI chat with ReAct loop (streaming)
      await reactLoop(msg);
    } catch (e) {
      const errText = `\u26a0\ufe0f 执行失败：${String(e)}`;
      appendChatMessage({ role: 'ai', text: errText, timestamp: Date.now() });
      persistMessage('assistant', errText);
    } finally {
      setSending(false);
      setAgentStatus('');
      setStreamingText('');
    }
  }

  // ————————————————————————————————————————
  // 流式回复
  // ————————————————————————————————————————
  async function streamReply(history: BackendChatMsg[], isSuggestion = false): Promise<string> {
    return new Promise(async (resolve, reject) => {
      let buffer = '';
      const unlistenChunk = await listen<string>('ai-stream-chunk', (e) => {
        buffer += e.payload;
        setStreamingText(isSuggestion ? buffer : buffer);
      });
      const unlistenDone = await listen('ai-stream-done', () => {
        unlistenChunk();
        unlistenDone();
        setStreamingText('');
        const finalText = isSuggestion ? buffer : buffer;
        appendChatMessage({ role: 'ai', text: finalText, timestamp: Date.now() });
        persistMessage('assistant', finalText);
        resolve(buffer);
      });

      try {
        await aiChatStream(history);
      } catch (e) {
        unlistenChunk();
        unlistenDone();
        setStreamingText('');
        reject(e);
      }
    });
  }

  // ————————————————————————————————————————
  // 任务计划执行器
  // ————————————————————————————————————————
  async function executePlan(plan: TaskPlanStep[], userMsg: string) {
    const steps = [...plan];
    appendChatMessage({
      role: 'ai', text: `我来制定执行计划：`, timestamp: Date.now(),
      widget: { type: 'task_plan', data: steps },
    });

    const results: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      steps[i].status = 'running';
      setAgentStatus(`执行步骤 ${i + 1}/${steps.length}: ${steps[i].description}`);

      try {
        const { observation, result } = await executeAIAction({ tool: steps[i].tool, params: steps[i].params }, setAgentStatus);
        steps[i].status = 'done';
        steps[i].result = observation.slice(0, 100);
        results.push(`${steps[i].description}: ${observation}`);

        if (result.navigateTo && steps[i].tool === 'navigate') {
          setCurrentPage(result.navigateTo as PageKey);
        }
      } catch (e) {
        steps[i].status = 'error';
        steps[i].result = String(e);
        results.push(`${steps[i].description}: 失败 - ${String(e)}`);
      }
    }

    // 展示汇总
    const summary = results.map((r, i) => `${i + 1}. ${r}`).join('\n');
    appendChatMessage({
      role: 'ai',
      text: `执行完成！结果汇总：\n\n${summary}`,
      timestamp: Date.now(),
      widget: { type: 'task_plan', data: steps },
    });
    persistMessage('assistant', `任务计划执行完成：\n${summary}`);

    // AI 总结
    if (ollamaOnline) {
      try {
        const summaryMsg = `用户要求："${userMsg}"\n\n已自动执行计划，结果：\n${summary}\n\n请给出简短总结和建议。`;
        if (useStreaming) {
          await streamReply([{ role: 'user' as const, content: summaryMsg }], true);
        } else {
          const reply = await aiChat([{ role: 'user' as const, content: summaryMsg }]);
          appendChatMessage({ role: 'ai', text: reply, timestamp: Date.now() });
          persistMessage('assistant', reply);
        }
      } catch { /* skip */ }
    }
  }

  // ————————————————————————————————————————
  // ReAct loop (with streaming + context enhancement)
  // ————————————————————————————————————————
  async function reactLoop(userMsg: string) {
    // 注入上下文
    let contextPrefix = '';
    try {
      const behavior = await getUserBehaviorSummary();
      if (behavior) contextPrefix += `\n[用户行为摘要] ${behavior}`;
    } catch { /* skip */ }

    const history: BackendChatMsg[] = chatMessages
      .slice(-16)
      .map(m => ({ role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text }));
    history.push({ role: 'user' as const, content: contextPrefix ? `${userMsg}\n${contextPrefix}` : userMsg });

    let lastActionResult = undefined;

    for (let turn = 0; turn < MAX_REACT_TURNS; turn++) {
      setAgentStatus(turn === 0 ? 'AI 思考中...' : `Agent 第 ${turn + 1} 轮思考...`);

      let reply: string;
      if (useStreaming && turn === 0) {
        // 第一轮用流式显示
        try {
          reply = await streamReply(history);
        } catch {
          reply = await aiChat(history);
          appendChatMessage({ role: 'ai', text: reply, timestamp: Date.now() });
          persistMessage('assistant', reply);
        }
      } else {
        reply = await aiChat(history);
      }

      const actions = parseAIActions(reply);
      const displayText = stripActionBlocks(reply);

      if (actions.length === 0) {
        // 没有流式时才添加消息（流式已经在 streamReply 中添加了）
        if (!useStreaming || turn > 0) {
          appendChatMessage({ role: 'ai', text: displayText || reply, timestamp: Date.now(), actionResult: lastActionResult });
          persistMessage('assistant', displayText || reply);
        }
        break;
      }

      if (displayText && (!useStreaming || turn > 0)) {
        appendChatMessage({ role: 'ai', text: displayText, timestamp: Date.now() });
        persistMessage('assistant', displayText);
      }

      const observations: string[] = [];
      for (const action of actions) {
        setAgentStatus(`正在执行: ${action.tool}...`);
        try {
          const { observation, result } = await executeAIAction(action, setAgentStatus);
          observations.push(`[${action.tool}] ${observation}`);
          lastActionResult = result;

          if (action.tool === 'navigate' && result.navigateTo) {
            setCurrentPage(result.navigateTo as PageKey);
          }

          appendChatMessage({
            role: 'ai',
            text: `**${action.tool}** 执行完成：\n\n${observation}`,
            timestamp: Date.now(),
            actionResult: result,
          });
          persistMessage('assistant', `${action.tool}: ${observation}`);
        } catch (e) {
          observations.push(`[${action.tool}] 执行失败: ${String(e)}`);
        }
      }

      history.push({ role: 'assistant' as const, content: reply });
      history.push({
        role: 'user' as const,
        content: `[OBSERVATION] 工具执行结果：\n${observations.join('\n')}\n\n请根据结果继续回答。如果任务完成，直接总结。`,
      });
    }
  }

  // ————————————————————————————————————————
  // 文件拖拽处理
  // ————————————————————————————————————————
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    setSending(true);
    setAgentStatus('正在分析拖入的文件...');

    try {
      for (const file of files.slice(0, 5)) {
        const filePath = (file as unknown as { path?: string }).path || file.name;
        const isImage = /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(file.name);

        appendChatMessage({ role: 'user', text: `[拖入文件] ${file.name} (${formatSize(file.size)})`, timestamp: Date.now() });
        persistMessage('user', `拖入文件: ${file.name}`);

        if (isImage && filePath && ollamaOnline) {
          // 图片：用视觉模型分析
          setAgentStatus(`AI 分析图片: ${file.name}...`);
          try {
            const desc = await aiVisionChat(filePath, '请描述这张图片的内容，建议合适的标签和归档目录。使用中文回答。');
            const imgSrc = await readImageBase64(filePath);
            appendChatMessage({
              role: 'ai',
              text: `**图片分析结果：**\n\n${desc}`,
              timestamp: Date.now(),
              widget: { type: 'image_preview', data: { src: imgSrc, name: file.name, path: filePath } },
            });
            persistMessage('assistant', desc, 'image_preview', JSON.stringify({ name: file.name, path: filePath }));
          } catch (err) {
            appendChatMessage({ role: 'ai', text: `图片分析失败：${String(err)}`, timestamp: Date.now() });
          }
        } else if (filePath) {
          // 普通文件：读取预览
          try {
            const preview = await readFilePreview(filePath);
            appendChatMessage({
              role: 'ai',
              text: `**文件预览：**\n\n\`\`\`\n${preview.slice(0, 500)}\n\`\`\``,
              timestamp: Date.now(),
            });
            persistMessage('assistant', preview.slice(0, 500));

            // AI 分析
            if (ollamaOnline) {
              const aiMsg = `用户拖入文件 "${file.name}" (${formatSize(file.size)})，内容预览：\n${preview.slice(0, 500)}\n\n请分析这个文件并给出建议（归档位置、是否重要等）。`;
              if (useStreaming) {
                await streamReply([{ role: 'user' as const, content: aiMsg }]);
              } else {
                const reply = await aiChat([{ role: 'user' as const, content: aiMsg }]);
                appendChatMessage({ role: 'ai', text: reply, timestamp: Date.now() });
                persistMessage('assistant', reply);
              }
            }
          } catch {
            appendChatMessage({ role: 'ai', text: `无法预览文件 ${file.name}`, timestamp: Date.now() });
          }
        }
      }
    } finally {
      setSending(false);
      setAgentStatus('');
    }
  }

  // ————————————————————————————————————————
  // 渲染
  // ————————————————————————————————————————
  const statusTag = ollamaOnline === null
    ? <Tag color="default"><Spin size="small" /> 检测中</Tag>
    : ollamaOnline
      ? <Tag color="success">Ollama 在线</Tag>
      : <Tag color="error">Ollama 离线</Tag>;

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* 左侧：会话列表 */}
      <div style={{
        width: 200, flexShrink: 0, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column',
        background: '#fafafa',
      }}>
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f0f0f0' }}>
          <Button type="primary" block size="small" icon={<PlusOutlined />} onClick={handleNewSession}>
            新建对话
          </Button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {sessionsLoading ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
          ) : sessions.length === 0 ? (
            <Empty description="暂无历史对话" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 20 }} />
          ) : sessions.map(s => (
            <div key={s.id}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                background: s.id === currentSessionId ? '#e6f4ff' : 'transparent',
                borderLeft: s.id === currentSessionId ? '3px solid #1677ff' : '3px solid transparent',
              }}
              onClick={() => handleSelectSession(s.id)}
            >
              {editingTitle === s.id ? (
                <Input size="small" value={newTitle} autoFocus
                  onChange={e => setNewTitle(e.target.value)}
                  onPressEnter={() => handleRenameSession(s.id, newTitle)}
                  onBlur={() => setEditingTitle(null)}
                  style={{ flex: 1 }}
                />
              ) : (
                <>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </span>
                  <span style={{ fontSize: 11, color: '#bfbfbf', flexShrink: 0 }}>{s.message_count}</span>
                  <Tooltip title="重命名">
                    <EditOutlined style={{ fontSize: 12, color: '#bfbfbf' }}
                      onClick={(e) => { e.stopPropagation(); setEditingTitle(s.id); setNewTitle(s.title); }} />
                  </Tooltip>
                  <Popconfirm title="确定删除？" onConfirm={(e) => { e?.stopPropagation(); handleDeleteSession(s.id); }}
                    onCancel={(e) => e?.stopPropagation()}>
                    <DeleteOutlined style={{ fontSize: 12, color: '#bfbfbf' }} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                </>
              )}
            </div>
          ))}
        </div>
        {/* 建议区域 */}
        {suggestions.length > 0 && (
          <div style={{ borderTop: '1px solid #f0f0f0', padding: 8 }}>
            <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
              <BulbOutlined /> AI 建议
            </div>
            {suggestions.slice(0, 3).map((s, i) => (
              <div key={i} style={{
                fontSize: 11, padding: '4px 6px', marginBottom: 3, borderRadius: 4, cursor: 'pointer',
                background: s.type === 'warning' ? '#fff2e8' : '#f0f5ff',
                color: s.type === 'warning' ? '#d4380d' : '#1677ff',
              }} onClick={() => s.action && send(`${s.title}`)}>
                <Badge color={s.type === 'warning' ? 'red' : 'blue'} text={s.title} style={{ fontSize: 11 }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：聊天主区域 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 头部 */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>AI 智能助手</span>
            {statusTag}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Tooltip title={useStreaming ? '流式模式' : '普通模式'}>
              <Button size="small" type={useStreaming ? 'primary' : 'default'}
                icon={useStreaming ? <ThunderboltOutlined /> : <PauseOutlined />}
                onClick={() => setUseStreaming(!useStreaming)}>
                {useStreaming ? '流式' : '普通'}
              </Button>
            </Tooltip>
            <Button size="small" icon={<ReloadOutlined />}
              onClick={() => { setOllamaOnline(null); checkOllama().then(setOllamaOnline).catch(() => setOllamaOnline(false)); }}>
              重检
            </Button>
            <Popconfirm title="清空当前对话？" onConfirm={() => {
              clearChat();
              if (currentSessionId) clearChatMessages(currentSessionId).catch(() => {});
              appendChatMessage({ role: 'ai', text: '对话已清空。请告诉我你想做什么。', timestamp: Date.now() });
            }}>
              <Button size="small" icon={<ClearOutlined />}>清空</Button>
            </Popconfirm>
          </div>
        </div>

        {ollamaOnline === false && (
          <Alert type="warning" showIcon style={{ margin: '8px 16px 0' }} message="Ollama 未运行"
            description="请安装 Ollama 并运行 ollama serve，然后拉取模型。" closable />
        )}

        {/* 消息列表 + 拖拽区 */}
        <div
          style={{
            flex: 1, overflowY: 'auto', padding: '16px 20px', position: 'relative',
            ...(dragOver ? { background: '#e6f4ff', border: '2px dashed #1677ff', borderRadius: 8 } : {}),
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {dragOver && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(22,119,255,0.06)', zIndex: 10, borderRadius: 8,
            }}>
              <div style={{ textAlign: 'center' }}>
                <InboxOutlined style={{ fontSize: 48, color: '#1677ff' }} />
                <p style={{ color: '#1677ff', marginTop: 8, fontSize: 14 }}>拖放文件到此处分析</p>
              </div>
            </div>
          )}

          {chatMessages.length === 0 && !dragOver && (
            <div style={{ textAlign: 'center', paddingTop: 40, color: '#bfbfbf' }}>
              <RobotOutlined style={{ fontSize: 48, marginBottom: 12, display: 'block' }} />
              <p style={{ fontSize: 14, marginBottom: 16 }}>你好！我是 FileWise AI 助手</p>
              <p style={{ fontSize: 12, color: '#d9d9d9', marginBottom: 20 }}>
                支持 27 种工具调用 | 流式响应 | 文件拖拽分析 | 图片视觉对话 | 自动化规则
              </p>
              {/* 快捷入口 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 500, margin: '0 auto' }}>
                {QUICK_CMDS.map(q => (
                  <Button key={q.cmd} size="small" icon={q.icon} onClick={() => send(q.cmd)}
                    style={{ borderRadius: 16 }}>{q.label}</Button>
                ))}
              </div>
            </div>
          )}

          {chatMessages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 16, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: m.role === 'ai' ? '#e6f4ff' : '#f0f0f0',
                color: m.role === 'ai' ? '#1677ff' : '#595959',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
              }}>
                {m.role === 'ai' ? <RobotOutlined /> : <UserOutlined />}
              </div>
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: 10, fontSize: 13.5,
                lineHeight: 1.7, wordBreak: 'break-word',
                background: m.role === 'ai' ? '#fafafa' : '#1677ff',
                color: m.role === 'ai' ? '#262626' : '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                {m.role === 'ai'
                  ? <div className="md-body"><Markdown>{m.text}</Markdown></div>
                  : <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>}

                {/* 内嵌交互组件 */}
                {m.widget?.type === 'task_plan' && (
                  <TaskPlanWidget steps={m.widget.data as TaskPlanStep[]} onExecute={(steps) => executePlan(steps, '')} />
                )}
                {m.widget?.type === 'suggestion_list' && (
                  <SuggestionWidget suggestions={m.widget.data as Suggestion[]} onAction={(s) => send(s.title)} />
                )}
                {m.widget?.type === 'image_preview' && (m.widget.data as { src?: string })?.src && (
                  <div style={{ marginTop: 8 }}>
                    <img src={(m.widget.data as { src: string }).src} alt="preview"
                      style={{ maxWidth: 200, maxHeight: 150, borderRadius: 6, border: '1px solid #f0f0f0' }} />
                  </div>
                )}

                {/* 导航按钮 */}
                {m.actionResult?.navigateTo && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8e8e8' }}>
                    <Button type="primary" size="small" icon={<ArrowRightOutlined />}
                      onClick={() => setCurrentPage(m.actionResult!.navigateTo as PageKey)}>
                      前往{m.actionResult.label}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* 流式输出中 */}
          {streamingText && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e6f4ff', color: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                <RobotOutlined />
              </div>
              <div style={{ maxWidth: '75%', padding: '10px 14px', background: '#fafafa', borderRadius: 10, fontSize: 13.5, lineHeight: 1.7, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div className="md-body"><Markdown>{streamingText}</Markdown></div>
                <span className="streaming-cursor" style={{ display: 'inline-block', width: 2, height: 16, background: '#1677ff', animation: 'blink 1s infinite', verticalAlign: 'middle', marginLeft: 2 }} />
              </div>
            </div>
          )}

          {/* 思考/执行中 */}
          {sending && !streamingText && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e6f4ff', color: '#1677ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RobotOutlined />
              </div>
              <div style={{ padding: '10px 14px', background: '#fafafa', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spin size="small" />
                <span style={{ fontSize: 13, color: '#8c8c8c' }}>{agentStatus || 'AI 思考中...'}</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* 快捷指令（仅消息列表非空时显示在底部） */}
        {chatMessages.length > 0 && (
          <div style={{ padding: '6px 16px 2px', display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #f5f5f5' }}>
            {QUICK_CMDS.map(q => (
              <span key={q.cmd}
                style={{ padding: '2px 10px', background: '#f0f5ff', borderRadius: 12, fontSize: 11, color: '#1677ff', cursor: 'pointer', border: '1px solid #d6e4ff' }}
                onClick={() => send(q.cmd)}>{q.label}</span>
            ))}
          </div>
        )}

        {/* 输入区域 */}
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Tooltip title="拖拽文件或点击上传">
            <Button icon={<FileOutlined />} onClick={() => fileInputRef.current?.click()} />
          </Tooltip>
          <Tooltip title="上传图片分析">
            <Button icon={<PictureOutlined />} onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                const path = (file as unknown as { path?: string }).path;
                if (path) {
                  send(`分析这张图片 ${path}`);
                }
              };
              input.click();
            }} />
          </Tooltip>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} multiple
            onChange={async (e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              for (const file of Array.from(files)) {
                const path = (file as unknown as { path?: string }).path;
                if (path) send(`预览文件 ${path}`);
              }
              e.target.value = '';
            }}
          />
          <input
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            style={{
              flex: 1, border: '1px solid #d9d9d9', borderRadius: 8, padding: '8px 12px',
              fontSize: 13.5, outline: 'none', transition: 'border-color 0.2s',
            }}
            placeholder='输入指令，如"帮我整理下载文件夹"，或拖拽文件到上方...'
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            onFocus={e => (e.target.style.borderColor = '#1677ff')}
            onBlur={e => (e.target.style.borderColor = '#d9d9d9')}
            disabled={sending}
          />
          <Button type="primary" onClick={() => send()} icon={<SendOutlined />}
            loading={sending} disabled={!inputText.trim() && !sending}>
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
