import { X } from "lucide-react";
import { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from "react";
import ActivityPanel from "./components/ActivityPanel";
import ChatHome from "./components/ChatHome";
import ChatPanel from "./components/ChatPanel";
import ConnectionBadge from "./components/ConnectionBadge";
import CronPanel from "./components/CronPanel";
import Sidebar from "./components/Sidebar";
import type { SidebarView } from "./components/Sidebar";
import TodoPanel from "./components/TodoPanel";
import { TrafficLights } from "./components/TrafficLights";
import UsagePanel from "./components/UsagePanel";
import WorkHome from "./components/WorkHome";

// 管理面 workspace 按需加载：非首屏必需，首次进入视图时拉取
const AgentFilesWorkspace = lazy(() => import("./components/AgentFilesWorkspace"));
const OperationsWorkspace = lazy(() => import("./components/OperationsWorkspace"));
const SessionsWorkspace = lazy(() => import("./components/SessionsWorkspace"));
const SkillsWorkspace = lazy(() => import("./components/SkillsWorkspace"));
import type { SessionError } from "./components/ErrorBanner";
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
import { friendlyError } from "./lib/friendlyError";
import { GATEWAY_TOKEN_KEY, GATEWAY_URL_KEY } from "./lib/gateway-config";
import { clampRightPanelWidth, reportRightPanelWidth } from "./lib/layout-budget";

const DEFAULT_SESSION_KEY = "agent:main:main";

type ToastKind = "info" | "error" | "success";

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
  const [toasts, setToasts] = useState<
    { id: string; kind: ToastKind; dedupeKey: string; message: string }[]
  >([]);
  const [toolOutputs, setToolOutputs] = useState<ToolCallEvent[]>([]);
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const saved = Number(localStorage.getItem("redclaw:rightPanelWidth"));
    return Number.isFinite(saved) && saved >= 240 ? saved : 320;
  });
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 拖动中每帧写 localStorage 纯浪费：300ms 尾沿防抖持久化最终值
    const t = setTimeout(() => {
      localStorage.setItem("redclaw:rightPanelWidth", String(rightPanelWidth));
    }, 300);
    return () => clearTimeout(t);
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

  const pushToast = useCallback((message: string, kind: ToastKind = "info") => {
    // 同文案 dedupe upsert（学 ZCode toast dedupeKey）：同一错误/操作连发只留
    // 最新一条（移回栈尾重新计时），防「同一失败刷 5 条」；不同文案互不影响
    const dedupeKey = message;
    const id = crypto.randomUUID();
    setToasts((prev) => [
      ...prev.filter((t) => t.dedupeKey !== dedupeKey),
      { id, kind, dedupeKey, message },
    ]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // 请求代际防护：切会话时旧会话的慢历史返回会覆盖新会话内容，
  // 过期响应连同它的 finally（提前熄 loading）一起丢弃
  const historyGenRef = useRef(0);
  // 会话级错误登记（key → 本地化文案 + 原始报错）：错误横幅取当前会话条目，
  // 侧栏行首指示器取全表；该会话加载成功即清除
  const [sessionErrors, setSessionErrors] = useState<Map<string, SessionError>>(new Map());
  const loadHistory = useCallback(async (sessionKey: string) => {
    const gen = ++historyGenRef.current;
    setLoadingHistory(true);
    setMessages([]);
    try {
      const history = await gateway.fetchHistory(sessionKey);
      if (gen !== historyGenRef.current) return;
      setMessages(history);
      setSessionErrors((prev) => {
        if (!prev.has(sessionKey)) return prev;
        const next = new Map(prev);
        next.delete(sessionKey);
        return next;
      });
    } catch (err) {
      // 拉历史失败必须显式暴露：吞成空数组会让老会话伪装成「全新空会话」，
      // 对伴侣型产品是情感伤害级误导（以为聊天记录丢了）
      if (gen === historyGenRef.current) {
        console.error("[App] loadHistory failed:", err);
        const raw = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
        setSessionErrors((prev) =>
          new Map(prev).set(sessionKey, { message: friendlyError(err), raw }),
        );
      }
    } finally {
      if (gen === historyGenRef.current) setLoadingHistory(false);
    }
  }, []);

  // 草稿态新建（学 ZCode）：点「新建会话」不再立刻落库建空会话——误点不产生
  // 僵尸会话；进入无 key 草稿视图，首条消息发送时才真正 createSession
  //（ChatPanel.sendNow 负责），成功后经 adoptSessionKey 转正
  const skipHistoryLoadRef = useRef(false);
  const adoptSessionKey = useCallback((key: string) => {
    // 草稿转正：乐观消息已上屏，跳过本次 loadHistory（清屏会让消息闪没一次）
    skipHistoryLoadRef.current = true;
    setCurrentSessionKey(key);
    gateway.setActiveSessionKey(key);
  }, []);

  const handleNewSession = useCallback(() => {
    setView("chat");
    setMessages([]);
    setCurrentSessionKey("");
    gateway.setActiveSessionKey("");
    setInSession(true);
  }, []);

  useEffect(() => {
    const unsubInfo = gateway.onSessionInfo((info) => setSessionInfo(info));
    const unsubCmds = gateway.onCommands((cmds) => setCommands(cmds));
    const unsubSessions = gateway.onSessionList((list) => setSessions(list));
    const unsubError = gateway.onError((message) => {
      pushToast(message, "error");
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
    // 草稿转正（adoptSessionKey）后的第一次进效果：消息已在屏，跳过重拉
    if (skipHistoryLoadRef.current) {
      skipHistoryLoadRef.current = false;
      return;
    }
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

  // 后台任务完成唤醒（学 ZCode task-notification）：秋秋的定时任务跑完时面板
  // 没开也要知道——客户端轮询 cron.runs（scope=all，可见时 60s 一次），检出比
  // 基线新的终态 run 就弹 toast。首拉只建基线不弹（防启动刷屏）；完成时间超出
  // 10 分钟窗口的不补报（休眠唤醒回来不倒豆子，只抬基线——同 ZCode misfire
  // 记 skipped 不补跑的收刀语义）
  const lastCronRunTsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    const FRESH_WINDOW_MS = 10 * 60_000;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const runs = await gateway.fetchAllCronRuns(6);
        if (cancelled) return;
        const newest = runs[0]?.ts;
        if (newest == null) return;
        if (lastCronRunTsRef.current == null) {
          lastCronRunTsRef.current = newest;
          return;
        }
        if (newest > lastCronRunTsRef.current) {
          for (const run of runs) {
            if (!run.ts || run.ts <= lastCronRunTsRef.current) break; // desc 序，见旧即止
            if (run.status === "running" || !run.status) continue;
            if (Date.now() - run.ts > FRESH_WINDOW_MS) continue;
            const name = run.jobName || run.jobId;
            if (run.status === "error") {
              pushToast(`定时任务「${name}」运行失败${run.error ? `：${run.error}` : ""}`, "error");
            } else {
              pushToast(`定时任务「${name}」完成`, "success");
            }
          }
          lastCronRunTsRef.current = newest;
        }
      } catch {
        // 轮询失败静默：面板开着时 ActivityPanel 有自己的展示与报错面
      }
    };
    const timer = setInterval(() => void poll(), 60_000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connected, pushToast]);

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

  // Esc 返回主页：仅当焦点不在任何输入/弹层（target 是 body）时生效；
  // 弹层/输入框内的 Esc 由各自处理（useEscape 在 capture 阶段先吃掉）
  useEffect(() => {
    if (!inSession) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target !== document.body) return;
      handleBackHome();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inSession, handleBackHome]);

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
  // 稳定引用是 ChatPanel memo 的前提：内联箭头会让 App 每次重渲染（包括
  // 右栏拖宽的每一帧）都穿透到整个聊天面板
  const handleWorkDraftConsumed = useCallback(() => setWorkDraft(null), []);
  // 右栏拖宽经布局预算 clamp（感知侧栏宽度，给聊天区保底宽度）再落 state
  const handleRightPanelResize = useCallback((w: number) => {
    const next = clampRightPanelWidth(w);
    reportRightPanelWidth(next);
    setRightPanelWidth(next);
  }, []);
  // 右栏开合/宽度变化上报布局预算（关闭时释放占位）
  useEffect(() => {
    reportRightPanelWidth(rightPanel === "none" ? 0 : rightPanelWidth);
  }, [rightPanel, rightPanelWidth]);

  const retryHistory = useCallback(() => {
    // 草稿态无 key（空串会打到 fetchHistory 的默认路由上），不需要重试
    if (!currentSessionKey) return;
    void loadHistory(currentSessionKey);
  }, [loadHistory, currentSessionKey]);

  // 用户点横幅「×」：本次不看了，清掉该会话的登记（下次失败会重新登记）
  const dismissHistoryError = useCallback((sessionKey: string) => {
    setSessionErrors((prev) => {
      if (!prev.has(sessionKey)) return prev;
      const next = new Map(prev);
      next.delete(sessionKey);
      return next;
    });
  }, []);
  const handleDismissHistoryError = useCallback(
    () => dismissHistoryError(currentSessionKey),
    [dismissHistoryError, currentSessionKey],
  );

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
          sessionErrors={sessionErrors}
          loadingSessionKey={loadingHistory ? currentSessionKey : null}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          view={view}
          onSelectView={handleSelectView}
        />
        <div className={view === "chat" && inSession ? "flex flex-1 min-w-0" : "hidden"}>
          <ChatPanel
            active={view === "chat" && inSession}
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
            historyError={sessionErrors.get(currentSessionKey) ?? null}
            onRetryHistory={retryHistory}
            onDismissHistoryError={handleDismissHistoryError}
            onAdoptSessionKey={adoptSessionKey}
            workDraft={workDraft}
            onWorkDraftConsumed={handleWorkDraftConsumed}
            onBackHome={handleBackHome}
            pushToast={pushToast}
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
            <Suspense fallback={null}>
              <SessionsWorkspace connected={connected} onOpen={handleSelectSession} />
            </Suspense>
          </div>
        )}
        {visitedViews.has("skills") && (
          <div className={view === "skills" ? "flex flex-1 min-w-0" : "hidden"}>
            <Suspense fallback={null}>
              <SkillsWorkspace connected={connected} />
            </Suspense>
          </div>
        )}
        {visitedViews.has("files") && (
          <div className={view === "files" ? "flex flex-1 min-w-0" : "hidden"}>
            <Suspense fallback={null}>
              <AgentFilesWorkspace connected={connected} />
            </Suspense>
          </div>
        )}
        {visitedViews.has("operations") && (
          <div className={view === "operations" ? "flex flex-1 min-w-0" : "hidden"}>
            <Suspense fallback={null}>
              <OperationsWorkspace connected={connected} />
            </Suspense>
          </div>
        )}
        {view === "chat" && rightPanel === "activity" && (
          <ActivityPanel
            outputs={toolOutputs}
            sessions={sessions}
            width={rightPanelWidth}
            onResize={handleRightPanelResize}
            onClose={() => setRightPanel("none")}
          />
        )}
        {view === "chat" && rightPanel === "todo" && (
          <TodoPanel
            width={rightPanelWidth}
            onResize={handleRightPanelResize}
            onClose={() => setRightPanel("none")}
          />
        )}
        {view === "chat" && rightPanel === "usage" && (
          <UsagePanel
            width={rightPanelWidth}
            onResize={handleRightPanelResize}
            onClose={() => setRightPanel("none")}
          />
        )}
        {view === "chat" && rightPanel === "cron" && (
          <CronPanel
            width={rightPanelWidth}
            onResize={handleRightPanelResize}
            onClose={() => setRightPanel("none")}
          />
        )}
        {toasts.length > 0 && (
          <div
            className="fixed bottom-4 right-4 z-[120] flex flex-col gap-2 max-w-sm"
            aria-live="polite"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                className="px-4 py-2.5 rounded-lg text-sm shadow-lg flex items-start gap-2"
                style={{
                  background: "var(--bg-secondary)",
                  color: t.kind === "error" ? "var(--danger)" : "var(--text-primary)",
                  border: `1px solid ${
                    t.kind === "error"
                      ? "var(--danger)"
                      : t.kind === "success"
                        ? "var(--success)"
                        : "var(--border)"
                  }`,
                }}
              >
                <span className="flex-1">{t.message}</span>
                <button
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  className="shrink-0 opacity-60 hover:opacity-100"
                  title="关闭"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
