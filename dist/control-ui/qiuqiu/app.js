// QiuQiu Chat - Gateway WebSocket Client
// Connects to RedClaw gateway via WebSocket protocol v4

const PROTOCOL_VERSION = 4;

// --- State ---
let ws = null;
let connected = false;
let connectNonce = null;
let connId = null;
let pendingRequests = new Map();
let currentRunId = null;
let streamingBubble = null;
let streamingText = "";
let typingRow = null;
let nonSystemCount = 0;

// Cumulative session stats (updated from sessions.changed events)
let sessionStats = {
  model: null,
  modelProvider: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  contextTokens: null,
  cacheRead: null,
  cacheWrite: null,
  estimatedCostUsd: null,
  msgCount: 0,
};

// --- Config ---
function loadConfig() {
  const stored = localStorage.getItem("qiuqiu-config");
  if (stored) {
    try { return JSON.parse(stored); } catch {}
  }
  return {
    gatewayUrl: "ws://127.0.0.1:18789",
    sessionKey: "qiuqiu",
    bgImage: null,
    avatar: null,
    theme: "deepblue",
  };
}

// --- Theme ---
const THEMES = ["deepblue", "night", "day", "warm", "aurora"];

function applyTheme(name) {
  if (!THEMES.includes(name)) name = "deepblue";
  config.theme = name;
  document.body.setAttribute("data-theme", name);
  document.querySelectorAll(".swatch").forEach((s) => {
    s.classList.toggle("active", s.dataset.theme === name);
  });
}

function saveConfig(cfg) {
  localStorage.setItem("qiuqiu-config", JSON.stringify(cfg));
}

let config = loadConfig();

// --- DOM refs ---
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const connStatus = document.getElementById("conn-status");
const connLabel = document.getElementById("conn-label");
const bgLayer = document.getElementById("bg-layer");
const settingsOverlay = document.getElementById("settings-overlay");
const emptyState = document.getElementById("empty-state");
const contextPanel = document.getElementById("context-panel");
const ctxToggleBtn = document.getElementById("ctx-toggle");

// --- Utils ---
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function fmtNum(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function setStatus(state, label) {
  connStatus.className = `status-dot ${state}`;
  connLabel.textContent = label || "";
}

function scrollToBottom() {
  const container = document.getElementById("chat-container");
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMarkdown(text) {
  let html = "";
  const lines = text.split("\n");
  let inCode = false;
  let codeBlock = "";
  let inList = false;
  let listType = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCode) {
        html += `<pre><code>${escapeHtml(codeBlock)}</code></pre>`;
        codeBlock = "";
        inCode = false;
      } else {
        if (inList) { html += listType === "ul" ? "</ul>" : "</ol>"; inList = false; }
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBlock += (codeBlock ? "\n" : "") + line;
      continue;
    }

    if (inList && !/^(\s*[-*+]|\s*\d+\.)\s/.test(line) && line.trim() !== "") {
      html += listType === "ul" ? "</ul>" : "</ol>";
      inList = false;
    }

    if (line.trim() === "") {
      if (inList) { html += listType === "ul" ? "</ul>" : "</ol>"; inList = false; }
      continue;
    }

    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      html += `<h${level}>${inlineFormat(hMatch[2])}</h${level}>`;
      continue;
    }

    if (line.startsWith("> ")) {
      html += `<blockquote>${inlineFormat(line.slice(2))}</blockquote>`;
      continue;
    }

    const ulMatch = line.match(/^\s*[-*+]\s+(.+)/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        if (inList) html += listType === "ul" ? "</ul>" : "</ol>";
        html += "<ul>";
        inList = true;
        listType = "ul";
      }
      html += `<li>${inlineFormat(ulMatch[1])}</li>`;
      continue;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inList || listType !== "ol") {
        if (inList) html += listType === "ul" ? "</ul>" : "</ol>";
        html += "<ol>";
        inList = true;
        listType = "ol";
      }
      html += `<li>${inlineFormat(olMatch[1])}</li>`;
      continue;
    }

    if (/^[-*_]{3,}\s*$/.test(line)) {
      html += "<hr>";
      continue;
    }

    html += `<p>${inlineFormat(line)}</p>`;
  }

  if (inCode) html += `<pre><code>${escapeHtml(codeBlock)}</code></pre>`;
  if (inList) html += listType === "ul" ? "</ul>" : "</ol>";
  return html;
}

