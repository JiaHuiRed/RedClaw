import { spawnSync } from "node:child_process";
import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";

const WINDOWS_CODEPAGE_ENCODING_MAP: Record<number, string> = {
  65001: "utf-8",
  54936: "gb18030",
  936: "gbk",
  950: "big5",
  932: "shift_jis",
  949: "euc-kr",
  1252: "windows-1252",
};

let cachedWindowsConsoleEncoding: string | null | undefined;

export function parseWindowsCodePage(raw: string): number | null {
  if (!raw) {
    return null;
  }
  const match = raw.match(/\b(\d{3,5})\b/);
  if (!match?.[1]) {
    return null;
  }
  const codePage = Number.parseInt(match[1], 10);
  if (!Number.isFinite(codePage) || codePage <= 0) {
    return null;
  }
  return codePage;
}

export function resolveWindowsConsoleEncoding(): string | null {
  if (process.platform !== "win32") {
    return null;
  }
  if (cachedWindowsConsoleEncoding !== undefined) {
    return cachedWindowsConsoleEncoding;
  }
  try {
    const result = spawnSync("cmd.exe", ["/d", "/s", "/c", "chcp"], {
      windowsHide: true,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const raw = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const codePage = parseWindowsCodePage(raw);
    cachedWindowsConsoleEncoding =
      codePage !== null ? (WINDOWS_CODEPAGE_ENCODING_MAP[codePage] ?? null) : null;
  } catch {
    cachedWindowsConsoleEncoding = null;
  }
  return cachedWindowsConsoleEncoding;
}

export function decodeWindowsOutputBuffer(params: {
  buffer: Buffer;
  platform?: NodeJS.Platform;
  windowsEncoding?: string | null;
}): string {
  const platform = params.platform ?? process.platform;
  if (platform !== "win32") {
    return params.buffer.toString("utf8");
  }

  const utf8 = decodeStrictUtf8(params.buffer);
  if (utf8 !== null) {
    return utf8;
  }

  const encoding = params.windowsEncoding ?? resolveWindowsConsoleEncoding();
  if (!encoding || normalizeLowercaseStringOrEmpty(encoding) === "utf-8") {
    return params.buffer.toString("utf8");
  }
  try {
    return new TextDecoder(encoding).decode(params.buffer);
  } catch {
    return params.buffer.toString("utf8");
  }
}

export function createWindowsOutputDecoder(params?: {
  platform?: NodeJS.Platform;
  windowsEncoding?: string | null;
}): {
  decode(chunk: Buffer | string): string;
  flush(): string;
} {
  const platform = params?.platform ?? process.platform;
  const encoding =
    platform === "win32" ? (params?.windowsEncoding ?? resolveWindowsConsoleEncoding()) : null;
  const normalizedEncoding = normalizeLowercaseStringOrEmpty(encoding);
  const legacyDecoder =
    platform === "win32" && encoding && normalizedEncoding !== "utf-8"
      ? new TextDecoder(encoding)
      : null;
  const utf8Decoder =
    platform === "win32" && legacyDecoder ? new TextDecoder("utf-8", { fatal: true }) : null;
  let useLegacyDecoder = false;
  let utf16leDecoder: TextDecoder | null = null;
  let pendingUtf8Bytes = Buffer.alloc(0);

  return {
    decode(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!legacyDecoder || !utf8Decoder) {
        return buffer.toString("utf8");
      }
      if (utf16leDecoder) {
        // The WSL startup banner is UTF-16LE, but the shell that continues
        // the stream (bash error messages, later stdout) is usually UTF-8.
        // Once the banner activates the UTF-16LE path, an ASCII/UTF-8 chunk
        // would decode as mojibake (every byte pair becomes one CJK code
        // point, e.g. "bash: line..." -> "慢獲›汬敮"). Detect the switch: a
        // chunk whose high bytes carry no nulls and that is valid strict
        // UTF-8 is no longer UTF-16LE text. Flush the UTF-16LE tail, drop
        // the decoder, and let the regular UTF-8/legacy path handle it.
        if (looksLikeUtf8AfterUtf16Le(buffer)) {
          const tail = utf16leDecoder.decode();
          utf16leDecoder = null;
          return tail + decodeFollowingChunk(buffer);
        }
        return utf16leDecoder.decode(buffer, { stream: true });
      }
      // wsl.exe and some Windows console programs emit UTF-16LE text without
      // a BOM (e.g. the WSL startup banner). UTF-16LE bytes almost always
      // fail strict UTF-8 once a multibyte high byte appears, which would
      // permanently flip us to the legacy codepage and garble the whole
      // stream. Detect the ASCII/null-byte alternating pattern first.
      if (!useLegacyDecoder && looksLikeUtf16LeText(buffer)) {
        utf16leDecoder = new TextDecoder("utf-16le");
        pendingUtf8Bytes = Buffer.alloc(0);
        return utf16leDecoder.decode(buffer, { stream: true });
      }
      return decodeFollowingChunk(buffer);
    },
    flush() {
      if (!legacyDecoder || !utf8Decoder) {
        return "";
      }
      if (utf16leDecoder) {
        return utf16leDecoder.decode();
      }
      return decodeFollowingChunk(undefined);
    },
  };

  function decodeFollowingChunk(chunk?: Buffer) {
    if (!chunk || chunk.length === 0) {
      if (useLegacyDecoder) {
        return legacyDecoder!.decode();
      }
      try {
        const decoded = utf8Decoder!.decode();
        pendingUtf8Bytes = Buffer.alloc(0);
        return decoded;
      } catch {
        useLegacyDecoder = true;
        const replayBuffer = pendingUtf8Bytes;
        pendingUtf8Bytes = Buffer.alloc(0);
        return replayBuffer.length > 0 ? legacyDecoder!.decode(replayBuffer) : "";
      }
    }
    if (useLegacyDecoder) {
      return legacyDecoder!.decode(chunk, { stream: true });
    }
    const replayBuffer =
      pendingUtf8Bytes.length > 0 ? Buffer.concat([pendingUtf8Bytes, chunk]) : chunk;
    try {
      const decoded = utf8Decoder!.decode(chunk, { stream: true });
      pendingUtf8Bytes = Buffer.from(getTrailingIncompleteUtf8Bytes(replayBuffer));
      return decoded;
    } catch {
      useLegacyDecoder = true;
      pendingUtf8Bytes = Buffer.alloc(0);
      return legacyDecoder!.decode(replayBuffer, { stream: true });
    }
  }
}

function looksLikeUtf8AfterUtf16Le(buffer: Buffer): boolean {
  if (buffer.length < 8) {
    return false;
  }
  const pairs = Math.floor(buffer.length / 2);
  let oddZero = 0;
  for (let i = 0; i < pairs; i += 1) {
    if (buffer[i * 2 + 1] === 0) {
      oddZero += 1;
    }
  }
  // UTF-16LE ASCII keeps 0x00 in every odd byte; UTF-16LE CJK keeps
  // non-ASCII high bytes there. A chunk with almost no null high bytes
  // that is also valid strict UTF-8 must be a UTF-8/ASCII continuation of
  // the stream, not more UTF-16LE.
  if (oddZero / pairs >= 0.1) {
    return false;
  }
  return decodeStrictUtf8(buffer) !== null;
}

function getTrailingIncompleteUtf8Bytes(buffer: Buffer): Buffer {
  let index = buffer.length - 1;
  let continuationBytes = 0;
  while (
    index >= 0 &&
    buffer[index] !== undefined &&
    buffer[index] >= 0x80 &&
    buffer[index] <= 0xbf &&
    continuationBytes < 3
  ) {
    continuationBytes += 1;
    index -= 1;
  }
  if (index < 0) {
    return buffer;
  }

  const leadByte = buffer[index];
  const sequenceLength = getUtf8SequenceLength(leadByte);
  if (sequenceLength <= 1) {
    return Buffer.alloc(0);
  }

  const availableBytes = continuationBytes + 1;
  return availableBytes < sequenceLength ? buffer.subarray(index) : Buffer.alloc(0);
}

function looksLikeUtf16LeText(buffer: Buffer): boolean {
  if (buffer.length < 8) {
    return false;
  }
  const pairs = Math.floor(buffer.length / 2);
  let evenNonZero = 0;
  let oddZero = 0;
  for (let i = 0; i < pairs; i += 1) {
    if (buffer[i * 2] !== 0) {
      evenNonZero += 1;
    }
    if (buffer[i * 2 + 1] === 0) {
      oddZero += 1;
    }
  }
  // ASCII-heavy UTF-16LE text: every ASCII code unit is followed by a 0x00
  // and its low byte is non-zero. Binary data has runs of 0x00 on both
  // parities, so the even-non-zero check keeps it from matching. GBK and
  // UTF-8 text have non-zero high/odd bytes and also stay out.
  return evenNonZero / pairs >= 0.6 && oddZero / pairs >= 0.35;
}

function getUtf8SequenceLength(byte: number): number {
  if (byte >= 0xc2 && byte <= 0xdf) {
    return 2;
  }
  if (byte >= 0xe0 && byte <= 0xef) {
    return 3;
  }
  if (byte >= 0xf0 && byte <= 0xf4) {
    return 4;
  }
  return 1;
}

function decodeStrictUtf8(buffer: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}
