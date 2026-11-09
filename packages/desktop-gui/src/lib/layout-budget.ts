// 侧栏与右栏面板共享的拖宽预算：两侧互相感知对方当前宽度，
// 保证聊天区保底宽度。没有这层协调时，480（侧栏 max）+ 560（右栏 max）
// 可以同时拖满，超出 900px 最小窗宽，聊天区被 flex 挤成 0 且无横向滚动。
export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 480;
export const RIGHT_PANEL_MAX_WIDTH = 560;
export const RIGHT_PANEL_MIN_WIDTH = 240;
export const MIN_CHAT_WIDTH = 380;

// 单窗口应用的布局事实：进程内单值即可，由 width 状态的持有方在变化时上报
let sidebarWidth = 260;
let rightPanelWidth = 0;

export function reportSidebarWidth(w: number): void {
  sidebarWidth = w;
}

export function reportRightPanelWidth(w: number): void {
  rightPanelWidth = w;
}

export function clampSidebarWidth(w: number): number {
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, w, window.innerWidth - rightPanelWidth - MIN_CHAT_WIDTH),
  );
}

export function clampRightPanelWidth(w: number): number {
  return Math.max(
    RIGHT_PANEL_MIN_WIDTH,
    Math.min(RIGHT_PANEL_MAX_WIDTH, w, window.innerWidth - sidebarWidth - MIN_CHAT_WIDTH),
  );
}
