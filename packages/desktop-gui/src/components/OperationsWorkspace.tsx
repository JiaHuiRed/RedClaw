import { RefreshCw, Save, Settings } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { gateway } from "../gateway/client";
import { useTheme } from "../theme/useTheme";

type Section =
  | "general"
  | "overview"
  | "devices"
  | "nodes"
  | "approvals"
  | "dreams"
  | "logs"
  | "providers"
  | "config";
type Device = {
  deviceId: string;
  displayName?: string;
  roles?: string[];
  tokens?: { role: string; revokedAtMs?: number }[];
};
type Pending = { requestId: string; deviceId: string; displayName?: string; role?: string };
type Node = {
  nodeId?: string;
  displayName?: string;
  platform?: string;
  connected?: boolean;
  paired?: boolean;
};
type ConfigOriginEntry = { path: string; source: string };
type ConfigSnapshot = {
  hash?: string;
  sourceConfig?: Record<string, unknown>;
  config?: Record<string, unknown>;
  valid?: boolean;
  issues?: { path: string; message: string }[];
  origins?: ConfigOriginEntry[];
  originsTruncated?: boolean;
};
type ProviderRow = { id: string; baseUrl?: string; api?: string; modelCount: number };
type ProviderForm = {
  baseUrl: string;
  modelId: string;
  apiKey: string;
  compatibility: "openai" | "anthropic";
  providerId: string;
  alias: string;
};
type LogTail = { lines?: string[]; file?: string };
type DreamDiary = { found?: boolean; content?: string; path?: string };
type ExecApprovalsSnapshot = {
  path: string;
  exists: boolean;
  hash: string;
  file: Record<string, unknown>;
};

function OriginBadge({ source }: { source: string | undefined }) {
  if (!source) return null;
  const isOverride = source === "override";
  return (
    <span
      className="shrink-0 text-[9px] leading-4 px-1 rounded"
      style={{
        background: "var(--bg-tertiary)",
        color: isOverride ? "var(--accent)" : "var(--text-secondary)",
      }}
    >
      {isOverride ? "覆盖" : "自定义"}
    </span>
  );
}
const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "通用设置" },
  { id: "overview", label: "运行概况" },
  { id: "devices", label: "设备配对" },
  { id: "nodes", label: "节点" },
  { id: "approvals", label: "执行审批" },
  { id: "dreams", label: "梦境与记忆" },
  { id: "logs", label: "日志" },
  { id: "providers", label: "模型供应商" },
  { id: "config", label: "高级配置" },
];

// 旧侧栏底部齿轮（SettingsModal）已并入这里：主题 + 连接是仅有的全局设置
const GATEWAY_URL_KEY = "redclaw:gatewayUrl:v2";
const GATEWAY_TOKEN_KEY = "redclaw:gatewayToken";

