import { useEffect } from "react";

/**
 * 弹层统一 Esc 关闭：capture 阶段监听，先于页面内其它 Esc 处理
 * （命令面板/输入框），保证「最上层的弹层先关」。
 */
export function useEscape(onEscape: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onEscape();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onEscape, active]);
}
