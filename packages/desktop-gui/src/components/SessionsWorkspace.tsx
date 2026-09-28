import { RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { gateway } from "../gateway/client";

type SessionRow = {
  key: string;
  label?: string;
  displayName?: string;
  kind: string;
  model?: string;
  status?: string;
  updatedAt?: number | null;
  totalTokens?: number;
  archived?: boolean;
  compactionCheckpointCount?: number;
};
type Checkpoint = { checkpointId: string; createdAt: number; reason: string; summary?: string };

export default function SessionsWorkspace({
  connected,
  onOpen,
}: {
  connected: boolean;
  onOpen: (key: string) => void;
}) {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [checkpoints, setCheckpoints] = useState<Record<string, Checkpoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadPage = useCallback(
    async (offset: number) => {
      if (!connected) return;
      setLoading(true);
      try {
        const result = await gateway.call<{ sessions: SessionRow[]; nextOffset?: number | null }>(
          "sessions.list",
          {
            includeGlobal: true,
            includeUnknown: true,
            configuredAgentsOnly: false,
            limit: 100,
            offset,
            ...(search.trim() ? { search: search.trim() } : {}),
          },
        );
        const page = (result.sessions ?? []).filter((row) => includeArchived || !row.archived);
        setRows((previous) => (offset === 0 ? page : [...previous, ...page]));
        setNextOffset(result.nextOffset ?? null);
        setError("");
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [connected, search, includeArchived],
  );

  const refresh = useCallback(() => loadPage(0), [loadPage]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function showCheckpoints(key: string) {
    if (checkpoints[key]) {
      setCheckpoints((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    setBusy(key);
    try {
      const result = await gateway.call<{ checkpoints: Checkpoint[] }>("sessions.compaction.list", {
        key,
      });
      setCheckpoints((current) => ({ ...current, [key]: result.checkpoints ?? [] }));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("");
    }
  }

  async function checkpointAction(method: "branch" | "restore", key: string, checkpointId: string) {
    const detail =
      method === "restore"
        ? "将当前会话恢复到此检查点？后续消息可能不再保留。"
        : "从此检查点创建新会话？";
    if (!window.confirm(detail)) return;
    setBusy(checkpointId);
    try {
      const result = await gateway.call<{ key?: string }>(`sessions.compaction.${method}`, {
        key,
        checkpointId,
      });
      setCheckpoints({});
      await refresh();
      if (method === "branch" && result.key) onOpen(result.key);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("");
    }
  }

  async function deleteSession(key: string) {
    if (!window.confirm(`删除会话 ${key}？转录记录也将归档。`)) return;
    setBusy(key);
    try {
      await gateway.call("sessions.delete", { key, deleteTranscript: true });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("");
    }
  }

  const inputStyle = {
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  };
  return (
    <section
      className="flex-1 min-w-0 overflow-y-auto px-8 py-7"
      style={{ color: "var(--text-primary)" }}
    >
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">会话管理</h2>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              查找、恢复或清理秋秋的会话
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={!connected || loading}
            title="刷新会话"
            className="p-2 rounded-md disabled:opacity-40"
            style={inputStyle}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <Search size={16} style={{ color: "var(--text-secondary)" }} />
          <input
            aria-label="搜索会话"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="按会话名称、关键词筛选"
            className="flex-1 min-w-0 text-sm px-3 py-2 rounded-lg outline-none"
            style={inputStyle}
          />
          <label
            className="text-xs flex items-center gap-1"
            style={{ color: "var(--text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            含归档
          </label>
        </div>
        {error && (
          <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {!connected && <p className="text-sm">连接 Gateway 后查看会话</p>}
        {loading && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            加载中…
          </p>
        )}
        {!loading && connected && rows.length === 0 && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            没有找到会话
          </p>
        )}
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="rounded-xl border p-3 space-y-2"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              <div className="flex justify-between gap-3 items-start">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {row.label || row.displayName || row.key}
                  </div>
                  <div
                    className="text-[11px] mt-1 truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {row.key} · {row.kind} · {row.model ?? "默认模型"} · {row.status ?? "空闲"}
                    {row.totalTokens !== undefined
                      ? ` · ${row.totalTokens.toLocaleString()} tokens`
                      : ""}
                    {row.updatedAt ? ` · ${new Date(row.updatedAt).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="shrink-0 flex gap-1">
                  <button
                    onClick={() => onOpen(row.key)}
                    className="text-xs px-2 py-1.5 rounded-md"
                    style={inputStyle}
                  >
                    打开
                  </button>
                  <button
                    onClick={() => void showCheckpoints(row.key)}
                    disabled={busy === row.key}
                    className="text-xs px-2 py-1.5 rounded-md disabled:opacity-40"
                    style={inputStyle}
                  >
                    检查点{row.compactionCheckpointCount ? ` ${row.compactionCheckpointCount}` : ""}
                  </button>
                  <button
                    onClick={() => void deleteSession(row.key)}
                    disabled={!!busy}
                    title="删除会话"
                    className="p-1.5 rounded-md disabled:opacity-40"
                    style={{ color: "var(--danger)" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {checkpoints[row.key] && (
                <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                  {checkpoints[row.key].length === 0 && <p className="text-xs">暂无压缩检查点</p>}
                  {checkpoints[row.key].map((point) => (
                    <div key={point.checkpointId} className="flex items-center gap-3 text-xs">
                      <span className="flex-1 min-w-0 truncate" title={point.summary}>
                        {new Date(point.createdAt).toLocaleString()} · {point.reason}{" "}
                        {point.summary ? `· ${point.summary}` : ""}
                      </span>
                      <button
                        onClick={() => void checkpointAction("branch", row.key, point.checkpointId)}
                        disabled={!!busy}
                        className="disabled:opacity-40"
                        style={{ color: "var(--accent)" }}
                      >
                        分支
                      </button>
                      <button
                        onClick={() =>
                          void checkpointAction("restore", row.key, point.checkpointId)
                        }
                        disabled={!!busy}
                        className="disabled:opacity-40"
                        style={{ color: "var(--danger)" }}
                      >
                        恢复
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {nextOffset !== null && (
          <button
            onClick={() => void loadPage(nextOffset)}
            disabled={loading}
            className="text-xs px-3 py-2 rounded-lg disabled:opacity-40"
            style={inputStyle}
          >
            加载更多会话
          </button>
        )}
      </div>
    </section>
  );
}
