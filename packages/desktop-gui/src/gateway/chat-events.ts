import { ListenerSet } from "./emitter";
// 聊天/agent 事件管线（从 client.ts 拆出）：chat 与 agent/session.tool 帧
// → 投递到监听器注册表。seq 水位线与跨会话过滤在这里，连接状态机留在 client。
import { dedupeBySource, resolveImages } from "./media";
import type { MediaResolver } from "./media";
import type { Message, ThinkingEvent, ToolCallEvent } from "./protocol";

export interface ChatEventContext {
  deltas: ListenerSet<[string, string, boolean?]>;
  /** 经 client 的去重 FIFO 投递（重复 final 广播只进一次） */
  notifyMessage: (msg: Message) => void;
  streamEnds: ListenerSet<[]>;
  notifyError: (message: string) => void;
  tools: ListenerSet<[ToolCallEvent]>;
  thinkings: ListenerSet<[ThinkingEvent]>;
  /** per-session delta seq 水位线，由 client 持有（终态清除需 Map 引用） */
  deltaSeqs: Map<string, number>;
  getActiveKey: () => string;
  /** final 后刷新会话信息（tokens/会话列表） */
  refreshSessionInfo: () => void;
  media: MediaResolver;
}

export class ChatEventPipeline {
  constructor(private ctx: ChatEventContext) {}

  handleChatEvent(payload: any) {
    if (!payload) return;
    const { state, sessionKey, message, deltaText, errorMessage } = payload;
    // chat 事件与 thinking/tool 流同口径：只消费 active 会话。known-session
    // /hasMedia 宽放行会让别的会话（含 heartbeat isolated key）的 delta/final
    // 串进当前聊天流；跨会话内容由会话切换时的 fetchHistory 兜底。
    if (sessionKey && sessionKey !== this.ctx.getActiveKey()) return;

    switch (state) {
      case "delta": {
        // seq 水位线（per-session）：<= 上次已收的帧是迟到/重放，丢弃（server
        // 端 delta 有 150ms 节流与增量对齐，正常序列 seq 单调；run 终态时清除）
        const seq = typeof payload.seq === "number" ? payload.seq : null;
        if (seq !== null) {
          const seqKey = this.deltaSeqKey(sessionKey);
          const lastSeq = this.ctx.deltaSeqs.get(seqKey);
          if (lastSeq !== undefined && seq <= lastSeq) break;
          this.ctx.deltaSeqs.set(seqKey, seq);
        }
        // replace=true 时 deltaText 是「到目前为止的全文」而非增量（server 端
        // 投影分叉时的修复帧），必须透传给 UI，按追加处理会重复拼文本
        this.ctx.deltas.emit(deltaText || "", message?.reasoning || "", payload.replace === true);
        break;
      }
      case "final":
        this.ctx.deltaSeqs.delete(this.deltaSeqKey(sessionKey));
        void this.handleFinalChatMessage(message);
        // refresh session info after each completed response
        this.ctx.refreshSessionInfo();
        break;
      case "aborted": {
        this.ctx.deltaSeqs.delete(this.deltaSeqKey(sessionKey));
        const partialText =
          message?.text ||
          message?.content
            ?.filter((c: any) => c.type === "text")
            ?.map((c: any) => c.text)
            ?.join("") ||
          "";
        if (partialText) {
          this.ctx.notifyMessage({
            id: message?.id || crypto.randomUUID(),
            role: "assistant",
            content: partialText,
            timestamp: Date.now(),
            reasoning: message?.reasoning || "",
          });
        }
        this.ctx.streamEnds.emit();
        break;
      }
      case "error":
        console.error("[Gateway] chat error:", errorMessage);
        this.ctx.deltaSeqs.delete(this.deltaSeqKey(sessionKey));
        this.ctx.streamEnds.emit();
        this.ctx.notifyError(errorMessage || "生成失败");
        break;
    }
  }

  // 生图完成消息：文字 + 图片（content image block / 顶层 mediaUrls / mediaUrl / MEDIA: 文本）
  // 本地绝对路径经 assistant-media 端点换 ticket 转 HTTP URL
  private async handleFinalChatMessage(message: any) {
    const content =
      message?.text ||
      message?.content
        ?.filter((c: any) => c.type === "text")
        ?.map((c: any) => c.text)
        ?.join("") ||
      "";

    const mediaCandidates = collectFinalMediaCandidates(message ?? {}, content);
    await this.resolveAndNotifyImages(mediaCandidates, content, message?.id);
  }

