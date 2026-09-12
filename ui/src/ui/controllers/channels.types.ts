import type { GatewayBrowserClient } from "../gateway.ts";
import type { ChannelsStatusSnapshot } from "../types.ts";

export type ChannelsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  channelsLoading: boolean;
  channelsLoadingProbe?: boolean | null;
  channelsRefreshSeq?: number;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsError: string | null;
  channelsLastSuccess: number | null;
  whatsappLoginMessage: string | null;
  whatsappLoginQrDataUrl: string | null;
  whatsappLoginConnected: boolean | null;
  whatsappBusy: boolean;
  /** Channel id while a channels.start/channels.stop call is in flight. */
  channelRuntimeBusy?: string | null;
};
