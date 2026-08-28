const DEFAULT_SESSION_KEY = "agent:main:main";
const RECONNECT_DELAY = 2000;
const RECONNECT_DELAY_MAX = 30_000;
// challenge 已到但 connect 应答未到：网关接受了 TCP 却卡死，按失败走退避重连
const CONNECT_CHALLENGE_TIMEOUT_MS = 10_000;
const DEFAULT_URL = "ws://127.0.0.1:18789";
// 单请求响应超时。tools.invoke（生图）会等工具跑完才响应，需要留足余量。
const REQUEST_TIMEOUT_MS = 120_000;

export interface MessageImage {
  url: string;
  alt?: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  reasoning?: string;
  images?: MessageImage[];
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

export interface AgentIdentity {
  agentId: string;
  name?: string;
  emoji?: string;
  avatar?: string | null;
  avatarSource?: string | null;
  avatarStatus?: "none" | "local" | "remote" | "data" | string;
  avatarReason?: string;
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
  private reconnectDelay = RECONNECT_DELAY;
  private challengeTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReqs: Record<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  > = {};
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
  private _agentId: string | null = null;
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
  get agentId() {
    return this._agentId;
  }
  get serverUrl() {
    return this.url;
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
    if (this.challengeTimer) clearTimeout(this.challengeTimer);
    this.challengeTimer = null;
    this.reconnectDelay = RECONNECT_DELAY;
    this._failPending(new Error("Gateway client stopped"));
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this._notifyStatus();
  }

  // 断连/停止时清空挂起请求：否则 chat.send 的 promise 永远 pending，
  // isGenerating 卡 true，输入框锁死到重启。
  private _failPending(err: Error) {
    const pending = Object.values(this.pendingReqs);
    this.pendingReqs = {};
    for (const p of pending) p.reject(err);
  }

  private _scheduleReconnect() {
    // 指数退避：网关长时间不在时避免固定间隔连打；连接成功后重置
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_DELAY_MAX);
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

