import { useCallback, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

interface ResizeHandleProps {
  /** 面板当前宽度 */
  width: number;
  /** 拖拽后的新宽度回调 */
  onResize: (width: number) => void;
  min: number;
  max: number;
  /** 1 = 手柄在右缘（向左拖变窄）；-1 = 手柄在左缘（向左拖变宽） */
  direction?: 1 | -1;
  style?: React.CSSProperties;
}

/**
 * 3px 拖拽手柄：按下后在 window 上挂 mousemove/mouseup，
 * 按 direction 计算新宽度并 clamp，松手清理。
 */
export default function ResizeHandle({
  width,
  onResize,
  min,
  max,
  direction = 1,
  style,
}: ResizeHandleProps) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const startDrag = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: width };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const next = Math.min(
          max,
          Math.max(
            min,
            dragRef.current.startWidth + direction * (ev.clientX - dragRef.current.startX),
          ),
        );
        onResize(next);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, min, max, direction, onResize],
  );

  return (
    <div
      onMouseDown={startDrag}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 3,
        cursor: "col-resize",
        zIndex: 10,
        ...(direction === 1 ? { right: -1.5 } : { left: -1.5 }),
        ...style,
      }}
    />
  );
}