function inlineFormat(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/_(.+?)_/g, "<em>$1</em>");
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

// --- Empty state ---
function updateEmptyState() {
  emptyState.style.display = nonSystemCount > 0 ? "none" : "";
}

// --- Avatar ---
function buildAvatarEl() {
  const el = document.createElement("div");
  el.className = "msg-avatar";
  if (config.avatar) {
    const img = document.createElement("img");
    img.src = config.avatar;
    el.appendChild(img);
  } else {
    el.textContent = "\u{1F342}";
  }
  return el;
}

function applyAvatarEverywhere() {
  // Update titlebar avatar
  const tba = document.getElementById("titlebar-avatar");
  if (tba) {
    if (config.avatar) {
      tba.innerHTML = `<img src="${config.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      tba.textContent = "\u{1F342}";
    }
  }
  // Update all existing message avatars
  document.querySelectorAll(".msg-avatar").forEach((el) => {
    if (config.avatar) {
      el.innerHTML = `<img src="${config.avatar}">`;
    } else {
      el.innerHTML = "\u{1F342}";
    }
  });
  // Update empty state avatar
  const ea = document.querySelector(".empty-avatar");
  if (ea) {
    if (config.avatar) {
      ea.innerHTML = `<img src="${config.avatar}" style="width:80px;height:80px;object-fit:cover;border-radius:50%;">`;
    } else {
      ea.textContent = "\u{1F342}";
    }
  }
}

// --- Context Panel ---
let ctxVisible = localStorage.getItem("qiuqiu-ctx-visible") !== "false";

function updateContextPanel() {
  if (!ctxVisible) {
    contextPanel.classList.add("hidden");
    ctxToggleBtn.textContent = "上下文";
    return;
  }
  contextPanel.classList.remove("hidden");
  ctxToggleBtn.textContent = "收起";

  const s = sessionStats;
  const modelLabel = s.model
    ? (s.modelProvider ? `${s.modelProvider}/${s.model}` : s.model)
    : "—";

  const totalTok = s.totalTokens;
  const ctxTok = s.contextTokens;
  const pct = (totalTok != null && ctxTok != null && ctxTok > 0)
    ? Math.min(999, Math.round((totalTok / ctxTok) * 100))
    : null;
  const tokLine = totalTok != null
    ? `Total ${fmtNum(totalTok)} tokens${ctxTok != null ? ` / ${fmtNum(ctxTok)} ctx` : ""}${pct != null ? ` · ${pct}%` : ""}`
    : "Total — tokens";

  const inOut = (s.inputTokens != null || s.outputTokens != null)
    ? `In ${fmtNum(s.inputTokens)} · Out ${fmtNum(s.outputTokens)}`
    : null;

  const cacheRead = s.cacheRead;
  const cacheWrite = s.cacheWrite;
  let cacheLine = null;
  if (cacheRead != null && cacheWrite != null) {
    const total = cacheRead + cacheWrite;
    const hitRate = total > 0 ? Math.round((cacheRead / total) * 100) : 0;
    cacheLine = `Cache ${fmtNum(cacheRead)} · Hit ${hitRate}%`;
  } else if (cacheRead != null) {
    cacheLine = `Cache ${fmtNum(cacheRead)}`;
  }

  let costLine = null;
  if (s.estimatedCostUsd != null && s.estimatedCostUsd >= 0) {
    const cny = s.estimatedCostUsd * 7.25;
    if (cny >= 0.01) {
      costLine = `¥${cny.toFixed(2)}`;
    } else if (cny > 0) {
      costLine = `¥${cny.toFixed(4)}`;
    }
    if (costLine && s.msgCount > 0) {
      costLine += ` · ${s.msgCount} msgs`;
    }
  } else if (s.msgCount > 0) {
    costLine = `${s.msgCount} msgs`;
  }

  const rows = [
    { label: "模型", value: modelLabel },
    { label: "上下文", value: tokLine },
    ...(inOut ? [{ label: "用量", value: inOut }] : []),
    ...(cacheLine ? [{ label: "缓存", value: cacheLine }] : []),
    ...(costLine ? [{ label: "费用", value: costLine }] : []),
  ];

  document.getElementById("ctx-rows").innerHTML = rows
    .map(r => `<div class="ctx-row"><span class="ctx-key">${r.label}</span><span class="ctx-val">${r.value}</span></div>`)
    .join("");
}

ctxToggleBtn.addEventListener("click", () => {
  ctxVisible = !ctxVisible;
  localStorage.setItem("qiuqiu-ctx-visible", String(ctxVisible));
  updateContextPanel();
});

// --- Messages ---
function addMessage(role, content, opts = {}) {
  const row = document.createElement("div");
  row.className = `message-row ${role}`;

  if (role === "system") {
    const sysEl = document.createElement("div");
    sysEl.className = "system-msg";
    sysEl.textContent = content;
    row.appendChild(sysEl);
    messagesEl.appendChild(row);
    scrollToBottom();
    return { row, bubble: null };
  }

  if (role === "assistant") {
    row.appendChild(buildAvatarEl());
  }

  const col = document.createElement("div");
  col.className = "msg-col";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (opts.error) bubble.classList.add("error");

  if (role === "assistant") {
    bubble.innerHTML = content ? renderMarkdown(content) : "";
  } else {
    bubble.textContent = content;
  }

  col.appendChild(bubble);

  const timeEl = document.createElement("div");
  timeEl.className = "msg-time";
  timeEl.textContent = formatTime(new Date());
  col.appendChild(timeEl);

  row.appendChild(col);
  messagesEl.appendChild(row);

  nonSystemCount++;
  sessionStats.msgCount++;
  updateEmptyState();
  scrollToBottom();

  return { row, bubble, col };
}

function showTypingIndicator() {
  if (typingRow) return;

  const row = document.createElement("div");
  row.className = "message-row assistant";
  row.appendChild(buildAvatarEl());

  const col = document.createElement("div");
  col.className = "msg-col";

  const bubble = document.createElement("div");
  bubble.className = "bubble typing-bubble";
  bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  col.appendChild(bubble);
  row.appendChild(col);
  messagesEl.appendChild(row);

  typingRow = row;
  scrollToBottom();
}

function hideTypingIndicator() {
  if (typingRow) {
    typingRow.remove();
    typingRow = null;
  }
}

function updateStreamingMessage(text) {
  if (!streamingBubble) return;
  streamingBubble.innerHTML = renderMarkdown(text);
  scrollToBottom();
}

// --- Background ---
function applyBackground() {
  if (config.bgImage) {
    bgLayer.style.backgroundImage = `url(${config.bgImage})`;
    bgLayer.classList.add("active");
  } else {
    bgLayer.style.backgroundImage = "";
    bgLayer.classList.remove("active");
  }
}

// --- Theme picker click handlers ---
document.querySelectorAll(".swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    applyTheme(btn.dataset.theme);
    saveConfig(config);
  });
});

// --- WebSocket Protocol ---
function connectGateway() {
  if (ws) {
    ws.close();
    ws = null;
  }

  setStatus("connecting", "连接中...");
  connected = false;
  connectNonce = null;

  try {
    ws = new WebSocket(config.gatewayUrl);
  } catch (e) {
    setStatus("offline", "地址无效");
    return;
  }

  ws.onopen = () => {
    setStatus("connecting", "握手中...");
  };

  ws.onmessage = (event) => {
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch {
      return;
    }
    handleFrame(frame);
  };

  ws.onerror = () => {
    setStatus("offline", "连接错误");
  };

  ws.onclose = () => {
    connected = false;
    setStatus("offline", "已断开");

    hideTypingIndicator();
    if (streamingBubble) {
      streamingBubble = null;
      streamingText = "";
      currentRunId = null;
      sendBtn.disabled = false;
    }

    for (const [, req] of pendingRequests) {
      req.reject(new Error("disconnected"));
    }
    pendingRequests.clear();

    setTimeout(() => {
      if (!connected) connectGateway();
    }, 3000);
  };
}

function handleFrame(frame) {
  switch (frame.type) {
    case "event": handleEvent(frame); break;
    case "res": handleResponse(frame); break;
  }
}

function handleEvent(frame) {
  const { event, payload } = frame;

  if (event === "connect.challenge") {
    connectNonce = payload?.nonce;
    sendConnectRequest();
    return;
  }

  if (event === "chat") {
    handleChatEvent(payload);
    return;
  }

  if (event === "sessions.changed") {
    handleSessionsChanged(payload);
    return;
  }
  // tick and other heartbeats: ignore
}

function handleResponse(frame) {
  const { id, ok, payload, error } = frame;
  const pending = pendingRequests.get(id);
  if (pending) {
    pendingRequests.delete(id);
    if (ok) {
      pending.resolve(payload);
    } else {
      pending.reject(error || { message: "请求失败" });
    }
    return;
  }

  if (ok && payload?.type === "hello-ok") {
    connected = true;
    connId = payload.server?.connId;
    setStatus("online", "已连接");
    // Subscribe to session events to receive stats updates
    subscribeSessionEvents();
  }
}

function sendConnectRequest() {
  const id = uuid();
  const frame = {
    type: "req",
    id,
    method: "connect",
    params: {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: "openclaw-control-ui",
        displayName: "QiuQiu",
        version: "1.0.0",
        platform: navigator.platform || "win32",
        mode: "ui",
      },
      role: "operator",
      scopes: ["operator.admin"],
      auth: {},
    },
  };

  pendingRequests.set(id, {
    resolve: (payload) => {
      if (payload?.type === "hello-ok") {
        connected = true;
        connId = payload.server?.connId;
        setStatus("online", "已连接");
        subscribeSessionEvents();
      }
    },
    reject: (err) => {
      setStatus("offline", err?.message || "连接失败");
    },
  });

  ws.send(JSON.stringify(frame));
}

function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("未连接"));
      return;
    }
    const id = uuid();
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

// --- Session events subscription ---
async function subscribeSessionEvents() {
  try {
    await sendRequest("sessions.subscribe", {});
  } catch {
    // Non-critical; stats won't update in real time
  }
}

function handleSessionsChanged(payload) {
  if (!payload) return;
  // Filter to only our session
  const key = payload.sessionKey ?? payload.key;
  if (key && key !== config.sessionKey) return;

  // Merge stats from payload
  const entry = payload.entry ?? payload;
  if (!entry || typeof entry !== "object") return;

  const pick = (field) => (entry[field] != null ? entry[field] : sessionStats[field]);
  sessionStats.model = pick("model");
  sessionStats.modelProvider = pick("modelProvider");
  sessionStats.inputTokens = pick("inputTokens");
  sessionStats.outputTokens = pick("outputTokens");
  sessionStats.totalTokens = pick("totalTokens");
  sessionStats.contextTokens = pick("contextTokens");
  sessionStats.cacheRead = pick("cacheRead");
  sessionStats.cacheWrite = pick("cacheWrite");
  sessionStats.estimatedCostUsd = pick("estimatedCostUsd");

  updateContextPanel();
}

// Fallback: fetch session stats via sessions.list after each reply
async function fetchSessionStats() {
  try {
    const result = await sendRequest("sessions.list", {
      limit: 1,
      search: config.sessionKey,
      includeGlobal: false,
      includeUnknown: false,
    });
    const sessions = result?.sessions ?? result?.entries ?? [];
    const entry = sessions.find(s => s.key === config.sessionKey) ?? sessions[0];
    if (!entry) return;

    sessionStats.model = entry.model ?? sessionStats.model;
    sessionStats.modelProvider = entry.modelProvider ?? sessionStats.modelProvider;
    sessionStats.inputTokens = entry.inputTokens ?? sessionStats.inputTokens;
    sessionStats.outputTokens = entry.outputTokens ?? sessionStats.outputTokens;
    sessionStats.totalTokens = entry.totalTokens ?? sessionStats.totalTokens;
    sessionStats.contextTokens = entry.contextTokens ?? sessionStats.contextTokens;
    sessionStats.cacheRead = entry.cacheRead ?? sessionStats.cacheRead;
    sessionStats.cacheWrite = entry.cacheWrite ?? sessionStats.cacheWrite;
    sessionStats.estimatedCostUsd = entry.estimatedCostUsd ?? sessionStats.estimatedCostUsd;

    updateContextPanel();
  } catch {
    // Non-critical
  }
}

// --- Chat ---
function handleChatEvent(payload) {
  if (!payload) return;
  const { state, deltaText, runId } = payload;

  // Only process events belonging to this page's active request.
  // This prevents TUI streaming responses from leaking into the web page.
  if (!currentRunId) return;
  if (runId && runId !== currentRunId) return;

  if (state === "delta" && deltaText) {
    if (!streamingBubble) {
      hideTypingIndicator();
      const { bubble } = addMessage("assistant", "");
      streamingBubble = bubble;
      streamingText = "";
    }
    streamingText += deltaText;
    updateStreamingMessage(streamingText);
    return;
  }

  if (state === "final") {
    let finalText = streamingText;
    if (!finalText && payload.message) {
      const content = payload.message.content;
      if (typeof content === "string") {
        finalText = content;
      } else if (Array.isArray(content)) {
        finalText = content.filter(c => c.type === "text").map(c => c.text).join("\n");
      }
    }
    hideTypingIndicator();
    if (streamingBubble) {
      if (finalText) streamingBubble.innerHTML = renderMarkdown(finalText);
      const col = streamingBubble.closest(".msg-col");
      if (col && !col.querySelector(".msg-time")) {
        const timeEl = document.createElement("div");
        timeEl.className = "msg-time";
        timeEl.textContent = formatTime(new Date());
        col.appendChild(timeEl);
      }
    } else if (finalText) {
      addMessage("assistant", finalText);
    }
    streamingBubble = null;
    streamingText = "";
    currentRunId = null;
    sendBtn.disabled = false;
    // Fetch stats after reply (fallback if sessions.subscribe didn't deliver)
    void fetchSessionStats();
    return;
  }

  if (state === "aborted") {
    hideTypingIndicator();
    if (streamingBubble) {
      if (!streamingText) streamingBubble.innerHTML = "<em style='opacity:0.5'>(已中断)</em>";
      streamingBubble = null;
      streamingText = "";
    }
    currentRunId = null;
    sendBtn.disabled = false;
    return;
  }

  if (state === "error") {
    hideTypingIndicator();
    if (streamingBubble) {
      streamingBubble = null;
      streamingText = "";
    }
    addMessage("assistant", payload.errorMessage || "发生了错误", { error: true });
    currentRunId = null;
    sendBtn.disabled = false;
    return;
  }
}

async function sendChatMessage(text) {
  if (!text.trim()) return;
  if (!connected) {
    addMessage("system", "未连接到 gateway");
    return;
  }

  addMessage("user", text);
  inputEl.value = "";
  autoResize();
  sendBtn.disabled = true;

  showTypingIndicator();

  try {
    const result = await sendRequest("chat.send", {
      sessionKey: config.sessionKey,
      message: text,
      idempotencyKey: uuid(),
    });
    currentRunId = result?.runId;
    if (!currentRunId) {
      hideTypingIndicator();
      sendBtn.disabled = false;
    }
  } catch (err) {
    hideTypingIndicator();
    addMessage("assistant", `发送失败：${err?.message || err?.code || "未知错误"}`, { error: true });
    currentRunId = null;
    sendBtn.disabled = false;
  }
}

// --- Input handling ---
function autoResize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
}

inputEl.addEventListener("input", autoResize);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage(inputEl.value);
  }
});
sendBtn.addEventListener("click", () => {
  sendChatMessage(inputEl.value);
});

// --- Settings ---
document.querySelector(".titlebar-status").addEventListener("click", () => {
  document.getElementById("cfg-gateway-url").value = config.gatewayUrl;
  document.getElementById("cfg-session-key").value = config.sessionKey;
  settingsOverlay.classList.remove("hidden");
});

document.getElementById("cfg-close").addEventListener("click", () => {
  settingsOverlay.classList.add("hidden");
});

document.getElementById("cfg-save").addEventListener("click", () => {
  config.gatewayUrl = document.getElementById("cfg-gateway-url").value.trim();
  config.sessionKey = document.getElementById("cfg-session-key").value.trim() || "qiuqiu";
  saveConfig(config);
  settingsOverlay.classList.add("hidden");
  connectGateway();
});

document.getElementById("cfg-clear-bg").addEventListener("click", () => {
  config.bgImage = null;
  saveConfig(config);
  applyBackground();
});

document.getElementById("cfg-bg-image").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    config.bgImage = reader.result;
    saveConfig(config);
    applyBackground();
  };
  reader.readAsDataURL(file);
});

document.getElementById("cfg-avatar-img").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    config.avatar = reader.result;
    saveConfig(config);
    applyAvatarEverywhere();
  };
  reader.readAsDataURL(file);
});

document.getElementById("cfg-clear-avatar").addEventListener("click", () => {
  config.avatar = null;
  saveConfig(config);
  applyAvatarEverywhere();
});

// --- Init ---
applyTheme(config.theme || "deepblue");
applyBackground();
applyAvatarEverywhere();
updateEmptyState();
updateContextPanel();
connectGateway();