  async generateImage(prompt: string, size?: string, sessionKey?: string) {
    if (!this.connected) throw new Error("Gateway not connected");
    const key = sessionKey ?? this._activeSessionKey;
    try {
      const res = await this._request("tools.invoke", {
        name: "image_generate",
        args: {
          action: "generate",
          prompt,
          ...(size ? { size } : {}),
        },
        sessionKey: key,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!res.ok) {
        throw new Error(res.error?.message || "生图启动失败");
      }
      return res.payload;
    } catch (err) {
      console.error("[Gateway] generateImage failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`生图启动失败：${message}`);
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
        this._agentId = s.agentId ?? this._agentId;

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

  async fetchAgentIdentity(agentId?: string) {
    const id = agentId ?? this._agentId;
    // _agentId 可能尚未从 status 拉取到（竞态）；不传 agentId 时 server 解析默认 agent
    const params = id ? { agentId: id } : {};
    try {
      const res = await this._request("agent.identity.get", params);
      if (res.ok && res.payload) {
        const p = res.payload;
        return {
          agentId: id,
          name: p.name,
          emoji: p.emoji,
          avatar: p.avatar ?? null,
          avatarSource: p.avatarSource ?? null,
          avatarStatus: p.avatarStatus ?? "none",
          avatarReason: p.avatarReason ?? null,
        } as AgentIdentity;
      }
      return null;
    } catch (err) {
      console.error("[Gateway] fetchAgentIdentity failed:", err);
      return null;
    }
  }

  async updateAgentAvatar(agentId: string, avatar: string) {
    try {
      const id = agentId ?? this._agentId;
      const res = await this._request("agents.update", id ? { agentId: id, avatar } : { avatar });
      if (!res.ok) throw new Error(res.error?.message ?? "未知错误");
      return true;
    } catch (err) {
      console.error("[Gateway] updateAgentAvatar failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`头像更新失败：${message}`);
      throw err;
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
        const out: Message[] = [];
        for (const m of res.payload.messages as any[]) {
          // 只渲染用户/助手消息；工具结果（role=toolResult）在实时聊天里也不显示，
          // 历史里同样跳过，避免 "Background task started..." 之类文本变成气泡。
          const role = m.role ?? "assistant";
          if (role !== "user" && role !== "assistant") {
            continue;
          }
          let content =
            typeof m.content === "string"
              ? m.content
              : (m.content?.map((c: any) => c.text).join("") ?? "");
          // 过滤内部路由消息（inter-session / task completion），不显示给用户；
          // 真实回复由 message tool 的 sourceReply 直接补发 assistant 消息。
          if (
            content.startsWith("[Inter-session message]") ||
            content.startsWith("[Internal task completion event]") ||
            content.startsWith("[Internal message]")
          ) {
            continue;
          }
          // 心跳 ack 文本（HEARTBEAT_OK）不渲染成气泡：server 实时广播已过滤，
          // 但历史投影对带 thinking 块的消息 isHeartbeatOkResponse 不命中，这里文本兜底。
          if (/^HEARTBEAT_OK(\s|$)/.test(content.trim())) {
            continue;
          }
          const mediaCandidates = [
            ...(Array.isArray(m.mediaUrls) ? m.mediaUrls : []),
            ...(m.mediaUrl ? [m.mediaUrl] : []),
            ...(Array.isArray(m.MediaPaths) ? m.MediaPaths : []),
            ...(m.MediaPath ? [m.MediaPath] : []),
          ];
          const mediaTokenRe = /\bMEDIA:\s*`?([^\n]+)`?/gi;
          let mm: RegExpExecArray | null;
          while ((mm = mediaTokenRe.exec(content)) !== null) {
            const p = mm[1].trim();
            if (p) mediaCandidates.push(p);
          }
          // 历史生图消息：图片路径藏在 assistant 消息的 message tool 调用参数里
          // （chat.history 投影保留 toolCall 块，arguments.attachments[].media 是
          // 图片绝对路径，arguments.message 是展示文案），顶层字段没有媒体，
          // 不解析的话历史里就看不到生成的图。
          if (Array.isArray(m.content)) {
            for (const block of m.content) {
              if (block?.type !== "toolCall" || block.name !== "message" || !block.arguments) {
                continue;
              }
              let args: any = block.arguments;
              if (typeof args === "string") {
                try {
                  args = JSON.parse(args);
                } catch {
                  args = null;
                }
              }
              if (!args) continue;
              if (typeof args.message === "string" && !content) {
                content = args.message;
              }
              for (const att of args.attachments ?? []) {
                if (
                  att?.media &&
                  typeof att.media === "string" &&
                  (att.type === "image" || /\.(png|jpe?g|gif|webp|bmp)$/i.test(att.media))
                ) {
                  mediaCandidates.push(att.media);
                }
              }
            }
          }
          let images: MessageImage[] = [];
          // 按源路径先去重：本地路径经 mediaTicket 换发后不是稳定 URL，
          // 同路径重复字段（mediaUrl + mediaUrls[0]）会解析出两个不同 URL。
          const seenPaths = new Set<string>();
          for (const cand of mediaCandidates) {
            if (!cand || seenPaths.has(cand)) continue;
            seenPaths.add(cand);
            const url = await this._resolveMediaHttpUrl(cand);
            if (!url) continue;
            if (images.some((img) => img.url === url)) continue;
            images.push({ url });
          }
          // 空内容且无图（生图后台任务 run 的空 final）不渲染成空白气泡。
          if (!content && images.length === 0) {
            continue;
          }
          out.push({
            id: m.id ?? crypto.randomUUID(),
            role: m.role ?? "assistant",
            content,
            timestamp: m.timestamp ?? Date.now(),
            reasoning: m.reasoning ?? "",
            ...(images.length > 0 ? { images } : {}),
          });
        }
        return out;
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
    if (!this.running) return;
    // 旧连接句柄可能还在，但底层 TCP 已死（Windows 上杀 gateway 后常见），
    // 直接复用它会导致 RPC 永远 pending、界面卡在"连接中"。
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
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
      this._failPending(new Error("Gateway connection closed"));
      this._notifyStatus();
      if (this.running) {
        this._scheduleReconnect();
      }
    };
  }

  private _connecting = false;

  // 网络级握手失败（超时/断连）：清掉挂起的 connect 请求并按退避重连。
  // 仅显式拒绝（网关返回 ok:false，如鉴权失败）才走 stop()——那种重试没有意义。
  private _abortHandshake(err: Error) {
    this._connecting = false;
    this._failPending(err);
    if (this.challengeTimer) {
      clearTimeout(this.challengeTimer);
      this.challengeTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this._notifyStatus();
    if (this.running) {
      this._scheduleReconnect();
    }
  }

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
        if (this.challengeTimer) {
          clearTimeout(this.challengeTimer);
          this.challengeTimer = null;
        }
        this.reconnectDelay = RECONNECT_DELAY;
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
        // just fail again, so stop() instead of rescheduling.
        this._notifyError(`连接被拒绝：${res.error?.message || "未知错误"}`);
        this.stop();
      }
    } catch (err) {
      console.error("[Gateway] connect failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`连接失败：${message}`);
      this._abortHandshake(err instanceof Error ? err : new Error(message));
    }
  }

  private _handleFrame(frame: any) {
    if (frame.type === "event") {
      if (frame.event === "connect.challenge") {
        if (!this._connecting) {
          this._connecting = true;
          this.challengeTimer = setTimeout(() => {
            this.challengeTimer = null;
            if (this._connecting) {
              this._abortHandshake(new Error("Gateway handshake timed out"));
            }
          }, CONNECT_CHALLENGE_TIMEOUT_MS);
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
    const hasMedia =
      !!message?.mediaUrl ||
      !!message?.mediaUrls ||
      !!message?.MediaPath ||
      !!message?.MediaPaths ||
      (Array.isArray(message?.content) &&
        message.content.some((c: any) => c?.type === "image" && c?.url));
    if (
      sessionKey &&
      sessionKey !== this._activeSessionKey &&
      !this._isKnownSessionKey(sessionKey) &&
      !hasMedia
    )
      return;

    switch (state) {
      case "delta":
        this._notifyDelta(deltaText || "", message?.reasoning || "");
        break;
      case "final":
        void this._handleFinalChatMessage(message);
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
    }
  }

  // 生图完成消息：文字 + 图片（content image block / 顶层 mediaUrls / mediaUrl / MEDIA: 文本）
  // 本地绝对路径经 assistant-media 端点换 ticket 转 HTTP URL
  private async _handleFinalChatMessage(message: any) {
    const content =
      message?.text ||
      message?.content
        ?.filter((c: any) => c.type === "text")
        ?.map((c: any) => c.text)
        ?.join("") ||
      "";

    const mediaCandidates = [
      ...(Array.isArray(message?.mediaUrls) ? message.mediaUrls : []),
      ...(message?.mediaUrl ? [message.mediaUrl] : []),
      ...(Array.isArray(message?.MediaPaths) ? message.MediaPaths : []),
      ...(message?.MediaPath ? [message.MediaPath] : []),
    ];
    const mediaTokenRe = /\bMEDIA:\s*`?([^\n]+)`?/gi;
    let m: RegExpExecArray | null;
    while ((m = mediaTokenRe.exec(content)) !== null) {
      const path = m[1].trim();
      if (path) mediaCandidates.push(path);
    }
    await this._resolveAndNotifyImages(mediaCandidates, content);
  }

  private async _resolveAndNotifyImages(mediaCandidates: string[], text: string) {
    let images: MessageImage[] = [];
    // server 可能同时填 mediaUrl + mediaUrls[0]（同一路径双字段），且本地路径
    // 每次解析换新 mediaTicket，按最终 URL 去重会失效——先按原始路径去重。
    const seenPaths = new Set<string>();
    try {
      for (const cand of mediaCandidates) {
        if (!cand || seenPaths.has(cand)) continue;
        seenPaths.add(cand);
        const url = await this._resolveMediaHttpUrl(cand);
        if (!url) continue;
        if (images.some((img) => img.url === url)) continue;
        images.push({ url });
      }
    } catch (err) {
      console.error("[Gateway] resolve images failed:", err);
    }

    // 空内容且无图（如生图后台任务 run 结束的空 final 广播）不渲染，
    // 否则会变成空白气泡。
    if (!text && images.length === 0) {
      return;
    }

    this._notifyMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      timestamp: Date.now(),
      ...(images.length > 0 ? { images } : {}),
    });
  }

  // 把媒体引用解析成可直接 <img> 的 HTTP URL：
  //  - http(s) 原样
  //  - / 开头的相对路径拼 gateway http base
  //  - 本地绝对路径（生图落盘）经 assistant-media 端点换 mediaTicket
  private async _resolveMediaHttpUrl(source: string | undefined): Promise<string | null> {
    if (!source) return null;
    const httpBase = this.url.replace(/^ws/, "http");
    if (/^https?:\/\//i.test(source)) return source;
    if (source.startsWith("/")) return `${httpBase}${source}`;
    // 本地绝对路径：assistant-media meta 换 ticket（allowQueryToken:true）
    try {
      const enc = encodeURIComponent(source);
      const metaUrl = `${httpBase}/__openclaw__/assistant-media?source=${enc}&meta=1${
        this.token ? `&token=${encodeURIComponent(this.token)}` : ""
      }`;
      const res = await fetch(metaUrl);
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.available && data?.mediaTicket) {
        return `${httpBase}/__openclaw__/assistant-media?source=${enc}&mediaTicket=${encodeURIComponent(data.mediaTicket)}`;
      }
      return null;
    } catch {
      return null;
    }
  }

  private _isKnownSessionKey(sessionKey: string): boolean {
    if (!sessionKey) return false;
    if (sessionKey === this._activeSessionKey) return true;
    if (this._sessions.some((s) => s.sessionKey === sessionKey)) return true;
    return (
      sessionKey.includes(this._activeSessionKey) || this._activeSessionKey.includes(sessionKey)
    );
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
      const toolData = data ?? {};
      // message tool 是内部路由工具：start 阶段保留卡片（告诉用户任务开始），
      // result 阶段静默（sourceReply 会补发 assistant 消息，避免重复气泡）。
      if (!(toolData.name === "message" && toolData.phase === "result")) {
        this._notifyTool(toolData as ToolCallEvent);
      }
      // message tool 的 sourceReply 走 internal-ui sink，不经过 chat final
      // broadcast；GUI/TUI 这里直接消费，补发一条 assistant 消息（含图片）。
      if (toolData.name === "message" && !toolData.error) {
        const sourceReply = (toolData as any)?.result?.details?.sourceReply;
        if (sourceReply) {
          const text =
            sourceReply.text ||
            sourceReply.message ||
            ((toolData as any)?.result?.content as any[])
              ?.filter((c: any) => c?.type === "text")
              ?.map((c: any) => c.text)
              ?.join("") ||
            "";
          const mediaCandidates = [
            ...(Array.isArray(sourceReply.mediaUrls) ? sourceReply.mediaUrls : []),
            ...(sourceReply.mediaUrl ? [sourceReply.mediaUrl] : []),
          ];
          this._resolveAndNotifyImages(mediaCandidates, text);
        }
      }
      return;
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
      const timer = setTimeout(() => {
        delete this.pendingReqs[id];
        reject(new Error(`Gateway request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);
      this.pendingReqs[id] = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      const frame = JSON.stringify({ type: "req", id, method, params });
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(frame);
      } else {
        clearTimeout(timer);
        delete this.pendingReqs[id];
        reject(new Error("WebSocket not connected"));
      }
    });
  }
}

export const gateway = new GatewayClient();
