import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expectNoReaddirSyncDuring } from "../../test-utils/fs-scan-assertions.js";
import { listGitTrackedFiles } from "../../test-utils/repo-files.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const lowLevelHistoryHelpers = [
  "buildInboundHistoryFromMap",
  "buildHistoryContextFromMap",
  "buildPendingHistoryContextFromMap",
  "clearHistoryEntries",
  "clearHistoryEntriesIfEnabled",
  "recordPendingHistoryEntry",
  "recordPendingHistoryEntryIfEnabled",
  "recordPendingHistoryEntryWithMedia",
];

const legacyReplyHistoryCompatibilityFiles = new Set([
  "extensions/mattermost/runtime-api.ts",
  "extensions/mattermost/src/mattermost/runtime-api.ts",
  "extensions/mattermost/src/runtime-api.ts",
]);

const skippedExtensionScanDirs = new Set([
  ".cache",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
]);

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split("/")), "utf8");
}

function isScannableTsFile(relativePath: string): boolean {
  const parts = relativePath.split("/");
  return (
    !parts.some((part) => skippedExtensionScanDirs.has(part)) &&
    relativePath.endsWith(".ts") &&
    !relativePath.endsWith(".d.ts")
  );
}

function listGitTsFiles(relativeDir: string): string[] | null {
  return (
    listGitTrackedFiles({ repoRoot, pathspecs: relativeDir })?.filter(isScannableTsFile) ?? null
  );
}

function listTsFiles(relativeDir: string): string[] {
  const gitFiles = listGitTsFiles(relativeDir);
  if (gitFiles) {
    return gitFiles;
  }

  const dir = path.join(repoRoot, ...relativeDir.split("/"));
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (skippedExtensionScanDirs.has(entry.name)) {
        return [];
      }
      return listTsFiles(relativePath);
    }
    if (!entry.isFile() || !isScannableTsFile(relativePath)) {
      return [];
    }
    return [relativePath];
  });
}

function collectReplyHistoryBindings(source: string): Set<string> {
  const bindings = new Set<string>();
  const importOrExportPattern =
    /\b(?:import|export)\s*\{([\s\S]*?)\}\s*from\s*["']openclaw\/plugin-sdk\/reply-history["']/g;
  for (const match of source.matchAll(importOrExportPattern)) {
    const block = match[1] ?? "";
    for (const nameMatch of block.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
      bindings.add(nameMatch[0]);
    }
  }
  return bindings;
}

describe("message turn migration guardrails", () => {
  it("lists plugin TypeScript files from git without walking extension roots", () => {
    expectNoReaddirSyncDuring(() => {
      const files = listTsFiles("extensions");

      expect(files.length).toBeGreaterThan(0);
      expect(files.every((file) => file.startsWith("extensions/"))).toBe(true);
      expect(files.some((file) => file.endsWith(".d.ts"))).toBe(false);
    });
  });

  it("keeps plugin runtime files off deprecated reply-history map helpers", () => {
    for (const file of listTsFiles("extensions")) {
      if (file.includes(".test.") || file.endsWith(".test.ts")) {
        continue;
      }
      if (legacyReplyHistoryCompatibilityFiles.has(file)) {
        continue;
      }
      const source = readRepoFile(file);
      const replyHistoryBindings = collectReplyHistoryBindings(source);
      for (const helper of lowLevelHistoryHelpers) {
        expect(
          replyHistoryBindings.has(helper),
          `${file} should use createChannelHistoryWindow instead of ${helper}`,
        ).toBe(false);
      }
    }
  });
});
