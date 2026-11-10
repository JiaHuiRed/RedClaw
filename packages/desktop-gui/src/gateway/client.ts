import { invoke } from "@tauri-apps/api/core";
import * as apiAgents from "./api-agents";
import * as apiCron from "./api-cron";
import * as apiTodos from "./api-todos";
import * as apiTools from "./api-tools";
import * as apiUsage from "./api-usage";
import { ChatEventPipeline } from "./chat-events";
import { ListenerSet } from "./emitter";
import { parseSessionRows, projectHistory } from "./history";
import { MediaResolver } from "./media";
import {
  CONNECT_CHALLENGE_TIMEOUT_MS,
  DEFAULT_SESSION_KEY,
  DEFAULT_URL,
  REQUEST_TIMEOUT_MS,
  RECONNECT_DELAY,
  RECONNECT_DELAY_MAX,
  type ChatSession,
  type CommandEntry,
  type DomainRpc,
  type Message,
  type ModelEntry,
  type OutgoingImageAttachment,
  type SessionInfo,
  type ThinkingEvent,
  type ToolCallEvent,
} from "./protocol";

// 类型与常量的公共出口：协议层全部从这里再导出，既有导入点不变
export * from "./protocol";

// 导出类本身：单测需要可新建实例隔离状态（单例 gateway 供运行时使用）
export class GatewayClient {
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
  // 事件防护（借鉴 eigent 投影管线的轻量版）：
  // 1) delta seq 水位线（per-session），丢弃迟到/重放帧（run 终态时清除该会话水位线）
  private _deltaSeqs = new Map<string, number>();
  // 2) 同 id 消息只投递一次，防重复 final 广播造成双条
  private _seenMessageIds = new Set<string>();
  private _seenMessageIdOrder: string[] = [];

  // 事件出口统一走监听器注册表（详见 emitter.ts），11 组 onXxx 三件套收敛于此
  private messages = new ListenerSet<[Message]>();
  private deltas = new ListenerSet<[string, string, boolean?]>();
  private statuses = new ListenerSet<[boolean]>();
  private sessionInfos = new ListenerSet<[SessionInfo]>();
  private sessionLists = new ListenerSet<[ChatSession[]]>();
  private commandsSets = new ListenerSet<[CommandEntry[]]>();
  private modelLists = new ListenerSet<[ModelEntry[]]>();
  private errorSets = new ListenerSet<[string]>();
  private streamEnds = new ListenerSet<[]>();
  private thinkings = new ListenerSet<[ThinkingEvent]>();
  private tools = new ListenerSet<[ToolCallEvent]>();

  // sessions.changed 节流：cron/心跳/聊天会话的生命周期广播可能密集到达，
  // 每次都全量 status 会打爆 RPC；窗口内的多次广播合并成一次刷新
  private sessionsRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  // 媒体解析（assistant-media ticket 换发）：httpBase/token 走 getter，
  // configure() 改地址后无需重建
  private media = new MediaResolver(
    () => this.url.replace(/^ws/, "http"),
    () => this.token,
  );

  // 领域 API 模块的调用面适配器：收窄成 DomainRpc 接口传给 api-* 模块
  private rpc: DomainRpc = {
    call: (method, params) => this._request(method, params ?? {}),
    notifyError: (message) => this._notifyError(message),
  };

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
    this.statuses.emit(this.connected);
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

