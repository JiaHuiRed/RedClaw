import { Send, Plug, PlugZap, PanelRight, Slash } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { gateway, type Message, type SessionInfo, type CommandEntry } from "../gateway/client";

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "m";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function shortModel(m: string | null): string {
  if (!m) return "—";
  const parts = m.split("/");
  return parts.length > 1 ? parts[1]! : m;
}

interface ChatPanelProps {
  connected: boolean;
  setConnected: (v: boolean) => void;
  messages: Message[];
  setMessages: (fn: Message[] | ((prev: Message[]) => Message[])) => void;
  streamingText: string;
  setStreamingText: (v: string) => void;
  sessionInfo: SessionInfo;
  commands: CommandEntry[];
  onToggleCode: () => void;
  loadingHistory?: boolean;
}

export default function ChatPanel({
  connected,
  setConnected,
  messages,
  setMessages,
  streamingText,
  setStreamingText,
  sessionInfo,
  commands,
  onToggleCode,
  loadingHistory,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdFilter, setCmdFilter] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filteredCommands = useMemo(() => {
    if (!cmdFilter || cmdFilter === "/") return commands.slice(0, 15);
    const q = cmdFilter.toLowerCase().slice(1);
    return commands
      .filter((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      .slice(0, 15);
  }, [commands, cmdFilter]);

  useEffect(() => {
    const unsubMsg = gateway.onMessage((msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    const unsubDelta = gateway.onDelta((text, _reasoning) => {
      setStreamingText(text);
    });

    const unsubStatus = gateway.onStatus((status) => {
      setConnected(status);
      setConnecting(false);
    });

    return () => {
      unsubMsg();
      unsubDelta();
      unsubStatus();
      gateway.stop();
    };
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  async function handleConnect() {
    if (connected) {
      gateway.stop();
      return;
    }
    setConnecting(true);
    gateway.start();
  }

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || !connected) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowCmdPalette(false);

    try {
      await gateway.sendMessage(msg);
    } catch (err) {
      console.error("send failed:", err);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith("/")) {
      setShowCmdPalette(true);
      setCmdFilter(val);
    } else {
      setShowCmdPalette(false);
    }
    // auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showCmdPalette && e.key === "Escape") {
      setShowCmdPalette(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const { model, totalTokens, contextTokens, percentUsed } = sessionInfo;
  const hasStreaming = streamingText.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 h-12 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-sm font-medium">RedClaw</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCode}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            <PanelRight size={14} />
            代码
          </button>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80 disabled:opacity-50"
            style={{
              background: connected ? "#34c759" : "var(--accent)",
              color: "#fff",
            }}
          >
            {connecting ? (
              <>连接中…</>
            ) : connected ? (
              <>
                <PlugZap size={14} /> 已连接
              </>
            ) : (
              <>
                <Plug size={14} /> 连接
              </>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !hasStreaming && (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            <div className="text-center space-y-2">
              {loadingHistory ? (
                <>
                  <div
                    className="inline-block w-5 h-5 border-2 rounded-full animate-spin"
                    style={{
                      borderColor: "var(--text-secondary)",
                      borderTopColor: "var(--accent)",
                    }}
                  />
                  <p className="text-xs mt-2">加载历史消息…</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">RedClaw</p>
                  <p className="text-xs">
                    {connected ? "选择一个会话开始聊天" : "连接 Gateway 后开始聊天"}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
              style={{
                background: msg.role === "user" ? "var(--user-bubble)" : "var(--assistant-bubble)",
                color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
              }}
            >
              {msg.content}
              {msg.reasoning && (
                <details className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <summary>思考过程</summary>
                  <p className="mt-1 whitespace-pre-wrap">{msg.reasoning}</p>
                </details>
              )}
            </div>
          </div>
        ))}

        {hasStreaming && (
          <div className="flex justify-start">
            <div
              className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
              style={{
                background: "var(--assistant-bubble)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {streamingText}
              <span
                className="inline-block w-1.5 h-4 ml-0.5 animate-pulse"
                style={{ background: "var(--accent)" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      {connected && (
        <div
          className="flex items-center gap-3 px-4 py-1 text-[11px] border-t shrink-0"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
            background: "var(--bg-secondary)",
          }}
        >
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            {shortModel(model)}
          </span>
          <span className="opacity-60">|</span>
          <span>
            {totalTokens != null ? fmt(totalTokens) : "0"} / {fmt(contextTokens)}
            {percentUsed != null && (
              <span
                className="ml-1"
                style={{ color: (percentUsed ?? 0) > 80 ? "#ff453a" : undefined }}
              >
                ({Math.round(percentUsed)}%)
              </span>
            )}
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1">
            <Slash size={10} />
            输入 / 查看命令
          </span>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t shrink-0 relative" style={{ borderColor: "var(--border)" }}>
        {/* Command palette */}
        {showCmdPalette && filteredCommands.length > 0 && (
          <div
            className="absolute bottom-full left-4 right-4 mb-2 rounded-xl border overflow-y-auto max-h-52"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
          >
            {filteredCommands.map((cmd) => (
              <button
                key={cmd.name}
                onClick={() => handleSend(cmd.name + " ")}
                className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center gap-2"
                style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}
              >
                <span className="font-medium" style={{ color: "var(--accent)" }}>
                  {cmd.name}
                </span>
                <span style={{ color: "var(--text-secondary)" }} className="truncate">
                  {cmd.description}
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          className="flex items-end gap-2 rounded-xl px-3 py-2"
          style={{ background: "var(--bg-tertiary)" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "输入消息… （/ 查看命令）" : "请先连接 Gateway"}
            disabled={!connected}
            rows={1}
            className="flex-1 bg-transparent text-sm outline-none resize-none disabled:opacity-50"
            style={{ color: "var(--text-primary)" }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!connected || !input.trim()}
            className="shrink-0 rounded-lg p-1.5 disabled:opacity-30"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
