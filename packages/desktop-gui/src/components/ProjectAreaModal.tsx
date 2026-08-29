import { Trash2, X } from "lucide-react";
import { useState } from "react";
import { gateway, type AgentSummary } from "../gateway/client";

interface ProjectAreaModalProps {
  mode: "create" | "edit";
  agent?: AgentSummary | null;
  defaultAgentId: string;
  modelOptions: string[];
  onClose: () => void;
  /** created=true 表示新建成功（调用方可顺带建首个会话） */
  onSaved: (agentId: string, created: boolean) => void;
}

// 项目区（agent）新建/编辑表单：name/emoji/模型/工作区走 agents.create|update RPC。
// 全局 config（config.get 脱敏回写会毁密钥）刻意不在此编辑。
export default function ProjectAreaModal({
  mode,
  agent,
  defaultAgentId,
  modelOptions,
  onClose,
  onSaved,
}: ProjectAreaModalProps) {
  const [name, setName] = useState(agent ? agent.identity?.name || agent.name || agent.id : "");
  const [workspace, setWorkspace] = useState(agent?.workspace ?? "");
  const [emoji, setEmoji] = useState(agent?.identity?.emoji ?? "");
  // agents.list 的 model 可能是字符串或对象（provider 路由），表单只编辑字符串形态
  const [model, setModel] = useState(typeof agent?.model === "string" ? agent.model : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDefault = agent?.id === defaultAgentId;
  const canSubmit = name.trim().length > 0 && (mode === "edit" || workspace.trim().length > 0);

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        const { agentId } = await gateway.createAgent({
          name: name.trim(),
          workspace: workspace.trim(),
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(emoji.trim() ? { emoji: emoji.trim() } : {}),
        });
        onSaved(agentId, true);
      } else if (agent) {
        await gateway.updateAgent(agent.id, {
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(workspace.trim() ? { workspace: workspace.trim() } : {}),
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(emoji.trim() ? { emoji: emoji.trim() } : {}),
        });
        onSaved(agent.id, false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!agent || busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await gateway.deleteAgent(agent.id);
      onSaved(agent.id, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        className="w-[420px] max-w-[92vw] rounded-2xl border shadow-2xl p-4 space-y-3"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {mode === "create" ? "新建项目区" : `编辑项目区 · ${agent?.id}`}
          </span>
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
            名称{mode === "create" ? "（同时作为 ID，中文/英文均可）" : ""}
          </span>
          <input
            className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：RedClaw、写作助手"
            autoFocus
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            工作区路径{mode === "create" ? "（必填，该区域的文件读写根目录）" : ""}
          </span>
          <input
            className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
            style={{ ...inputStyle, fontFamily: "var(--font-mono, monospace)" }}
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="D:\projects\my-app"
            spellCheck={false}
          />
        </label>

        <div className="flex gap-2">
          <label className="block space-y-1 w-24">
            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Emoji
            </span>
            <input
              className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
              style={inputStyle}
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🐉"
            />
          </label>
          <label className="block space-y-1 flex-1">
            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              默认模型（可选）
            </span>
            <input
              className="w-full text-xs px-2.5 py-2 rounded-lg outline-none"
              style={inputStyle}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="留空用全局默认"
              list="project-area-models"
              spellCheck={false}
            />
            <datalist id="project-area-models">
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
        </div>

        {error && (
          <div className="text-xs px-2.5 py-2 rounded-lg" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          {mode === "edit" && !isDefault ? (
            <button
              onClick={remove}
              disabled={busy}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg hover:opacity-80 disabled:opacity-40"
              style={{
                color: confirmDelete ? "var(--on-solid)" : "var(--danger)",
                background: confirmDelete ? "var(--danger)" : "transparent",
                border: "1px solid var(--danger)",
              }}
              title={confirmDelete ? "再次点击确认删除（不删除工作区文件）" : "删除项目区"}
            >
              <Trash2 size={12} />
              {confirmDelete ? "确认删除" : "删除"}
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            className="text-xs px-3.5 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-90 disabled:opacity-30"
            style={{ background: "var(--accent)", color: "var(--on-solid)" }}
          >
            {busy ? "保存中…" : mode === "create" ? "创建" : "保存"}
          </button>
        </div>

        {mode === "edit" && isDefault && (
          <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            默认项目区不可删除
          </div>
        )}
      </div>
    </div>
  );
}
