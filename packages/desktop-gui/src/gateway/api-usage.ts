// usage/memory 领域 RPC（从 client.ts 拆出，经 DomainRpc 调用面解耦）
import type { DomainRpc, MemoryOverview, UsageCostSummary } from "./protocol";

// 用量成本（usage.cost，operator.read）：days=7|30
export async function fetchUsageCost(
  rpc: DomainRpc,
  days: number,
): Promise<UsageCostSummary | null> {
  try {
    const res = await rpc.call("usage.cost", { days });
    if (!res.ok) return null;
    const payload = res.payload as Partial<UsageCostSummary>;
    if (!payload || !Array.isArray(payload.daily)) return null;
    return {
      updatedAt: payload.updatedAt ?? Date.now(),
      days: payload.days ?? days,
      daily: payload.daily,
      totals: {
        totalTokens: payload.totals?.totalTokens ?? 0,
        totalCost: payload.totals?.totalCost ?? 0,
        input: payload.totals?.input ?? 0,
        output: payload.totals?.output ?? 0,
        cacheRead: payload.totals?.cacheRead ?? 0,
        cacheWrite: payload.totals?.cacheWrite ?? 0,
      },
      cacheStatus: payload.cacheStatus,
    };
  } catch (err) {
    console.error("[Gateway] fetchUsageCost failed:", err);
    return null;
  }
}

// 记忆概览（memory.overview，operator.read）：MEMORY.md + memory/ 目录
export async function fetchMemoryOverview(
  rpc: DomainRpc,
  agentId?: string,
): Promise<MemoryOverview | null> {
  try {
    const res = await rpc.call("memory.overview", agentId ? { agentId } : {});
    if (!res.ok) return null;
    const payload = res.payload as Partial<MemoryOverview>;
    if (!payload || !Array.isArray(payload.files)) return null;
    return {
      agentId: payload.agentId ?? agentId ?? "main",
      workspace: payload.workspace ?? "",
      longTerm: payload.longTerm ?? null,
      files: payload.files,
      totals: {
        files: payload.totals?.files ?? 0,
        bytes: payload.totals?.bytes ?? 0,
        lastUpdatedAtMs: payload.totals?.lastUpdatedAtMs ?? null,
      },
    };
  } catch (err) {
    console.error("[Gateway] fetchMemoryOverview failed:", err);
    return null;
  }
}
