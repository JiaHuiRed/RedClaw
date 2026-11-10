import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

// 界面字号（设置页可调）：React 挂载前落到根节点，防首帧字号跳变
const savedUiFontSize = localStorage.getItem("redclaw:uiFontSize:v1");
if (savedUiFontSize) {
  document.documentElement.style.setProperty("--ui-font-size", savedUiFontSize);
}
// 窗口隐藏时停掉 CSS 动画（DocumentTimeline 不结算会泄漏整棵动效子树）
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    document.documentElement.setAttribute("data-document-hidden", "");
  } else {
    document.documentElement.removeAttribute("data-document-hidden");
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
