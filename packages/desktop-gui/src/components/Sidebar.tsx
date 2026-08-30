import {
  Plus,
  MessageCircle,
  Check,
  X,
  Pencil,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Folder,
  Settings,
} from "lucide-react";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  memo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { gateway, type ChatSession, type AgentSummary } from "../gateway/client";
import type { ConnectionState } from "../lib/connectionStatus";
import ConnectionBadge from "./ConnectionBadge";
import ProjectAreaModal from "./ProjectAreaModal";
import SettingsModal from "./SettingsModal";

const COLLAPSED_KEY = "redclaw:sidebarCollapsed";
const WIDTH_KEY = "redclaw:sidebarWidth";
const GROUPS_KEY = "redclaw:collapsedGroups";
const DEFAULT_WIDTH = 260;
const COLLAPSED_WIDTH = 48;
const MIN_WIDTH = 160;
const MAX_WIDTH = 480;

interface SidebarProps {
  connected: boolean;
  connectionState: ConnectionState;
  sessions: ChatSession[];
  currentSessionKey: string;
  onSelectSession: (sessionKey: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionKey: string) => void;
  onRenameSession: (sessionKey: string, label: string) => void;
}

interface SessionGroup {
  agentId: string;
  agent?: AgentSummary;
  displayName: string;
  emoji: string;
  workspace?: string;
  isDefault: boolean;
  sessions: ChatSession[];
}

function sessionTitle(s: ChatSession): string {
  return s.title || s.model || s.sessionKey.split("/").pop() || s.sessionKey;
}

