# 参与开发（CONTRIBUTING）

RedClaw 是 OpenClaw 的**独立个人 fork**（维护者：[@JiaHuiRed](https://github.com/JiaHuiRed)），
没有上游那套 PR 标签 / CODEOWNERS / 发布流程。这里只讲怎么把活干对。

> 上游问题请找上游：<https://github.com/openclaw/openclaw>（issues / 安全报告都走那边）。
> `docs/` 目录是上游文档站源码，作为参考保留，不随 fork 演进更新。

## 开发流程

```bash
pnpm install
pnpm build        # 编译 CLI + 桌面前端（根目录）
```

**桌面 GUI 验证四板斧**（在 `packages/desktop-gui/` 里跑）：

```
pnpm check        # typecheck + design tokens + 行数门禁(≤800) + 单测(26 例)
pnpm build        # tsc + vite build
```

- **别在仓库根目录跑 `pnpm test`**——那是上游整仓测试套件，几十分钟跑不完。
- 改 gateway（`src/`）行为后，需要根目录 `pnpm build` 重编 dist 并重启 gateway 才能联调。
- 格式化用 oxfmt（仓库自带包装脚本），不用 Prettier。
- TypeScript 导航优先用 typegraph MCP 的 `ts_*` 工具（见 `CLAUDE.md`）。

## 约定

- **提交**：简洁、按逻辑分组；fork 自有工作用 `[Qiu]` 前缀。
- **变更日志**：每个面向用户的改动都要在 `CHANGELOG.md` 记一条（中文），
  README 不维护版本号列表——版本史只活在这里。
- **文档**：README 只讲「是什么 / 有什么特色 / 怎么用 / 致谢」；深一点的
  架构约束在各子树的 `AGENTS.md` 与 `packages/desktop-gui/src/components/README.md`。
- **根 `AGENTS.md`** 是硬规则入口（子树各有 scoped 版本）。
- **隐私**：不提交真实密钥、会话数据、个人信息；密钥只在 `~/.openclaw/` 本地配置里。

## 安全

见 [SECURITY.md](SECURITY.md)。
