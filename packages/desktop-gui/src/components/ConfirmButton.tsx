import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * 二次点击确认按钮（3 秒窗口）：应用内的破坏性操作确认范式，
 * 替代 window.confirm——Tauri WebView 下原生 confirm 可用性随版本波动
 * （存在静默返回 false 直接执行的隐患），且风格与自绘弹层割裂。
 * 与 Sidebar/CronPanel 已有的二段确认行为一致，统一收口。
 */
export default function ConfirmButton({
  onConfirm,
  confirmLabel = "确认？",
  title,
  className,
  style,
  children,
  disabled,
}: {
  onConfirm: () => void;
  confirmLabel?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timerRef.current = setTimeout(() => setArmed(false), 3000);
      }}
      className={className}
      style={armed ? { ...style, background: "var(--danger)", color: "var(--on-solid)" } : style}
      title={armed ? confirmLabel : title}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