function sessionTime(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// sessionKey 形如 agent:<agentId>:<name>；其余前缀归入 "other"
function agentIdOfSession(sessionKey: string): string {
  if (sessionKey.startsWith("agent:")) {
    const id = sessionKey.split(":")[1];
    if (id) return id;
  }
  return "other";
}

function Sidebar({
  connected,
  connectionState,
  sessions,
  currentSessionKey,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === "1");
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(saved) && saved >= MIN_WIDTH ? saved : DEFAULT_WIDTH;
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeleteArea, setConfirmDeleteArea] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [defaultAgentId, setDefaultAgentId] = useState("main");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "[]") as string[]),
  );
  const [areaModal, setAreaModal] = useState<{
    mode: "create" | "edit";
    agent?: AgentSummary;
  } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      if (areaConfirmTimeoutRef.current) clearTimeout(areaConfirmTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([...collapsedGroups]));
  }, [collapsedGroups]);

  // 项目区元数据（agents.list）：连接后拉取，编辑后刷新
  const refreshAgents = useCallback(async () => {
    try {
      const { defaultId, agents: list } = await gateway.fetchAgents();
      setAgents(list);
      setDefaultAgentId(defaultId);
    } catch (err) {
      console.error("[Sidebar] fetchAgents failed:", err);
    }
  }, []);

  useEffect(() => {
    if (connected) void refreshAgents();
  }, [connected, refreshAgents]);

  // 会话按项目区分组：默认区排最前，其余按 agents.list 顺序，未识别前缀归"其他"
  const groups = useMemo<SessionGroup[]>(() => {
    const byId = new Map(agents.map((a) => [a.id, a]));
    const grouped = new Map<string, ChatSession[]>();
    for (const s of sessions) {
      const id = agentIdOfSession(s.sessionKey);
      const list = grouped.get(id) ?? [];
      list.push(s);
      grouped.set(id, list);
    }
    const ids = [...grouped.keys()];
    ids.sort((a, b) => {
      if (a === defaultAgentId) return -1;
      if (b === defaultAgentId) return 1;
      const ai = agents.findIndex((x) => x.id === a);
      const bi = agents.findIndex((x) => x.id === b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return ids.map((id) => {
      const agent = byId.get(id);
      return {
        agentId: id,
        agent,
        displayName: id === "other" ? "其他" : agent?.identity?.name || agent?.name || id,
        emoji: agent?.identity?.emoji || (id === "other" ? "📄" : "📁"),
        workspace: agent?.workspace,
        isDefault: id === defaultAgentId,
        sessions: grouped.get(id) ?? [],
      };
    });
  }, [sessions, agents, defaultAgentId]);

  const startDrag = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      setCollapsed(false);
      dragRef.current = { startX: e.clientX, startWidth: width };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const next = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, dragRef.current.startWidth + (ev.clientX - dragRef.current.startX)),
        );
        setWidth(next);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width],
  );

  const startEdit = (s: ChatSession) => {
    setEditingKey(s.sessionKey);
    setEditValue(s.title || "");
  };

  const commitEdit = () => {
    if (editingKey && editValue.trim()) {
      onRenameSession(editingKey, editValue.trim());
    }
    setEditingKey(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue("");
  };

  const handleDelete = (sessionKey: string) => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    if (confirmDelete === sessionKey) {
      onDeleteSession(sessionKey);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(sessionKey);
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirmDelete(null);
      }, 3000);
    }
  };

  const toggleGroup = (agentId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  // 在指定项目区里新建会话并切换过去
  const newSessionInArea = async (agentId: string) => {
    try {
      const key = await gateway.createSession(agentId === "other" ? {} : { agentId });
      onSelectSession(key);
    } catch (err) {
      console.error("[Sidebar] create session failed:", err);
    }
  };

  const handleAreaSaved = async (agentId: string, created: boolean) => {
    setAreaModal(null);
    setConfirmDeleteArea(null);
    await refreshAgents();
    if (created && agentId !== "other") {
      void newSessionInArea(agentId);
    }
  };

  const handleDeleteArea = (agentId: string) => {
    if (areaConfirmTimeoutRef.current) clearTimeout(areaConfirmTimeoutRef.current);
    if (confirmDeleteArea === agentId) {
      void gateway
        .deleteAgent(agentId)
        .then(() => refreshAgents())
        .catch((err) => console.error("[Sidebar] delete agent failed:", err));
      setConfirmDeleteArea(null);
    } else {
      setConfirmDeleteArea(agentId);
      areaConfirmTimeoutRef.current = setTimeout(() => {
        setConfirmDeleteArea(null);
      }, 3000);
    }
  };

  const renderSessionRow = (s: ChatSession) => {
    const active = s.sessionKey === currentSessionKey;
    const isEditing = editingKey === s.sessionKey;
    return (
      <div
        key={s.sessionKey}
        className="group relative w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs transition-colors hover:opacity-90"
        style={{
          background: active ? "var(--bg-tertiary)" : "transparent",
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
        onClick={() => {
          if (!isEditing) onSelectSession(s.sessionKey);
        }}
      >
        <MessageCircle
          size={14}
          className="mt-0.5 shrink-0"
          style={{ color: "var(--text-secondary)" }}
        />
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                className="flex-1 text-xs px-1 py-0.5 rounded border outline-none"
                style={{
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  borderColor: "var(--border)",
                }}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                onBlur={commitEdit}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  commitEdit();
                }}
                className="p-0.5 rounded hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
              >
                <Check size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cancelEdit();
                }}
                className="p-0.5 rounded hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <>
              <div className="font-medium truncate">{sessionTitle(s)}</div>
              <div
                className="flex items-center gap-2 mt-1"
                style={{ color: "var(--text-secondary)" }}
              >
                <span className="truncate">{s.configuredModel || s.model || "—"}</span>
                {s.updatedAt && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="shrink-0">{sessionTime(s.updatedAt)}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Hover actions */}
        {!isEditing && (
          <div
            className="hidden group-hover:flex items-center gap-0.5 absolute right-2 top-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => startEdit(s)}
              className="p-1 rounded hover:opacity-70"
              style={{ color: "var(--text-secondary)" }}
              title="重命名"
            >
              <Pencil size={12} />
            </button>
            {confirmDelete === s.sessionKey ? (
              <button
                onClick={() => handleDelete(s.sessionKey)}
                className="p-1 rounded"
                style={{ color: "var(--danger)" }}
                title="确认删除"
              >
                <Trash2 size={12} />
              </button>
            ) : (
              <button
                onClick={() => handleDelete(s.sessionKey)}
                className="p-1 rounded hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
                title="删除会话"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className="relative flex flex-col border-r shrink-0"
        style={{
          width: collapsed ? COLLAPSED_WIDTH : width,
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 h-12 border-b shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          {collapsed ? (
            <div className="flex flex-col items-center justify-center gap-2 w-full">
              <button
                onClick={() => setCollapsed(false)}
                className="p-1.5 rounded-md hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
                title="展开侧边栏"
              >
                <PanelLeftOpen size={16} />
              </button>
              <button
                onClick={onNewSession}
                className="p-1.5 rounded-md hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
                title="新建会话"
              >
                <Plus size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ConnectionBadge state={connectionState} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  RedClaw
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onNewSession}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-md hover:opacity-80"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                  title="新建会话"
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => setCollapsed(true)}
                  className="p-1.5 rounded-md hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                  title="折叠侧边栏"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>
            </>
          )}
        </div>

        {/* 项目区分组会话列表 */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.length === 0 && (
              <div className="text-xs text-center py-8" style={{ color: "var(--text-secondary)" }}>
                {connected ? "暂无会话" : "未连接"}
              </div>
            )}
            {groups.map((g) => {
              const isCollapsed = collapsedGroups.has(g.agentId);
              const workspaceName = g.workspace
                ? g.workspace
                    .replace(/[\\/]+$/, "")
                    .split(/[\\/]/)
                    .pop()
                : "";
              return (
                <div key={g.agentId} className="space-y-0.5">
                  {/* 分组头 */}
                  <div
                    className="group/area relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs cursor-pointer select-none hover:opacity-90"
                    onClick={() => toggleGroup(g.agentId)}
                    title={g.workspace || g.agentId}
                  >
                    {isCollapsed ? (
                      <ChevronRight
                        size={12}
                        className="shrink-0"
                        style={{ color: "var(--text-secondary)" }}
                      />
                    ) : (
                      <ChevronDown
                        size={12}
                        className="shrink-0"
                        style={{ color: "var(--text-secondary)" }}
                      />
                    )}
                    <span className="shrink-0">{g.emoji}</span>
                    <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {g.displayName}
                    </span>
                    {g.isDefault && (
                      <span
                        className="shrink-0 text-[9px] px-1 py-px rounded"
                        style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                      >
                        默认
                      </span>
                    )}
                    {workspaceName && (
                      <span
                        className="truncate text-[10px] opacity-60"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {workspaceName}
                      </span>
                    )}
                    <span className="flex-1" />
                    <span
                      className="text-[10px] shrink-0"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {g.sessions.length}
                    </span>

                    {/* 分组 hover 操作 */}
                    <div
                      className="hidden group-hover/area:flex items-center gap-0.5 absolute right-1 top-1/2 -translate-y-1/2 px-1 rounded-md"
                      style={{ background: "var(--bg-secondary)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => void newSessionInArea(g.agentId)}
                        className="p-1 rounded hover:opacity-70"
                        style={{ color: "var(--text-secondary)" }}
                        title="在此项目区新建会话"
                      >
                        <Plus size={12} />
                      </button>
                      {g.agentId !== "other" && (
                        <>
                          <button
                            onClick={() => setAreaModal({ mode: "edit", agent: g.agent })}
                            className="p-1 rounded hover:opacity-70"
                            style={{ color: "var(--text-secondary)" }}
                            title="编辑项目区"
                          >
                            <Pencil size={12} />
                          </button>
                          {!g.isDefault &&
                            (confirmDeleteArea === g.agentId ? (
                              <button
                                onClick={() => handleDeleteArea(g.agentId)}
                                className="p-1 rounded"
                                style={{ color: "var(--danger)" }}
                                title="确认删除项目区（不删工作区文件）"
                              >
                                <Trash2 size={12} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDeleteArea(g.agentId)}
                                className="p-1 rounded hover:opacity-70"
                                style={{ color: "var(--text-secondary)" }}
                                title="删除项目区"
                              >
                                <Trash2 size={12} />
                              </button>
                            ))}
                        </>
                      )}
                    </div>
                  </div>

                  {/* 分组内会话 */}
                  {!isCollapsed &&
                    (g.sessions.length > 0 ? (
                      g.sessions.map(renderSessionRow)
                    ) : (
                      <div
                        className="text-[11px] px-3 py-1.5 flex items-center gap-1.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <Folder size={11} />
                        暂无会话，点 + 新建
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer：新建项目区 + 设置 + 版本 */}
        {!collapsed && (
          <div
            className="p-3 border-t flex items-center justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              onClick={() => setAreaModal({ mode: "create" })}
              disabled={!connected}
              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md hover:opacity-80 disabled:opacity-40"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
              title="新建项目区（独立工作区的 agent）"
            >
              <FolderPlus size={13} />
              新建项目区
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="p-1.5 rounded-md hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
                title="设置（主题 / 连接）"
              >
                <Settings size={14} />
              </button>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                v{__REDCLAW_VERSION__}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Drag handle */}
      {!collapsed && (
        <div
          onMouseDown={startDrag}
          className="shrink-0 cursor-col-resize"
          style={{ width: 3, background: "var(--border)" }}
          title="拖拽调整宽度"
        />
      )}

      {areaModal && (
        <ProjectAreaModal
          mode={areaModal.mode}
          agent={areaModal.agent}
          defaultAgentId={defaultAgentId}
          modelOptions={gateway.models.map((m) => m.id)}
          onClose={() => setAreaModal(null)}
          onSaved={(agentId, created) => void handleAreaSaved(agentId, created)}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}

// props 全部稳定引用（App 层 useCallback/useMemo），流式期间跳过会话列表重渲染
export default memo(Sidebar);
