import { Briefcase, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { gateway, type AgentSummary } from "../gateway/client";
import ModeTabs, { type AppMode } from "./ModeTabs";

interface WorkHomeProps {
  connected: boolean;
  onSend: (text: string, agentId: string) => void;
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

// 工作台主页：居中输入 + 项目区选择（参考 ChatGPT Work/Codex 布局骨架）
export default function WorkHome({ connected, onSend, onSwitchMode }: WorkHomeProps) {
  const [text, setText] = useState("");
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentId, setAgentId] = useState("");

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
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const selected = useMemo(() => agents.find((a) => a.id === agentId), [agents, agentId]);

  function submit() {
    const msg = text.trim();
    if (!msg || !connected || !agentId) return;
    onSend(msg, agentId);
    setText("");
  }

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

          {/* 进行中的工作聚合区：下一步接入 */}
          {selected?.workspace && (
            <div
              className="text-center text-[11px] mt-3"
              style={{ color: "var(--text-secondary)" }}
            >
              {selected.workspace}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
