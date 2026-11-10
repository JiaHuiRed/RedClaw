import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

function writeStdoutLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

type ParsedArgs = {
  maxLines: number;
  /** 只统计该路径前缀下的文件（子包接自己的门禁用） */
  root?: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  let maxLines = 500;
  let root: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index + 0];
    if (arg === "--max") {
      const next = argv[index + 1];
      if (!next || Number.isNaN(Number(next))) {
        throw new Error("Missing/invalid --max value");
      }
      maxLines = Number(next);
      index++;
      continue;
    }
    if (arg === "--root") {
      const next = argv[index + 1];
      if (!next) throw new Error("Missing --root value");
      root = next.replace(/\\/g, "/").replace(/\/$/, "");
      index++;
      continue;
    }
  }

  return { maxLines, root };
}

function gitLsFilesAll(): string[] {
  // Include untracked files too so local refactors don’t “pass” by accident.
  const stdout = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function countLines(filePath: string): Promise<number> {
  const content = await readFile(filePath, "utf8");
  // Count physical lines. Keeps the rule simple + predictable.
  return content.split("\n").length;
}

async function main() {
  // Makes `... | head` safe.
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });

  const { maxLines, root } = parseArgs(process.argv.slice(2));
  const files = gitLsFilesAll()
    .filter((filePath) => existsSync(filePath))
    .filter((filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"))
    .filter((filePath) => (root ? filePath.replace(/\\/g, "/").startsWith(`${root}/`) : true));

  // 分批并发：全仓 ~10k 文件一次性 Promise.all 会在 Windows 上撞 EMFILE
  const BATCH = 256;
  const results: Array<{ filePath: string; lines: number }> = [];
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    results.push(
      ...(await Promise.all(
        batch.map(async (filePath) => ({ filePath, lines: await countLines(filePath) })),
      )),
    );
  }

  const offenders = results
    .filter((result) => result.lines > maxLines)
    .toSorted((a, b) => b.lines - a.lines);

  if (!offenders.length) {
    return;
  }

  // Minimal, grep-friendly output.
  for (const offender of offenders) {
    writeStdoutLine(`${offender.lines}\t${offender.filePath}`);
  }

  process.exitCode = 1;
}

await main();
