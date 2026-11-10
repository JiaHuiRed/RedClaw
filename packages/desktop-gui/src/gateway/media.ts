// 媒体引用解析（从 client.ts 拆出）：把消息里的本地路径/相对路径/HTTP URL
// 解析成可直接 <img> 的 HTTP URL。本地绝对路径经 assistant-media 端点换 ticket。
import type { RpcFrame } from "./protocol";

export class MediaResolver {
  // ticket 5 分钟 TTL，同路径反复换发结果等价：按源路径缓存，历史加载
  // /重复消息不再每张图都打一次 meta 往返。
  private ticketCache = new Map<string, { url: string; expiresAt: number }>();

  constructor(
    private getHttpBase: () => string,
    private getToken: () => string,
  ) {}

  async resolve(source: string | undefined): Promise<string | null> {
    if (!source) return null;
    const httpBase = this.getHttpBase();
    if (/^https?:\/\//i.test(source)) return source;
    if (source.startsWith("/")) return `${httpBase}${source}`;
    // 本地绝对路径：assistant-media meta 换 ticket（allowQueryToken:true）
    try {
      const cached = this.ticketCache.get(source);
      if (cached && cached.expiresAt - 60_000 > Date.now()) {
        return cached.url;
      }
      const enc = encodeURIComponent(source);
      const token = this.getToken();
      const metaUrl = `${httpBase}/__openclaw__/assistant-media?source=${enc}&meta=1${
        token ? `&token=${encodeURIComponent(token)}` : ""
      }`;
      // 5s 超时：网关 HTTP 端口半死（TCP 通但不响应）时避免挂住整个历史加载，
      // 超时走下方 catch 按解析失败返回 null。
      const res = await fetch(metaUrl, { signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.available && data?.mediaTicket) {
        const url = `${httpBase}/__openclaw__/assistant-media?source=${enc}&mediaTicket=${encodeURIComponent(data.mediaTicket)}`;
        const parsedExp = data.mediaTicketExpiresAt ? Date.parse(data.mediaTicketExpiresAt) : NaN;
        if (this.ticketCache.size > 200) this.ticketCache.clear();
        this.ticketCache.set(source, {
          url,
          expiresAt: Number.isFinite(parsedExp) ? parsedExp : Date.now() + 4 * 60_000,
        });
        return url;
      }
      return null;
    } catch {
      return null;
    }
  }
}

interface MediaSourceRecord {
  mediaUrls?: unknown;
  mediaUrl?: unknown;
  MediaPaths?: unknown;
  MediaPath?: unknown;
}

/** 从消息记录的顶层媒体字段收集候选（历史投影与 final 广播共用） */
export function collectMediaCandidates(record: MediaSourceRecord, content: string): string[] {
  return [
    ...(Array.isArray(record.mediaUrls) ? (record.mediaUrls as string[]) : []),
    ...(typeof record.mediaUrl === "string" ? [record.mediaUrl] : []),
    ...(Array.isArray(record.MediaPaths) ? (record.MediaPaths as string[]) : []),
    ...(typeof record.MediaPath === "string" ? [record.MediaPath] : []),
    ...extractMediaTokens(content),
  ];
}

// 正文里 MEDIA: `path` 标记提取（生图落盘消息的第三种媒体藏匿处）
function extractMediaTokens(content: string): string[] {
  const out: string[] = [];
  const mediaTokenRe = /\bMEDIA:\s*`?([^\n]+)`?/gi;
  let m: RegExpExecArray | null;
  while ((m = mediaTokenRe.exec(content)) !== null) {
    const path = m[1]?.trim();
    if (path) out.push(path);
  }
  return out;
}

/** 按源路径去重：本地路径每次换发 ticket 不是稳定 URL，同路径双字段
 * （mediaUrl + mediaUrls[0]）会解析出两个不同 URL，先按源路径收窄再并行解析 */
export function dedupeBySource(candidates: string[]): string[] {
  const seen = new Set<string>();
  return candidates.filter((cand) => {
    if (!cand || seen.has(cand)) return false;
    seen.add(cand);
    return true;
  });
}

/** 并行解析 + 按最终 URL 去重（同路径已收敛，这里兜双字段残余） */
export async function resolveImages(
  candidates: string[],
  resolver: MediaResolver,
): Promise<{ url: string }[]> {
  const urls = await Promise.all(candidates.map((c) => resolver.resolve(c)));
  const seenUrls = new Set<string>();
  const images: { url: string }[] = [];
  for (const url of urls) {
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    images.push({ url });
  }
  return images;
}

/** fetchHistory 的媒体相关工具：从 toolCall 块参数里挖附件媒体路径 */
export function collectAttachmentMedia(args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const att of (args.attachments as Array<Record<string, unknown>> | undefined) ?? []) {
    const media = att?.media;
    if (
      typeof media === "string" &&
      (att.type === "image" || /\.(png|jpe?g|gif|webp|bmp)$/i.test(media))
    ) {
      out.push(media);
    }
  }
  return out;
}

export type { RpcFrame };
