import { Settings, X } from "lucide-react";
import { useState } from "react";
import { gateway } from "../gateway/client";
import { useTheme } from "../theme/useTheme";

const GATEWAY_URL_KEY = "redclaw:gatewayUrl:v2";
const GATEWAY_TOKEN_KEY = "redclaw:gatewayToken";

// 全局设置（主题 + 连接）：入口在侧边栏底部。
// 保存连接信息后 stop/start 重连，与旧顶栏 popover 行为一致。
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const [url, setUrl] = useState(() => localStorage.getItem(GATEWAY_URL_KEY) ?? "");
  const [token, setToken] = useState(() => localStorage.getItem(GATEWAY_TOKEN_KEY) ?? "");

  function save() {
    const nextUrl = url.trim();
    const nextToken = token.trim();
    if (nextUrl) localStorage.setItem(GATEWAY_URL_KEY, nextUrl);
    else localStorage.removeItem(GATEWAY_URL_KEY);
    if (nextToken) localStorage.setItem(GATEWAY_TOKEN_KEY, nextToken);
    else localStorage.removeItem(GATEWAY_TOKEN_KEY);
    gateway.configure(nextUrl || undefined, nextToken);
    onClose();
    gateway.stop();
    gateway.start();
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
        className="w-[400px] max-w-[92vw] rounded-2xl border shadow-2xl p-4 space-y-3"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">设置</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-1">
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            主题
          </div>
          <div className="flex gap-1">
            {(
              [
                ["light", "浅色"],
                ["dark", "深色"],
                ["system", "跟随系统"],
              ] as const
            ).map(([value, label]) => {
              const active = themePreference === value;
              return (
                <button
                  key={value}
                  onClick={() => setThemePreference(value)}
                  className="flex-1 text-[10px] py-1.5 rounded-md font-medium transition-colors hover:opacity-80"
                  style={{
                    background: active ? "var(--accent)" : "var(--bg-tertiary)",
                    color: active ? "var(--on-solid)" : "var(--text-secondary)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}
          className="space-y-2"
        >
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Gateway URL
          </div>
          <input
            className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
            style={inputStyle}
            placeholder="ws://127.0.0.1:18789"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
          />
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Token
          </div>
          <input
            type="password"
            className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
            style={inputStyle}
            placeholder="gateway.auth.token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            onClick={save}
            className="w-full text-xs py-1.5 rounded-md font-medium hover:opacity-80"
            style={{ background: "var(--accent)", color: "var(--on-solid)" }}
          >
            保存并重连
          </button>
        </div>

        <div className="flex items-center gap-1.5 pt-1" style={{ color: "var(--text-secondary)" }}>
          <Settings size={11} />
          <span className="text-[10px]">涉及密钥的全局配置仍走 gateway 工具 / CLI</span>
        </div>
      </div>
    </div>
  );
}
