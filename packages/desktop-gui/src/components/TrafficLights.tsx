import { getCurrentWindow } from "@tauri-apps/api/window";

// macOS 交通灯窗控：decorations:false 后自绘的最小化/最大化/关闭。
// 纯三色圆点不带符号（哥哥拍板）；三色是苹果系统控件固定配色（已登记 token 门禁 ALLOWED）。
const DOTS = [
  {
    label: "关闭",
    color: "#ff5f57",
    action: (win: ReturnType<typeof getCurrentWindow>) => void win.close(),
  },
  {
    label: "最小化",
    color: "#febc2e",
    action: (win: ReturnType<typeof getCurrentWindow>) => void win.minimize(),
  },
  {
    label: "最大化",
    color: "#28c840",
    action: (win: ReturnType<typeof getCurrentWindow>) => void win.toggleMaximize(),
  },
];

export function TrafficLights() {
  return (
    <div className="flex items-center gap-2">
      {DOTS.map((dot) => (
        <button
          key={dot.label}
          aria-label={dot.label}
          title={dot.label}
          onClick={() => dot.action(getCurrentWindow())}
          className="h-3 w-3 rounded-full hover:opacity-90"
          style={{ background: dot.color }}
        />
      ))}
    </div>
  );
}
