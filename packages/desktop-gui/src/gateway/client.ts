const DEFAULT_SESSION_KEY = "agent:main:main";
const RECONNECT_DELAY = 2000;
const DEFAULT_URL = "ws://127.0.0.1:18789";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  reasoning?: string;
}

export interface ThinkingEvent {
  text: string;
  delta?: string;
  replace?: boolean;
}

export interface ToolCallEvent {
  phase?: string;
  name?: string;
  input?: unknown;
  result?: unknown;
  partialResult?: unknown;
  id?: string;
  [key: string]: unknown;
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
  alias?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export type TodoStatus = "open" | "in_progress" | "done" | "cancelled";
export type TodoPriority = "low" | "medium" | "high";

export interface Todo {
  id: string;
  title: string;
  notes?: string;
  status: TodoStatus;
  priority?: TodoPriority;
  dueAt?: number;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface TodoCreateInput {
  title: string;
  notes?: string;
  priority?: TodoPriority;
  dueAt?: number;
  tags?: string[];
}

export interface TodoUpdateInput {
  title?: string;
  notes?: string;
  status?: TodoStatus;
  priority?: TodoPriority;
  dueAt?: number | null;
  tags?: string[];
}

type Listener = (msg: Message) => void;
type DeltaListener = (text: string, reasoning: string) => void;
type StatusListener = (connected: boolean) => void;
type SessionInfoListener = (info: SessionInfo) => void;
type SessionListListener = (sessions: ChatSession[]) => void;
type CommandsListener = (cmds: CommandEntry[]) => void;
type ModelListListener = (models: ModelEntry[]) => void;
type ErrorListener = (message: string) => void;
type ThinkingListener = (thinking: ThinkingEvent) => void;
type ToolListener = (tool: ToolCallEvent) => void;
type StreamEndListener = () => void;

class GatewayClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private running = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReqs: Record<string, { resolve: (v: any) => void; reject: (e: Error) => void }> =
    {};
  private url = DEFAULT_URL;
  private token = "";
  private _activeSessionKey = DEFAULT_SESSION_KEY;

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
  private modelListListeners: ModelListListener[] = [];
  private errorListeners: ErrorListener[] = [];
  private streamEndListeners: StreamEndListener[] = [];
  private thinkingListeners: ThinkingListener[] = [];
  private toolListeners: ToolListener[] = [];

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

  get activeSessionKey() {
    return this._activeSessionKey;
  }

  setActiveSessionKey(key: string) {
    this._activeSessionKey = key;
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

  onModelList(fn: ModelListListener) {
    this.modelListListeners.push(fn);
    return () => {
      this.modelListListeners = this.modelListListeners.filter((l) => l !== fn);
    };
  }

  onError(fn: ErrorListener) {
    this.errorListeners.push(fn);
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== fn);
    };
  }

  onStreamEnd(fn: StreamEndListener) {
    this.streamEndListeners.push(fn);
    return () => {
      this.streamEndListeners = this.streamEndListeners.filter((l) => l !== fn);
    };
  }

  onThinking(fn: ThinkingListener) {
    this.thinkingListeners.push(fn);
    return () => {
      this.thinkingListeners = this.thinkingListeners.filter((l) => l !== fn);
    };
  }

  onTool(fn: ToolListener) {
    this.toolListeners.push(fn);
    return () => {
      this.toolListeners = this.toolListeners.filter((l) => l !== fn);
    };
  }

