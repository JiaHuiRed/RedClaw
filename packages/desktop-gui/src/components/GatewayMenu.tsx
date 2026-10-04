import { ChevronDown, Plug, PlugZap, Power, RotateCw, Rocket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { gateway } from "../gateway/client";
import type { ConnectionState } from "../lib/connectionStatus";
import { CONNECTION_COLOR } from "../lib/connectionStatus";

interface GatewayMenuProps {
  connected: boolean;
  connecting: boolean;
  setConnecting: (v: boolean) => void;
  connectionState: ConnectionState;
}

// 网关连接 pill + 进程管理菜单：挂在全局标题栏右侧，任何界面都有
// 连接入口（此前只在会话内顶栏，主页断连时找不到连接的地方）。
export function GatewayMenu({
  connected,
  connecting,
  setConnecting,
  connectionState,
}: GatewayMenuProps) {
  const [show, setShow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    }
    if (show) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [show]);

  function handleConnect() {
    if (connected) {
      gateway.stop();
      return;
    }
    setConnecting(true);
    gateway.start();
  }

  // 启动网关进程：spawn 后立即试连一次，不等退避计时
  async function handleGatewaySpawn() {
    setShow(false);
    try {
      await gateway.spawnGatewayProcess();
      setConnecting(true);
      gateway.start();
      gateway.retryNow();
    } catch {
      // 错误已由 client 层 toast
    }
  }

  // 重启网关：已连接走 RPC 自重启（GUI 重连自动接上）；未连接退化为拉起进程
  async function handleGatewayRestart() {
    setShow(false);
    try {
      if (connected) {
        setConnecting(true);
        await gateway.restartGateway();
      } else {
        await handleGatewaySpawn();
      }
    } catch {
      // 错误已由 client 层 toast
    }
  }

  // 停止网关进程：仅对 GUI 拉起的进程有效；终端自启的不归 GUI 管
  async function handleGatewayStop() {
    setShow(false);
    try {
      const stopped = await gateway.stopGatewayProcess();
      if (!stopped) console.info("[GatewayMenu] 当前网关非 GUI 启动，跳过停止");
    } catch {
      // 错误已由 client 层 toast
    }
  }

  return (
    <div className="flex items-center relative" ref={rootRef}>
      <button
        onClick={() => setShow((v) => !v)}
        disabled={connecting}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md hover:opacity-80 disabled:opacity-50"
        style={{
          // Idle keeps the accent color (it's still an inviting call to
          // action, not a passive status readout) - connecting/connected/
          // error defer to the shared map so the button and the Sidebar
          // badge never disagree about what those three actually mean.
          background:
            connectionState === "idle" ? "var(--accent)" : CONNECTION_COLOR[connectionState],
          color: "var(--on-solid)",
        }}
        title="网关连接与管理"
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
        <ChevronDown size={12} className="opacity-70" />
      </button>
      {show && (
        <div
          className="absolute top-full right-0 mt-1 w-56 rounded-xl border shadow-lg z-50 overflow-hidden py-1"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        >
          {!connected && !connecting && (
            <button
              onClick={handleConnect}
              className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
            >
              <PlugZap size={13} style={{ color: "var(--accent)" }} />
              <span className="flex-1">连接网关</span>
            </button>
          )}
          <button
            onClick={() => void handleGatewaySpawn()}
            className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80"
            style={{ color: "var(--text-primary)" }}
          >
            <Rocket size={13} style={{ color: "var(--accent)" }} />
            <span className="flex-1">启动网关进程</span>
            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              后台
            </span>
          </button>
          <button
            onClick={() => void handleGatewayRestart()}
            className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80"
            style={{ color: "var(--text-primary)" }}
          >
            <RotateCw size={13} style={{ color: "var(--violet-9)" }} />
            <span className="flex-1">重启网关</span>
            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              {connected ? "热重启" : "拉起"}
            </span>
          </button>
          <button
            onClick={() => void handleGatewayStop()}
            className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80"
            style={{ color: "var(--text-primary)" }}
          >
            <Power size={13} style={{ color: "var(--danger)" }} />
            <span className="flex-1">停止网关进程</span>
            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              GUI 托管
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