  private async resolveAndNotifyImages(
    mediaCandidates: string[],
    text: string,
    messageId?: string,
  ) {
    // server 可能同时填 mediaUrl + mediaUrls[0]（同一路径双字段），且本地路径
    // 每次解析换新 mediaTicket，按最终 URL 去重会失效——先按原始路径去重，
    // 再并行解析（串行时 N 张图 = N 个串行往返，最终气泡明显延迟）。
    let images: { url: string }[] = [];
    try {
      images = await resolveImages(dedupeBySource(mediaCandidates), this.ctx.media);
    } catch (err) {
      console.error("[Gateway] resolve images failed:", err);
    }

    // 空内容且无图（如生图后台任务 run 结束的空 final 广播）不渲染，
    // 否则会变成空白气泡。
    if (!text && images.length === 0) {
      return;
    }

    this.ctx.notifyMessage({
      // 服务端稳定 id 透传：重复 final 广播（如重连重放）被去重 FIFO 拦截。
      id: messageId || crypto.randomUUID(),
      role: "assistant",
      content: text,
      timestamp: Date.now(),
      ...(images.length > 0 ? { images } : {}),
    });
  }

  // 无 sessionKey 的帧按 active 会话归属（与放行口径一致），水位线/清除都用它
  private deltaSeqKey(sessionKey: string | undefined): string {
    return sessionKey || this.ctx.getActiveKey();
  }

  handleAgentEvent(payload: any) {
    if (!payload) return;
    const { sessionKey, stream, data } = payload;
    if (sessionKey && sessionKey !== this.ctx.getActiveKey()) return;

    if (stream === "thinking") {
      this.ctx.thinkings.emit({
        text: data?.text ?? "",
        delta: data?.delta,
        replace: data?.replace === true,
      });
      return;
    }
    if (stream === "tool") {
      const toolData = data ?? {};
      // message tool 是内部路由工具：start 阶段保留卡片（告诉用户任务开始），
      // result 阶段静默（sourceReply 会补发 assistant 消息，避免重复气泡）。
      if (!(toolData.name === "message" && toolData.phase === "result")) {
        this.ctx.tools.emit(toolData as ToolCallEvent);
      }
      // message tool 的 sourceReply 走 internal-ui sink，不经过 chat final
      // broadcast；GUI/TUI 这里直接消费，补发一条 assistant 消息（含图片）。
      if (toolData.name === "message" && !toolData.error) {
        const sourceReply = (toolData as any)?.result?.details?.sourceReply;
        if (sourceReply) {
          const text =
            sourceReply.text ||
            sourceReply.message ||
            ((toolData as any)?.result?.content as any[])
              ?.filter((c: any) => c?.type === "text")
              ?.map((c: any) => c.text)
              ?.join("") ||
            "";
          const mediaCandidates = [
            ...(Array.isArray(sourceReply.mediaUrls) ? sourceReply.mediaUrls : []),
            ...(sourceReply.mediaUrl ? [sourceReply.mediaUrl] : []),
          ];
          this.resolveAndNotifyImages(mediaCandidates, text);
        }
      }
      return;
    }
  }
}

function collectFinalMediaCandidates(
  record: {
    mediaUrls?: unknown;
    mediaUrl?: unknown;
    MediaPaths?: unknown;
    MediaPath?: unknown;
  },
  content: string,
): string[] {
  const out = [
    ...(Array.isArray(record.mediaUrls) ? (record.mediaUrls as string[]) : []),
    ...(typeof record.mediaUrl === "string" ? [record.mediaUrl] : []),
    ...(Array.isArray(record.MediaPaths) ? (record.MediaPaths as string[]) : []),
    ...(typeof record.MediaPath === "string" ? [record.MediaPath] : []),
  ];
  const mediaTokenRe = /\bMEDIA:\s*`?([^\n]+)`?/gi;
  let m: RegExpExecArray | null;
  while ((m = mediaTokenRe.exec(content)) !== null) {
    const path = m[1]?.trim();
    if (path) out.push(path);
  }
  return out;
}
