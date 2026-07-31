export type ConnectionState = "idle" | "connecting" | "connected" | "error";

// Priority order matters: a recent error always wins (it's time-boxed by the
// caller, so it can't get stuck), otherwise "connecting" beats a stale
// "connected" from before a reconnect started.
export function getConnectionState(
  connected: boolean,
  connecting: boolean,
  hasRecentError: boolean,
): ConnectionState {
  if (hasRecentError) return "error";
  if (connecting) return "connecting";
  if (connected) return "connected";
  return "idle";
}

export const CONNECTION_COLOR: Record<ConnectionState, string> = {
  idle: "var(--neutral)",
  connecting: "var(--warning)",
  connected: "var(--success)",
  error: "var(--danger)",
};
