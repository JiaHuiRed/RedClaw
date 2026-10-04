#!/usr/bin/env node
// 设计 token 门禁（借鉴 eigent check:design-token-usage 的轻量版）：
// 组件里禁止裸色值（hex / rgb()/rgba()），UI 颜色一律走 var(--*) 语义变量，
// 保证主题切换与 OKLCH 色阶一致性。
//
// 例外必须在本文件 ALLOWED 里登记值 + 理由；未登记的裸值直接报错退出。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCAN_ROOT = fileURLToPath(new URL("../src/components", import.meta.url));

// 文件名 → { reason, values }：裸值白名单，新增例外先在这里登记
const ALLOWED = {
  "MessageParts.tsx": {
    reason: "代码块固定暗色板：两种主题下代码块恒为深色，不随语义 token 切换",
    values: ["#1e1e1e", "#2d2d2d", "#333", "#999", "#d4d4d4"],
  },
  "ChatPanel.tsx": {
    reason: "canvas fillStyle 背景填充，非 UI 颜色",
    values: ["#fff"],
  },
  "TrafficLights.tsx": {
    reason: "macOS 交通灯固定原生色：红黄绿三点是苹果系统控件配色，不随主题切换",
    values: ["#ff5f57", "#febc2e", "#28c840"],
  },
};

// 阴影墨色统一放行：boxShadow 的 rgba(0,0,0,α) 是主题无关的投影，不参与主题切换
const SHADOW_INK = "rgba(0,0,0,";

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /\brgba?\(/g;

function listTsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const violations = [];

for (const file of listTsxFiles(SCAN_ROOT)) {
  const name = file.split(/[\\/]/).pop();
  const allowed = new Set((ALLOWED[name]?.values ?? []).map((v) => v.toLowerCase()));
  const source = readFileSync(file, "utf-8");
  const lines = source.split("\n");

  lines.forEach((line, idx) => {
    for (const match of line.matchAll(HEX_RE)) {
      if (allowed.has(match[0].toLowerCase())) continue;
      violations.push(`${name}:${idx + 1} 裸色值 ${match[0]}`);
    }
    for (const match of line.matchAll(RGB_RE)) {
      const rest = line.slice(match.index);
      if (rest.startsWith(SHADOW_INK)) continue;
      violations.push(`${name}:${idx + 1} 裸 rgb()/rgba() 表达式`);
    }
  });
}

if (violations.length > 0) {
  console.error("[check:tokens] 组件里发现裸色值，UI 颜色请改用 var(--*) 语义变量：\n");
  for (const v of violations) console.error("  " + v);
  console.error(
    "\n确属无法语义化的例外（如固定暗色代码块），请在 scripts/check-design-tokens.mjs 的 ALLOWED 登记值与理由。",
  );
  process.exit(1);
}

console.log("[check:tokens] 组件色值检查通过（语义 token 一致性 OK）");
