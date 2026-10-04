import { Brain, ChevronDown, Cpu } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelEntry } from "../gateway/client";
import { EffortSlider } from "./EffortSlider";

// per-message 思考档全集（chat.send thinking one-shot；不传 = 跟随模型默认）
export const THINKING_STEPS = ["minimal", "low", "medium", "high"] as const;
export const THINKING_LABELS: Record<string, string> = {
  minimal: "最轻",
  low: "低",
  medium: "中",
  high: "高",
};

interface ModelPickerProps {
  models: ModelEntry[];
  /** per-message 模型覆盖；null = 跟随会话默认 */
  model: string | null;
  /** 会话默认模型（回落显示用） */
  sessionModel?: string | null;
  thinking: string | null;
  onPickModel: (id: string | null) => void;
  onPickThinking: (level: string | null) => void;
  disabled?: boolean;
}

function shortModel(id: string): string {
  const slash = id.lastIndexOf("/");
  return slash >= 0 ? id.slice(slash + 1) : id;
}

// 模型+推理强度两态弹层（RedCode 式）：概览态 = 当前档名+模型按钮+滑杆，
// 列表态 = 搜索+分组选型。ChatHome 主页输入框与会话内输入框共用，
// 保证「新建会话」时也能换模型/调推理档（Codex 同一套输入框的做法）。
export function ModelPicker({
  models,
  model,
  sessionModel,
  thinking,
  onPickModel,
  onPickThinking,
  disabled,
}: ModelPickerProps) {
  const [show, setShow] = useState(false);
  // 弹层两态：false = 概览（模型+滑杆），true = 模型列表
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // 外点关闭
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setShow(false);
        setSearch("");
        setPicking(false);
      }
    }
    if (show) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [show]);

  const grouped = useMemo(() => {
    const map = new Map<string, ModelEntry[]>();
    for (const m of models) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return [...map.entries()];
  }, [models]);

  const filteredGroups = useMemo(() => {
    if (!search) return grouped;
    const q = search.toLowerCase();
    return grouped
      .map(
        ([provider, list]) =>
          [
            provider,
            list.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)),
          ] as const,
      )
      .filter(([, list]) => list.length > 0);
  }, [grouped, search]);

  // 本条消息实际生效的模型条目（per-message 覆盖优先，回落会话默认）；
  // 推理滑杆只对明确支持推理的模型显示
  const effectiveEntry = useMemo(
    () => models.find((m) => m.id === (model ?? sessionModel)),
    [models, model, sessionModel],
  );

  function pick(id: string | null) {
    onPickModel(id);
    // 新模型不支持推理时保留档位没有意义（one-shot thinking 会被拒/忽略）
    if (id && models.find((m) => m.id === id)?.reasoning === false) {
      onPickThinking(null);
    }
    setPicking(false);
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        onClick={() => setShow((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors disabled:opacity-30 max-w-44"
        style={{
          background:
            model || thinking
              ? "color-mix(in srgb, var(--accent) 14%, var(--bg-secondary))"
              : "var(--bg-tertiary)",
          color: model || thinking ? "var(--accent)" : "var(--text-secondary)",
        }}
        title={model ? `本条消息将使用 ${model}` : "本条消息跟随会话模型"}
      >
        <Cpu size={13} className="shrink-0" />
        <span className="truncate">{model ? shortModel(model) : "模型"}</span>
        {thinking && (
          <>
            <span className="opacity-50">·</span>
            <span>{THINKING_LABELS[thinking] ?? thinking}</span>
          </>
        )}
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      {show && (
        <div
          className="absolute bottom-full left-0 mb-2 w-80 rounded-xl border shadow-lg z-50 overflow-hidden"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
        >
          {picking ? (
            <>
              <div
                className="px-3 py-2 border-b flex items-center gap-2"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  onClick={() => setPicking(false)}
                  className="text-xs shrink-0 hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                  title="返回"
                >
                  ←
                </button>
                <input
                  className="flex-1 text-xs px-2 py-1.5 rounded-md outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="搜索模型…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                <button
                  onClick={() => pick(null)}
                  className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center justify-between border-b"
                  style={{
                    color: "var(--text-primary)",
                    background: model ? "transparent" : "var(--bg-tertiary)",
                    borderColor: "var(--border)",
                  }}
                >
                  <span>
                    跟随会话设置
                    <span
                      className="block text-[10px] mt-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {sessionModel ? shortModel(sessionModel) : "默认模型"}
                    </span>
                  </span>
                  {!model && (
                    <span className="text-[10px] shrink-0" style={{ color: "var(--accent)" }}>
                      当前
                    </span>
                  )}
                </button>
                {filteredGroups.length === 0 && (
                  <div
                    className="px-3 py-4 text-xs text-center"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {search ? "未找到匹配模型" : "暂无可用模型"}
                  </div>
                )}
                {filteredGroups.map(([provider, list]) => (
                  <div key={provider}>
                    <div
                      className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {provider}
                    </div>
                    {list.map((m) => {
                      const active = m.id === model;
                      return (
                        <button
                          key={m.id}
                          onClick={() => pick(m.id)}
                          className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center gap-2"
                          style={{
                            color: "var(--text-primary)",
                            background: active ? "var(--bg-tertiary)" : "transparent",
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{m.name || m.id}</div>
                            <div
                              className="text-[10px] mt-0.5 truncate"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {m.id}
                            </div>
                          </div>
                          {active && (
                            <span
                              className="text-[10px] shrink-0"
                              style={{ color: "var(--accent)" }}
                            >
                              本条消息
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Brain size={14} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                  {thinking ? (THINKING_LABELS[thinking] ?? thinking) : "跟随模型默认"}
                </span>
              </div>
              <button
                onClick={() => setPicking(true)}
                className="flex items-center justify-center gap-1 text-xs hover:opacity-80"
                style={{ color: "var(--text-secondary)" }}
                title="选择模型"
              >
                <span className="truncate">
                  {model ? shortModel(model) : sessionModel ? shortModel(sessionModel) : "默认模型"}
                </span>
                <ChevronDown size={12} className="shrink-0 opacity-60" />
              </button>
              {effectiveEntry?.reasoning === true && (
                <>
                  <EffortSlider
                    steps={THINKING_STEPS}
                    current={thinking ?? undefined}
                    label={(v) => THINKING_LABELS[v] ?? v}
                    unselectedLabel="跟随模型默认"
                    onChange={(v) => onPickThinking(v)}
                  />
                  <div
                    className="flex items-center justify-between text-[10px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span>更快</span>
                    <span>更聪明</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
