// 全应用共享的时间/问候格式（此前 4 个面板各写一份，行为还不一致）。
// 口径：相对时间 7 天内用「N天前」，更早用 M/D；时点显示今天省略日期。

/** 相对时间：刚刚 / N分钟前 / N小时前 / N天前 / M/D */
export function fmtRelative(ts?: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 时点：今天 HH:MM / M/D HH:MM */
export function fmtClock(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** cron 倒计时（未来时点）：待排程 / 即将运行 / N分钟后 / N小时后 / M/D */
export function fmtCountdown(ms?: number): string {
  if (!ms) return "待排程";
  const diff = ms - Date.now();
  if (diff <= 0) return "即将运行";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟后`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时后`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 时段问候：夜深了 / 早上好 / 中午好 / 下午好 / 晚上好 */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}
