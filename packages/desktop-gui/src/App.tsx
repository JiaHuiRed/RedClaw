import { useState, useEffect } from "react";
import ChatPanel from "./components/ChatPanel";
import CodePanel from "./components/CodePanel";
import Sidebar from "./components/Sidebar";
import { gateway, type Message, type SessionInfo, type CommandEntry } from "./gateway/client";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [showCodePanel, setShowCodePanel] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>(gateway.sessionInfo);
  const [commands, setCommands] = useState<CommandEntry[]>(gateway.commands);

  useEffect(() => {
    const unsubInfo = gateway.onSessionInfo((info) => setSessionInfo(info));
    const unsubCmds = gateway.onCommands((cmds) => setCommands(cmds));
    return () => {
      unsubInfo();
      unsubCmds();
    };
  }, []);

  return (
    <div className="flex h-screen w-screen">
      <Sidebar connected={connected} />
      <ChatPanel
        connected={connected}
        setConnected={setConnected}
        messages={messages}
        setMessages={setMessages}
        streamingText={streamingText}
        setStreamingText={setStreamingText}
        sessionInfo={sessionInfo}
        commands={commands}
        onToggleCode={() => setShowCodePanel((v) => !v)}
      />
      {showCodePanel && <CodePanel onClose={() => setShowCodePanel(false)} />}
    </div>
  );
}
