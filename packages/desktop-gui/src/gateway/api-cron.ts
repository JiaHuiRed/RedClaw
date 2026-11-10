// cron.* 领域 RPC（从 client.ts 拆出，经 DomainRpc 调用面解耦）
import type { CronCreateInput, CronJobSummary, CronRunLogEntry, DomainRpc } from "./protocol";

export async function fetchCronJobs(rpc: DomainRpc): Promise<CronJobSummary[]> {
  const res = await rpc.call("cron.list", { includeDisabled: true });
  const payload = res.payload as { jobs?: CronJobSummary[] };
  return Array.isArray(payload?.jobs) ? payload.jobs : [];
}

export async function cronSetEnabled(rpc: DomainRpc, id: string, enabled: boolean) {
  const res = await rpc.call("cron.update", { id, patch: { enabled } });
  if (!res.ok) throw new Error(res.error?.message ?? "更新定时任务失败");
}

export async function cronRemove(rpc: DomainRpc, id: string) {
  const res = await rpc.call("cron.remove", { id });
  if (!res.ok) throw new Error(res.error?.message ?? "删除定时任务失败");
}

export async function cronRunNow(rpc: DomainRpc, id: string) {
  const res = await rpc.call("cron.run", { id, mode: "force" });
  if (!res.ok) throw new Error(res.error?.message ?? "触发运行失败");
}

export async function cronCreate(rpc: DomainRpc, input: CronCreateInput): Promise<{ id: string }> {
  const res = await rpc.call("cron.add", {
    name: input.name,
    schedule: input.schedule,
    sessionTarget: "isolated",
    wakeMode: "now",
    payload: {
      kind: "agentTurn",
      message: input.message,
      ...(input.lightContext ? { lightContext: true } : {}),
    },
    delivery: { mode: "none" },
    ...(input.agentId ? { agentId: input.agentId } : {}),
  });
  if (!res.ok) throw new Error(res.error?.message ?? "新建定时任务失败");
  const payload = res.payload as { id?: string };
  return { id: payload?.id ?? "" };
}

async function fetchRuns(
  rpc: DomainRpc,
  params: Record<string, unknown>,
  failMessage: string,
): Promise<CronRunLogEntry[]> {
  const res = await rpc.call("cron.runs", params);
  if (!res.ok) throw new Error(res.error?.message ?? failMessage);
  const payload = res.payload as { entries?: CronRunLogEntry[] };
  return Array.isArray(payload?.entries) ? payload.entries : [];
}

export async function fetchCronRuns(rpc: DomainRpc, jobId: string, limit = 10) {
  return fetchRuns(rpc, { scope: "job", id: jobId, limit, sortDir: "desc" }, "查询运行历史失败");
}

// 跨 job 的最近运行流（scope=all，服务端自动 join jobName）：Activity 面板后台区块用
export async function fetchAllCronRuns(rpc: DomainRpc, limit = 8) {
  return fetchRuns(rpc, { scope: "all", limit, sortDir: "desc" }, "查询运行历史失败");
}
