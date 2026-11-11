import { Clock, ImagePlus, Loader2, Palette, Send, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  gateway,
  type CommandEntry,
  type ModelEntry,
  type OutgoingImageAttachment,
} from "../gateway/client";
import { getVisibleItems, type PaletteItem } from "../lib/commandPalette";
import CommandPalette from "./CommandPalette";
import { ModelPicker } from "./ModelPicker";

// 本条消息模型覆盖（per-run modelOverride）：null = 跟随会话当前模型。
// v1：带版本后缀防旧格式覆盖（localStorage key 教训见 ChatHome 同款）
const CHAT_MODEL_KEY = "redclaw:chatModel:v1";
const CHAT_THINKING_KEY = "redclaw:chatThinking:v1";
// 输入历史召回（webui input-history 对齐）：↑ 上一条 / ↓ 下一条，封顶 50 条
const INPUT_HISTORY_KEY = "redclaw:inputHistory:v1";
const INPUT_HISTORY_CAP = 50;
// 本地斜杠命令：手动压缩会话上下文（sessions.compact RPC 在 ChatPanel 侧执行）。
// 刻意只有手动入口——不自动、不定时、不阈值触发（会断 DeepSeek 前缀缓存）
const COMPACT_COMMAND: CommandEntry = {
  name: "/compact",
  description: "压缩会话上下文（手动触发，不自动执行）",
  category: "会话",
  acceptsArgs: false,
};
// 生图模式：🎨 切换，尺寸固定档位（来自 Stepfun API 实测，同 RedStudio）
const IMAGE_SIZES = ["1024x1024", "768x1360", "896x1184", "1360x768", "1184x896"];

// 忙时入队的待发消息：快照发送时刻的文本/附件/模型/思考档/生图参数
export type QueuedMessage = {
  id: string;
  text: string;
  attachments?: OutgoingImageAttachment[];
  model?: string;
  thinking?: string;
  imageMode?: boolean;
  imageSize?: string;
};

type PendingImage = {
  id: string;
  objectUrl: string;
  base64: string;
  mimeType: string;
  fileName: string;
};

// 空态卡片反向触发的动作句柄（面板持 ref，composer 每渲染刷新实现）
export interface ComposerActions {
  openCommands: () => void;
  /** 编辑重发：把内容回填输入框（不触发发送） */
  fillDraft: (text: string) => void;
}

// 读取图片为 base64 附件（预览走 objectURL，不再同时存 dataUrl 双份字符串：
// 12MB 图原先 base64+dataUrl 两份常驻 ≈32MB，现在只剩 base64 一份）
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read image failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * 聊天输入壳（从 ChatPanel 拆出）：文本区、命令面板、图片附件、per-message
 * 模型/思考档、生图模式、忙时队列。发送统一产出 QueuedMessage 交给
 * onSendItem（面板 sendNow：乐观消息/自动标题/流式启动都在那边）。
 */
