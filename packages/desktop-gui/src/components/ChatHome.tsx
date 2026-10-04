import { ArrowUp } from "lucide-react";
import { useState } from "react";
import ModeTabs, { type AppMode } from "./ModeTabs";

interface ChatHomeProps {
  connected: boolean;
  onSend: (text: string, agentId: string) => void;
  onSwitchMode: (mode: AppMode) => void;
}

// 主页聊天态：与工作台主页（WorkHome）同骨架的入口页。
// 发送即进入与秋秋的默认会话（agent:main:main，家人感连续上下文），
// 之后就是纯会话界面——主页才区分聊天/工作，会话中不区分。
export default function ChatHome({ connected, onSend, onSwitchMode }: ChatHomeProps) {
  const [text, setText] = useState("");

  function submit() {
    const msg = text.trim();
    if (!msg || !connected) return;
    onSend(msg, "main");
    setText("");
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 顶栏与工作台主页同高，双 tab 居中；进会话后由 ChatPanel 的会话顶栏接管 */}
      <div
        className="flex items-center h-12 border-b shrink-0 relative"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="absolute left-1/2 -translate-x-1/2">
          <ModeTabs mode="chat" onChange={onSwitchMode} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 pt-[14vh] pb-16">
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
              我们从哪里开始？
            </div>
          </div>

          {/* 大输入卡：与工作台主页同款，聚焦光晕由 input-shell 类负责 */}
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
              placeholder={connected ? "和秋秋说点什么…" : "先连接网关，再和秋秋聊天"}
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
        </div>
      </div>
    </div>
  );
}
