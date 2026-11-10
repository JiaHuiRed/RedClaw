import { useEffect, useRef, useState } from "react";
import { toolSegmentKey, type StreamSegment } from "../components/MessageParts";
import { gateway, type Message, type ToolCallEvent } from "../gateway/client";
import { applyStreamDelta } from "../lib/chat-stream";

export interface ChatStreamHandlers {
  /** 任何 run 事件到达（delta/thinking/tool/message）：刷新 stall 检测基准 */
  onActivity: () => void;
  /** final 消息投递（runTools = 本轮流式分段里的工具快照，供随消息持久化） */
  onFinalMessage: (msg: Message, runTools: ToolCallEvent[]) => void;
  /** 思考流全文覆盖 */
  onThinking: (text: string) => void;
  /** 流结束（aborted/error） */
  onStreamEnd: () => void;
  /** 连接状态变化（断线时调用方负责清流式残留） */
  onStatus: (connected: boolean) => void;
}

/**
 * 流式分段状态机 + gateway 事件订阅（从 ChatPanel 拆出）。
 * ref 与 state 同步维护：订阅闭包里需要读到最新分段（React state 在闭包里是旧值）。
 * delta 在 150ms 服务端节流之上做 rAF 合帧；handlers 经 ref 每渲染刷新，effect 只挂一次。
 */
export function useChatStream(handlers: ChatStreamHandlers) {
  const [segments, setSegments] = useState<StreamSegment[]>([]);
  const segmentsRef = useRef<StreamSegment[]>([]);
  // delta 合帧缓冲：同帧多个 delta 只提交一次，长回复的 markdown 重解析频率显著下降
  const pendingDeltaRef = useRef<{ text: string; replace: boolean } | null>(null);
  const deltaRafRef = useRef<number | null>(null);

  const updateSegments = (fn: (prev: StreamSegment[]) => StreamSegment[]) => {
    segmentsRef.current = fn(segmentsRef.current);
    setSegments(segmentsRef.current);
  };
  const flushDelta = () => {
    deltaRafRef.current = null;
    const pending = pendingDeltaRef.current;
    pendingDeltaRef.current = null;
    if (!pending) return;
    updateSegments((prev) => applyStreamDelta(prev, pending.text, pending.replace));
  };
  const clearSegments = () => {
    // 丢弃未提交的合并帧：final/abort/断线后残留 flush 会在空分段上长出幽灵文本
    if (deltaRafRef.current !== null) {
      cancelAnimationFrame(deltaRafRef.current);
      deltaRafRef.current = null;
    }
    pendingDeltaRef.current = null;
    updateSegments(() => []);
  };
  const getToolSnapshot = () =>
    segmentsRef.current.flatMap((seg) => (seg.kind === "tool" ? [seg.tool] : []));

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const h = () => handlersRef.current;
    const markActivity = () => h().onActivity();

    const unsubMsg = gateway.onMessage((msg) => {
      markActivity();
      // 该轮工具卡随 final 消息持久化：流式分段清空前的快照挂到消息上，
      // 之后翻历史也能看到这一轮的工具轨迹（右栏 ActivityPanel 是另一路镜像）
      h().onFinalMessage(msg, getToolSnapshot());
    });

    const unsubDelta = gateway.onDelta((text, _reasoning, replace) => {
      if (!text) return;
      markActivity();
      // 连续增量直接拼接等价于逐条 apply；replace 修复帧是全文语义，以新帧为准
      const pending = pendingDeltaRef.current;
      pendingDeltaRef.current =
        pending && !pending.replace && !replace
          ? { text: pending.text + text, replace: false }
          : { text, replace: replace === true };
      if (deltaRafRef.current === null) {
        deltaRafRef.current = requestAnimationFrame(flushDelta);
      }
    });

    const unsubThinking = gateway.onThinking((evt) => {
      markActivity();
      // data.text is always the full accumulated reasoning; replace when
      // the server flags a non-prefix change, otherwise just overwrite.
      h().onThinking(evt.text);
    });

    const unsubTool = gateway.onTool((tool) => {
      markActivity();
      const key = toolSegmentKey(tool);
      if (!key) return;
      updateSegments((prev) => {
        const idx = prev.findIndex(
          (seg) => seg.kind === "tool" && toolSegmentKey(seg.tool) === key,
        );
        if (idx === -1) return [...prev, { kind: "tool", tool }];
        const next = [...prev];
        next[idx] = { kind: "tool", tool };
        return next;
      });
    });

    const unsubStreamEnd = gateway.onStreamEnd(() => {
      h().onStreamEnd();
    });

    const unsubStatus = gateway.onStatus((status) => {
      h().onStatus(status);
    });

    return () => {
      unsubMsg();
      unsubDelta();
      unsubThinking();
      unsubTool();
      unsubStreamEnd();
      unsubStatus();
      // NOTE: do not gateway.stop() here. Vite HMR / StrictMode remounts
      // run this cleanup and would kill the WebSocket, leaving the UI
      // looking "connected" while every send silently fails. Connection
      // lifecycle is owned by the connect button / App layer instead.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { segments, clearSegments, getToolSnapshot };
}
