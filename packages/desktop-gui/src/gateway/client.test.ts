import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayClient, deriveSessionTitle, type Message } from "./client";

// GatewayClient 的防护逻辑（水位线/去重/退避/握手）都是 private：测试经由
// 类型收窄的 internal 视图驱动 _handleFrame/_notifyMessage 等入口，行为面
// 与运行时一致。抽纯函数前这是这些守护逻辑唯一的回归安全网。
interface Internal {
  _handleFrame: (frame: unknown) => void;
  _notifyMessage: (msg: Message) => void;
  _scheduleReconnect: () => void;
  _abortHandshake: (err: Error) => void;
  _deltaSeqs: Map<string, number>;
  _seenMessageIds: Set<string>;
  reconnectDelay: number;
  running: boolean;
  ws: {
    close: ReturnType<typeof vi.fn>;
    onclose: null;
    onerror: null;
    readyState: number;
  } | null;
}

const internal = (c: GatewayClient): Internal => c as unknown as Internal;

function chatFrame(payload: Record<string, unknown>): Record<string, unknown> {
  return { type: "event", event: "chat", payload };
}

interface DeltaRecord {
  text: string;
  reasoning: string;
  replace?: boolean;
}

describe("deriveSessionTitle", () => {
  it("空消息返回 null", () => {
    expect(deriveSessionTitle([])).toBeNull();
  });

  it("取首条用户消息，跳过 assistant 与命令", () => {
    const msgs: Message[] = [
      { id: "1", role: "assistant", content: "回复", timestamp: 0 },
      { id: "2", role: "user", content: "/help", timestamp: 0 },
      { id: "3", role: "user", content: "  帮我清理电脑垃圾  ", timestamp: 0 },
    ];
    expect(deriveSessionTitle(msgs)).toBe("帮我清理电脑垃圾");
  });

  it("超 24 字截断加省略号", () => {
    const msgs: Message[] = [{ id: "1", role: "user", content: "长".repeat(30), timestamp: 0 }];
    expect(deriveSessionTitle(msgs)).toBe("长".repeat(24) + "…");
  });

  it("纯空白/纯命令返回 null", () => {
    expect(deriveSessionTitle([{ id: "1", role: "user", content: "  ", timestamp: 0 }])).toBeNull();
    expect(
      deriveSessionTitle([{ id: "1", role: "user", content: "/cmd", timestamp: 0 }]),
    ).toBeNull();
  });
});

describe("delta seq 水位线（per-session，run 终态清除）", () => {
  it("迟到/重放帧被丢弃，无 seq 帧透传", () => {
    const c = new GatewayClient();
    const deltas: DeltaRecord[] = [];
    c.onDelta((text, reasoning, replace) => deltas.push({ text, reasoning, replace }));
    const i = internal(c);
    i._handleFrame(chatFrame({ state: "delta", seq: 2, deltaText: "a" }));
    i._handleFrame(chatFrame({ state: "delta", seq: 2, deltaText: "a" })); // 重放
    i._handleFrame(chatFrame({ state: "delta", seq: 1, deltaText: "b" })); // 迟到
    i._handleFrame(chatFrame({ state: "delta", deltaText: "no-seq" }));
    i._handleFrame(chatFrame({ state: "delta", seq: 3, deltaText: "c" }));
    expect(deltas.map((d) => d.text)).toEqual(["a", "no-seq", "c"]);
  });

  it("跨会话事件不串台且不写水位线", () => {
    const c = new GatewayClient();
    const deltas: DeltaRecord[] = [];
    c.onDelta((text) => deltas.push({ text, reasoning: "" }));
    const i = internal(c);
    i._handleFrame(chatFrame({ state: "delta", sessionKey: "agent:other:main", deltaText: "x" }));
    expect(deltas).toHaveLength(0);
    expect(i._deltaSeqs.size).toBe(0);
  });

  it("final 清除水位线：新 run 的低 seq 不被误杀", async () => {
    const c = new GatewayClient();
    const deltas: DeltaRecord[] = [];
    c.onDelta((text) => deltas.push({ text, reasoning: "" }));
    const msgs: Message[] = [];
    c.onMessage((m) => msgs.push(m));
    const i = internal(c);
    i._handleFrame(chatFrame({ state: "delta", seq: 5, deltaText: "x" }));
    i._handleFrame(chatFrame({ state: "final", message: { id: "m1", text: "done" } }));
    // final 投递走异步媒体解析（无候选也至少一个 microtask）
    await vi.waitFor(() => expect(msgs).toHaveLength(1));
    expect(i._deltaSeqs.size).toBe(0);
    i._handleFrame(chatFrame({ state: "delta", seq: 1, deltaText: "new-run" }));
    expect(deltas.map((d) => d.text)).toEqual(["x", "new-run"]);
  });

  it("replace=true 修复帧透传给 UI", () => {
    const c = new GatewayClient();
    const deltas: DeltaRecord[] = [];
    c.onDelta((text, reasoning, replace) => deltas.push({ text, reasoning, replace }));
    const i = internal(c);
    i._handleFrame(chatFrame({ state: "delta", deltaText: "全文", replace: true }));
    expect(deltas).toEqual([{ text: "全文", reasoning: "", replace: true }]);
  });

  it("aborted：部分文本作为消息入列且同 id 去重", () => {
    const c = new GatewayClient();
    const msgs: Message[] = [];
    c.onMessage((m) => msgs.push(m));
    const i = internal(c);
    const frame = chatFrame({ state: "aborted", message: { id: "m1", text: "partial" } });
    i._handleFrame(frame);
    i._handleFrame(frame);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ id: "m1", role: "assistant", content: "partial" });
  });
});

