// 把底层错误翻译成用户可读的中文：Workspace 页大量 setError(String(err))
// 会把 "Error: RPC timeout after ..." 之类的原始串直接糊在页面上。
// 只做通用模式归类，未知错误原样透出（不吞上下文）。
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/timed?\s?out|timeout/i.test(raw)) return "请求超时：网关可能正忙或未响应，稍后重试";
  if (/not connected|websocket/i.test(raw)) return "网关未连接：请先确认右上连接状态";
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND|fetch failed|network/i.test(raw)) {
    return "网络错误：连不上网关，请确认网关进程在运行";
  }
  if (/401|403|unauthorized|forbidden|auth|token/i.test(raw)) return "鉴权失败：token 或权限不对";
  return raw;
}
