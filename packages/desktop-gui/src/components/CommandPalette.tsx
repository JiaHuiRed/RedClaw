import { ChevronLeft } from "lucide-react";
import type { PaletteItem } from "../lib/commandPalette";

interface CommandPaletteProps {
  items: PaletteItem[];
  selectedIndex: number;
  category: string | null;
  onSelectIndex: (index: number) => void;
  onActivate: (item: PaletteItem) => void;
  onBack: () => void;
}

export default function CommandPalette({
  items,
  selectedIndex,
  category,
  onSelectIndex,
  onActivate,
  onBack,
}: CommandPaletteProps) {
  return (
    <div
      className="absolute bottom-full left-4 right-4 mb-2 rounded-xl border overflow-y-auto max-h-52"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      {category && (
        <button
          onClick={onBack}
          className="w-full text-left px-3 py-2 text-xs flex items-center gap-1.5 hover:opacity-80 sticky top-0"
          style={{
            color: "var(--text-secondary)",
            background: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <ChevronLeft size={12} />
          {category}
        </button>
      )}

      {items.length === 0 && (
        <div className="px-3 py-4 text-xs text-center" style={{ color: "var(--text-secondary)" }}>
          未找到匹配命令
        </div>
      )}

      {items.map((item, i) => {
        const active = i === selectedIndex;
        const rowStyle = {
          color: "var(--text-primary)",
          background: active ? "var(--bg-tertiary)" : "transparent",
          borderBottom: "1px solid var(--border)",
        };

        if (item.kind === "header") {
          return (
            <button
              key={item.category}
              onClick={() => onActivate(item)}
              onMouseEnter={() => onSelectIndex(i)}
              className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:opacity-80"
              style={rowStyle}
            >
              <span className="font-medium">{item.category}</span>
              <span style={{ color: "var(--text-secondary)" }}>{item.count}</span>
            </button>
          );
        }

        const cmd = item.command;
        return (
          <button
            key={cmd.name}
            onClick={() => onActivate(item)}
            onMouseEnter={() => onSelectIndex(i)}
            className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center gap-2"
            style={rowStyle}
          >
            <span className="font-medium shrink-0" style={{ color: "var(--accent)" }}>
              {cmd.name}
            </span>
            <span style={{ color: "var(--text-secondary)" }} className="truncate">
              {cmd.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
