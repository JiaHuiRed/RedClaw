import m from "mithril"
import comData from "./comData.js"
import chatData from "../view/chat/chatData.js"
import Notice from "../view/common/notice.js"

const SESSION_KEY = "agent:main:main"
const RECONNECT_DELAY = 2000

export default {
  ws: null,
  connected: false,
  running: false,
  reconnectTimer: null,
  pendingReqs: {},

  config: {
    url: "ws://127.0.0.1:18789",
    token: "",
  },

  configure(url, token) {
    if (url) this.config.url = url
    if (token !== undefined) this.config.token = token
  },

  start() {
    if (this.running) return
    this.running = true
    this._connect()
  },

  stop() {
    this.running = false
    clearTimeout(this.reconnectTimer)
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  },

  _connect() {
    if (!this.running) return
    this.ws = new WebSocket(this.config.url)

    this.ws.onopen = () => {
      setTimeout(() => this._sendConnect(), 750)
    }

    this.ws.onmessage = (event) => {
      let frame
      try {
        frame = JSON.parse(event.data)
      } catch {
        return
      }
      this._handleFrame(frame)
    }

    this.ws.onclose = () => {
      this.connected = false
      if (this.running) {
        this.reconnectTimer = setTimeout(() => this._connect(), RECONNECT_DELAY)
      }
    }
  },

  _sendConnect() {
    this._request("connect", {
      minProtocol: 4,
      maxProtocol: 4,
      client: {
        id: "openclaw-control-ui",
        version: "0.1.0",
        platform: "web",
        mode: "webchat",
      },
      role: "operator",
      scopes: ["operator.read", "operator.write"],
      auth: { token: this.config.token },
      locale: navigator.language || "zh-CN",
    })
      .then((res) => {
        if (res.ok) {
          this.connected = true
          console.log("[Gateway] connected")
          m.redraw()
        }
      })
      .catch((err) => {
        console.error("[Gateway] connect failed:", err)
      })
  },

  _handleFrame(frame) {
    if (frame.type === "event") {
      if (frame.event === "connect.challenge") {
        this._sendConnect()
        return
      }
      if (frame.event === "chat") {
        this._handleChatEvent(frame.payload)
        return
      }
      return
    }
    if (frame.type === "res") {
      const pending = this.pendingReqs[frame.id]
      if (pending) {
        delete this.pendingReqs[frame.id]
        if (frame.ok) {
          pending.resolve(frame)
        } else {
          pending.reject(
            new Error(frame.error?.message || "Gateway error")
          )
        }
      }
    }
  },

  _handleChatEvent(payload) {
    if (!payload) return
    const { state, sessionKey, message, deltaText, errorMessage } = payload
    if (sessionKey && sessionKey !== SESSION_KEY) return

    switch (state) {
      case "delta":
        this._onDelta(deltaText || "", message)
        break
      case "final":
        this._onFinal(message)
        break
      case "aborted":
        this._onAborted()
        break
      case "error":
        this._onError(errorMessage || "Unknown error")
        break
    }
  },

  _onDelta(text, message) {
    const data = comData.data.get()
    const mainList = data?.chatLists?.find((l) => l.id === 0)
    if (mainList) {
      mainList.replying = true
      mainList.streamDisplayContent = text
      mainList.streamReasoningChunks = message?.reasoning || ""
    }
    m.redraw()
  },

  _onFinal(message) {
    const data = comData.data.get()
    const mainList = data?.chatLists?.find((l) => l.id === 0)
    if (mainList) {
      mainList.replying = false
      mainList.streamDisplayContent = ""
      mainList.streamReasoningChunks = ""
    }

    const aiText =
      message?.text ||
      message?.content
        ?.filter((c) => c.type === "text")
        ?.map((c) => c.text)
        ?.join("") ||
      ""

    chatData.addGatewayMessage({
      uuid: crypto.randomUUID(),
      name: "AI",
      content: aiText,
      group: "assistant",
      timestamp: Date.now(),
      reasoning: message?.reasoning || "",
    })

    chatData.preparing = false
    m.redraw()
  },

  _onAborted() {
    const data = comData.data.get()
    const mainList = data?.chatLists?.find((l) => l.id === 0)
    if (mainList) {
      mainList.replying = false
      mainList.streamDisplayContent = ""
      mainList.streamReasoningChunks = ""
    }
    chatData.preparing = false
    m.redraw()
  },

  _onError(errMsg) {
    const data = comData.data.get()
    const mainList = data?.chatLists?.find((l) => l.id === 0)
    if (mainList) {
      mainList.replying = false
      mainList.streamDisplayContent = ""
      mainList.streamReasoningChunks = ""
    }
    chatData.preparing = false
    Notice.launch({ msg: "Gateway error: " + errMsg, timeout: 5000, color: "red" })
    m.redraw()
  },

  _request(method, params) {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      this.pendingReqs[id] = { resolve, reject }
      const frame = JSON.stringify({ type: "req", id, method, params })
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(frame)
      } else {
        reject(new Error("WebSocket not connected"))
        delete this.pendingReqs[id]
      }
    })
  },

  async sendMessage(text) {
    if (!this.connected) throw new Error("Gateway not connected")
    const idempotencyKey = crypto.randomUUID()
    await this._request("chat.send", {
      sessionKey: SESSION_KEY,
      message: text,
      deliver: false,
      idempotencyKey,
    })
  },
}
