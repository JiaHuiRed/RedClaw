import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ChatPanel from "./components/ChatPanel";
import CodePanel from "./components/CodePanel";
import Sidebar from "./components/Sidebar";
import TodoPanel from "./components/TodoPanel";
import UsagePanel from "./components/UsagePanel";
import {
  gateway,
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
  const [rightPanel, setRightPanel] = useState<"none" | "code" | "todo" | "usage">("none");
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

  const loadHistory = useCallback(async (sessionKey: string) => {
    setLoadingHistory(true);
    setMessages([]);
    try {
      const history = await gateway.fetchHistory(sessionKey);
      setMessages(history);
    } finally {
      setLoadingHistory(false);
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
      setToolOutputs((prev) => [...prev.slice(-59), tool]);
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

  const handleSelectSession = useCallback((sessionKey: string) => {
    setCurrentSessionKey(sessionKey);
    gateway.setActiveSessionKey(sessionKey);
  }, []);

  const handleNewSession = useCallback(async () => {
    setMessages([]);
    try {
      const key = await gateway.createSession();
      setCurrentSessionKey(key);
    } catch (err) {
      console.error("createSession failed:", err);
      pushToast("新建会话失败，已切换到默认会话");
      setCurrentSessionKey(DEFAULT_SESSION_KEY);
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

  const onToggleCode = useCallback(() => {
    setRightPanel((p) => (p === "code" ? "none" : "code"));
  }, []);
  const onToggleTodo = useCallback(() => {
    setRightPanel((p) => (p === "todo" ? "none" : "todo"));
  }, []);
  const onToggleUsage = useCallback(() => {
    setRightPanel((p) => (p === "usage" ? "none" : "usage"));
  }, []);

  return (
    <div className="flex h-screen w-screen">
      <Sidebar
        connected={connected}
        connectionState={connectionState}
        sessions={sessions}
        currentSessionKey={currentSessionKey}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />
      <ChatPanel
        connected={connected}
        setConnected={handleConnectedChange}
        connecting={connecting}
        setConnecting={setConnecting}
        connectionState={connectionState}
        messages={messages}
        setMessages={setMessages}
        sessionInfo={sessionInfo}
        commands={commands}
        sessions={sessions}
        currentSessionKey={currentSessionKey}
        onSelectSession={handleSelectSession}
        onToggleCode={onToggleCode}
        onToggleTodo={onToggleTodo}
        onToggleUsage={onToggleUsage}
        loadingHistory={loadingHistory}
      />
      {rightPanel === "code" && (
        <CodePanel
          outputs={toolOutputs}
          width={rightPanelWidth}
          onResize={setRightPanelWidth}
          onClose={() => setRightPanel("none")}
        />
      )}
      {rightPanel === "todo" && (
        <TodoPanel
          width={rightPanelWidth}
          onResize={setRightPanelWidth}
          onClose={() => setRightPanel("none")}
        />
      )}
      {rightPanel === "usage" && (
        <UsagePanel
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
  );
}
