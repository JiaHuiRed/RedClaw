import { Coins, RefreshCw, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { gateway, type UsageCostSummary } from "../gateway/client";
import ResizeHandle from "./ResizeHandle";

interface UsagePanelProps {
  width: number;
  onResize: (width: number) => void;
  onClose: () => void;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtCost(n: number): string {
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function dayLabel(date: string): string {
  const [, m, d] = date.split("-");
  const now = new Date();
  const md = `${Number(m)}/${Number(d)}`;
  if (Number(m) === now.getMonth() + 1 && Number(d) === now.getDate()) return "今天";
  return md;
}

// 用量成本面板：usage.cost RPC，纯 CSS 条形图（不引图表库）
export default function UsagePanel({ width, onResize, onClose }: UsagePanelProps) {
  const [range, setRange] = useState<7 | 30>(7);
  const [data, setData] = useState<UsageCostSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    gateway
      .fetchUsageCost(range)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const daily = data?.daily ?? [];
  const maxCost = Math.max(...daily.map((d) => d.totalCost), 0.000001);
  const maxTokens = Math.max(...daily.map((d) => d.totalTokens), 1);
  const activeDays = daily.filter((d) => d.totalTokens > 0).length;
  const avgCost = activeDays > 0 ? (data?.totals.totalCost ?? 0) / activeDays : 0;
  const peak = daily.reduce((a, b) => (b.totalCost > a.totalCost ? b : a), daily[0]);

  return (
    <aside
      className="flex flex-col rounded-2xl border shrink-0 relative my-2 mr-2"
      style={{
        width,
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <ResizeHandle
        width={width}
        onResize={onResize}
        min={240}
        max={560}
        direction={-1}
        style={{ left: -2 }}
      />
      <div
        className="flex items-center justify-between px-4 h-12 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-sm font-medium">用量 / 成本</span>
        <div className="flex items-center gap-1.5">
          {([7, 30] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="text-[11px] px-2 py-1 rounded-md transition-opacity hover:opacity-80"
              style={{
                background: range === r ? "var(--accent)" : "var(--bg-tertiary)",
                color: range === r ? "var(--on-solid)" : "var(--text-secondary)",
              }}
            >
              {r}天
            </button>
          ))}
          <button
            onClick={() => setRange((r) => r)}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
            title="刷新"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {!data && loading && (
          <div className="text-xs text-center py-10" style={{ color: "var(--text-secondary)" }}>
            加载中…
          </div>
        )}
        {data && (
          <>
            {/* 汇总卡片 */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className="rounded-xl p-3 space-y-1"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
              >
                <div
                  className="flex items-center gap-1.5 text-[11px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Coins size={11} style={{ color: "var(--accent)" }} />
                  区间花费
                </div>
                <div className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                  {fmtCost(data.totals.totalCost)}
                </div>
              </div>
              <div
                className="rounded-xl p-3 space-y-1"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
              >
                <div
                  className="flex items-center gap-1.5 text-[11px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <Zap size={11} style={{ color: "var(--accent)" }} />
                  总 Tokens
                </div>
                <div className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                  {fmtTokens(data.totals.totalTokens)}
                </div>
              </div>
              <div
                className="rounded-xl p-3 space-y-1"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
              >
                <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  活跃日均花费
                </div>
                <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  {fmtCost(avgCost)}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  {activeDays}/{data.days} 天活跃
                </div>
              </div>
              <div
                className="rounded-xl p-3 space-y-1"
                style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
              >
                <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  单日峰值
                </div>
                <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  {peak ? fmtCost(peak.totalCost) : "—"}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  {peak ? dayLabel(peak.date) : ""}
                </div>
              </div>
            </div>

            {/* 按日条形（时间正序，底部最新） */}
            <div className="space-y-1.5">
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                每日花费
              </div>
              {[...daily].reverse().map((d) => (
                <div key={d.date} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="w-9 shrink-0 text-right"
                    style={{
                      color: d.totalTokens > 0 ? "var(--text-primary)" : "var(--text-secondary)",
                    }}
                  >
                    {dayLabel(d.date)}
                  </span>
                  <div
                    className="flex-1 h-3.5 rounded overflow-hidden"
                    style={{ background: "var(--bg-tertiary)" }}
                  >
                    {d.totalCost > 0 && (
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${Math.max(2, (d.totalCost / maxCost) * 100)}%`,
                          background:
                            "linear-gradient(90deg, color-mix(in srgb, var(--accent) 55%, transparent), var(--accent))",
                        }}
                      />
                    )}
                  </div>
                  <span
                    className="w-24 shrink-0 text-right"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {d.totalTokens > 0
                      ? `${fmtCost(d.totalCost)} · ${fmtTokens(d.totalTokens)}`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>

            <div className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              峰值日 tokens {peak ? fmtTokens(peak.totalTokens) : "—"}（单日{" "}
              {maxTokens > 0 ? fmtTokens(maxTokens) : 0}） · 数据来自会话 transcript 统计
              {data.updatedAt ? ` · 更新于 ${new Date(data.updatedAt).toLocaleTimeString()}` : ""}
            </div>
          </>
        )}
        {data && daily.length === 0 && (
          <div className="text-xs text-center py-10" style={{ color: "var(--text-secondary)" }}>
            暂无用量数据
          </div>
        )}
      </div>
    </aside>
  );
}
