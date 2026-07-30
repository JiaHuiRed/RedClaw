import { useState, useEffect, useCallback } from "react";
import ChatPanel from "./components/ChatPanel";
import CodePanel from "./components/CodePanel";
import Sidebar from "./components/Sidebar";
import {
  gateway,
  type Message,
  type SessionInfo,
  type ChatSession,
  type CommandEntry,
} from "./gateway/client";

const DEFAULT_SESSION_KEY = "agent:main:main";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>(gateway.sessionInfo);
  const [commands, setCommands] = useState<CommandEntry[]>(gateway.commands);
  const [sessions, setSessions] = useState<ChatSession[]>(gateway.sessions);
  const [currentSessionKey, setCurrentSessionKey] = useState(DEFAULT_SESSION_KEY);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);

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
    setStreamingText("");
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
    const unsubError = gateway.onError((message) => pushToast(message));

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
    setStreamingText("");
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

  return (
    <div className="flex h-screen w-screen">
      <Sidebar
        connected={connected}
        sessions={sessions}
        currentSessionKey={currentSessionKey}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
      />
      <ChatPanel
        connected={connected}
        setConnected={setConnected}
        messages={messages}
        setMessages={setMessages}
        streamingText={streamingText}
        setStreamingText={setStreamingText}
        sessionInfo={sessionInfo}
        commands={commands}
        onToggleCode={() => setShowCodePanel((v) => !v)}
        loadingHistory={loadingHistory}
      />
      {showCodePanel && <CodePanel onClose={() => setShowCodePanel(false)} />}
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
