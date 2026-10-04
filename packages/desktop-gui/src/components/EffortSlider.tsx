import { useCallback, useRef, useState } from "react";

/**
 * 推理强度滑杆（React 版，交互复刻 RedCode packages/ui EffortSliderV2）。
 *
 * 档位集合由调用方给出（steps），值域用下标：拖动阶段连续值严格跟手，
 * 松手 round 到最近一档提交——那一下吸附由 CSS 过渡收尾；拖动中必须关掉
 * 过渡，否则滑块拖在指针后面，比跳还难受。
 *
 * 几何与 RedCode 同款：胶囊画在根元素上，Track 内缩半个滑块（padding），
 * 滑到 0%/100% 时滑块中心正好落在胶囊两端；填充贴满胶囊、只裁剪自身，
 * 刻度与滑块共用 Track 基准（space-between 对齐）。
 */
export interface EffortSliderProps {
  /** 从低到高排好序的真实档位。 */
  steps: readonly string[];
  /** 当前显式档位。未设置时保留模型默认，不选中任何刻度。 */
  current?: string;
  onChange: (value: string) => void;
  /** 档位显示名；不给用原值。 */
  label?: (value: string) => string;
  /** 未显式选择时的占位文案（居中显示）。 */
  unselectedLabel?: string;
}

export function EffortSlider({
  steps,
  current,
  onChange,
  label,
  unselectedLabel,
}: EffortSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | undefined>();
  const last = steps.length - 1;
  const committed = current === undefined ? -1 : steps.indexOf(current);
  const position = drag ?? Math.max(committed, 0);
  const hasSelection = drag !== undefined || committed >= 0;
  const activeIndex = drag === undefined ? committed : Math.round(position);
  const nearest = steps[Math.round(position)] ?? current ?? "";
  const text = (value: string) => (label ? label(value) : value);

  const commit = useCallback(
    (raw: number) => {
      const index = Math.max(0, Math.min(last, Math.round(raw)));
      const value = steps[index];
      if (value !== undefined && value !== current) onChange(value);
    },
    [last, steps, current, onChange],
  );

  const valueFromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const raw = ((clientX - rect.left) / rect.width) * last;
    return Math.max(0, Math.min(last, raw));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta =
      e.key === "ArrowLeft" || e.key === "ArrowDown"
        ? -1
        : e.key === "ArrowRight" || e.key === "ArrowUp"
          ? 1
          : undefined;
    if (e.key === "Home") {
      commit(0);
    } else if (e.key === "End") {
      commit(last);
    } else if (delta !== undefined) {
      commit((committed < 0 ? -1 : committed) + delta);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  if (steps.length === 0) return null;

  if (steps.length === 1) {
    const step = steps[0];
    return (
      <button
        type="button"
        onClick={() => step !== undefined && onChange(step)}
        className="w-full rounded-full px-2.5 py-1 text-xs transition-colors"
        style={{
          background: "var(--bg-tertiary)",
          color: current === step ? "var(--accent)" : "var(--text-secondary)",
          border: `1px solid ${current === step ? "var(--accent)" : "transparent"}`,
        }}
      >
        {text(step ?? "")}
      </button>
    );
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="推理强度"
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={hasSelection ? activeIndex : undefined}
      aria-valuetext={hasSelection ? text(nearest) : unselectedLabel}
      data-dragging={drag !== undefined ? "" : undefined}
      data-unselected={hasSelection ? undefined : ""}
      className="relative select-none cursor-pointer flex items-center rounded-full"
      style={{
        height: 24,
        padding: "0 13px", // 半个滑块：滑块中心轨迹恰好贴齐胶囊两端
        background: "var(--bg-tertiary)",
        touchAction: "none",
        transition: "background 90ms ease-out",
      }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(valueFromPointer(e.clientX));
      }}
      onPointerMove={(e) => {
        if (drag === undefined) return;
        setDrag(valueFromPointer(e.clientX));
      }}
      onPointerUp={() => {
        // 先落 drag 再提交：提交触发的外观变化由过渡收尾，拖动态先解除
        const raw = position;
        setDrag(undefined);
        commit(raw);
      }}
      onPointerCancel={() => setDrag(undefined)}
    >
      {/* 填充：贴满胶囊，仅随 position 横向缩放；拖动中关过渡严格跟手 */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
        style={{ opacity: hasSelection ? 1 : 0 }}
      >
        <div
          className="absolute inset-y-0"
          style={{
            left: 13,
            right: 13,
            background: "var(--accent)",
            opacity: 0.85,
            transform: `scaleX(${position / last})`,
            transformOrigin: "left center",
            transition:
              drag !== undefined ? "none" : "transform 140ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </div>
      {/* 刻度：视觉提示不吃事件，位置与滑块停点共用同一基准 */}
      <div
        ref={trackRef}
        aria-hidden
        className="relative z-10 w-full h-full flex items-center justify-between pointer-events-none"
      >
        {steps.map((_, i) => (
          <span
            key={i}
            className="rounded-full"
            style={{
              width: 3,
              height: 3,
              background:
                activeIndex >= 0 && i <= activeIndex
                  ? "var(--bg-secondary)"
                  : "var(--text-secondary)",
              opacity: activeIndex >= 0 && i <= activeIndex ? 0.9 : 0.5,
              transform: activeIndex === i ? "scale(1.4)" : undefined,
              transition:
                drag !== undefined ? "none" : "opacity 120ms ease-out, transform 120ms ease-out",
            }}
          />
        ))}
      </div>
      {/* 滑块：中心轨迹 = padding + t*(胶囊宽-滑块宽)，translate 收回自身半宽；未选中隐藏 */}
      <div
        aria-hidden
        className="absolute top-1/2 rounded-full pointer-events-none"
        style={{
          width: 26,
          height: 26,
          left: `calc(13px + (100% - 26px) * ${position / last})`,
          translate: "-50% -50%",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          boxShadow: "0 2px 6px color-mix(in srgb, var(--text-primary) 20%, transparent)",
          opacity: hasSelection ? 1 : 0,
          transition:
            drag !== undefined
              ? "none"
              : "left 140ms cubic-bezier(0.22, 1, 0.36, 1), opacity 100ms ease-out",
        }}
      />
      {!hasSelection && (
        <span
          className="absolute inset-0 flex items-center justify-center text-[11px] pointer-events-none"
          style={{ color: "var(--text-secondary)" }}
        >
          {unselectedLabel}
        </span>
      )}
    </div>
  );
}
