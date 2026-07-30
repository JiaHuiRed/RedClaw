import {
  Send,
  Plug,
  PlugZap,
  PanelRight,
  Slash,
  Copy,
  Check,
  Square,
  Settings,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  gateway,
  type Message,
  type SessionInfo,
  type CommandEntry,
  type ModelEntry,
} from "../gateway/client";

const GATEWAY_URL_KEY = "redclaw:gatewayUrl";
const GATEWAY_TOKEN_KEY = "redclaw:gatewayToken";

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 p-1 rounded opacity-0 group-hover/code:opacity-100 transition-opacity"
      style={{ color: "var(--text-secondary)" }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p({ children }) {
          return <p className="my-1.5 last:mb-0">{children}</p>;
        },
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || "");
          if (!match) {
            return (
              <code
                className="text-sm px-1 py-0.5 rounded"
                style={{ background: "var(--bg-tertiary)", color: "var(--accent)" }}
              >
                {children}
              </code>
            );
          }
          const code = String(children).replace(/\n$/, "");
          return (
            <div
              className="group/code my-3 rounded-lg overflow-hidden text-sm"
              style={{ background: "#1e1e1e", border: "1px solid #333" }}
            >
              <div
                className="flex items-center justify-between px-3 py-1.5 text-[11px]"
                style={{ background: "#2d2d2d", color: "#999" }}
              >
                <span>{match[1]}</span>
                <CopyButton text={code} />
              </div>
              <pre className="p-3 m-0 overflow-x-auto">
                <code
                  className={className}
                  style={{
                    color: "#d4d4d4",
                    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                  }}
                >
                  {children}
                </code>
              </pre>
            </div>
          );
        },
        pre({ children }) {
          return <>{children}</>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              {children}
            </a>
          );
        },
        ul({ children }) {
          return <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>;
        },
        li({ children }) {
          return <li>{children}</li>;
        },
        h1({ children }) {
          return <h1 className="text-base font-bold my-2">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-sm font-bold my-2">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-sm font-semibold my-1.5">{children}</h3>;
        },
        blockquote({ children }) {
          return (
            <blockquote
              className="pl-3 my-2 border-l-2 italic text-sm"
              style={{ borderColor: "var(--accent)", color: "var(--text-secondary)" }}
            >
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="my-2 overflow-x-auto">
              <table
                className="text-sm border-collapse w-full"
                style={{ border: "1px solid var(--border)" }}
              >
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th
              className="px-3 py-1.5 text-left font-medium text-xs"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-3 py-1.5 text-xs" style={{ border: "1px solid var(--border)" }}>
              {children}
            </td>
          );
        },
        hr() {
          return <hr className="my-3" style={{ borderColor: "var(--border)" }} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface ChatPanelProps {
  connected: boolean;
  setConnected: (v: boolean) => void;
  messages: Message[];
  setMessages: (fn: Message[] | ((prev: Message[]) => Message[])) => void;
  streamingText: string;
  setStreamingText: (fn: string | ((prev: string) => string)) => void;
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdFilter, setCmdFilter] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>(gateway.models);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsUrl, setSettingsUrl] = useState(() => localStorage.getItem(GATEWAY_URL_KEY) ?? "");
  const [settingsToken, setSettingsToken] = useState(
    () => localStorage.getItem(GATEWAY_TOKEN_KEY) ?? "",
  );
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Close model selector on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelSelectorRef.current && !modelSelectorRef.current.contains(e.target as Node)) {
        setShowModelSelector(false);
        setModelSearch("");
      }
    }
    if (showModelSelector) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showModelSelector]);

  // Close settings popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    }
    if (showSettings) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSettings]);

  function handleSaveSettings() {
    const url = settingsUrl.trim();
    const token = settingsToken.trim();
    if (url) localStorage.setItem(GATEWAY_URL_KEY, url);
    else localStorage.removeItem(GATEWAY_URL_KEY);
    if (token) localStorage.setItem(GATEWAY_TOKEN_KEY, token);
    else localStorage.removeItem(GATEWAY_TOKEN_KEY);
    gateway.configure(url || undefined, token);
    setShowSettings(false);
    gateway.stop();
    gateway.start();
  }

  const filteredCommands = useMemo(() => {
    if (!cmdFilter || cmdFilter === "/") return commands.slice(0, 15);
    const q = cmdFilter.toLowerCase().slice(1);
    return commands
      .filter((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
      .slice(0, 15);
  }, [commands, cmdFilter]);

  const filteredModels = useMemo(() => {
    if (!modelSearch) return availableModels;
    const q = modelSearch.toLowerCase();
    return availableModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [availableModels, modelSearch]);

  useEffect(() => {
    const unsubMsg = gateway.onMessage((msg) => {
      setMessages((prev) => [...prev, msg]);
      setStreamingText("");
      setIsGenerating(false);
    });

    const unsubDelta = gateway.onDelta((text, _reasoning) => {
      setStreamingText((prev) => prev + text);
    });

    const unsubStreamEnd = gateway.onStreamEnd(() => {
      setStreamingText("");
      setIsGenerating(false);
    });

    const unsubStatus = gateway.onStatus((status) => {
      setConnected(status);
      setConnecting(false);
    });

    const unsubModels = gateway.onModelList((models) => {
      setAvailableModels(models);
    });

    return () => {
      unsubMsg();
      unsubDelta();
      unsubStreamEnd();
      unsubStatus();
      unsubModels();
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
    if (!msg || !connected || isGenerating) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowCmdPalette(false);
    setIsGenerating(true);

    try {
      await gateway.sendMessage(msg);
    } catch (err) {
      console.error("send failed:", err);
      setIsGenerating(false);
    }
  }

  async function handleStop() {
    try {
      await gateway.abortChat();
    } catch (err) {
      console.error("abort failed:", err);
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
        <div className="flex items-center gap-2 relative" ref={modelSelectorRef}>
          <span className="text-sm font-medium">RedClaw</span>
          {connected && (
            <button
              onClick={() => setShowModelSelector((v) => !v)}
              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium hover:opacity-80 transition-opacity"
              style={{
                background: "var(--bg-tertiary)",
                color: model ? "var(--text-secondary)" : "var(--border)",
              }}
            >
              {model ? shortModel(model) : "—"}
            </button>
          )}

          {/* Model selector dropdown */}
          {showModelSelector && connected && (
            <div
              className="absolute top-full left-0 mt-1 w-72 rounded-xl border shadow-lg z-50 overflow-hidden"
              style={{
                background: "var(--bg-secondary)",
                borderColor: "var(--border)",
              }}
            >
              {/* Search / filter */}
              <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex gap-1">
                  <input
                    className="flex-1 text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    placeholder="搜索模型…"
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {/* Model list */}
              <div
                className="max-h-48 overflow-y-auto border-b"
                style={{ borderColor: "var(--border)" }}
              >
                {filteredModels.length === 0 && (
                  <div
                    className="px-3 py-4 text-xs text-center"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {modelSearch ? "未找到匹配模型" : "暂无可用模型"}
                  </div>
                )}
                {filteredModels.map((m) => {
                  const active = m.id === model;
                  return (
                    <button
                      key={m.id}
                      onClick={async () => {
                        try {
                          await gateway.switchModel(m.id);
                          setShowModelSelector(false);
                          setModelSearch("");
                        } catch {}
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center gap-2"
                      style={{
                        color: "var(--text-primary)",
                        background: active ? "var(--bg-tertiary)" : "transparent",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{m.name || m.id}</div>
                        <div
                          className="text-[10px] mt-0.5 truncate"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {m.id}
                          {m.contextWindow && <span> · {fmt(m.contextWindow)} ctx</span>}
                        </div>
                      </div>
                      {active && (
                        <span className="text-[10px] shrink-0" style={{ color: "var(--accent)" }}>
                          当前
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Manual input */}
              <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <div
                  className="text-[10px] uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  或手动输入
                </div>
                <div className="flex gap-1">
                  <input
                    className="flex-1 text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    placeholder="provider/model"
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          try {
                            await gateway.switchModel(val);
                            setShowModelSelector(false);
                            setModelSearch("");
                          } catch {}
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Reasoning intensity */}
              <div className="px-3 py-2">
                <div
                  className="text-[10px] uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  推理强度
                </div>
                <div className="flex gap-1">
                  {(["off", "low", "medium", "high"] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => {
                        gateway.setReasoning(level);
                        setShowModelSelector(false);
                      }}
                      className="flex-1 text-[10px] py-1 rounded-md font-medium transition-colors hover:opacity-80"
                      style={{
                        background: "var(--bg-tertiary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {level === "off"
                        ? "关闭"
                        : level === "low"
                          ? "低"
                          : level === "medium"
                            ? "中"
                            : "高"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
              title="连接设置"
            >
              <Settings size={14} />
            </button>
            {showSettings && (
              <div
                className="absolute top-full right-0 mt-1 w-72 rounded-xl border shadow-lg z-50 p-3 space-y-2"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
              >
                <div>
                  <div
                    className="text-[10px] uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Gateway URL
                  </div>
                  <input
                    className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    placeholder="ws://127.0.0.1:18789"
                    value={settingsUrl}
                    onChange={(e) => setSettingsUrl(e.target.value)}
                  />
                </div>
                <div>
                  <div
                    className="text-[10px] uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Token
                  </div>
                  <input
                    type="password"
                    className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                    style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                    placeholder="gateway.auth.token"
                    value={settingsToken}
                    onChange={(e) => setSettingsToken(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  className="w-full text-xs py-1.5 rounded-md font-medium hover:opacity-80"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  保存并重连
                </button>
              </div>
            )}
          </div>
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
              className="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              style={{
                background: msg.role === "user" ? "var(--user-bubble)" : "var(--assistant-bubble)",
                color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
              }}
            >
              <MarkdownBlock content={msg.content} />
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
            {model ? shortModel(model) : "等待模型"}
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
                onClick={() => {
                  if (cmd.acceptsArgs) {
                    setInput(cmd.name + " ");
                    setShowCmdPalette(false);
                    inputRef.current?.focus();
                  } else {
                    handleSend(cmd.name);
                  }
                }}
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
          {isGenerating ? (
            <button
              onClick={handleStop}
              className="shrink-0 rounded-lg p-1.5"
              style={{ background: "#ff453a", color: "#fff" }}
              title="停止生成"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!connected || !input.trim()}
              className="shrink-0 rounded-lg p-1.5 disabled:opacity-30"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
