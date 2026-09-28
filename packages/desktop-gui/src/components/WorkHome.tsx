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

// 工作台主页：居中输入 + 项目区选择 + 进行中聚合（参考 ChatGPT Work/Codex 布局骨架）
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

  // 最近会话：侧栏同源（status 的 recent），排除心跳隔离会话
  const recentSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.sessionKey !== HEARTBEAT_SESSION_KEY)
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
      >
        <div className="absolute left-1/2 -translate-x-1/2">
          <ModeTabs mode="work" onChange={onSwitchMode} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 pt-[14vh] pb-10">
          <div className="text-center mb-8">
            <div className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
              {greeting()}，我们要做什么？
            </div>
            <div className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
              交给秋秋一件事，随时回来看进度
            </div>
          </div>

          {/* 大输入卡：hover 轻浮起，呼吸感 */}
          <div
            className="rounded-2xl border shadow-sm transition-all duration-300 ease-out hover:shadow-md hover:-translate-y-0.5"
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
              className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed px-4 pt-4 rounded-t-2xl disabled:opacity-50"
              style={{ color: "var(--text-primary)" }}
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <label
                className="flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 cursor-pointer"
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
              <button
                onClick={submit}
                disabled={!connected || !text.trim()}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 ease-out hover:opacity-85 disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--on-solid)" }}
                title="发送（Enter）"
              >
                <ArrowUp size={15} />
              </button>
            </div>
          </div>

          {selected?.workspace && (
            <div
              className="text-center text-[11px] mt-3"
              style={{ color: "var(--text-secondary)" }}
            >
              {selected.workspace}
            </div>
          )}

          {/* 进行中聚合：最近会话 / 定时任务 / 待办 */}
          {hasActivity && (
            <div className="grid grid-cols-3 gap-3 mt-10">
              <div>
                <div
                  className="flex items-center gap-1.5 text-[11px] font-medium mb-2 px-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <MessagesSquare size={12} />
                  最近会话
                </div>
                <div className="flex flex-col gap-1.5">
                  {recentSessions.length === 0 && <EmptyHint text="暂无会话" />}
                  {recentSessions.map((s) => (
                    <button
                      key={s.sessionKey}
                      onClick={() => onOpenSession(s.sessionKey)}
                      className="text-left rounded-xl border px-3 py-2 transition-all duration-300 ease-out hover:shadow-sm hover:-translate-y-0.5"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
                    >
                      <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                        {s.title || s.model || s.sessionKey}
                      </div>
                      <div
                        className="text-[10px] mt-0.5"
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
                  className="flex items-center gap-1.5 text-[11px] font-medium mb-2 px-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <CalendarClock size={12} />
                  定时任务
                </div>
                <div className="flex flex-col gap-1.5">
                  {nextCron.length === 0 && <EmptyHint text="暂无启用的任务" />}
                  {nextCron.map((j) => (
                    <div
                      key={j.id}
                      className="rounded-xl border px-3 py-2"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
                      title={j.description || j.name}
                    >
                      <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                        {j.name}
                      </div>
                      <div
                        className="text-[10px] mt-0.5"
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
                  className="flex items-center gap-1.5 text-[11px] font-medium mb-2 px-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <ListTodo size={12} />
                  待办
                </div>
                <div className="flex flex-col gap-1.5">
                  {openTodos.length === 0 && <EmptyHint text="暂无待办" />}
                  {openTodos.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl border px-3 py-2"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
                      title={t.notes || t.title}
                    >
                      <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                        {t.status === "in_progress" ? "▶ " : ""}
                        {t.title}
                      </div>
                      <div
                        className="text-[10px] mt-0.5"
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
    <div className="text-[11px] px-1 py-1" style={{ color: "var(--text-secondary)" }}>
      {text}
    </div>
  );
}
