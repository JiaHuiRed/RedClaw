# 安全策略

RedClaw 是**本地优先、单用户**的个人部署：Gateway 与桌面客户端都跑在你自己的机器上，
不是对抗性多租户边界——它信任本机操作者，不设计为多个敌对用户共享一个 gateway 时的
相互隔离层。多数「安全问题」在这个模型下其实是部署选择（比如把 gateway 暴露公网）。

## 怎么报告

- **RedClaw 自有问题**（desktop-gui、fork 补丁、文档）：在
  [RedClaw 仓库](https://github.com/JiaHuiRed/RedClaw) 提 issue，或私下联系仓库所有者
  [@JiaHuiRed](https://github.com/JiaHuiRed)。若涉及未修复的漏洞，请勿在公开 issue 里
  贴完整利用路径与 PoC。
- **上游问题**（gateway 核心、插件体系、协议——能复现到上游代码的）：
  走上游流程 <https://github.com/openclaw/openclaw>（其 SECURITY.md / 私密 GHSA），
  不要在这里绕过上游的披露流程。

高价值的报告 = 当前可复现 + 实际影响 + 建议修复。仅提示注入的链、扫描器裸输出、
依赖「敌对用户共享同一受信 gateway」的假设，在本信任模型下通常不算安全漏洞。

## 信任模型要点

- **密钥边界**：通道/供应商凭据在 `~/.openclaw/credentials/`，模型鉴权在
  `agents/<agentId>/agent/auth-profiles.json`——永不入库、永不外发。
- **执行审批**：exec 类工具默认 fail-closed（deny / allowlist / full 三档策略 +
  二次确认），桌面端审批走应用内确认条而非原生 `confirm`。
- **连接面**：Tauri WebView origin 白名单（`gateway.controlUi.allowedOrigins`）；
  token 不进 URL fragment。
- **升级**：fork 自主演进，无自动更新通道；升级前看 `CHANGELOG.md`。

## 已知取舍

- gateway 假设**本机/受信局域网**操作者；不要把它当成面向公网的多租户服务。
- 插件可执行任意本机能力——只装你审过或上游官方维护的插件。
