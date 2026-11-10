// chat.history 投影（从 client.ts 拆出）：原始消息数组 → GUI Message[]。
// 纯投影逻辑（无连接状态），可独立单测。
import { collectAttachmentMedia, collectMediaCandidates, dedupeBySource } from "./media";
import type { MediaResolver } from "./media";
import {
  DEFAULT_SESSION_KEY,
  STREAM_ERROR_FALLBACK_TEXT,
  type ChatSession,
  type Message,
  type MessageImage,
} from "./protocol";

// status.sessions.recent → 侧栏会话行（gateway 字段名是 key 不是 sessionKey，
// 见 status.summary.ts buildSessionRows）
export function parseSessionRows(raw: any[]): ChatSession[] {
  return raw.map((s: any) => ({
    sessionKey: s.key ?? s.sessionKey ?? DEFAULT_SESSION_KEY,
    sessionId: s.sessionId,
    model: s.model,
    configuredModel: s.configuredModel,
    title: s.title,
    updatedAt: s.updatedAt,
    messageCount: s.messageCount,
    kind: s.kind,
  }));
}

export async function projectHistory(rawMessages: any[], media: MediaResolver): Promise<Message[]> {
  const out: Message[] = [];
  for (const m of rawMessages) {
    // 只渲染用户/助手消息；工具结果（role=toolResult）在实时聊天里也不显示，
    // 历史里同样跳过，避免 "Background task started..." 之类文本变成气泡。
    const role = m.role ?? "assistant";
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    let content =
      typeof m.content === "string"
        ? m.content
        : (m.content?.map((c: any) => c.text).join("") ?? "");
    // 过滤内部路由消息（inter-session / task completion），不显示给用户；
    // 真实回复由 message tool 的 sourceReply 直接补发 assistant 消息。
    if (
      content.startsWith("[Inter-session message]") ||
      content.startsWith("[Internal task completion event]") ||
      content.startsWith("[Internal message]")
    ) {
      continue;
    }
    // 心跳 ack 文本（HEARTBEAT_OK）不渲染成气泡：server 实时广播已过滤，
    // 但历史投影对带 thinking 块的消息 isHeartbeatOkResponse 不命中，这里文本兜底。
    if (/^HEARTBEAT_OK(\s|$)/.test(content.trim())) {
      continue;
    }
    // 生成失败轮占位：打 failed 标记，UI 折叠成细条，保留时间线但去掉空泡噪音
    if (content.trim() === STREAM_ERROR_FALLBACK_TEXT) {
      out.push({
        id: m.id ?? crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: m.timestamp ?? Date.now(),
        failed: true,
      });
      continue;
    }
    const mediaCandidates = collectMediaCandidates(m, content);
    // 历史生图消息：图片路径藏在 assistant 消息的 message tool 调用参数里
    // （chat.history 投影保留 toolCall 块，arguments.attachments[].media 是
    // 图片绝对路径，arguments.message 是展示文案），顶层字段没有媒体，
    // 不解析的话历史里就看不到生成的图。
    if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block?.type !== "toolCall" || block.name !== "message" || !block.arguments) {
          continue;
        }
        let args: any = block.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            args = null;
          }
        }
        if (!args) continue;
        if (typeof args.message === "string" && !content) {
          content = args.message;
        }
        mediaCandidates.push(...collectAttachmentMedia(args));
      }
    }
    let images: MessageImage[] = [];
    // 先按源路径去重再并行解析：本地路径经 mediaTicket 换发不是稳定 URL，
    // 同路径重复字段会解析出两个不同 URL；并行把多图会话切换延迟降到 1 往返
    const uniqueCandidates = dedupeBySource(mediaCandidates);
    const resolvedUrls = await Promise.all(uniqueCandidates.map((c) => media.resolve(c)));
    const seenUrls = new Set<string>();
    for (const url of resolvedUrls) {
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      images.push({ url });
    }
    // 空内容且无图（生图后台任务 run 的空 final）不渲染成空白气泡。
    if (!content && images.length === 0) {
      continue;
    }
    out.push({
      id: m.id ?? crypto.randomUUID(),
      role: m.role ?? "assistant",
      content,
      timestamp: m.timestamp ?? Date.now(),
      reasoning: m.reasoning ?? "",
      ...(images.length > 0 ? { images } : {}),
    });
  }
  return out;
}
