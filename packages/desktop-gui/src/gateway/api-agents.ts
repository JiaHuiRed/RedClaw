// agents.* 领域 RPC（项目区管理 + 头像，从 client.ts 拆出，经 DomainRpc 解耦）
import type {
  AgentCreateInput,
  AgentIdentity,
  AgentSummary,
  AgentUpdateInput,
  DomainRpc,
} from "./protocol";

export async function fetchAgents(
  rpc: DomainRpc,
): Promise<{ defaultId: string; agents: AgentSummary[] }> {
  const res = await rpc.call("agents.list", {});
  const payload = res.payload as {
    defaultId?: string;
    agents?: AgentSummary[];
  };
  return {
    defaultId: payload?.defaultId ?? "main",
    agents: Array.isArray(payload?.agents) ? payload.agents : [],
  };
}

export async function createAgent(
  rpc: DomainRpc,
  input: AgentCreateInput,
): Promise<{ agentId: string }> {
  const res = await rpc.call("agents.create", input);
  if (!res.ok) throw new Error(res.error?.message ?? "新建项目区失败");
  const payload = res.payload as { agentId?: string };
  if (!payload?.agentId) throw new Error("新建项目区失败：缺少 agentId");
  return { agentId: payload.agentId };
}

export async function updateAgent(rpc: DomainRpc, agentId: string, patch: AgentUpdateInput) {
  const res = await rpc.call("agents.update", { agentId, ...patch });
  if (!res.ok) throw new Error(res.error?.message ?? "更新项目区失败");
}

export async function deleteAgent(rpc: DomainRpc, agentId: string) {
  const res = await rpc.call("agents.delete", { agentId });
  if (!res.ok) throw new Error(res.error?.message ?? "删除项目区失败");
}

export async function fetchAgentIdentity(
  rpc: DomainRpc,
  agentId?: string,
): Promise<AgentIdentity | null> {
  // agentId 未解析到时（竞态）不传参，server 解析默认 agent
  try {
    const res = await rpc.call("agent.identity.get", agentId ? { agentId } : {});
    if (res.ok && res.payload) {
      const p = res.payload;
      return {
        agentId: agentId,
        name: p.name,
        emoji: p.emoji,
        avatar: p.avatar ?? null,
        avatarSource: p.avatarSource ?? null,
        avatarStatus: p.avatarStatus ?? "none",
        avatarReason: p.avatarReason ?? null,
      } as AgentIdentity;
    }
    return null;
  } catch (err) {
    console.error("[Gateway] fetchAgentIdentity failed:", err);
    return null;
  }
}

export async function updateAgentAvatar(rpc: DomainRpc, agentId: string, avatar: string) {
  try {
    const res = await rpc.call("agents.update", agentId ? { agentId, avatar } : { avatar });
    if (!res.ok) throw new Error(res.error?.message ?? "未知错误");
    return true;
  } catch (err) {
    console.error("[Gateway] updateAgentAvatar failed:", err);
    rpc.notifyError(`头像更新失败：${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
