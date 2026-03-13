import React, { useEffect, useRef, useState } from "react";

const API_BASE = "https://sentinel-project-la8l.onrender.com";
const CHAT_WS_URL = "wss://sentinel-project-la8l.onrender.com/ws/chat";

export default function ChildChat() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(CHAT_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Chat socket connected");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log("New chat message", payload);
        setMessages((prev) => [...prev, payload]);
      } catch (err) {
        console.error("Invalid chat payload", err);
      }
    };

    ws.onerror = () => {
      setError("Live chat connection failed.");
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!text.trim()) return;

    const msg = text.trim();
    setText("");
    setError("");

    try {
      const res = await fetch(`${API_BASE}/analyze-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender_id: "userA",
          receiver_id: "childA",
          message: msg,
        }),
      });

      if (!res.ok) {
        throw new Error(`Analyze failed: ${res.status}`);
      }

      const data = await res.json();

      const payload = {
        sender: "userA",
        text: msg,
        risk: data.risk,
        reason: data.reason,
      };

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      } else {
        setMessages((prev) => [...prev, payload]);
      }
    } catch (err) {
      console.error(err);
      setError("Could not contact safety layer.");
    }
  };

  return (
    <div className="chat-app">
      <div className="chat-header">Child Safety Chat</div>

      <div className="chat-window">
        {messages.map((m, i) => (
          <div key={`${m.text}-${i}`} className={`msg ${m.risk.toLowerCase()}`}>
            <div className="msg-text">{m.text}</div>
            {m.risk !== "SAFE" && (
              <div className="msg-warning">Warning: {m.reason}</div>
            )}
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={sendMessage}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type message..."
        />

        <button type="submit">Send</button>
      </form>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