  async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await this._request(method, params);
    if (!response.ok) {
      throw new Error(response.error?.message ?? `${method} 失败`);
    }
    return response.payload as T;
  }

  onMessage(fn: (msg: Message) => void) {
    return this.messages.add(fn);
  }

  onDelta(fn: (text: string, reasoning: string, replace?: boolean) => void) {
    return this.deltas.add(fn);
  }

  onStatus(fn: (connected: boolean) => void) {
    return this.statuses.add(fn);
  }

  onSessionInfo(fn: (info: SessionInfo) => void) {
    return this.sessionInfos.add(fn);
  }

  onSessionList(fn: (sessions: ChatSession[]) => void) {
    return this.sessionLists.add(fn);
  }

  onCommands(fn: (cmds: CommandEntry[]) => void) {
    return this.commandsSets.add(fn);
  }

  onModelList(fn: (models: ModelEntry[]) => void) {
    return this.modelLists.add(fn);
  }

  onError(fn: (message: string) => void) {
    return this.errorSets.add(fn);
  }

  onStreamEnd(fn: () => void) {
    return this.streamEnds.add(fn);
  }

  onThinking(fn: (thinking: ThinkingEvent) => void) {
    return this.thinkings.add(fn);
  }

  onTool(fn: (tool: ToolCallEvent) => void) {
    return this.tools.add(fn);
  }

  async sendMessage(
    text: string,
    opts?: {
      sessionKey?: string;
      attachments?: OutgoingImageAttachment[];
      model?: string;
      thinking?: string;
    },
  ) {
    if (!this.connected) throw new Error("Gateway not connected");
    const key = opts?.sessionKey ?? this._activeSessionKey;
    const idempotencyKey = crypto.randomUUID();
    try {
      await this._request("chat.send", {
        sessionKey: key,
        message: text,
        ...(opts?.attachments?.length ? { attachments: opts.attachments } : {}),
        // One-shot per-run model override；不传 = 跟随会话当前模型
        ...(opts?.model ? { model: opts.model } : {}),
        // One-shot per-run thinking level（与 model 同语义，不落会话）
        ...(opts?.thinking ? { thinking: opts.thinking } : {}),
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

  // ---- 网关进程生命周期（GUI 桌面端专属）----

  /** 后台拉起网关进程（openclaw gateway）；已托管时返回既有 PID */
  async spawnGatewayProcess(): Promise<number> {
    try {
      return await invoke<number>("gateway_spawn");
    } catch (err) {
      console.error("[Gateway] spawn gateway failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`启动网关进程失败：${message}`);
      throw err;
    }
  }

  /** 停止 GUI 托管的网关进程；false = 当前网关不是 GUI 启动的 */
  async stopGatewayProcess(): Promise<boolean> {
    try {
      return await invoke<boolean>("gateway_stop");
    } catch (err) {
      console.error("[Gateway] stop gateway failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`停止网关进程失败：${message}`);
      throw err;
    }
  }

  /** 请求网关自我重启（gateway.restart.request，v0.3.27 RPC）；断线后自动重连接上 */
  async restartGateway() {
    try {
      await this._request("gateway.restart.request", { reason: "desktop-gui" });
    } catch (err) {
      console.error("[Gateway] restart failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`重启网关失败：${message}`);
      throw err;
    }
  }

  /** 断线重连等待中立即发起一次连接（启动网关进程后快速接上，不等退避计时） */
  retryNow() {
    if (this.running && !this.connected && !this._connecting) {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this._connect();
    }
  }

  async ttsConvert(text: string, provider?: string) {
    if (!this.connected) throw new Error("Gateway not connected");
    return apiTools.ttsConvert(this.rpc, text, provider);
  }

  async generateImage(prompt: string, size?: string, sessionKey?: string) {
    if (!this.connected) throw new Error("Gateway not connected");
    const key = sessionKey ?? this._activeSessionKey;
    return apiTools.generateImage(this.rpc, prompt, size, key);
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
        this.sessionInfos.emit(this._sessionInfo);
        this._agentId = s.agentId ?? this._agentId;

        // parse session list
        this._sessions = parseSessionRows(res.payload.sessions.recent);
        this.sessionLists.emit(this._sessions);
      } else if (res.ok && res.payload?.model) {
        // fallback: top-level model when no session exists yet
        this._sessionInfo = { ...this._sessionInfo, model: res.payload.model };
        this.sessionInfos.emit(this._sessionInfo);
      }
    } catch (err) {
      console.error("[Gateway] fetchSessionInfo failed:", err);
    }
  }

  // sessions.changed 的节流出口：窗口内多次广播合并成一次 status 拉取
  private _scheduleSessionsRefresh() {
    if (this.sessionsRefreshTimer) return;
    this.sessionsRefreshTimer = setTimeout(() => {
      this.sessionsRefreshTimer = null;
      if (this.connected) this.fetchSessionInfo();
    }, 500);
  }

  async fetchAgentIdentity(agentId?: string) {
    // _agentId 可能尚未从 status 拉取到（竞态）；不传 agentId 时 server 解析默认 agent
    return apiAgents.fetchAgentIdentity(this.rpc, agentId ?? this._agentId ?? undefined);
  }

  async updateAgentAvatar(agentId: string, avatar: string) {
    return apiAgents.updateAgentAvatar(this.rpc, agentId, avatar);
  }

  // 项目区（agent）管理：列表 / 新建 / 编辑 / 删除
  async fetchAgents(): Promise<{ defaultId: string; agents: import("./protocol").AgentSummary[] }> {
    return apiAgents.fetchAgents(this.rpc);
  }

  async createAgent(input: import("./protocol").AgentCreateInput): Promise<{ agentId: string }> {
    return apiAgents.createAgent(this.rpc, input);
  }

  async updateAgent(agentId: string, patch: import("./protocol").AgentUpdateInput) {
    return apiAgents.updateAgent(this.rpc, agentId, patch);
  }

  async deleteAgent(agentId: string) {
    return apiAgents.deleteAgent(this.rpc, agentId);
  }

  // 用量成本（usage.cost，operator.read）：days=7|30
  async fetchUsageCost(days: number) {
    return apiUsage.fetchUsageCost(this.rpc, days);
  }

  // 记忆概览（memory.overview，operator.read）：MEMORY.md + memory/ 目录
  async fetchMemoryOverview(agentId?: string) {
    return apiUsage.fetchMemoryOverview(this.rpc, agentId ?? this._agentId ?? undefined);
  }

  // 定时任务管理（cron.*，operator admin 写）
  async fetchCronJobs() {
    return apiCron.fetchCronJobs(this.rpc);
  }

  async cronSetEnabled(id: string, enabled: boolean) {
    return apiCron.cronSetEnabled(this.rpc, id, enabled);
  }

  async cronRemove(id: string) {
    return apiCron.cronRemove(this.rpc, id);
  }

  async cronRunNow(id: string) {
    return apiCron.cronRunNow(this.rpc, id);
  }

  async cronCreate(input: import("./protocol").CronCreateInput) {
    return apiCron.cronCreate(this.rpc, input);
  }

  async fetchCronRuns(jobId: string, limit = 10) {
    return apiCron.fetchCronRuns(this.rpc, jobId, limit);
  }

  async fetchAllCronRuns(limit = 8) {
    return apiCron.fetchAllCronRuns(this.rpc, limit);
  }

  async fetchCommands() {
    try {
      const res = await this._request("commands.list", { scope: "text", includeArgs: false });
      if (res.ok && res.payload?.commands) {
        this._commands = res.payload.commands;
        this.commandsSets.emit(this._commands);
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
        this.modelLists.emit(this._models);
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
        return await projectHistory(res.payload.messages, this.media);
      }
    } catch (err) {
      console.error("[Gateway] fetchHistory failed:", err);
      // 失败向上抛（App.loadHistory 显式出错误态）：吞成 [] 会让老会话
      // 在 UI 上伪装成「全新空会话」——对家人型产品是情感伤害级误导
      throw err;
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
      this.sessionInfos.emit(this._sessionInfo);
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
    agentId?: string;
  }): Promise<string> {
    try {
      const res = await this._request("sessions.create", params ?? {});
      const key = res.payload?.key ?? this._activeSessionKey;
      this._activeSessionKey = key;
      // refresh session list after creation
      this.fetchSessionInfo();
      return key;
    } catch (err) {
      // 侧栏分组头的 +号新建等入口只 console：错误必须到 toast 才可见
      console.error("[Gateway] createSession failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      this._notifyError(`新建会话失败：${message}`);
      throw err;
    }
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

  async fetchTodos(filter?: {
    status?: import("./protocol").TodoStatus;
    tag?: string;
    dueBefore?: number;
  }) {
    return apiTodos.fetchTodos(this.rpc, filter);
  }

  async addTodo(input: import("./protocol").TodoCreateInput) {
    return apiTodos.addTodo(this.rpc, input);
  }

  async updateTodo(id: string, patch: import("./protocol").TodoUpdateInput) {
    return apiTodos.updateTodo(this.rpc, id, patch);
  }

  async removeTodo(id: string) {
    return apiTodos.removeTodo(this.rpc, id);
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
      this.statuses.emit(this.connected);
    };

    this.ws.onclose = () => {
      this.ws = null;
      this._connecting = false;
      this.connected = false;
      this._failPending(new Error("Gateway connection closed"));
      this.statuses.emit(this.connected);
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
      // 调度重连绑定「本次确实关闭了 ws」：challenge 超时回调与 _sendConnect
      // catch 会先后到达本函数，ws 已为 null 说明断开已在别处（onclose 或
      // 首次调用）处理过，重复调度只会让退避多翻一档。
      if (this.running) this._scheduleReconnect();
    }
    this.statuses.emit(this.connected);
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
        this.statuses.emit(this.connected);
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
        this.chatEvents.handleChatEvent(frame.payload);
        return;
      }
      // agent events (thinking/tool/... broadcast) and session.tool events
      if (frame.event === "agent" || frame.event === "session.tool") {
        this.chatEvents.handleAgentEvent(frame.payload);
        return;
      }
      // 会话生命周期广播（创建/更新/删除）：server 在会话变化时主动推送，
      // 消费它才能让新会话在首条消息发出后立刻出现在侧栏，
      // 而不是干等整条回复 final 后的兜底刷新
      if (frame.event === "sessions.changed") {
        this._scheduleSessionsRefresh();
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

  // 聊天/agent 事件管线：投递逻辑在 chat-events.ts，这里只装配上下文。
  // 字段按声明顺序初始化，引用的都是上方已就绪的注册表/水位线/媒体解析器。
  private chatEvents = new ChatEventPipeline({
    deltas: this.deltas,
    notifyMessage: (msg) => this._notifyMessage(msg),
    streamEnds: this.streamEnds,
    notifyError: (message) => this._notifyError(message),
    tools: this.tools,
    thinkings: this.thinkings,
    deltaSeqs: this._deltaSeqs,
    getActiveKey: () => this._activeSessionKey,
    refreshSessionInfo: () => void this.fetchSessionInfo(),
    media: this.media,
  });

  private _notifyMessage(msg: Message) {
    // 同 id 只投递一次：重复 final/补发广播（如重连重放）会在聊天里出现双条。
    // FIFO 上限 200 条，防长会话无界增长。
    if (msg.id) {
      if (this._seenMessageIds.has(msg.id)) return;
      this._seenMessageIds.add(msg.id);
      this._seenMessageIdOrder.push(msg.id);
      if (this._seenMessageIdOrder.length > 200) {
        for (const id of this._seenMessageIdOrder.splice(0, 100)) {
          this._seenMessageIds.delete(id);
        }
      }
    }
    this.messages.emit(msg);
  }

  private _notifyError(message: string) {
    this.errorSets.emit(message);
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