export function ChatComposer({
  connected,
  isGenerating,
  imagePending,
  sessionModel,
  commands,
  active,
  onCompactSession,
  workDraft,
  onWorkDraftConsumed,
  onSendItem,
  onStop,
  pushToast,
  actionsRef,
}: {
  connected: boolean;
  isGenerating: boolean;
  imagePending: boolean;
  sessionModel: string | null;
  commands: CommandEntry[];
  active?: boolean;
  // 手动压缩会话（本地斜杠命令 /compact；纯手动，绝不自动/定时触发）
  onCompactSession?: () => void;
  workDraft: { text: string; nonce: number } | null;
  onWorkDraftConsumed: () => void;
  onSendItem: (item: QueuedMessage) => void;
  onStop: () => void;
  pushToast: (message: string) => void;
  actionsRef: MutableRefObject<ComposerActions | null>;
}) {
  const [input, setInput] = useState("");
  const [sendQueue, setSendQueue] = useState<QueuedMessage[]>([]);
  // 随下一条消息发送的图片附件（按钮选择 / 粘贴）：预览用 objectURL，
  // 发送/移除时 revoke，避免解码位图与字符串常驻
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [imageMode, setImageMode] = useState(false);
  const [imageSize, setImageSize] = useState("1024x1024");
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdCategory, setCmdCategory] = useState<string | null>(null);
  const [cmdSelectedIndex, setCmdSelectedIndex] = useState(0);
  const [availableModels, setAvailableModels] = useState<ModelEntry[]>(gateway.models);
  // 输入框内 per-message 模型选择：覆盖只随下一次 chat.send 生效，不改会话默认
  const [chatModel, setChatModel] = useState<string | null>(() =>
    localStorage.getItem(CHAT_MODEL_KEY),
  );
  // per-message 思考档：null = 跟随模型默认；换模型时若新模型不支持推理则自动清档
  const [chatThinking, setChatThinking] = useState<string | null>(() =>
    localStorage.getItem(CHAT_THINKING_KEY),
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 输入历史：lazy 读 localStorage（损坏值当空表）；-1 = 未在召回态
  const inputHistoryRef = useRef<string[]>(
    (() => {
      try {
        const saved = JSON.parse(localStorage.getItem(INPUT_HISTORY_KEY) ?? "[]") as unknown;
        return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    })(),
  );
  const historyIdxRef = useRef(-1);
  const historyDraftRef = useRef("");

  function pushInputHistory(msg: string) {
    const list = inputHistoryRef.current;
    if (list[list.length - 1] === msg) return; // 连发同文去重
    const next = [...list, msg].slice(-INPUT_HISTORY_CAP);
    inputHistoryRef.current = next;
    historyIdxRef.current = -1;
    try {
      localStorage.setItem(INPUT_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // 存储满/隐私模式：内存里仍可召回本次会话
    }
  }

  // 召回写回输入框：与手动输入同一条路径（命令面板判断 + auto-resize）
  function applyInputValue(val: string) {
    setInput(val);
    setShowCmdPalette(val.startsWith("/"));
    const ta = inputRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  }
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 模型列表随 gateway 推送刷新（ModelPicker 数据源）
  useEffect(() => {
    const unsub = gateway.onModelList((list) => setAvailableModels(list));
    return unsub;
  }, []);

  const dropPendingImages = () => {
    setPendingImages((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.objectUrl);
      return [];
    });
  };

  const removePendingImage = (id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((x) => x.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  async function addPendingImages(files: File[]) {
    // 静默丢弃是最伤的「点了没反应」：超量/超限/非图片/读取失败全部显式提示
    if (files.length > 4) {
      pushToast(`一次最多带 4 张图，多余的 ${files.length - 4} 张已忽略`);
    }
    let skippedNonImage = 0;
    for (const file of files.slice(0, 4)) {
      if (!file.type.startsWith("image/")) {
        skippedNonImage++;
        continue;
      }
      // 服务端 chat.attachments 默认上限 20MB，base64 还有 4/3 膨胀，raw 收到 12MB
      if (file.size > 12 * 1024 * 1024) {
        pushToast(`图片 ${file.name} 超过 12MB 上限，已跳过`);
        continue;
      }
      try {
        const base64 = await readFileAsBase64(file);
        setPendingImages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            objectUrl: URL.createObjectURL(file),
            base64,
            mimeType: file.type,
            fileName: file.name || "image.png",
          },
        ]);
      } catch (err) {
        console.error("[ChatComposer] read image failed:", err);
        pushToast(`图片 ${file.name} 读取失败`);
      }
    }
    if (skippedNonImage > 0) {
      pushToast(`已忽略 ${skippedNonImage} 个非图片文件`);
    }
  }

  // 面板命令 = 网关注册命令 + 本地命令（/compact 仅在面板侧接线时出现）
  const paletteCommands = useMemo(
    () => (onCompactSession ? [COMPACT_COMMAND, ...commands] : commands),
    [commands, onCompactSession],
  );

  const paletteItems = useMemo(
    () => getVisibleItems(paletteCommands, input, cmdCategory),
    [paletteCommands, input, cmdCategory],
  );

  // Any navigation that changes what's visible (typing, drilling in/out)
  // should reset the highlighted row rather than leaving it pointing at
  // whatever happened to be at that index before.
  useEffect(() => {
    setCmdSelectedIndex(0);
  }, [input, cmdCategory]);

  // Closing the palette by any path (Escape at root, sending a command,
  // clearing the input) should always land back at root next time it opens.
  useEffect(() => {
    if (!showCmdPalette) setCmdCategory(null);
  }, [showCmdPalette]);

  // Ctrl+K 唤起命令面板；隐藏挂载（其他视图）时不响应
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCommands();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // onSendItem 每渲染刷新到最新实现（面板 sendNow 闭包依赖面板状态）
  const sendItemRef = useRef(onSendItem);
  sendItemRef.current = onSendItem;

  function openCommands() {
    setInput("/");
    setShowCmdPalette(true);
    inputRef.current?.focus();
  }

  function fillDraft(text: string) {
    setInput(text);
    inputRef.current?.focus();
    setShowCmdPalette(text.startsWith("/"));
  }

  function buildItem(msg: string): QueuedMessage {
    return {
      id: crypto.randomUUID(),
      text: msg,
      attachments: pendingImages.map((p) => ({
        type: "image",
        mimeType: p.mimeType,
        fileName: p.fileName,
        content: p.base64,
      })),
      model: chatModel ?? undefined,
      thinking: chatThinking ?? undefined,
      imageMode,
      imageSize,
    };
  }

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if ((!msg && pendingImages.length === 0) || !connected) return;
    if (msg) pushInputHistory(msg);
    const item = buildItem(msg);
    // 生成中：入队而非丢弃；流结束后由派发 effect 依次发出
    if (isGenerating) {
      setSendQueue((prev) => [...prev, item]);
    } else {
      void sendItemRef.current(item);
    }
    setInput("");
    setShowCmdPalette(false);
    dropPendingImages();
  }

  function activatePaletteItem(item: PaletteItem) {
    if (item.kind === "header") {
      setCmdCategory(item.category);
      setInput("/");
      return;
    }
    // 本地命令不走消息发送：/compact 直接触发 RPC（保持输入框原样）
    if (item.command.name === "/compact") {
      setShowCmdPalette(false);
      onCompactSession?.();
      return;
    }
    const cmd = item.command;
    if (cmd.acceptsArgs) {
      setInput(cmd.name + " ");
      setShowCmdPalette(false);
      inputRef.current?.focus();
    } else {
      void handleSend(cmd.name);
    }
  }

  // 模型/思考档选择与持久化（弹层 UI 在共享 ModelPicker 组件里）
  function pickChatModel(modelId: string | null) {
    setChatModel(modelId);
    if (modelId) localStorage.setItem(CHAT_MODEL_KEY, modelId);
    else localStorage.removeItem(CHAT_MODEL_KEY);
  }

  function pickChatThinking(level: string | null) {
    setChatThinking(level);
    if (level) localStorage.setItem(CHAT_THINKING_KEY, level);
    else localStorage.removeItem(CHAT_THINKING_KEY);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    historyIdxRef.current = -1; // 手动输入打断召回
    setInput(val);
    setShowCmdPalette(val.startsWith("/"));
    // auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showCmdPalette) {
      if (e.key === "Escape") {
        if (cmdCategory) {
          setCmdCategory(null);
          setInput("/");
        } else {
          setShowCmdPalette(false);
        }
        return;
      }
      // Only pops the category when there's truly nothing left to delete in
      // the current scope - must not hijack backspacing through real query text.
      if (e.key === "Backspace" && cmdCategory && input === "/") {
        e.preventDefault();
        setCmdCategory(null);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCmdSelectedIndex((i) => Math.min(i + 1, Math.max(paletteItems.length - 1, 0)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCmdSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      // 中文 IME 组词中按 Enter 是确认候选词，不能当「发送/选中」处理
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        const item = paletteItems[cmdSelectedIndex];
        if (item) {
          e.preventDefault();
          activatePaletteItem(item);
          return;
        }
      }
    }
    // 输入历史召回：↑ 从当前草稿进入历史、继续 ↑ 更早；↓ 回到新，走完回草稿。
    // 只在空输入或已在召回态时接管方向键，不干扰正常光标移动
    if (!e.nativeEvent.isComposing && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const hist = inputHistoryRef.current;
      const recalling = historyIdxRef.current !== -1;
      const eligible =
        e.key === "ArrowUp" ? (input === "" || recalling) && hist.length > 0 : recalling;
      if (eligible) {
        e.preventDefault();
        if (e.key === "ArrowUp") {
          if (historyIdxRef.current === -1) {
            historyDraftRef.current = input;
            historyIdxRef.current = hist.length - 1;
          } else {
            historyIdxRef.current = Math.max(0, historyIdxRef.current - 1);
          }
        } else {
          historyIdxRef.current += 1;
          if (historyIdxRef.current >= hist.length) {
            historyIdxRef.current = -1;
            applyInputValue(historyDraftRef.current);
            return;
          }
        }
        applyInputValue(hist[historyIdxRef.current] ?? "");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  }

  // 队列派发：流结束（isGenerating 翻 false）后依次发出下一条。
  // 未连接时不派发，队列保留到重连后继续（断线不应吞掉排队消息）。
  useEffect(() => {
    if (!connected || isGenerating || sendQueue.length === 0) return;
    const next = sendQueue[0];
    if (!next) return;
    setSendQueue((prev) => prev.slice(1));
    void sendItemRef.current(next);
  }, [connected, isGenerating, sendQueue]);

  // 工作台主页「交办」：nonce 只消费一次；忙时落回输入框不丢字
  const workDraftNonceRef = useRef(0);
  useEffect(() => {
    if (!workDraft || workDraft.nonce === workDraftNonceRef.current) return;
    workDraftNonceRef.current = workDraft.nonce;
    if (isGenerating) {
      setInput(workDraft.text);
    } else {
      void handleSend(workDraft.text);
    }
    onWorkDraftConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workDraft]);

  // 空态卡片「查看命令」/消息行「编辑重发」等外部触发：句柄每渲染刷新到最新实现
  actionsRef.current = { openCommands, fillDraft };

  return (
    <div className="p-4 border-t shrink-0 relative" style={{ borderColor: "var(--border)" }}>
      {/* Command palette */}
      {showCmdPalette && (
        <CommandPalette
          items={paletteItems}
          selectedIndex={cmdSelectedIndex}
          category={cmdCategory}
          onSelectIndex={setCmdSelectedIndex}
          onActivate={activatePaletteItem}
          onBack={() => {
            setCmdCategory(null);
            setInput("/");
          }}
        />
      )}

      <div
        className="input-shell flex flex-col rounded-2xl px-3 py-2 border transition-all"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {sendQueue.length > 0 && (
          <div className="flex flex-col gap-1 px-1 pt-1">
            {sendQueue.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-ui-sm"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                }}
              >
                <Clock size={11} className="shrink-0" />
                <span className="truncate flex-1">
                  {item.imageMode ? "生图：" : ""}
                  {item.text}
                </span>
                <button
                  onClick={() => setSendQueue((prev) => prev.filter((x) => x.id !== item.id))}
                  className="shrink-0 opacity-70 hover:opacity-100"
                  title="移出队列"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1 pt-1 pb-0.5">
            {pendingImages.map((p) => (
              <div key={p.id} className="relative">
                <img
                  src={p.objectUrl}
                  alt={p.fileName}
                  className="w-12 h-12 rounded-lg object-cover border"
                  style={{ borderColor: "var(--border)" }}
                />
                <button
                  onClick={() => removePendingImage(p.id)}
                  className="absolute -top-1.5 -right-1.5 rounded-full p-0.5 shadow-md"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                  }}
                  title="移除"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => setImageMode((m) => !m)}
            disabled={!connected}
            className="shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-30"
            style={
              imageMode
                ? { background: "var(--accent)", color: "var(--on-solid)" }
                : { color: "var(--text-secondary)", background: "var(--bg-secondary)" }
            }
            title="生图模式（Stepfun）"
          >
            <Palette size={16} />
          </button>
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={!connected}
            className="shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-30"
            style={{ color: "var(--text-secondary)", background: "var(--bg-tertiary)" }}
            title="发送图片（也可直接粘贴截图）"
          >
            <ImagePlus size={16} />
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void addPendingImages(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {/* per-message 模型+思考档（共享 ModelPicker）：覆盖仅对本条消息生效 */}
          <ModelPicker
            models={availableModels}
            model={chatModel}
            sessionModel={sessionModel}
            thinking={chatThinking}
            onPickModel={pickChatModel}
            onPickThinking={pickChatThinking}
            disabled={!connected}
          />
          {imageMode && (
            <select
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              disabled={!connected || imagePending}
              className="shrink-0 rounded-lg px-2 py-1.5 text-ui-sm outline-none disabled:opacity-50"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
              title="图片尺寸"
            >
              {IMAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
                f.type.startsWith("image/"),
              );
              if (files.length > 0) {
                e.preventDefault();
                void addPendingImages(files);
              }
            }}
            placeholder={
              !connected
                ? "请先连接 Gateway"
                : imageMode
                  ? "描述你想生成的图片…"
                  : "输入消息… （/ 查看命令）"
            }
            disabled={!connected}
            rows={1}
            className="flex-1 bg-transparent text-ui-base outline-none resize-none disabled:opacity-50"
            style={{ color: "var(--text-primary)" }}
          />
          {imagePending ? (
            // 生图可能挂几分钟：保留停止入口（abort 同样有效），允许继续打字排队
            <button
              onClick={onStop}
              className="shrink-0 rounded-full w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-90"
              style={{ background: "var(--danger)", color: "var(--on-solid)" }}
              title="停止生图"
            >
              <Loader2 size={14} className="animate-spin" />
            </button>
          ) : isGenerating ? (
            <button
              onClick={onStop}
              className="shrink-0 rounded-full w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-90"
              style={{ background: "var(--danger)", color: "var(--on-solid)" }}
              title="停止生成"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => void handleSend()}
              disabled={!connected || (!input.trim() && pendingImages.length === 0)}
              className="shrink-0 rounded-full w-8 h-8 flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-30"
              style={{ background: "var(--accent)", color: "var(--on-solid)" }}
              title={imageMode ? "生成图片" : "发送"}
            >
              <Send size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
