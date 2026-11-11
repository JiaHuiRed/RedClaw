import type { Message } from "../gateway/client";

// 会话导出（webui「导出聊天 .md」对齐）：消息流 → 单个 Markdown 文档。
// 图片用原 URL（data URL 直接内嵌、mediaTicket 稳定 URL 引用）。
export function messagesToMarkdown(messages: Message[], title: string): string {
  const lines: string[] = [`# ${title}`, "", `> 导出于 ${new Date().toLocaleString()}`, ""];
  for (const m of messages) {
    const who = m.role === "user" ? "我" : m.role === "assistant" ? "秋秋" : m.role;
    const time = new Date(m.timestamp).toLocaleString();
    lines.push(`### ${who} · ${time}`, "");
    if (m.content) lines.push(m.content, "");
    for (const img of m.images ?? []) {
      lines.push(`![${img.alt ?? "图片"}](${img.url})`, "");
    }
    lines.push("");
  }
  return lines.join("\n");
}

// 文件名安全化 + 时间戳（redclaw-<标题>-<YYYYMMDD-HHmm>.md）
export function exportFileName(title: string, at = new Date()): string {
  const safe = title.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40) || "会话";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(
    at.getHours(),
  )}${pad(at.getMinutes())}`;
  return `redclaw-${safe}-${stamp}.md`;
}

// Blob 下载（WebView2 走默认下载 UI）；失败返回 false 由调用方回落剪贴板
export function downloadTextFile(filename: string, text: string, mime = "text/markdown"): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
