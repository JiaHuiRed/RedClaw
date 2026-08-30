import { CalendarClock, Check, Play, Plus, RefreshCw, Trash2, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { gateway, type CronJobSummary } from "../gateway/client";
import ResizeHandle from "./ResizeHandle";

interface CronPanelProps {
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
}

function fmtTime(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function scheduleLabel(job: CronJobSummary): string {
  if (job.schedule?.kind === "cron" && job.schedule.expr) {
    return job.schedule.expr + (job.schedule.tz ? ` (${job.schedule.tz})` : "");
  }
  if (job.schedule?.kind === "every" && job.schedule.everyMs) {
    const min = Math.round(job.schedule.everyMs / 60000);
    return min % 60 === 0 ? `每 ${min / 60} 小时` : `每 ${min} 分钟`;
  }
  return job.schedule?.kind ?? "";
}

const RUN_STATUS_LABEL: Record<string, string> = {
  ok: "成功",
  error: "失败",
  skipped: "跳过",
  running: "运行中",
};

// 定时任务面板：cron.list/update/remove/run 驱动（列表 + 开关 + 立即运行 + 删除 + 新建）
export default function CronPanel({ width, onResize, onClose }: CronPanelProps) {
  const [jobs, setJobs] = useState<CronJobSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setJobs(await gateway.fetchCronJobs());
    } catch (err) {
      console.error("[CronPanel] list failed:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggleEnabled(job: CronJobSummary) {
    setJobs((prev) =>
      (prev ?? []).map((j) => (j.id === job.id ? { ...j, enabled: !j.enabled } : j)),
    );
    try {
      await gateway.cronSetEnabled(job.id, !job.enabled);
    } catch (err) {
      console.error("[CronPanel] toggle failed:", err);
      void refresh();
    }
  }

  async function runNow(job: CronJobSummary) {
    try {
      await gateway.cronRunNow(job.id);
    } catch (err) {
      console.error("[CronPanel] run failed:", err);
    }
  }

  async function remove(job: CronJobSummary) {
    if (confirmDelete !== job.id) {
      setConfirmDelete(job.id);
      setTimeout(() => setConfirmDelete((cur) => (cur === job.id ? null : cur)), 3000);
      return;
    }
    try {
      await gateway.cronRemove(job.id);
      setJobs((prev) => (prev ?? []).filter((j) => j.id !== job.id));
    } catch (err) {
      console.error("[CronPanel] remove failed:", err);
    }
    setConfirmDelete(null);
  }

  return (
    <aside
      className="flex flex-col rounded-2xl border shrink-0 relative my-2 mr-2"
      style={{
        width,
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <ResizeHandle
        width={width}
        onResize={onResize}
        min={240}
        max={560}
        direction={-1}
        style={{ left: -2 }}
      />
      <div
        className="flex items-center justify-between px-4 h-12 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-sm font-medium">定时任务</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCreate(true)}
            className="p-1.5 rounded-md hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
            title="新建定时任务"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => void refresh()}
            className="p-1.5 rounded-md hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
            title="刷新"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {jobs === null && (
          <div className="text-xs text-center py-10" style={{ color: "var(--text-secondary)" }}>
            加载中…
          </div>
        )}
        {jobs?.length === 0 && (
          <div className="text-xs text-center py-10" style={{ color: "var(--text-secondary)" }}>
            暂无定时任务
          </div>
        )}
        {jobs?.map((job) => {
          const lastStatus = job.state?.lastRunStatus;
          return (
            <div
              key={job.id}
              className="rounded-xl p-3 space-y-1.5"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <CalendarClock
                  size={13}
                  className="shrink-0"
                  style={{ color: job.enabled ? "var(--accent)" : "var(--text-secondary)" }}
                />
                <span
                  className="text-xs font-medium truncate flex-1"
                  style={{ color: job.enabled ? "var(--text-primary)" : "var(--text-secondary)" }}
                  title={job.payload?.message}
                >
                  {job.name}
                </span>
                {job.payload?.lightContext === true && (
                  <span
                    className="shrink-0 flex items-center gap-0.5 text-[9px] px-1 py-px rounded"
                    style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                    title="轻上下文：不注入认知文件，冷启动省 token"
                  >
                    <Zap size={9} />
                    轻上下文
                  </span>
                )}
                {/* 开关 */}
                <button
                  onClick={() => void toggleEnabled(job)}
                  className="shrink-0 rounded-full relative transition-colors"
                  style={{
                    background: job.enabled ? "var(--accent)" : "var(--border)",
                    width: 32,
                    height: 18,
                  }}
                  title={job.enabled ? "点击停用" : "点击启用"}
                >
                  <span
                    className="absolute rounded-full bg-white"
                    style={{
                      top: 2,
                      width: 14,
                      height: 14,
                      left: job.enabled ? 16 : 2,
                    }}
                  />
                </button>
              </div>

              <div
                className="flex items-center gap-2 text-[11px] flex-wrap"
                style={{ color: "var(--text-secondary)" }}
              >
                <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                  {scheduleLabel(job)}
                </span>
                {job.state?.nextRunAtMs && <span>· 下次 {fmtTime(job.state.nextRunAtMs)}</span>}
                {job.state?.lastRunAtMs && (
                  <span>
                    · 上次 {fmtTime(job.state.lastRunAtMs)}
                    {lastStatus ? `（${RUN_STATUS_LABEL[lastStatus] ?? lastStatus}）` : ""}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  onClick={() => void runNow(job)}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md hover:opacity-80"
                  style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
                  title="立即运行一次"
                >
                  <Play size={10} />
                  运行
                </button>
                <span className="flex-1" />
                {confirmDelete === job.id ? (
                  <button
                    onClick={() => void remove(job)}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md"
                    style={{ background: "var(--danger)", color: "var(--on-solid)" }}
                    title="再次点击确认删除"
                  >
                    <Check size={10} />
                    确认删除
                  </button>
                ) : (
                  <button
                    onClick={() => void remove(job)}
                    className="p-1 rounded-md hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                    title="删除定时任务"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CronCreateForm
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void refresh();
          }}
        />
      )}
    </aside>
  );
}

function CronCreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("0 9 * * *");
  const [message, setMessage] = useState("");
  const [lightContext, setLightContext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && expr.trim().length > 0 && message.trim().length > 0;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await gateway.cronCreate({
        name: name.trim(),
        scheduleExpr: expr.trim(),
        message: message.trim(),
        lightContext,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55"
      onClick={onClose}
    >
      <div
        className="w-[460px] max-w-[92vw] rounded-2xl border shadow-2xl p-4 space-y-3"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">新建定时任务</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={14} />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            名称
          </span>
          <input
            className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：每天早上提醒喝水"
            autoFocus
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Cron 表达式（Asia/Hong_Kong 时区）
          </span>
          <input
            className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
            style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)" }}
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="0 9 * * *"
            spellCheck={false}
          />
          <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
            分 时 日 月 周 —— 「0 9 * * *」= 每天 9:00；「0 9,14,20 * * *」= 每天 9/14/20 点
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            任务指令
          </span>
          <textarea
            className="w-full text-xs px-2.5 py-2 rounded-lg outline-none resize-none"
            style={inputStyle}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="到点后发给 agent 的完整指令（写清楚要做什么、怎么做、完成后怎么汇报）"
          />
        </label>

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={lightContext}
            onChange={(e) => setLightContext(e.target.checked)}
          />
          <span style={{ color: "var(--text-primary)" }}>轻上下文</span>
          <span style={{ color: "var(--text-secondary)" }}>
            （不注入认知文件，单次冷启动省 ~17k tokens；任务指令需自包含）
          </span>
        </label>

        {error && (
          <div className="text-xs px-2.5 py-2 rounded-lg" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            className="text-xs px-3.5 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-30"
            style={{ background: "var(--accent)", color: "var(--on-solid)" }}
          >
            {busy ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
