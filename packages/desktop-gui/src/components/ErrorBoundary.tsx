import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  /** 分区名，用于失败占位文案和控制台定位 */
  label?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// 单个消息分区渲染崩溃时只把自身折叠成失败占位，不拖垮整条时间线。
// 没有它，一个坏分区（如畸形 markdown/工具数据）会让整棵消息树白屏。
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[MessageParts] 分区渲染失败:", this.props.label, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="text-xs rounded-lg px-2.5 py-1.5"
          style={{
            color: "var(--text-secondary)",
            background: "var(--bg-tertiary)",
            border: "1px dashed var(--border)",
          }}
        >
          此内容渲染失败（{this.props.label ?? "未知分区"}），其余内容不受影响
        </div>
      );
    }
    return this.props.children;
  }
}
