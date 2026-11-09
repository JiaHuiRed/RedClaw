// 流式分段的状态机逻辑（从 ChatPanel 抽出为纯函数，便于单测）。
// 段模型与分区注册表同源：文本/工具交错，见 components/MessageParts.tsx。
import type { StreamSegment } from "../components/MessageParts";

type TextSegment = Extract<StreamSegment, { kind: "text" }>;

function textSegments(prev: StreamSegment[]): string {
  return prev
    .filter((s): s is TextSegment => s.kind === "text")
    .map((s) => s.text)
    .join("");
}

/**
 * 把一条 delta 合并进流式分段，返回新分段数组（不可变更新）。
 *
 * - 常规增量：追加到最后一个文本段；末尾是工具段（或空）则新开文本段。
 * - replace=true 时 deltaText 是「到目前为止的全文」而非增量（server 端
 *   投影分叉时的修复帧），必须按全文对齐：与已有文本段拼接结果前缀一致时
 *   只补差值；分叉时丢弃旧文本段整段重建（工具段位置保留）。
 */
export function applyStreamDelta(
  prev: StreamSegment[],
  text: string,
  replace: boolean,
): StreamSegment[] {
  const last = prev[prev.length - 1];
  if (replace) {
    const prevText = textSegments(prev);
    if (text.startsWith(prevText)) {
      const tail = text.slice(prevText.length);
      if (!tail) return prev;
      if (last?.kind === "text") {
        return [...prev.slice(0, -1), { kind: "text", text: last.text + tail }];
      }
      return [...prev, { kind: "text", text: tail }];
    }
    return [...prev.filter((s) => s.kind === "tool"), { kind: "text", text }];
  }
  if (last?.kind === "text") {
    return [...prev.slice(0, -1), { kind: "text", text: last.text + text }];
  }
  return [...prev, { kind: "text", text }];
}
