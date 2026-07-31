import { CONNECTION_COLOR, type ConnectionState } from "../lib/connectionStatus";

interface ConnectionBadgeProps {
  state: ConnectionState;
  label?: string;
}

export default function ConnectionBadge({ state, label }: ConnectionBadgeProps) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${state === "connecting" ? "animate-pulse" : ""}`}
        style={{ background: CONNECTION_COLOR[state] }}
      />
      {label && (
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
      )}
    </div>
  );
}