describe("消息 id 去重 FIFO", () => {
  it("同 id 只投递一次；超 200 条后先入队的可重新投递", () => {
    const c = new GatewayClient();
    const ids: string[] = [];
    c.onMessage((m) => ids.push(m.id));
    const i = internal(c);
    for (let n = 1; n <= 250; n++) {
      i._notifyMessage({ id: `m${n}`, role: "assistant", content: "", timestamp: 0 });
    }
    expect(ids).toHaveLength(250);
    // m250 仍在去重窗口内：重放被拦截
    i._notifyMessage({ id: "m250", role: "assistant", content: "", timestamp: 0 });
    expect(ids).toHaveLength(250);
    // m1..m100 已被 FIFO 驱逐：重放会再投递（不会永久占用）
    i._notifyMessage({ id: "m1", role: "assistant", content: "", timestamp: 0 });
    expect(ids).toHaveLength(251);
  });
});

describe("重连退避与握手幂等", () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("指数翻倍且封顶 30s", () => {
    vi.useFakeTimers();
    const c = new GatewayClient();
    const i = internal(c);
    i.running = true;
    // 观察调度参数而不是触发回调：触发会走真 _connect/new WebSocket
    const st = vi.spyOn(globalThis, "setTimeout");
    for (const scheduledDelay of [2000, 4000, 8000, 16000, 30000, 30000]) {
      i._scheduleReconnect();
      expect(st).toHaveBeenLastCalledWith(expect.any(Function), scheduledDelay);
      expect(i.reconnectDelay).toBe(Math.min(scheduledDelay * 2, 30_000));
    }
  });

  it("_abortHandshake 幂等：challenge 超时与 catch 先后到达只调度一次退避", () => {
    vi.useFakeTimers();
    const c = new GatewayClient();
    const i = internal(c);
    i.running = true;
    const ws = { close: vi.fn(), onclose: null, onerror: null, readyState: 1 };
    i.ws = ws;
    const err = new Error("Gateway handshake timed out");
    const st = vi.spyOn(globalThis, "setTimeout");
    i._abortHandshake(err);
    i._abortHandshake(err);
    // 只有第一次调用真正关闭了 ws 并调度退避；第二次时 ws 已 null，重复调度
    // 只会让退避多翻一档（commit f5541b2bb31 修的双调度 bug 的回归防护）
    expect(ws.close).toHaveBeenCalledTimes(1);
    expect(st).toHaveBeenCalledTimes(1);
    expect(st).toHaveBeenLastCalledWith(expect.any(Function), 2000);
    expect(i.reconnectDelay).toBe(4000);
  });
});
