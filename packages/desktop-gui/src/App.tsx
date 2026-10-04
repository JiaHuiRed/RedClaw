import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ActivityPanel from "./components/ActivityPanel";
import AgentFilesWorkspace from "./components/AgentFilesWorkspace";
import ChatHome from "./components/ChatHome";
import ChatPanel from "./components/ChatPanel";
import ConnectionBadge from "./components/ConnectionBadge";
import CronPanel from "./components/CronPanel";
import OperationsWorkspace from "./components/OperationsWorkspace";
import SessionsWorkspace from "./components/SessionsWorkspace";
import Sidebar from "./components/Sidebar";
import type { SidebarView } from "./components/Sidebar";
import SkillsWorkspace from "./components/SkillsWorkspace";
import TodoPanel from "./components/TodoPanel";
import { TrafficLights } from "./components/TrafficLights";
import UsagePanel from "./components/UsagePanel";
import WorkHome from "./components/WorkHome";
import {
  gateway,
  deriveSessionTitle,
  type Message,
  type SessionInfo,
  type ChatSession,
  type CommandEntry,
  type ToolCallEvent,
} from "./gateway/client";
import { getConnectionState } from "./lib/connectionStatus";

const DEFAULT_SESSION_KEY = "agent:main:main";
// v2: 旧 key 里可能存着过期的 URL（如 ws://127.0.0.1:19001），会覆盖代码默认值导致连不上
const GATEWAY_URL_KEY = "redclaw:gatewayUrl:v2";
const GATEWAY_TOKEN_KEY = "redclaw:gatewayToken";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [hasRecentError, setHasRecentError] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [view, setView] = useState<SidebarView>("chat");
  // Codex 式双态：主页（view=chat/work，顶部保留模式切换）vs 会话态（进会话后
  // 就是纯会话界面，不再有聊天/工作之分）。任何进会话的路径都置 true。
  const [inSession, setInSession] = useState(false);
  const [visitedViews, setVisitedViews] = useState<Set<SidebarView>>(() => new Set(["chat"]));
  const [rightPanel, setRightPanel] = useState<"none" | "activity" | "todo" | "usage" | "cron">(
    "none",
  );
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>(gateway.sessionInfo);
  const [commands, setCommands] = useState<CommandEntry[]>(gateway.commands);
  const [sessions, setSessions] = useState<ChatSession[]>(gateway.sessions);
  const [currentSessionKey, setCurrentSessionKey] = useState(DEFAULT_SESSION_KEY);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [toolOutputs, setToolOutputs] = useState<ToolCallEvent[]>([]);
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem("redclaw:rightPanelWidth"));
    return Number.isFinite(saved) && saved >= 240 ? saved : 320;
  });
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem("redclaw:rightPanelWidth", String(rightPanelWidth));
  }, [rightPanelWidth]);

  const connectionState = useMemo(
    () => getConnectionState(connected, connecting, hasRecentError),
    [connected, connecting, hasRecentError],
  );

  // A genuine successful connection supersedes a stale error badge. Only on
  // `true`, deliberately - a rejected handshake's own cleanup path (see
  // gateway/client.ts _sendConnect's else-branch) calls stop() right after
  // notifying the error, which fires this same setter with `false` in the
  // same tick; clearing on `false` too would erase the error badge before
  // anyone could see it.
  const handleConnectedChange = useCallback((v: boolean) => {
    setConnected(v);
    if (!v) return;
    setHasRecentError(false);
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  }, []);

  const pushToast = useCallback((message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // 请求代际防护：切会话时旧会话的慢历史返回会覆盖新会话内容，
  // 过期响应连同它的 finally（提前熄 loading）一起丢弃
  const historyGenRef = useRef(0);
  const loadHistory = useCallback(async (sessionKey: string) => {
    const gen = ++historyGenRef.current;
    setLoadingHistory(true);
    setMessages([]);
    try {
      const history = await gateway.fetchHistory(sessionKey);
      if (gen !== historyGenRef.current) return;
      setMessages(history);
    } finally {
      if (gen === historyGenRef.current) setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    const unsubInfo = gateway.onSessionInfo((info) => setSessionInfo(info));
    const unsubCmds = gateway.onCommands((cmds) => setCommands(cmds));
    const unsubSessions = gateway.onSessionList((list) => setSessions(list));
    const unsubError = gateway.onError((message) => {
      pushToast(message);
      // gateway.onError can fire for failures (e.g. a rejected chat.send)
      // that never touch connection status, so this can't rely solely on
      // handleConnectedChange to clear it - it needs its own timer too.
      setHasRecentError(true);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => {
        setHasRecentError(false);
        errorTimeoutRef.current = null;
      }, 4000);
    });
    const unsubTool = gateway.onTool((tool) => {
      // message tool 是内部路由（sourceReply 补发 assistant 消息），不进代码面板
      if (tool.name === "message" && tool.phase === "result") return;
      setToolOutputs((prev) => {
        // 同一次调用的 start/update/result 事件合并成一张卡：
        // 有 id 按 id 归并；无 id 把最近一条同名运行中记录视为同一次调用，
        // 其余才追加——否则每个阶段各占一张空卡刷屏
        if (tool.id) {
          const idx = prev.findIndex((t) => t.id === tool.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = tool;
            return next;
          }
        } else {
          for (let i = prev.length - 1; i >= 0; i--) {
            const t = prev[i];
            if (
              t &&
              t.name === tool.name &&
              !t.id &&
              (t.phase === "start" || t.phase === "update")
            ) {
              const next = [...prev];
              next[i] = tool;
              return next;
            }
          }
        }
        return [...prev.slice(-59), tool];
      });
    });

    // Apply any saved gateway URL/token before auto-connecting
    const savedUrl = localStorage.getItem(GATEWAY_URL_KEY);
    const savedToken = localStorage.getItem(GATEWAY_TOKEN_KEY);
    if (savedUrl || savedToken) {
      gateway.configure(savedUrl || undefined, savedToken ?? undefined);
    }

    // Auto-connect on launch so the user doesn't have to click "连接" every time
    gateway.start();

    // Load history on mount if already connected
    if (gateway.isConnected) {
      loadHistory(DEFAULT_SESSION_KEY);
    }

    return () => {
      unsubInfo();
      unsubCmds();
      unsubSessions();
      unsubError();
      unsubTool();
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, [loadHistory, pushToast]);

  // Auto-load history when current session changes
  useEffect(() => {
    if (connected && currentSessionKey) {
      loadHistory(currentSessionKey);
    }
  }, [connected, currentSessionKey, loadHistory]);

  // 未命名会话回填标题：用会话首条用户消息（尽力而为，每会话只试一次）。
  // chat.history 返回尾部窗口，msgs 打满 limit 说明会话比窗口长、拿不到开头，不起名。
  const backfillTriedRef = useRef<Set<string>>(new Set());
  const backfillRunningRef = useRef(false);
  useEffect(() => {
    if (!connected || backfillRunningRef.current) return;
    const targets = sessions
      .filter((s) => !s.title && !backfillTriedRef.current.has(s.sessionKey))
      .slice(0, 10);
    if (targets.length === 0) return;
    backfillRunningRef.current = true;
    void (async () => {
      for (const s of targets) {
        backfillTriedRef.current.add(s.sessionKey);
        try {
          const msgs: Message[] = await gateway.fetchHistory(s.sessionKey, 200);
          if (msgs.length >= 200) continue;
          const title = deriveSessionTitle(msgs);
          if (title) await gateway.renameSession(s.sessionKey, title);
        } catch {
          // 单个会话失败不阻塞其余；已标记 tried 不会死循环
        }
      }
    })().finally(() => {
      backfillRunningRef.current = false;
    });
  }, [connected, sessions]);

  const handleSelectSession = useCallback((sessionKey: string) => {
    setCurrentSessionKey(sessionKey);
    gateway.setActiveSessionKey(sessionKey);
    setView("chat");
    setInSession(true);
  }, []);

  const handleSelectView = useCallback((next: SidebarView) => {
    setVisitedViews((previous) => new Set(previous).add(next));
    // 右栏面板只挂在会话态顶栏的开关上，离开会话态时一并收起
    setRightPanel("none");
    setView(next);
  }, []);

  // 从会话返回主页（保留 view=chat，主页聊天态接管渲染）
  const handleBackHome = useCallback(() => {
    setRightPanel("none");
    setInSession(false);
  }, []);

  const handleNewSession = useCallback(async () => {
    setView("chat");
    setMessages([]);
    try {
      const key = await gateway.createSession();
      setCurrentSessionKey(key);
      setInSession(true);
    } catch (err) {
      console.error("createSession failed:", err);
      pushToast("新建会话失败，已切换到默认会话");
      // client._activeSessionKey 与 UI 同步回落，否则发送仍打到失败的旧 key
      setCurrentSessionKey(DEFAULT_SESSION_KEY);
      gateway.setActiveSessionKey(DEFAULT_SESSION_KEY);
      setInSession(true);
    }
  }, [pushToast]);

  const handleDeleteSession = useCallback(
    async (sessionKey: string) => {
      try {
        await gateway.deleteSession(sessionKey);
        if (sessionKey === currentSessionKey) {
          const remaining = sessions.filter((s) => s.sessionKey !== sessionKey);
          const next = remaining.length > 0 ? remaining[0].sessionKey : DEFAULT_SESSION_KEY;
          setCurrentSessionKey(next);
          gateway.setActiveSessionKey(next);
        }
      } catch {
        // error already logged in client
      }
    },
    [currentSessionKey, sessions],
  );

  const handleRenameSession = useCallback(async (sessionKey: string, label: string) => {
    try {
      await gateway.renameSession(sessionKey, label);
    } catch {
      // error already logged in client
    }
  }, []);

  const onToggleActivity = useCallback(() => {
    setRightPanel((p) => (p === "activity" ? "none" : "activity"));
  }, []);
  const onToggleTodo = useCallback(() => {
    setRightPanel((p) => (p === "todo" ? "none" : "todo"));
  }, []);
  const onToggleUsage = useCallback(() => {
    setRightPanel((p) => (p === "usage" ? "none" : "usage"));
  }, []);
  const onToggleCron = useCallback(() => {
    setRightPanel((p) => (p === "cron" ? "none" : "cron"));
  }, []);

  // 工作台/主页聊天交办：路由进对应项目区的默认会话，聊天面板消费 workDraft 直发
  const [workDraft, setWorkDraft] = useState<{ text: string; nonce: number } | null>(null);
  const handleWorkSend = useCallback((text: string, agentId: string) => {
    const key = `agent:${agentId}:main`;
    setCurrentSessionKey(key);
    gateway.setActiveSessionKey(key);
    setView("chat");
    setInSession(true);
    setWorkDraft({ text, nonce: Date.now() });
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen">
      {/* 全局标题栏（decorations:false 自绘）：只有交通灯+品牌，横贯全窗可拖拽；
          其余操作按钮和页面 tab 都在下方内容区 */}
      <div
        className="flex items-center gap-2.5 px-3 h-12 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
        data-tauri-drag-region
      >
        <TrafficLights />
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          RedClaw
        </span>
        <ConnectionBadge state={connectionState} />
      </div>
      <div className="flex flex-1 min-h-0">
        <Sidebar
          connected={connected}
          connecting={connecting}
          setConnecting={setConnecting}
          connectionState={connectionState}
          sessions={sessions}
          currentSessionKey={currentSessionKey}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          view={view}
          onSelectView={handleSelectView}
        />
        <div className={view === "chat" && inSession ? "flex flex-1 min-w-0" : "hidden"}>
          <ChatPanel
            connected={connected}
            setConnected={handleConnectedChange}
            setConnecting={setConnecting}
            messages={messages}
            setMessages={setMessages}
            sessionInfo={sessionInfo}
            commands={commands}
            sessions={sessions}
            currentSessionKey={currentSessionKey}
            onSelectSession={handleSelectSession}
            onToggleActivity={onToggleActivity}
            onToggleTodo={onToggleTodo}
            onToggleUsage={onToggleUsage}
            onToggleCron={onToggleCron}
            loadingHistory={loadingHistory}
            workDraft={workDraft}
            onWorkDraftConsumed={() => setWorkDraft(null)}
            onBackHome={handleBackHome}
          />
        </div>
        {view === "chat" && !inSession && (
          <ChatHome connected={connected} onSend={handleWorkSend} onSwitchMode={handleSelectView} />
        )}
        {visitedViews.has("work") && (
          <div className={view === "work" ? "flex flex-1 min-w-0" : "hidden"}>
            <WorkHome
              connected={connected}
              sessions={sessions}
              onSend={handleWorkSend}
              onOpenSession={handleSelectSession}
              onSwitchMode={(mode) => handleSelectView(mode)}
            />
          </div>
        )}
        {visitedViews.has("sessions") && (
          <div className={view === "sessions" ? "flex flex-1 min-w-0" : "hidden"}>
            <SessionsWorkspace connected={connected} onOpen={handleSelectSession} />
          </div>
        )}
        {visitedViews.has("skills") && (
          <div className={view === "skills" ? "flex flex-1 min-w-0" : "hidden"}>
            <SkillsWorkspace connected={connected} />
          </div>
        )}
        {visitedViews.has("files") && (
          <div className={view === "files" ? "flex flex-1 min-w-0" : "hidden"}>
            <AgentFilesWorkspace connected={connected} />
          </div>
        )}
        {visitedViews.has("operations") && (
          <div className={view === "operations" ? "flex flex-1 min-w-0" : "hidden"}>
            <OperationsWorkspace connected={connected} />
          </div>
        )}
        {view === "chat" && rightPanel === "activity" && (
          <ActivityPanel
            outputs={toolOutputs}
            sessions={sessions}
            width={rightPanelWidth}
            onResize={setRightPanelWidth}
            onClose={() => setRightPanel("none")}
          />
        )}
        {view === "chat" && rightPanel === "todo" && (
          <TodoPanel
            width={rightPanelWidth}
            onResize={setRightPanelWidth}
            onClose={() => setRightPanel("none")}
          />
        )}
        {view === "chat" && rightPanel === "usage" && (
          <UsagePanel
            width={rightPanelWidth}
            onResize={setRightPanelWidth}
            onClose={() => setRightPanel("none")}
          />
        )}
        {view === "chat" && rightPanel === "cron" && (
          <CronPanel
            width={rightPanelWidth}
            onResize={setRightPanelWidth}
            onClose={() => setRightPanel("none")}
          />
        )}
        {toasts.length > 0 && (
          <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="px-4 py-2.5 rounded-lg text-sm shadow-lg"
                style={{
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                {t.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
