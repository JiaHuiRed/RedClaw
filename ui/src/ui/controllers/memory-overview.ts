import type { GatewayBrowserClient } from "../gateway.ts";

export type MemoryFileOverview = {
  name: string;
  size: number;
  updatedAtMs: number;
  preview?: string | null;
};

export type MemoryOverviewResult = {
  agentId: string;
  workspace: string;
  longTerm: MemoryFileOverview | null;
  files: MemoryFileOverview[];
  totals: { files: number; bytes: number; lastUpdatedAtMs: number | null };
};

export type MemoryOverviewState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  memoryOverviewLoading: boolean;
  memoryOverview: MemoryOverviewResult | null;
  memoryOverviewError: string | null;
};

export async function loadMemoryOverview(state: MemoryOverviewState): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  state.memoryOverviewLoading = true;
  state.memoryOverviewError = null;
  try {
    state.memoryOverview = await state.client.request<MemoryOverviewResult>(
      "memory.overview",
      {},
    );
  } catch (err) {
    state.memoryOverviewError = err instanceof Error ? err.message : String(err);
  } finally {
    state.memoryOverviewLoading = false;
  }
}
