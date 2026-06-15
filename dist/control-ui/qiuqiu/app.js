// QiuQiu Chat - Gateway WebSocket Client
// Connects to RedClaw gateway via WebSocket protocol v4

const PROTOCOL_VERSION = 4;

// --- State ---
let ws = null;
let connected = false;
let connectNonce = null;
let connId = null;
let pendingRequests = new Map(); // id -> { resolve, reject }
let currentRunId = null;
let streamingEl = null;
let streamingText = "";
let requestCounter = 0;

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
  };
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

// --- Utils ---
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  // Simple markdown renderer (no external deps)
  let html = "";
  const lines = text.split("\n");
  let inCode = false;
  let codeBlock = "";
  let inList = false;
  let listType = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks
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

    // Close list if no longer list item
    if (inList && !/^(\s*[-*+]|\s*\d+\.)\s/.test(line) && line.trim() !== "") {
      html += listType === "ul" ? "</ul>" : "</ol>";
      inList = false;
    }

    // Empty line
    if (line.trim() === "") {
      if (inList) { html += listType === "ul" ? "</ul>" : "</ol>"; inList = false; }
      continue;
    }

    // Headers
    const hMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      html += `<h${level}>${inlineFormat(hMatch[2])}</h${level}>`;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      html += `<blockquote>${inlineFormat(line.slice(2))}</blockquote>`;
      continue;
    }

    // Unordered list
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

    // Ordered list
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

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      html += "<hr>";
      continue;
    }

    // Paragraph
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

function addMessage(role, content, opts = {}) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  if (opts.streaming) el.classList.add("streaming");
  if (opts.error) el.classList.add("error");

  if (role === "assistant" || role === "error") {
    el.innerHTML = renderMarkdown(content);
  } else if (role === "system") {
    el.textContent = content;
  } else {
    el.textContent = content;
  }

  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function updateStreamingMessage(text) {
  if (!streamingEl) return;
  streamingEl.innerHTML = renderMarkdown(text);
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

// --- WebSocket Protocol ---
function connectGateway() {
  if (ws) {
    ws.close();
    ws = null;
  }

  setStatus("connecting", "connecting...");
  connected = false;
  connectNonce = null;

  try {
    ws = new WebSocket(config.gatewayUrl);
  } catch (e) {
    setStatus("offline", "invalid URL");
    return;
  }

  ws.onopen = () => {
    setStatus("connecting", "handshake...");
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
    setStatus("offline", "error");
  };

  ws.onclose = (event) => {
    connected = false;
    setStatus("offline", "disconnected");

    // Finalize any streaming message
    if (streamingEl) {
      streamingEl.classList.remove("streaming");
      streamingEl = null;
      streamingText = "";
    }

    // Reject pending requests
    for (const [id, req] of pendingRequests) {
      req.reject(new Error("disconnected"));
    }
    pendingRequests.clear();

    // Auto-reconnect after delay
    setTimeout(() => {
      if (!connected) connectGateway();
    }, 3000);
  };
}

function handleFrame(frame) {
  switch (frame.type) {
    case "event":
      handleEvent(frame);
      break;
    case "res":
      handleResponse(frame);
      break;
  }
}

function handleEvent(frame) {
  const { event, payload } = frame;

  if (event === "connect.challenge") {
    // Server sent challenge, respond with connect request
    connectNonce = payload?.nonce;
    sendConnectRequest();
    return;
  }

  if (event === "chat") {
    handleChatEvent(payload);
    return;
  }

  if (event === "tick") {
    // Heartbeat, ignore
    return;
  }
}

function handleResponse(frame) {
  const { id, ok, payload, error } = frame;
  const pending = pendingRequests.get(id);
  if (pending) {
    pendingRequests.delete(id);
    if (ok) {
      pending.resolve(payload);
    } else {
      pending.reject(error || { message: "Request failed" });
    }
    return;
  }

  // Connect response (handled inline)
  if (ok && payload?.type === "hello-ok") {
    connected = true;
    connId = payload.server?.connId;
    setStatus("online", "connected");
    addMessage("system", "Connected to gateway");
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

  // Register response handler for hello-ok
  pendingRequests.set(id, {
    resolve: (payload) => {
      if (payload?.type === "hello-ok") {
        connected = true;
        connId = payload.server?.connId;
        setStatus("online", "connected");
        addMessage("system", "Connected");
      }
    },
    reject: (err) => {
      setStatus("offline", err?.message || "connect failed");
      addMessage("system", `Connection failed: ${err?.message || "unknown error"}`);
    },
  });

  ws.send(JSON.stringify(frame));
}

function sendRequest(method, params) {
  return new Promise((resolve, reject) => {
    if (!connected || !ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("not connected"));
      return;
    }
    const id = uuid();
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({
      type: "req",
      id,
      method,
      params,
    }));
  });
}

// --- Chat ---
function handleChatEvent(payload) {
  if (!payload) return;
  const { state, deltaText, runId } = payload;

  if (state === "delta" && deltaText) {
    if (!streamingEl) {
      streamingEl = addMessage("assistant", "", { streaming: true });
      streamingText = "";
    }
    streamingText += deltaText;
    updateStreamingMessage(streamingText);
    return;
  }

  if (state === "final") {
    // Extract text from final message if no streaming occurred
    let finalText = streamingText;
    if (!finalText && payload.message) {
      const content = payload.message.content;
      if (typeof content === "string") {
        finalText = content;
      } else if (Array.isArray(content)) {
        finalText = content
          .filter(c => c.type === "text")
          .map(c => c.text)
          .join("\n");
      }
    }
    if (streamingEl) {
      streamingEl.classList.remove("streaming");
      if (finalText) {
        streamingEl.innerHTML = renderMarkdown(finalText);
      }
    } else if (finalText) {
      addMessage("assistant", finalText);
    }
    streamingEl = null;
    streamingText = "";
    currentRunId = null;
    sendBtn.disabled = false;
    return;
  }

  if (state === "aborted") {
    if (streamingEl) {
      streamingEl.classList.remove("streaming");
      if (!streamingText) {
        streamingEl.innerHTML = "<em>(aborted)</em>";
      }
      streamingEl = null;
      streamingText = "";
    }
    currentRunId = null;
    sendBtn.disabled = false;
    return;
  }

  if (state === "error") {
    if (streamingEl) {
      streamingEl.classList.remove("streaming");
      streamingEl = null;
      streamingText = "";
    }
    addMessage("assistant", payload.errorMessage || "An error occurred", { error: true });
    currentRunId = null;
    sendBtn.disabled = false;
    return;
  }
}

async function sendChatMessage(text) {
  if (!text.trim()) return;
  if (!connected) {
    addMessage("system", "Not connected to gateway");
    return;
  }

  addMessage("user", text);
  inputEl.value = "";
  autoResize();
  sendBtn.disabled = true;

  try {
    const result = await sendRequest("chat.send", {
      sessionKey: config.sessionKey,
      message: text,
      idempotencyKey: uuid(),
    });
    currentRunId = result?.runId;
  } catch (err) {
    addMessage("assistant", `Failed to send: ${err?.message || err?.code || "unknown error"}`, { error: true });
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

// --- Init ---
applyBackground();
connectGateway();
