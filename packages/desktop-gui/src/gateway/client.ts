const SESSION_KEY = "agent:main:main";
const RECONNECT_DELAY = 2000;
const DEFAULT_URL = "ws://127.0.0.1:18789";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  reasoning?: string;
}

export interface SessionInfo {
  model: string | null;
  configuredModel: string | null;
  contextTokens: number | null;
  totalTokens: number | null;
  remainingTokens: number | null;
  percentUsed: number | null;
}

export interface CommandEntry {
  name: string;
  textAliases?: string[];
  description: string;
  category?: string;
  acceptsArgs: boolean;
}

export interface ChatSession {
  sessionKey: string;
  sessionId?: string;
  model?: string;
  configuredModel?: string;
  title?: string;
  updatedAt?: number;
  messageCount?: number;
}

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  contextTokens?: number;
}

type Listener = (msg: Message) => void;
type DeltaListener = (text: string, reasoning: string) => void;
type StatusListener = (connected: boolean) => void;
type SessionInfoListener = (info: SessionInfo) => void;
type SessionListListener = (sessions: ChatSession[]) => void;
type CommandsListener = (cmds: CommandEntry[]) => void;

class GatewayClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private running = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReqs: Record<string, { resolve: (v: any) => void; reject: (e: Error) => void }> =
    {};
  private url = DEFAULT_URL;
  private token = "";

  private _sessionInfo: SessionInfo = {
    model: null,
    configuredModel: null,
    contextTokens: null,
    totalTokens: null,
    remainingTokens: null,
    percentUsed: null,
  };
  private _sessions: ChatSession[] = [];
  private _commands: CommandEntry[] = [];
  private _models: ModelEntry[] = [];

  private messageListeners: Listener[] = [];
  private deltaListeners: DeltaListener[] = [];
  private statusListeners: StatusListener[] = [];
  private sessionInfoListeners: SessionInfoListener[] = [];
  private sessionListListeners: SessionListListener[] = [];
  private commandsListeners: CommandsListener[] = [];

  get sessionInfo() {
    return this._sessionInfo;
  }
  get sessions() {
    return this._sessions;
  }
  get commands() {
    return this._commands;
  }
  get models() {
    return this._models;
  }

  configure(url?: string, token?: string) {
    if (url) this.url = url;
    if (token !== undefined) this.token = token;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._connect();
  }

  stop() {
    this.running = false;
    this._connecting = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this._notifyStatus();
  }

  get isConnected() {
    return this.connected;
  }

  onMessage(fn: Listener) {
    this.messageListeners.push(fn);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== fn);
    };
  }

  onDelta(fn: DeltaListener) {
    this.deltaListeners.push(fn);
    return () => {
      this.deltaListeners = this.deltaListeners.filter((l) => l !== fn);
    };
  }

  onStatus(fn: StatusListener) {
    this.statusListeners.push(fn);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== fn);
    };
  }

  onSessionInfo(fn: SessionInfoListener) {
    this.sessionInfoListeners.push(fn);
    return () => {
      this.sessionInfoListeners = this.sessionInfoListeners.filter((l) => l !== fn);
    };
  }

  onSessionList(fn: SessionListListener) {
    this.sessionListListeners.push(fn);
    return () => {
      this.sessionListListeners = this.sessionListListeners.filter((l) => l !== fn);
    };
  }

  onCommands(fn: CommandsListener) {
    this.commandsListeners.push(fn);
    return () => {
      this.commandsListeners = this.commandsListeners.filter((l) => l !== fn);
    };
  }

  async sendMessage(text: string) {
    if (!this.connected) throw new Error("Gateway not connected");
    const idempotencyKey = crypto.randomUUID();
    await this._request("chat.send", {
      sessionKey: SESSION_KEY,
      message: text,
      deliver: false,
      idempotencyKey,
    });
  }

  async fetchSessionInfo() {
    try {
      const res = await this._request("status", { includeChannelSummary: false });
      if (res.ok && res.payload?.sessions?.recent?.length > 0) {
        const s = res.payload.sessions.recent[0];
        this._sessionInfo = {
          model: s.model ?? null,
          configuredModel: s.configuredModel ?? null,
          contextTokens: s.contextTokens ?? null,
          totalTokens: s.totalTokens ?? null,
          remainingTokens: s.remainingTokens ?? null,
          percentUsed: s.percentUsed ?? null,
        };
        this._notifySessionInfo();

        // parse session list
        this._sessions = res.payload.sessions.recent.map((s: any) => ({
          sessionKey: s.sessionKey ?? SESSION_KEY,
          sessionId: s.sessionId,
          model: s.model,
          configuredModel: s.configuredModel,
          title: s.title,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
        }));
        this._notifySessionList();
      }
    } catch (err) {
      console.error("[Gateway] fetchSessionInfo failed:", err);
    }
  }

  async fetchCommands() {
    try {
      const res = await this._request("commands.list", { scope: "text", includeArgs: false });
      if (res.ok && res.payload?.commands) {
        this._commands = res.payload.commands;
        this._notifyCommands();
      }
    } catch (err) {
      console.error("[Gateway] fetchCommands failed:", err);
    }
  }

  async fetchHistory(sessionKey: string, limit = 200): Promise<Message[]> {
    try {
      const res = await this._request("chat.history", { sessionKey, limit });
      if (res.ok && res.payload?.messages) {
        return res.payload.messages.map((m: any) => ({
          id: m.id ?? crypto.randomUUID(),
          role: m.role ?? "assistant",
          content:
            typeof m.content === "string"
              ? m.content
              : (m.content?.map((c: any) => c.text).join("") ?? ""),
          timestamp: m.timestamp ?? Date.now(),
          reasoning: m.reasoning ?? "",
        }));
      }
    } catch (err) {
      console.error("[Gateway] fetchHistory failed:", err);
    }
    return [];
  }

  private _connect() {
    if (!this.running || this.ws) return;
    this._connecting = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      // Gateway sends connect.challenge first, we reply with connect
    };

    this.ws.onmessage = (event) => {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      this._handleFrame(frame);
    };

    this.ws.onerror = () => {
      this.connected = false;
      this._notifyStatus();
    };

    this.ws.onclose = () => {
      this.ws = null;
      this._connecting = false;
      this.connected = false;
      this._notifyStatus();
      if (this.running) {
        this.reconnectTimer = setTimeout(() => this._connect(), RECONNECT_DELAY);
      }
    };
  }

  private _connecting = false;

  private async _sendConnect() {
    try {
      const res = await this._request("connect", {
        minProtocol: 4,
        maxProtocol: 4,
        client: {
          id: "openclaw-tui",
          version: "0.1.0",
          platform: "windows",
          mode: "ui",
        },
        role: "operator",
        scopes: ["operator.read", "operator.write"],
        auth: this.token ? { token: this.token } : undefined,
        locale: "zh-CN",
      });
      if (res.ok) {
        this.connected = true;
        this._connecting = false;
        this._notifyStatus();
        // fetch session info and commands after connect
        this.fetchSessionInfo();
        this.fetchCommands();
      } else {
        this._connecting = false;
      }
    } catch (err) {
      console.error("[Gateway] connect failed:", err);
      this._connecting = false;
    }
  }

  private _handleFrame(frame: any) {
    if (frame.type === "event") {
      if (frame.event === "connect.challenge") {
        if (!this._connecting) {
          this._connecting = true;
          this._sendConnect();
        }
        return;
      }
      if (frame.event === "chat") {
        this._handleChatEvent(frame.payload);
        return;
      }
      return;
    }
    if (frame.type === "res") {
      const pending = this.pendingReqs[frame.id];
      if (pending) {
        delete this.pendingReqs[frame.id];
        if (frame.ok) {
          pending.resolve(frame);
        } else {
          pending.reject(new Error(frame.error?.message || "Gateway error"));
        }
      }
    }
  }

  private _handleChatEvent(payload: any) {
    if (!payload) return;
    const { state, sessionKey, message, deltaText, errorMessage } = payload;
    if (sessionKey && sessionKey !== SESSION_KEY) return;

    switch (state) {
      case "delta":
        this._notifyDelta(deltaText || "", message?.reasoning || "");
        break;
      case "final":
        this._notifyMessage({
          id: message?.id || crypto.randomUUID(),
          role: "assistant",
          content:
            message?.text ||
            message?.content
              ?.filter((c: any) => c.type === "text")
              ?.map((c: any) => c.text)
              ?.join("") ||
            "",
          timestamp: Date.now(),
          reasoning: message?.reasoning || "",
        });
        // refresh session info after each completed response
        this.fetchSessionInfo();
        break;
      case "aborted":
        this._notifyDelta("", "");
        break;
      case "error":
        console.error("[Gateway] chat error:", errorMessage);
        break;
    }
  }

  private _notifyMessage(msg: Message) {
    this.messageListeners.forEach((fn) => fn(msg));
  }

  private _notifyDelta(text: string, reasoning: string) {
    this.deltaListeners.forEach((fn) => fn(text, reasoning));
  }

  private _notifyStatus() {
    this.statusListeners.forEach((fn) => fn(this.connected));
  }

  private _notifySessionInfo() {
    this.sessionInfoListeners.forEach((fn) => fn(this._sessionInfo));
  }

  private _notifySessionList() {
    this.sessionListListeners.forEach((fn) => fn(this._sessions));
  }

  private _notifyCommands() {
    this.commandsListeners.forEach((fn) => fn(this._commands));
  }

  private _request(method: string, params: any) {
    return new Promise<any>((resolve, reject) => {
      const id = crypto.randomUUID();
      this.pendingReqs[id] = { resolve, reject };
      const frame = JSON.stringify({ type: "req", id, method, params });
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(frame);
      } else {
        reject(new Error("WebSocket not connected"));
        delete this.pendingReqs[id];
      }
    });
  }
}

export const gateway = new GatewayClient();