export default function OperationsWorkspace({ connected }: { connected: boolean }) {
  const [section, setSection] = useState<Section>("general");
  const { preference: themePreference, setPreference: setThemePreference } = useTheme();
  const [gwUrl, setGwUrl] = useState(() => localStorage.getItem(GATEWAY_URL_KEY) ?? "");
  const [gwToken, setGwToken] = useState(() => localStorage.getItem(GATEWAY_TOKEN_KEY) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [presence, setPresence] = useState<Record<string, unknown>[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [dream, setDream] = useState<Record<string, unknown> | null>(null);
  const [diary, setDiary] = useState<DreamDiary | null>(null);
  const [logs, setLogs] = useState<LogTail | null>(null);
  const [approvalTarget, setApprovalTarget] = useState("");
  const [approvals, setApprovals] = useState<ExecApprovalsSnapshot | null>(null);
  const [approvalsOriginal, setApprovalsOriginal] = useState("");
  const [approvalsDraft, setApprovalsDraft] = useState("");
  const [config, setConfig] = useState<ConfigSnapshot | null>(null);
  const [configKey, setConfigKey] = useState("");
  const [original, setOriginal] = useState("");
  const [draft, setDraft] = useState("");
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderForm>({
    baseUrl: "",
    modelId: "",
    apiKey: "",
    compatibility: "openai",
    providerId: "",
    alias: "",
  });

  const load = useCallback(async () => {
    if (!connected) return;
    setBusy(true);
    setError("");
    try {
      if (section === "overview") {
        const [nextHealth, nextStatus, nextPresence] = await Promise.all([
          gateway.call<Record<string, unknown>>("health"),
          gateway.call<Record<string, unknown>>("status"),
          gateway.call<unknown>("system-presence"),
        ]);
        setHealth(nextHealth);
        setStatus(nextStatus);
        setPresence(Array.isArray(nextPresence) ? (nextPresence as Record<string, unknown>[]) : []);
      } else if (section === "devices") {
        const result = await gateway.call<{ pending?: Pending[]; paired?: Device[] }>(
          "device.pair.list",
        );
        setPending(result.pending ?? []);
        setDevices(result.paired ?? []);
      } else if (section === "nodes") {
        const result = await gateway.call<{ nodes?: Node[] }>("node.list");
        setNodes(result.nodes ?? []);
      } else if (section === "approvals") {
        const [result, nodeList] = await Promise.all([
          gateway.call<ExecApprovalsSnapshot>(
            approvalTarget ? "exec.approvals.node.get" : "exec.approvals.get",
            approvalTarget ? { nodeId: approvalTarget } : {},
          ),
          gateway.call<{ nodes?: Node[] }>("node.list"),
        ]);
        setNodes(nodeList.nodes ?? []);
        setApprovals(result);
        const value = JSON.stringify(result.file ?? {}, null, 2);
        setApprovalsOriginal(value);
        setApprovalsDraft(value);
      } else if (section === "dreams") {
        const [memory, nextDiary] = await Promise.all([
          gateway.call<{ dreaming?: Record<string, unknown> }>("doctor.memory.status"),
          gateway.call<DreamDiary>("doctor.memory.dreamDiary"),
        ]);
        setDream(memory.dreaming ?? null);
        setDiary(nextDiary);
      } else if (section === "logs") {
        setLogs(await gateway.call<LogTail>("logs.tail", { limit: 200, maxBytes: 128000 }));
      } else if (section === "config" || section === "providers") {
        const snapshot = await gateway.call<ConfigSnapshot>("config.get");
        setConfig(snapshot);
        setConfigKey("");
        setDraft("");
        setOriginal("");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [approvalTarget, connected, section]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(method: string, params: Record<string, unknown>, confirmMessage: string) {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await gateway.call(method, params);
      setNotice("操作完成");
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  // Origins from config.get: paths in sourceConfig are user-authored, runtime
  // overrides win, anything absent comes from defaults. Rolled up to top-level
  // keys for the sidebar badges.
  const topKeyOrigins = useMemo(() => {
    const byTop = new Map<string, string>();
    for (const entry of config?.origins ?? []) {
      const top = entry.path.split(".")[0] ?? entry.path;
      if (byTop.get(top) === "override") continue;
      if (entry.source === "override") byTop.set(top, "override");
      else if (!byTop.has(top)) byTop.set(top, "file");
    }
    return byTop;
  }, [config]);
  function chooseConfigKey(key: string) {
    if (draft !== original && !window.confirm("此处有未保存修改，确定切换配置项？")) return;
    setConfigKey(key);
    const value = JSON.stringify(
      (config?.sourceConfig ?? config?.config ?? {})[key] ?? {},
      null,
      2,
    );
    setDraft(value);
    setOriginal(value);
  }

  const providerRows = useMemo<ProviderRow[]>(() => {
    const root = (config?.sourceConfig ?? config?.config ?? {}) as Record<string, unknown>;
    const modelsBlock = root.models as Record<string, unknown> | undefined;
    const providers = modelsBlock?.providers as Record<string, Record<string, unknown>> | undefined;
    if (!providers) return [];
    return Object.entries(providers).map(([id, p]) => ({
      id,
      baseUrl: typeof p.baseUrl === "string" ? p.baseUrl : undefined,
      api: typeof p.api === "string" ? p.api : undefined,
      modelCount: Array.isArray(p.models) ? p.models.length : 0,
    }));
  }, [config]);

  async function submitProvider() {
    if (!config?.hash || busy) return;
    if (!providerForm.baseUrl.trim() || !providerForm.modelId.trim()) {
      setError("Base URL 和模型 ID 必填。");
      return;
    }
    setBusy(true);
    try {
      const res = await gateway.call<{ providerId: string }>("config.providers.upsert", {
        baseUrl: providerForm.baseUrl.trim(),
        modelId: providerForm.modelId.trim(),
        ...(providerForm.apiKey.trim() ? { apiKey: providerForm.apiKey.trim() } : {}),
        compatibility: providerForm.compatibility,
        ...(providerForm.providerId.trim() ? { providerId: providerForm.providerId.trim() } : {}),
        ...(providerForm.alias.trim() ? { alias: providerForm.alias.trim() } : {}),
        baseHash: config.hash,
        note: "Desktop GUI: provider add",
      });
      setNotice(`供应商 ${res.providerId} 已保存，网关热重载后生效`);
      setProviderForm({
        baseUrl: "",
        modelId: "",
        apiKey: "",
        compatibility: "openai",
        providerId: "",
        alias: "",
      });
      setShowProviderForm(false);
      setConfig(await gateway.call<ConfigSnapshot>("config.get"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加供应商失败。");
    } finally {
      setBusy(false);
    }
  }

  async function removeProvider(id: string) {
    if (!config?.hash || busy) return;
    if (!window.confirm(`删除供应商「${id}」？Gateway 将重载配置。`)) return;
    setBusy(true);
    try {
      await gateway.call("config.patch", {
        baseHash: config.hash,
        raw: JSON.stringify({ models: { providers: { [id]: null } } }),
        note: `Desktop GUI: remove provider ${id}`,
      });
      setNotice(`供应商 ${id} 已删除，网关热重载后生效`);
      setConfig(await gateway.call<ConfigSnapshot>("config.get"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除供应商失败。");
    } finally {
      setBusy(false);
    }
  }

  // 主题/连接保存：连接信息落 localStorage 后 stop/start 重连（原 SettingsModal 行为）
  function saveConnection() {
    const nextUrl = gwUrl.trim();
    const nextToken = gwToken.trim();
    if (nextUrl) localStorage.setItem(GATEWAY_URL_KEY, nextUrl);
    else localStorage.removeItem(GATEWAY_URL_KEY);
    if (nextToken) localStorage.setItem(GATEWAY_TOKEN_KEY, nextToken);
    else localStorage.removeItem(GATEWAY_TOKEN_KEY);
    gateway.configure(nextUrl || undefined, nextToken);
    gateway.stop();
    gateway.start();
  }

  async function saveConfig() {
    if (!configKey || !config?.hash || draft === original) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setError("配置不是有效的 JSON；未保存。");
      return;
    }
    if (!window.confirm(`保存「${configKey}」配置？Gateway 可能重载或重新连接。`)) return;
    setBusy(true);
    try {
      await gateway.call("config.patch", {
        baseHash: config.hash,
        raw: JSON.stringify({ [configKey]: parsed }),
        note: `Desktop GUI: ${configKey}`,
      });
      setNotice(`${configKey} 已保存`);
      const snapshot = await gateway.call<ConfigSnapshot>("config.get");
      setConfig(snapshot);
      const value = JSON.stringify(
        (snapshot.sourceConfig ?? snapshot.config ?? {})[configKey] ?? {},
        null,
        2,
      );
      setOriginal(value);
      setDraft(value);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveApprovals() {
    if (!approvals?.hash || approvalsDraft === approvalsOriginal) return;
    let file: unknown;
    try {
      file = JSON.parse(approvalsDraft);
      if (!file || typeof file !== "object" || Array.isArray(file)) throw new Error();
    } catch {
      setError("执行审批配置必须是 JSON 对象；未保存。");
      return;
    }
    if (
      !window.confirm("保存执行审批规则？修改后的命令授权可能立即生效，请核对允许列表和安全等级。")
    )
      return;
    setBusy(true);
    try {
      await gateway.call(approvalTarget ? "exec.approvals.node.set" : "exec.approvals.set", {
        ...(approvalTarget ? { nodeId: approvalTarget } : {}),
        file,
        baseHash: approvals.hash,
      });
      setNotice("执行审批规则已保存");
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const surface = { background: "var(--bg-secondary)", border: "1px solid var(--border)" };
  const muted = { color: "var(--text-secondary)" };
  const input = {
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  };
  return (
    <section
      className="flex-1 min-w-0 overflow-y-auto px-8 py-7"
      style={{ color: "var(--text-primary)" }}
      data-tauri-drag-region
    >
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">运行与设置</h2>
            <p className="text-xs mt-1" style={muted}>
              设备、记忆、日志和 Gateway 配置
            </p>
          </div>
          <button
            onClick={() => {
              if (
                section === "config" &&
                draft !== original &&
                !window.confirm("配置有未保存修改，确定重新载入？")
              )
                return;
              if (
                section === "approvals" &&
                approvalsDraft !== approvalsOriginal &&
                !window.confirm("执行审批有未保存修改，确定重新载入？")
              )
                return;
              void load();
            }}
            disabled={!connected || busy}
            className="p-2 rounded-lg disabled:opacity-40"
            style={input}
            title="刷新"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="运行与设置分类">
          {SECTIONS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={section === tab.id}
              onClick={() => {
                if (
                  section === "config" &&
                  draft !== original &&
                  !window.confirm("配置有未保存修改，确定离开？")
                )
                  return;
                if (
                  section === "approvals" &&
                  approvalsDraft !== approvalsOriginal &&
                  !window.confirm("执行审批有未保存修改，确定离开？")
                )
                  return;
                setSection(tab.id);
                setNotice("");
              }}
              className="text-xs px-3 py-2 rounded-lg"
              style={{
                background: section === tab.id ? "var(--accent)" : "var(--bg-secondary)",
                color: section === tab.id ? "var(--on-solid)" : "var(--text-secondary)",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {!connected && <p className="text-sm">连接 Gateway 后查看运行状态</p>}
        {error && (
          <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {notice && (
          <p className="text-xs" style={{ color: "var(--success)" }}>
            {notice}
          </p>
        )}
        {busy && (
          <p className="text-xs" style={muted}>
            加载中…
          </p>
        )}
        {section === "general" && (
          <div className="space-y-3">
            <div className="rounded-xl p-4 space-y-3" style={surface}>
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <Settings size={14} />
                主题
              </h3>
              <div className="flex gap-1 max-w-xs">
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
                      className="flex-1 text-xs py-1.5 rounded-md font-medium transition-colors hover:opacity-80"
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
            <div className="rounded-xl p-4 space-y-2" style={surface}>
              <h3 className="text-sm font-medium">Gateway 连接</h3>
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={muted}>
                  URL
                </div>
                <input
                  className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                  style={input}
                  placeholder="ws://127.0.0.1:18789"
                  value={gwUrl}
                  onChange={(e) => setGwUrl(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={muted}>
                  Token
                </div>
                <input
                  type="password"
                  className="w-full text-xs px-2 py-1.5 rounded-md outline-none"
                  style={input}
                  placeholder="gateway.auth.token"
                  value={gwToken}
                  onChange={(e) => setGwToken(e.target.value)}
                />
              </div>
              <button
                onClick={saveConnection}
                className="w-full text-xs py-1.5 rounded-md font-medium hover:opacity-80"
                style={{ background: "var(--accent)", color: "var(--on-solid)" }}
              >
                保存并重连
              </button>
              <p className="text-[10px] flex items-center gap-1.5" style={muted}>
                <Settings size={11} />
                涉及密钥的全局配置仍走 gateway 工具 / CLI
              </p>
            </div>
          </div>
        )}
        {section === "overview" && health && (
          <div className="space-y-3">
            <div className="rounded-xl p-4" style={surface}>
              <h3 className="text-sm font-medium">
                Gateway {health.ok === true ? "运行正常" : "状态待确认"}
              </h3>
              <p className="text-xs mt-2" style={muted}>
                默认项目区：{String(health.defaultAgentId ?? "—")} · 会话：
                {String((health.sessions as { count?: number } | undefined)?.count ?? "—")} · 心跳：
                {String(health.heartbeatSeconds ?? "—")} 秒
              </p>
            </div>
            <div className="rounded-xl p-4" style={surface}>
              <h3 className="text-sm font-medium">连接实例 · {presence.length}</h3>
              {presence.map((item, i) => (
                <p key={String(item.instanceId ?? i)} className="text-xs mt-2" style={muted}>
                  {String(item.host ?? item.instanceId ?? "未知设备")} ·{" "}
                  {String(item.platform ?? "—")} · {String(item.version ?? "—")}
                </p>
              ))}
            </div>
            {status && (
              <div className="rounded-xl p-4">
                <h3 className="text-sm font-medium">服务概况</h3>
                <pre
                  className="text-xs mt-2 whitespace-pre-wrap break-all max-h-60 overflow-auto"
                  style={muted}
                >
                  {JSON.stringify(status, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
        {section === "devices" && connected && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium">等待配对 · {pending.length}</h3>
            {pending.map((item) => (
              <div
                key={item.requestId}
                className="flex items-center gap-2 rounded-xl p-3"
                style={surface}
              >
                <span className="flex-1 text-xs min-w-0 break-all">
                  {item.displayName || item.deviceId} · {item.role || "设备"}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(
                      "device.pair.approve",
                      { requestId: item.requestId },
                      `确认允许设备 ${item.displayName || item.deviceId} 连接？`,
                    )
                  }
                  className="text-xs disabled:opacity-40"
                  style={{ color: "var(--accent)" }}
                >
                  批准
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(
                      "device.pair.reject",
                      { requestId: item.requestId },
                      `拒绝设备 ${item.displayName || item.deviceId}？`,
                    )
                  }
                  className="text-xs disabled:opacity-40"
                  style={{ color: "var(--danger)" }}
                >
                  拒绝
                </button>
              </div>
            ))}
            <h3 className="text-sm font-medium">已配对 · {devices.length}</h3>
            {devices.map((item) => (
              <div key={item.deviceId} className="rounded-xl p-3 text-xs" style={surface}>
                <div>{item.displayName || item.deviceId}</div>
                <div className="mt-1 break-all" style={muted}>
                  {item.deviceId} · {item.roles?.join("、") || "—"}
                </div>
                {item.tokens
                  ?.filter((token) => !token.revokedAtMs)
                  .map((token) => (
                    <button
                      key={token.role}
                      disabled={busy}
                      onClick={() =>
                        void act(
                          "device.token.revoke",
                          { deviceId: item.deviceId, role: token.role },
                          `撤销 ${item.displayName || item.deviceId} 的 ${token.role} 授权？`,
                        )
                      }
                      className="mt-2 text-xs disabled:opacity-40"
                      style={{ color: "var(--danger)" }}
                    >
                      撤销 {token.role} 授权
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
        {section === "nodes" && connected && (
          <div className="space-y-2">
            {nodes.length === 0 && (
              <p className="text-xs" style={muted}>
                暂无节点
              </p>
            )}
            {nodes.map((node, i) => (
              <div
                key={String(node.nodeId ?? i)}
                className="rounded-xl p-3 text-xs"
                style={surface}
              >
                <strong>{node.displayName || node.nodeId || "未命名节点"}</strong>
                <p className="mt-1" style={muted}>
                  {node.platform || "—"} · {node.connected ? "在线" : "离线"} ·{" "}
                  {node.paired ? "已配对" : "未配对"}
                </p>
              </div>
            ))}
          </div>
        )}
        {section === "approvals" && connected && (
          <div className="space-y-3">
            <p className="text-xs" style={muted}>
              管理 Gateway 或节点的命令执行授权。修改前请确认允许列表与安全等级。
            </p>
            <select
              aria-label="执行审批目标"
              value={approvalTarget}
              onChange={(event) => {
                if (
                  approvalsDraft !== approvalsOriginal &&
                  !window.confirm("执行审批有未保存修改，确定切换目标？")
                )
                  return;
                setApprovalTarget(event.target.value);
              }}
              className="text-xs px-3 py-2 rounded-lg"
              style={input}
            >
              <option value="">Gateway</option>
              {nodes
                .filter((node) => node.nodeId)
                .map((node) => (
                  <option key={node.nodeId} value={node.nodeId}>
                    {node.displayName || node.nodeId}
                  </option>
                ))}
            </select>
            {approvals && (
              <div className="rounded-xl p-4 space-y-3" style={surface}>
                <p className="text-xs break-all" style={muted}>
                  {approvals.path}
                  {approvals.exists ? "" : " · 尚未创建"}
                </p>
                <textarea
                  aria-label="执行审批规则 JSON"
                  value={approvalsDraft}
                  onChange={(event) => setApprovalsDraft(event.target.value)}
                  spellCheck={false}
                  className="w-full min-h-[320px] resize-y rounded-lg p-3 font-mono text-xs outline-none"
                  style={input}
                />
                <button
                  onClick={() => void saveApprovals()}
                  disabled={busy || approvalsDraft === approvalsOriginal}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "var(--on-solid)" }}
                >
                  <Save size={13} />
                  保存审批规则
                </button>
              </div>
            )}
          </div>
        )}
        {section === "dreams" && connected && (
          <div className="space-y-3">
            <div className="rounded-xl p-4" style={surface}>
              <h3 className="text-sm font-medium">梦境状态</h3>
              <p className="text-xs mt-2" style={muted}>
                {dream
                  ? `已${dream.enabled ? "开启" : "关闭"} · 最近运行：${String(dream.lastRunAt ?? dream.lastRunAtMs ?? "—")}`
                  : "当前记忆插件没有梦境状态"}
              </p>
            </div>
            <div className="rounded-xl p-4" style={surface}>
              <h3 className="text-sm font-medium">梦境日记</h3>
              <p className="text-xs mt-1" style={muted}>
                {diary?.path ?? "—"}
              </p>
              {diary?.found ? (
                <pre
                  className="whitespace-pre-wrap break-words text-xs max-h-[55vh] overflow-y-auto mt-3"
                  style={muted}
                >
                  {diary.content}
                </pre>
              ) : (
                <p className="text-xs mt-2" style={muted}>
                  尚无日记
                </p>
              )}
            </div>
          </div>
        )}
        {section === "logs" && connected && (
          <div className="rounded-xl p-4" style={surface}>
            <p className="text-xs" style={muted}>
              {logs?.file ?? "Gateway 日志"}
            </p>
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all mt-3 max-h-[65vh] overflow-auto">
              {logs?.lines?.join("\n") || "暂无日志"}
            </pre>
          </div>
        )}
        {section === "providers" && connected && (
          <div className="space-y-3">
            <div className="flex justify-between items-center gap-3">
              <p className="text-xs" style={muted}>
                添加自定义 API 供应商（OpenAI / Anthropic
                兼容）。保存后网关热重载，新模型即可在对话中使用。
              </p>
              <button
                onClick={() => setShowProviderForm((v) => !v)}
                className="text-xs px-3 py-1.5 rounded-md shrink-0"
                style={{ background: "var(--accent)", color: "var(--on-solid)" }}
              >
                {showProviderForm ? "收起表单" : "添加供应商"}
              </button>
            </div>
            {showProviderForm && (
              <div className="rounded-xl p-4 space-y-3" style={surface}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs space-y-1 block" style={muted}>
                    Base URL *
                    <input
                      value={providerForm.baseUrl}
                      onChange={(e) => setProviderForm((f) => ({ ...f, baseUrl: e.target.value }))}
                      placeholder="https://api.example.com/v1"
                      className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                      style={input}
                    />
                  </label>
                  <label className="text-xs space-y-1 block" style={muted}>
                    模型 ID *
                    <input
                      value={providerForm.modelId}
                      onChange={(e) => setProviderForm((f) => ({ ...f, modelId: e.target.value }))}
                      placeholder="deepseek-v4"
                      className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                      style={input}
                    />
                  </label>
                  <label className="text-xs space-y-1 block" style={muted}>
                    API Key
                    <input
                      type="password"
                      value={providerForm.apiKey}
                      onChange={(e) => setProviderForm((f) => ({ ...f, apiKey: e.target.value }))}
                      placeholder="sk-…"
                      className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                      style={input}
                    />
                  </label>
                  <label className="text-xs space-y-1 block" style={muted}>
                    兼容模式
                    <select
                      value={providerForm.compatibility}
                      onChange={(e) =>
                        setProviderForm((f) => ({
                          ...f,
                          compatibility: e.target.value as "openai" | "anthropic",
                        }))
                      }
                      className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                      style={input}
                    >
                      <option value="openai">OpenAI 兼容</option>
                      <option value="anthropic">Anthropic 兼容</option>
                    </select>
                  </label>
                  <label className="text-xs space-y-1 block" style={muted}>
                    供应商 ID（可选，默认从 URL 生成）
                    <input
                      value={providerForm.providerId}
                      onChange={(e) =>
                        setProviderForm((f) => ({ ...f, providerId: e.target.value }))
                      }
                      placeholder="custom-…"
                      className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                      style={input}
                    />
                  </label>
                  <label className="text-xs space-y-1 block" style={muted}>
                    模型别名（可选）
                    <input
                      value={providerForm.alias}
                      onChange={(e) => setProviderForm((f) => ({ ...f, alias: e.target.value }))}
                      placeholder="my-model"
                      className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                      style={input}
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => void submitProvider()}
                    disabled={busy || !providerForm.baseUrl.trim() || !providerForm.modelId.trim()}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "var(--on-solid)" }}
                  >
                    <Save size={13} />
                    保存并热重载
                  </button>
                </div>
              </div>
            )}
            <div className="rounded-xl p-4" style={surface}>
              {providerRows.length === 0 ? (
                <p className="text-xs py-6 text-center" style={muted}>
                  暂无自定义供应商；点「添加供应商」，或到「高级配置」编辑 models.providers。
                </p>
              ) : (
                <div className="space-y-1">
                  {providerRows.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center gap-3 text-xs px-2 py-1.5 rounded-md"
                      style={{ background: "var(--bg-secondary)" }}
                    >
                      <span className="font-medium shrink-0">{row.id}</span>
                      <span className="truncate flex-1" style={muted}>
                        {row.baseUrl ?? "—"}
                        {row.api ? ` · ${row.api}` : ""}
                      </span>
                      <span className="shrink-0" style={muted}>
                        {row.modelCount} 模型
                      </span>
                      <button
                        onClick={() => void removeProvider(row.id)}
                        disabled={busy}
                        className="shrink-0 px-2 py-0.5 rounded disabled:opacity-40"
                        style={{ color: "var(--danger)" }}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {section === "config" && connected && (
          <div className="space-y-3">
            <p className="text-xs" style={muted}>
              选择配置项编辑 JSON；保存前会确认。敏感字段由 Gateway
              隐去，修改其他字段不会覆盖隐藏值。标签「自定义」= 配置文件中的值，「覆盖」=
              运行时覆盖，无标签为默认值。
            </p>
            {config?.valid === false && (
              <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
                当前配置无效：
                {config.issues?.map((issue) => `${issue.path}: ${issue.message}`).join("；")}
              </p>
            )}
            <div className="flex gap-4 min-h-[420px]">
              <div className="w-36 shrink-0 space-y-1 overflow-y-auto">
                {Object.keys(config?.sourceConfig ?? config?.config ?? {})
                  .sort()
                  .map((key) => (
                    <button
                      key={key}
                      onClick={() => chooseConfigKey(key)}
                      className="flex items-center justify-between gap-1 w-full text-left text-xs px-2 py-1.5 rounded-md"
                      style={{
                        background: configKey === key ? "var(--accent)" : "var(--bg-secondary)",
                        color: configKey === key ? "var(--on-solid)" : "var(--text-secondary)",
                      }}
                    >
                      <span className="truncate">{key}</span>
                      <OriginBadge source={topKeyOrigins.get(key)} />
                    </button>
                  ))}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {configKey ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5 text-sm">
                        {configKey}
                        <OriginBadge source={topKeyOrigins.get(configKey)} />
                        {draft !== original ? " · 未保存" : ""}
                      </span>
                      <button
                        onClick={() => void saveConfig()}
                        disabled={busy || draft === original}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md disabled:opacity-40"
                        style={{ background: "var(--accent)", color: "var(--on-solid)" }}
                      >
                        <Save size={13} />
                        保存
                      </button>
                    </div>
                    <textarea
                      aria-label={`${configKey} 配置`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      spellCheck={false}
                      className="flex-1 min-h-[400px] resize-y rounded-lg p-3 font-mono text-xs outline-none"
                      style={input}
                    />
                  </>
                ) : (
                  <p className="text-xs py-10 text-center" style={muted}>
                    选择一个配置项查看
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
