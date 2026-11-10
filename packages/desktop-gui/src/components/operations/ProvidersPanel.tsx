import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { gateway } from "../../gateway/client";
import { friendlyError } from "../../lib/friendlyError";
import ConfirmButton from "../ConfirmButton";

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

const EMPTY_FORM: ProviderForm = {
  baseUrl: "",
  modelId: "",
  apiKey: "",
  compatibility: "openai",
  providerId: "",
  alias: "",
};

// 模型供应商管理（config.providers.upsert + config.patch 删除，网关热重载生效）。
// 从 OperationsWorkspace 拆出：表单/行列表/删除确认自成一体，config 快照经 props 流入。
export function ProvidersPanel({
  config,
  busy,
  onError,
  onSuccess,
  onConfigReplaced,
}: {
  config: ConfigSnapshot | null;
  busy: boolean;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onConfigReplaced: (snapshot: ConfigSnapshot) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);

  // Origins from config.get: models.providers → 行列表
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

  async function submit() {
    if (!config?.hash || busy) return;
    if (!form.baseUrl.trim() || !form.modelId.trim()) {
      onError("Base URL 和模型 ID 必填。");
      return;
    }
    try {
      const res = await gateway.call<{ providerId: string }>("config.providers.upsert", {
        baseUrl: form.baseUrl.trim(),
        modelId: form.modelId.trim(),
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        compatibility: form.compatibility,
        ...(form.providerId.trim() ? { providerId: form.providerId.trim() } : {}),
        ...(form.alias.trim() ? { alias: form.alias.trim() } : {}),
        baseHash: config.hash,
        note: "Desktop GUI: provider add",
      });
      onSuccess(`供应商 ${res.providerId} 已保存，网关热重载后生效`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      onConfigReplaced(await gateway.call<ConfigSnapshot>("config.get"));
    } catch (err) {
      onError(friendlyError(err));
    }
  }

  async function remove(id: string) {
    if (!config?.hash || busy) return;
    try {
      await gateway.call("config.patch", {
        baseHash: config.hash,
        raw: JSON.stringify({ models: { providers: { [id]: null } } }),
        note: `Desktop GUI: remove provider ${id}`,
      });
      onSuccess(`供应商 ${id} 已删除，网关热重载后生效`);
      onConfigReplaced(await gateway.call<ConfigSnapshot>("config.get"));
    } catch (err) {
      onError(friendlyError(err));
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
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-3">
        <p className="text-xs" style={muted}>
          添加自定义 API 供应商（OpenAI / Anthropic
          兼容）。保存后网关热重载，新模型即可在对话中使用。
        </p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-md shrink-0"
          style={{ background: "var(--accent)", color: "var(--on-solid)" }}
        >
          {showForm ? "收起表单" : "添加供应商"}
        </button>
      </div>
      {showForm && (
        <div className="rounded-xl p-4 space-y-3" style={surface}>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs space-y-1 block" style={muted}>
              Base URL *
              <input
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="https://api.example.com/v1"
                className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                style={input}
              />
            </label>
            <label className="text-xs space-y-1 block" style={muted}>
              模型 ID *
              <input
                value={form.modelId}
                onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
                placeholder="deepseek-v4"
                className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                style={input}
              />
            </label>
            <label className="text-xs space-y-1 block" style={muted}>
              API Key
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-…"
                className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                style={input}
              />
            </label>
            <label className="text-xs space-y-1 block" style={muted}>
              兼容模式
              <select
                value={form.compatibility}
                onChange={(e) =>
                  setForm((f) => ({
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
                value={form.providerId}
                onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))}
                placeholder="custom-…"
                className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                style={input}
              />
            </label>
            <label className="text-xs space-y-1 block" style={muted}>
              模型别名（可选）
              <input
                value={form.alias}
                onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                placeholder="my-model"
                className="w-full rounded-md px-2 py-1.5 text-xs outline-none mt-1 block"
                style={input}
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => void submit()}
              disabled={busy || !form.baseUrl.trim() || !form.modelId.trim()}
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
                <ConfirmButton
                  onConfirm={() => void remove(row.id)}
                  confirmLabel={`确认删除「${row.id}」？网关将重载配置`}
                  disabled={busy}
                  className="shrink-0 px-2 py-0.5 rounded disabled:opacity-40"
                  style={{ color: "var(--danger)" }}
                  title="删除供应商（二次点击确认）"
                >
                  删除
                </ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
