import { RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { gateway, type AgentSummary } from "../gateway/client";

type FileEntry = { name: string; missing: boolean; size?: number; content?: string };
type FileList = { workspace: string; files: FileEntry[] };
type ToolGroup = {
  id: string;
  label: string;
  tools: { id: string; label: string; description: string; risk?: string; source: string }[];
};

export default function AgentFilesWorkspace({ connected }: { connected: boolean }) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentId, setAgentId] = useState("");
  const [panel, setPanel] = useState<"files" | "tools">("files");
  const [tools, setTools] = useState<ToolGroup[]>([]);
  const [list, setList] = useState<FileList | null>(null);
  const [file, setFile] = useState("");
  const [original, setOriginal] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!connected) return;
    void gateway
      .fetchAgents()
      .then((result) => {
        setAgents(result.agents);
        setAgentId((current) => current || result.defaultId);
      })
      .catch((err: unknown) => setError(String(err)));
  }, [connected]);

  const refresh = useCallback(async () => {
    if (!connected || !agentId) return;
    setBusy(true);
    try {
      const result = await gateway.call<FileList>("agents.files.list", { agentId });
      setList(result);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [agentId, connected]);

  useEffect(() => {
    setFile("");
    setDraft("");
    setOriginal("");
    setList(null);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!connected || !agentId || panel !== "tools") return;
    let current = true;
    void gateway
      .call<{ groups: ToolGroup[] }>("tools.catalog", { agentId, includePlugins: true })
      .then((result) => {
        if (current) setTools(result.groups ?? []);
      })
      .catch((err: unknown) => {
        if (current) setError(String(err));
      });
    return () => {
      current = false;
    };
  }, [agentId, connected, panel]);

  async function selectFile(name: string) {
    if (draft !== original && !window.confirm("当前文件有未保存的修改，确定离开？")) return;
    setBusy(true);
    try {
      const result = await gateway.call<{ file: FileEntry }>("agents.files.get", { agentId, name });
      const content = result.file.content ?? "";
      setFile(name);
      setOriginal(content);
      setDraft(content);
      setError("");
      setNotice("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!file || draft === original || busy) return;
    setBusy(true);
    try {
      await gateway.call("agents.files.set", { agentId, name: file, content: draft });
      setOriginal(draft);
      setNotice(`${file} 已保存`);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = {
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
  };
  return (
    <section
      className="flex-1 min-w-0 overflow-y-auto px-8 py-7"
      style={{ color: "var(--text-primary)" }}
    >
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">秋秋的工作区</h2>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              核心文件与可用工具
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={!connected || busy}
            className="p-2 rounded-md disabled:opacity-40"
            style={inputStyle}
            title="刷新文件"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <select
          aria-label="选择项目区"
          value={agentId}
          onChange={(e) => {
            if (draft !== original && !window.confirm("当前文件有未保存的修改，确定切换项目区？"))
              return;
            setAgentId(e.target.value);
          }}
          className="text-sm px-3 py-2 rounded-lg outline-none"
          style={inputStyle}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.identity?.name || agent.name || agent.id}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          {(["files", "tools"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setPanel(tab)}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{
                background: panel === tab ? "var(--accent)" : "var(--bg-secondary)",
                color: panel === tab ? "var(--on-solid)" : "var(--text-secondary)",
              }}
            >
              {tab === "files" ? "项目区文件" : "工具能力"}
            </button>
          ))}
        </div>
        {agents.find((agent) => agent.id === agentId) && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            模型：
            {typeof agents.find((agent) => agent.id === agentId)?.model === "string"
              ? (agents.find((agent) => agent.id === agentId)?.model as string)
              : ((
                  agents.find((agent) => agent.id === agentId)?.model as
                    | { default?: string }
                    | undefined
                )?.default ?? "使用默认模型")}
          </p>
        )}
        {list && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            工作区：{list.workspace}
          </p>
        )}
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
        {!connected && <p className="text-sm">连接 Gateway 后查看工作区文件</p>}
        {panel === "files" ? (
          <div className="flex gap-4 min-h-[480px]">
            <div className="w-44 shrink-0 space-y-1">
              {list?.files.map((entry) => (
                <button
                  key={entry.name}
                  onClick={() => void selectFile(entry.name)}
                  disabled={busy}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg truncate disabled:opacity-40"
                  style={{
                    background: file === entry.name ? "var(--accent)" : "var(--bg-secondary)",
                    color:
                      file === entry.name
                        ? "var(--on-solid)"
                        : entry.missing
                          ? "var(--text-secondary)"
                          : "var(--text-primary)",
                  }}
                  title={entry.missing ? "尚未创建；保存后创建" : entry.name}
                >
                  {entry.name}
                  {entry.missing ? " · 未创建" : ""}
                </button>
              ))}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              {file ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {file}
                      {draft !== original ? " · 未保存" : ""}
                    </span>
                    <button
                      onClick={() => void save()}
                      disabled={busy || draft === original}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                      style={{ background: "var(--accent)", color: "var(--on-solid)" }}
                    >
                      <Save size={13} />
                      保存
                    </button>
                  </div>
                  <textarea
                    aria-label={`${file} 内容`}
                    spellCheck={false}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="flex-1 w-full min-h-[440px] resize-y rounded-xl p-4 text-xs leading-relaxed font-mono outline-none"
                    style={inputStyle}
                  />
                </>
              ) : (
                <p className="text-sm py-10 text-center" style={{ color: "var(--text-secondary)" }}>
                  选择一个文件开始阅读
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {tools.length === 0 && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                当前没有可用工具
              </p>
            )}
            {tools.map((group) => (
              <div
                key={group.id}
                className="rounded-xl p-4 space-y-2"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <h3 className="text-sm font-medium">
                  {group.label} · {group.tools.length}
                </h3>
                {group.tools.map((tool) => (
                  <div
                    key={tool.id}
                    className="text-xs py-2"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <div className="font-medium">
                      {tool.label}{" "}
                      <span style={{ color: "var(--text-secondary)" }}>
                        · {tool.source} {tool.risk === "high" ? "· 高风险" : ""}
                      </span>
                    </div>
                    <div className="mt-1" style={{ color: "var(--text-secondary)" }}>
                      {tool.description}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
