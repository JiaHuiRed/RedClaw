import { Coins, RefreshCw, X } from "lucide-react";
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

// stepfun 等国内 provider 按 CNY 计价，价格配置后 cost 即为人民币
function fmtCost(n: number): string {
  if (n > 0 && n < 0.01) return `¥${n.toFixed(4)}`;
  return `¥${n.toFixed(2)}`;
}

function dayLabel(date: string): string {
  const [, m, d] = date.split("-");
  const now = new Date();
  if (Number(m) === now.getMonth() + 1 && Number(d) === now.getDate()) return "今天";
  return `${Number(m)}/${Number(d)}`;
}

function activeDays(daily: UsageCostSummary["daily"]): string[] {
  return daily.filter((d) => d.totalTokens > 0).map((d) => d.date);
}

function longestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const set = new Set(dates);
  let best = 1;
  for (const date of dates) {
    // 只从连续段起点开始数
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    if (set.has(prev.toISOString().slice(0, 10))) continue;
    let cur = 1;
    const next = new Date(date);
    while (set.has(next.toISOString().slice(0, 10))) {
      next.setDate(next.getDate() + 1);
      cur++;
    }
    best = Math.max(best, cur);
  }
  return best;
}

// 用量面板 v2：usage.cost 含缓存读写明细。纯 CSS 图形，不引图表库。
export default function UsagePanel({ width, onResize, onClose }: UsagePanelProps) {
  const [range, setRange] = useState<7 | 30>(7);
  const [data, setData] = useState<UsageCostSummary | null>(null);
  const [loading, setLoading] = useState(false);

  // 服务端首次重建用量缓存可能较慢（扫描会话 transcript），
  // cacheStatus=refreshing 时自动轮询直到 fresh。
  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    setLoading(true);
    const load = () => {
      gateway
        .fetchUsageCost(range)
        .then((d) => {
          if (cancelled) return;
          setData(d);
          setLoading(false);
          polls++;
          if (d?.cacheStatus?.status === "refreshing" && polls < 30) {
            setTimeout(() => {
              if (!cancelled) load();
            }, 3000);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const daily = data?.daily ?? [];
  const totals = data?.totals;
  const denom = (totals?.input ?? 0) + (totals?.cacheRead ?? 0) + (totals?.cacheWrite ?? 0);
  const hitRate = denom > 0 ? ((totals?.cacheRead ?? 0) / denom) * 100 : 0;
  const act = activeDays(daily);
  const avgCost = act.length > 0 ? (totals?.totalCost ?? 0) / act.length : 0;
  const peak = daily.reduce((a, b) => (b.totalCost > (a?.totalCost ?? -1) ? b : a), daily[0]);
  const maxCost = Math.max(...daily.map((d) => d.totalCost), 0.000001);
  const refreshing = data?.cacheStatus?.status === "refreshing";

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
        {refreshing && (
          <div
            className="text-[11px] px-2.5 py-1.5 rounded-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            用量缓存重建中，数据稍后自动补全…
          </div>
        )}

        {/* 命中率环 + 花费 */}
        <div className="flex items-center gap-4">
          <div
            className="rounded-full shrink-0 flex items-center justify-center"
            style={{
              width: 84,
              height: 84,
              background: `conic-gradient(var(--success) 0 ${hitRate}%, var(--bg-tertiary) ${hitRate}% 100%)`,
            }}
          >
            <div
              className="rounded-full flex flex-col items-center justify-center"
              style={{ width: 62, height: 62, background: "var(--bg-secondary)" }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {denom > 0 ? hitRate.toFixed(1) : "—"}
                {denom > 0 && "%"}
              </span>
              <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>
                缓存命中
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              <Coins size={14} style={{ color: "var(--accent)" }} />
              花费 {fmtCost(totals?.totalCost ?? 0)}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              产出 {fmtTokens(totals?.output ?? 0)} · 缓存读取 {fmtTokens(totals?.cacheRead ?? 0)}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              全价输入 {fmtTokens(totals?.input ?? 0)}
            </div>
          </div>
        </div>

        {/* 统计卡 */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "总 Tokens", value: fmtTokens(totals?.totalTokens ?? 0) },
            { label: "缓存读取 Tokens", value: fmtTokens(totals?.cacheRead ?? 0) },
            { label: "活跃天数", value: `${act.length} / ${daily.length} 天` },
            { label: "最长连续活跃", value: `${longestStreak(act)} 天` },
            { label: "活跃日均花费", value: fmtCost(avgCost) },
            {
              label: "单日峰值",
              value: peak ? fmtCost(peak.totalCost) : "—",
              sub: peak ? dayLabel(peak.date) : "",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl p-3 space-y-1"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
            >
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {card.label}
              </div>
              <div className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                {card.value}
              </div>
              {card.sub && (
                <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  {card.sub}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 每日条形（时间正序，底部最新） */}
        {daily.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              每日花费
            </div>
            {[...daily].reverse().map((d) => {
              const dayDenom = (d.input ?? 0) + (d.cacheRead ?? 0) + (d.cacheWrite ?? 0);
              const dayHit = dayDenom > 0 ? ((d.cacheRead ?? 0) / dayDenom) * 100 : 0;
              return (
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
                    className="w-28 shrink-0 text-right"
                    style={{ color: "var(--text-secondary)" }}
                    title={`当日缓存命中 ${dayHit.toFixed(0)}%`}
                  >
                    {d.totalTokens > 0
                      ? `${fmtCost(d.totalCost)} · ${fmtTokens(d.totalTokens)}`
                      : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {data && (
          <div className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {data.totals && (totals?.totalCost ?? 0) === 0 && (
              <>模型价格未配置（费用计为 0，tokens 统计不受影响）· </>
            )}
            数据来自会话 transcript 统计
            {data.updatedAt ? ` · 更新于 ${new Date(data.updatedAt).toLocaleTimeString()}` : ""}
          </div>
        )}
        {data && daily.length === 0 && !refreshing && (
          <div className="text-xs text-center py-10" style={{ color: "var(--text-secondary)" }}>
            暂无用量数据
          </div>
        )}
      </div>
    </aside>
  );
}
