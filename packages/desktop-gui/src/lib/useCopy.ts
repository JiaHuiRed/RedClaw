import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 复制反馈 hook：写剪贴板成功才亮「已复制」，失败返回 false 由调用方决定提示。
 * 统一 ChatPanel MessageActions 与 MessageParts CopyButton 两套复制实现
 * （原 MessageActions 版本 writeText 未 await 未 catch，失败也显示已复制）。
 */
export function useCopy(resetMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), resetMs);
        return true;
      } catch (err) {
        console.error("复制失败:", err);
        return false;
      }
    },
    [resetMs],
  );

  return { copied, copy };
}
