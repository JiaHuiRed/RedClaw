import { Briefcase, ArrowUp, MessagesSquare, CalendarClock, ListTodo } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  gateway,
  HEARTBEAT_SESSION_KEY,
  type AgentSummary,
  type ChatSession,
  type CronJobSummary,
  type Todo,
} from "../gateway/client";
import ModeTabs, { type AppMode } from "./ModeTabs";

interface WorkHomeProps {
  connected: boolean;
  sessions: ChatSession[];
  onSend: (text: string, agentId: string) => void;
  onOpenSession: (sessionKey: string) => void;
  onSwitchMode: (mode: AppMode) => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function fmtRel(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtNext(ms?: number): string {
  if (!ms) return "待排程";
  const diff = ms - Date.now();
  if (diff <= 0) return "即将运行";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟后`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时后`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 工作台主页：居中输入 + 项目区选择 + 进行中聚合
// 美感基调参考 Codex 工作模式：标题柔光晕、无边框行式列表、大留白；交互细节保持自己的人格（时段问候）
export default function WorkHome({
  connected,
  sessions,
  onSend,
  onOpenSession,
  onSwitchMode,
}: WorkHomeProps) {
  const [text, setText] = useState("");
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentId, setAgentId] = useState("");
  const [cronJobs, setCronJobs] = useState<CronJobSummary[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void gateway
      .fetchAgents()
      .then((res) => {
        if (cancelled) return;
        setAgents(res.agents);
        setAgentId((prev) => prev || res.defaultId || res.agents[0]?.id || "");
      })
      .catch(() => undefined);
    // 进行中聚合：定时任务与待办拉一次即可（低频面，不做轮询）
    void gateway
      .fetchCronJobs()
      .then((jobs) => !cancelled && setCronJobs(jobs.filter((j) => j.enabled)))
      .catch(() => undefined);
    void gateway
      .fetchTodos()
      .then((all) => {
        if (cancelled) return;
        setTodos(
          all
            .filter((t) => t.status === "open" || t.status === "in_progress")
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connected]);

  // 最近会话：侧栏同源（status 的 recent），排除心跳与 cron/dreaming 后台会话
  const recentSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.sessionKey !== HEARTBEAT_SESSION_KEY && s.kind !== "cron")
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 4),
    [sessions],
  );
  const nextCron = useMemo(
    () =>
      [...cronJobs]
        .sort((a, b) => (a.state.nextRunAtMs ?? Infinity) - (b.state.nextRunAtMs ?? Infinity))
        .slice(0, 4),
    [cronJobs],
  );
  const openTodos = useMemo(() => todos.slice(0, 4), [todos]);

  const selected = useMemo(() => agents.find((a) => a.id === agentId), [agents, agentId]);

  function submit() {
    const msg = text.trim();
    if (!msg || !connected || !agentId) return;
    onSend(msg, agentId);
    setText("");
  }

  const hasActivity =
    connected && (recentSessions.length > 0 || nextCron.length > 0 || openTodos.length > 0);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 顶栏与聊天面板同高，双 tab 居中，两侧留白对称 */}
      <div
        className="flex items-center h-12 border-b shrink-0 relative"
        style={{ borderColor: "var(--border)" }}
        data-tauri-drag-region
      >
        <div className="absolute left-1/2 -translate-x-1/2">
          <ModeTabs mode="work" onChange={onSwitchMode} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 pt-[14vh] pb-16">
          {/* 标题 + 正后方柔光晕：把视线聚到输入区，不喧宾夺主 */}
          <div className="relative text-center mb-9">
            <div
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 -top-10 w-[460px] h-[200px] pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 9%, transparent), transparent 70%)",
              }}
            />
            <div
              className="relative text-[28px] font-semibold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {greeting()}，我们要做什么？
            </div>
          </div>

          {/* 大输入卡：聚焦时桃粉光晕（与聊天输入壳同款），呼吸感留白 */}
          <div
            className="input-shell rounded-2xl border shadow-sm transition-all duration-300 ease-out"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={connected ? "描述一件事，秋秋来跟进…" : "先连接网关，再给秋秋安排工作"}
              disabled={!connected}
              rows={3}
              autoFocus
              className="w-full resize-none bg-transparent outline-none text-[15px] leading-relaxed px-5 pt-5 rounded-t-2xl disabled:opacity-50"
              style={{ color: "var(--text-primary)" }}
            />
            <div className="flex items-center justify-end px-3.5 pb-3 pt-1">
              <button
                onClick={submit}
                disabled={!connected || !text.trim()}
                className="flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300 ease-out hover:opacity-85 hover:shadow-md disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--on-solid)" }}
                title="发送（Enter）"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>

          {/* 项目区独立条：输入卡下方，与 Codex「选择项目」同位不同形 */}
          <div className="flex items-center justify-between mt-2.5 px-1">
            <label
              className="flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 cursor-pointer transition-colors duration-200 hover:opacity-80"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
              title="工作交给哪个项目区"
            >
              <Briefcase size={13} />
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="bg-transparent outline-none text-xs cursor-pointer"
                style={{ color: "var(--text-primary)" }}
              >
                {agents.length === 0 && <option value="">默认项目区</option>}
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.identity?.name || a.id}
                  </option>
                ))}
              </select>
            </label>
            {selected?.workspace && (
              <div
                className="text-[11px] truncate max-w-[50%]"
                style={{ color: "var(--text-secondary)" }}
                title={selected.workspace}
              >
                {selected.workspace.split(/[\\/]/).filter(Boolean).pop() || selected.workspace}
              </div>
            )}
          </div>

          {/* 进行中聚合：行式列表（无边框），悬浮轻浮起 */}
          {hasActivity && (
            <div className="grid grid-cols-3 gap-6 mt-12">
              <div>
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium mb-2 px-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <MessagesSquare size={12} style={{ color: "var(--info)" }} />
                  最近会话
                </div>
                <div className="flex flex-col">
                  {recentSessions.length === 0 && <EmptyHint text="暂无会话" />}
                  {recentSessions.map((s) => (
                    <button
                      key={s.sessionKey}
                      onClick={() => onOpenSession(s.sessionKey)}
                      className="group flex items-center gap-2 text-left px-2 py-2 rounded-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[var(--bg-tertiary)]"
                    >
                      <MessagesSquare
                        size={13}
                        className="shrink-0"
                        style={{ color: "var(--info)" }}
                      />
                      <div
                        className="flex-1 min-w-0 text-xs truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {s.title || s.model || s.sessionKey}
                      </div>
                      <div
                        className="shrink-0 text-[10px] group-hover:opacity-0 transition-opacity duration-200"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {fmtRel(s.updatedAt)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium mb-2 px-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <CalendarClock size={12} style={{ color: "var(--violet)" }} />
                  定时任务
                </div>
                <div className="flex flex-col">
                  {nextCron.length === 0 && <EmptyHint text="暂无启用的任务" />}
                  {nextCron.map((j) => (
                    <div
                      key={j.id}
                      className="group flex items-center gap-2 px-2 py-2 rounded-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[var(--bg-tertiary)]"
                      title={j.description || j.name}
                    >
                      <CalendarClock
                        size={13}
                        className="shrink-0"
                        style={{ color: "var(--violet)" }}
                      />
                      <div
                        className="flex-1 min-w-0 text-xs truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {j.name}
                      </div>
                      <div
                        className="shrink-0 text-[10px] group-hover:opacity-0 transition-opacity duration-200"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {fmtNext(j.state.nextRunAtMs)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium mb-2 px-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <ListTodo size={12} style={{ color: "var(--success)" }} />
                  待办
                </div>
                <div className="flex flex-col">
                  {openTodos.length === 0 && <EmptyHint text="暂无待办" />}
                  {openTodos.map((t) => (
                    <div
                      key={t.id}
                      className="group flex items-center gap-2 px-2 py-2 rounded-xl transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-[var(--bg-tertiary)]"
                      title={t.notes || t.title}
                    >
                      <ListTodo
                        size={13}
                        className="shrink-0"
                        style={{ color: "var(--success)" }}
                      />
                      <div
                        className="flex-1 min-w-0 text-xs truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {t.status === "in_progress" ? "▶ " : ""}
                        {t.title}
                      </div>
                      <div
                        className="shrink-0 text-[10px] group-hover:opacity-0 transition-opacity duration-200"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {fmtRel(t.updatedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="text-[11px] px-2 py-1.5" style={{ color: "var(--text-secondary)" }}>
      {text}
    </div>
  );
}