  async sendMessage(text: string, sessionKey?: string) {
    if (!this.connected) throw new Error("Gateway not connected");
    const key = sessionKey ?? this._activeSessionKey;
    const idempotencyKey = crypto.randomUUID();
    try {
      await this._request("chat.send", {
        sessionKey: key,
        message: text,
        deliver: false,
        idempotencyKey,
      });
    } catch (err) {
      console.error("[Gateway] sendMessage failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`发送失败：${message}`);
      throw err;
    }
  }

  async abortChat(sessionKey?: string) {
    const key = sessionKey ?? this._activeSessionKey;
    try {
      await this._request("chat.abort", { sessionKey: key });
    } catch (err) {
      console.error("[Gateway] abortChat failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`停止失败：${message}`);
      throw err;
    }
  }

  async ttsConvert(text: string, provider?: string) {
    if (!this.connected) throw new Error("Gateway not connected");
    try {
      const res = await this._request("tts.convert", {
        text,
        provider,
      });
      if (!res.payload?.audioPath) {
        throw new Error("TTS 无音频返回");
      }
      return res.payload.audioPath as string;
    } catch (err) {
      console.error("[Gateway] ttsConvert failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`语音合成失败：${message}`);
      throw err;
    }
  }

  async fetchSessionInfo() {
    try {
      const res = await this._request("status", { includeChannelSummary: false });
      if (res.ok && res.payload?.sessions?.recent?.length > 0) {
        const s = res.payload.sessions.recent[0];
        this._sessionInfo = {
          model: s.model ?? res.payload.model ?? null,
          configuredModel: s.configuredModel ?? res.payload.configuredModel ?? null,
          contextTokens: s.contextTokens ?? null,
          totalTokens: s.totalTokens ?? null,
          remainingTokens: s.remainingTokens ?? null,
          percentUsed: s.percentUsed ?? null,
        };
        this._notifySessionInfo();

        // parse session list
        this._sessions = res.payload.sessions.recent.map((s: any) => ({
          // gateway 返回的字段名是 key（不是 sessionKey），见 status.summary.ts buildSessionRows
          sessionKey: s.key ?? s.sessionKey ?? DEFAULT_SESSION_KEY,
          sessionId: s.sessionId,
          model: s.model,
          configuredModel: s.configuredModel,
          title: s.title,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount,
        }));
        this._notifySessionList();
      } else if (res.ok && res.payload?.model) {
        // fallback: top-level model when no session exists yet
        this._sessionInfo = { ...this._sessionInfo, model: res.payload.model };
        this._notifySessionInfo();
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

  async fetchModels() {
    try {
      const res = await this._request("models.list", { view: "configured" });
      if (res.ok && res.payload?.models) {
        this._models = res.payload.models;
        this._notifyModels();
      }
    } catch (err) {
      console.error("[Gateway] fetchModels failed:", err);
    }
  }

  async fetchHistory(sessionKey?: string, limit = 200): Promise<Message[]> {
    const key = sessionKey ?? this._activeSessionKey;
    try {
      const res = await this._request("chat.history", { sessionKey: key, limit });
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

  async switchModel(modelName: string) {
    try {
      await this._request("sessions.patch", {
        key: this._activeSessionKey,
        model: modelName,
      });
      this._sessionInfo = { ...this._sessionInfo, model: modelName, configuredModel: modelName };
      this._notifySessionInfo();
    } catch (err) {
      console.error("[Gateway] switchModel failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`切换模型失败：${message}`);
      throw err;
    }
  }

  async setReasoning(level: "off" | "low" | "medium" | "high") {
    try {
      await this._request("sessions.patch", {
        key: this._activeSessionKey,
        reasoningLevel: level === "off" ? null : level,
      });
    } catch (err) {
      console.error("[Gateway] setReasoning failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`调整推理强度失败：${message}`);
      throw err;
    }
  }

  async createSession(params?: {
    label?: string;
    model?: string;
    message?: string;
  }): Promise<string> {
    const res = await this._request("sessions.create", params ?? {});
    const key = res.payload?.key ?? this._activeSessionKey;
    this._activeSessionKey = key;
    // refresh session list after creation
    this.fetchSessionInfo();
    return key;
  }

  async deleteSession(sessionKey: string) {
    try {
      await this._request("sessions.delete", {
        key: sessionKey,
        deleteTranscript: true,
      });
      // refresh session list
      this.fetchSessionInfo();
    } catch (err) {
      console.error("[Gateway] deleteSession failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`删除会话失败：${message}`);
      throw err;
    }
  }

  async renameSession(sessionKey: string, label: string) {
    try {
      await this._request("sessions.patch", {
        key: sessionKey,
        label,
      });
      // refresh so sidebar picks up the new label
      this.fetchSessionInfo();
    } catch (err) {
      console.error("[Gateway] renameSession failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`重命名会话失败：${message}`);
      throw err;
    }
  }

  async fetchTodos(filter?: { status?: TodoStatus; tag?: string; dueBefore?: number }) {
    try {
      const res = await this._request("todo.list", filter ?? {});
      return (res.payload?.todos ?? []) as Todo[];
    } catch (err) {
      console.error("[Gateway] fetchTodos failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`加载待办失败：${message}`);
      return [];
    }
  }

  async addTodo(input: TodoCreateInput): Promise<Todo> {
    try {
      const res = await this._request("todo.add", input);
      return res.payload.todo as Todo;
    } catch (err) {
      console.error("[Gateway] addTodo failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`新增待办失败：${message}`);
      throw err;
    }
  }

  async updateTodo(id: string, patch: TodoUpdateInput): Promise<Todo> {
    try {
      const res = await this._request("todo.update", { id, ...patch });
      return res.payload.todo as Todo;
    } catch (err) {
      console.error("[Gateway] updateTodo failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`更新待办失败：${message}`);
      throw err;
    }
  }

  async removeTodo(id: string): Promise<void> {
    try {
      await this._request("todo.remove", { id });
    } catch (err) {
      console.error("[Gateway] removeTodo failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`删除待办失败：${message}`);
      throw err;
    }
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
          id: "redclaw-desktop",
          version: __REDCLAW_VERSION__,
          platform: "windows",
          mode: "ui",
        },
        role: "operator",
        scopes: ["operator.read", "operator.write", "operator.admin"],
        auth: this.token ? { token: this.token } : undefined,
        locale: "zh-CN",
      });
      if (res.ok) {
        this.connected = true;
        this._connecting = false;
        this._notifyStatus();
        // subscribe to session-scoped events (session.tool / session.message / sessions.changed)
        this._request("sessions.subscribe", {}).catch(() => undefined);
        // fetch session info and commands after connect
        this.fetchSessionInfo();
        this.fetchCommands();
        this.fetchModels();
      } else {
        // The Gateway explicitly rejected this handshake (bad/missing auth,
        // device identity, etc). Retrying with the same credentials would
        // just fail again, so stop() instead of letting onclose reschedule
        // another attempt.
        this._notifyError(`连接被拒绝：${res.error?.message || "未知错误"}`);
        this.stop();
      }
    } catch (err) {
      console.error("[Gateway] connect failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`连接失败：${message}`);
      this.stop();
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
      // agent events (thinking/tool/... broadcast) and session.tool events
      if (frame.event === "agent" || frame.event === "session.tool") {
        this._handleAgentEvent(frame.payload);
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
    if (sessionKey && sessionKey !== this._activeSessionKey) return;

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
      case "aborted": {
        const partialText =
          message?.text ||
          message?.content
            ?.filter((c: any) => c.type === "text")
            ?.map((c: any) => c.text)
            ?.join("") ||
          "";
        if (partialText) {
          this._notifyMessage({
            id: message?.id || crypto.randomUUID(),
            role: "assistant",
            content: partialText,
            timestamp: Date.now(),
            reasoning: message?.reasoning || "",
          });
        }
        this._notifyStreamEnd();
        break;
      }
      case "error":
        console.error("[Gateway] chat error:", errorMessage);
        this._notifyStreamEnd();
        this._notifyError(errorMessage || "生成失败");
        break;
      case "error":
        console.error("[Gateway] chat error:", errorMessage);
        this._notifyStreamEnd();
        this._notifyError(errorMessage || "生成失败");
        break;
    }
  }

  private _handleAgentEvent(payload: any) {
    if (!payload) return;
    const { sessionKey, stream, data } = payload;
    if (sessionKey && sessionKey !== this._activeSessionKey) return;

    if (stream === "thinking") {
      this._notifyThinking({
        text: data?.text ?? "",
        delta: data?.delta,
        replace: data?.replace === true,
      });
      return;
    }
    if (stream === "tool") {
      this._notifyTool((data ?? {}) as ToolCallEvent);
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

  private _notifyModels() {
    this.modelListListeners.forEach((fn) => fn(this._models));
  }

  private _notifyError(message: string) {
    this.errorListeners.forEach((fn) => fn(message));
  }

  private _notifyStreamEnd() {
    this.streamEndListeners.forEach((fn) => fn());
  }

  private _notifyThinking(thinking: ThinkingEvent) {
    this.thinkingListeners.forEach((fn) => fn(thinking));
  }

  private _notifyTool(tool: ToolCallEvent) {
    this.toolListeners.forEach((fn) => fn(tool));
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
