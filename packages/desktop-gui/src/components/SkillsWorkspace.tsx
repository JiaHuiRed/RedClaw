import { Download, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { gateway } from "../gateway/client";

type Skill = {
  name: string;
  description?: string;
  skillKey: string;
  source: string;
  disabled: boolean;
  eligible: boolean;
  primaryEnv?: string;
  install?: { id: string; label: string; kind: string }[];
  missing?: { bins?: string[]; env?: string[]; config?: string[]; os?: string[] };
};
type SearchResult = { slug: string; displayName: string; summary?: string; version?: string };
type SkillDetail = {
  skill?: { displayName: string; summary?: string; slug: string } | null;
  owner?: { handle?: string | null } | null;
  latestVersion?: { version: string; changelog?: string } | null;
};

export default function SkillsWorkspace({ connected }: { connected: boolean }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [detailSlug, setDetailSlug] = useState("");
  const [keySkill, setKeySkill] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const response = await gateway.call<{ skills: Skill[] }>("skills.status");
      setSkills(response.skills ?? []);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setResults(null);
    setDetail(null);
    setDetailSlug("");
    try {
      const response = await gateway.call<{ results: SearchResult[] }>("skills.search", {
        query: query.trim(),
        limit: 20,
      });
      setResults(response.results ?? []);
      setError("");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function showDetail(slug: string) {
    setDetailSlug(slug);
    setDetail(null);
    try {
      const response = await gateway.call<SkillDetail>("skills.detail", { slug });
      setDetail(response);
      setError("");
    } catch (err) {
      setError(String(err));
      setDetailSlug("");
    }
  }

  async function toggle(skill: Skill) {
    setBusy(skill.skillKey);
    try {
      await gateway.call("skills.update", { skillKey: skill.skillKey, enabled: skill.disabled });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("");
    }
  }

  async function install(slug: string) {
    if (!window.confirm(`从 ClawHub 安装 ${slug}？请只安装信任的技能。`)) return;
    setBusy(slug);
    try {
      await gateway.call("skills.install", { source: "clawhub", slug });
      setMessage(`已安装 ${slug}`);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("");
    }
  }

  async function installDependency(skill: Skill, option: { id: string; label: string }) {
    if (!window.confirm(`为 ${skill.name} 安装依赖「${option.label}」？这会运行安装命令。`)) return;
    setBusy(skill.skillKey);
    try {
      await gateway.call("skills.install", {
        name: skill.name,
        installId: option.id,
        dangerouslyForceUnsafeInstall: false,
        timeoutMs: 120000,
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("");
    }
  }

  async function saveApiKey(skill: Skill) {
    if (!apiKey.trim()) return;
    setBusy(skill.skillKey);
    try {
      await gateway.call("skills.update", { skillKey: skill.skillKey, apiKey: apiKey.trim() });
      setApiKey("");
      setKeySkill("");
      setMessage(`${skill.name} 的密钥已保存`);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("");
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
      data-tauri-drag-region
    >
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">技能</h2>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              秋秋可以使用的能力与安装状态
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={!connected || loading}
            title="刷新技能"
            className="p-2 rounded-lg disabled:opacity-40"
            style={inputStyle}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {!connected && <p className="text-sm">连接 Gateway 后查看技能</p>}
        {error && (
          <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {message && (
          <p className="text-xs" style={{ color: "var(--success)" }}>
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <input
            aria-label="搜索 ClawHub 技能"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="搜索 ClawHub 技能"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
          <button
            onClick={() => void search()}
            disabled={!connected || loading || !query.trim()}
            className="flex items-center gap-2 px-3 rounded-lg text-sm disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--on-solid)" }}
          >
            <Search size={15} />
            搜索
          </button>
        </div>
        {results && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">搜索结果 · {results.length}</h3>
            {results.map((item) => (
              <div
                key={item.slug}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.displayName}</div>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {item.summary || item.slug}
                  </p>
                </div>
                <button
                  onClick={() => void showDetail(item.slug)}
                  className="text-xs px-2 py-1.5 rounded-md"
                  style={inputStyle}
                >
                  详情
                </button>
                <button
                  onClick={() => void install(item.slug)}
                  disabled={!!busy}
                  className="text-xs flex items-center gap-1.5 px-2 py-1.5 rounded-md disabled:opacity-40"
                  style={inputStyle}
                >
                  <Download size={13} />
                  {busy === item.slug ? "安装中" : "安装"}
                </button>
              </div>
            ))}
            {results.length === 0 && (
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                没有找到技能
              </p>
            )}
            {detailSlug && (
              <div
                className="rounded-xl border p-4 text-xs space-y-2"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
              >
                <div className="flex justify-between">
                  <strong>{detail?.skill?.displayName || detailSlug}</strong>
                  <button onClick={() => setDetailSlug("")}>关闭</button>
                </div>
                {!detail && <p>获取详情中…</p>}
                {detail && (
                  <>
                    <p>{detail.skill?.summary}</p>
                    <p style={{ color: "var(--text-secondary)" }}>
                      作者：{detail.owner?.handle ?? "未知"} · 最新版本：
                      {detail.latestVersion?.version ?? "—"}
                    </p>
                    {detail.latestVersion?.changelog && <p>{detail.latestVersion.changelog}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">已发现技能 · {skills.length}</h3>
          {loading && skills.length === 0 && <p className="text-xs">加载中…</p>}
          {skills.map((skill) => (
            <div
              key={skill.skillKey}
              className="rounded-xl border p-3 space-y-2"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {skill.name}
                    <span className="text-[11px] ml-2" style={{ color: "var(--text-secondary)" }}>
                      {skill.source}
                    </span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {skill.description}
                  </div>
                  {!skill.eligible && !skill.disabled && (
                    <div className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
                      缺少依赖：
                      {Object.values(skill.missing ?? {})
                        .flat()
                        .join("、") || "当前环境不支持"}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void toggle(skill)}
                  disabled={!connected || !!busy}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-md disabled:opacity-40"
                  style={{
                    background: skill.disabled ? "var(--bg-tertiary)" : "var(--accent)",
                    color: skill.disabled ? "var(--text-secondary)" : "var(--on-solid)",
                  }}
                >
                  {busy === skill.skillKey ? "保存中" : skill.disabled ? "启用" : "已启用"}
                </button>
              </div>
              {skill.install?.map((option) => (
                <button
                  key={option.id}
                  onClick={() => void installDependency(skill, option)}
                  disabled={!!busy}
                  className="text-xs px-2 py-1 rounded-md mr-2 disabled:opacity-40"
                  style={inputStyle}
                >
                  安装依赖：{option.label}
                </button>
              ))}
              {skill.primaryEnv && (
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {keySkill === skill.skillKey ? (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        aria-label={`${skill.name} 密钥`}
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={skill.primaryEnv}
                        className="flex-1 min-w-0 px-2 py-1 rounded-md"
                        style={inputStyle}
                      />
                      <button
                        disabled={!apiKey.trim() || !!busy}
                        onClick={() => void saveApiKey(skill)}
                        className="disabled:opacity-40"
                      >
                        保存密钥
                      </button>
                      <button
                        onClick={() => {
                          setApiKey("");
                          setKeySkill("");
                        }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setApiKey("");
                        setKeySkill(skill.skillKey);
                      }}
                    >
                      配置 {skill.primaryEnv}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
