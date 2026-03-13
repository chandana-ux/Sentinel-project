import React, { useEffect, useRef, useState } from "react";

const API_BASE = "https://sentinel-project-la8l.onrender.com";
const CHAT_WS_URL = "wss://sentinel-project-la8l.onrender.com/ws/chat";
const PARTICIPANTS = {
  userA: {
    label: "Person A",
    avatar: "https://i.pravatar.cc/40?img=1",
  },
  userB: {
    label: "Person B",
    avatar: "https://i.pravatar.cc/40?img=2",
  },
};

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

  useEffect(() => {
    const handlePaste = (event) => {
      const items = event.clipboardData?.items ?? [];

      for (const item of items) {
        if (!item.type.includes("image")) {
          continue;
        }

        const file = item.getAsFile();
        if (!file) {
          continue;
        }

        const reader = new FileReader();
        reader.onload = () => {
          setMessages((prev) => [
            ...prev,
            {
              sender: "userA",
              text: "[Image sent]",
              image: reader.result,
            },
          ]);
        };

        reader.readAsDataURL(file);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!text.trim()) return;

    const msg = text.trim();
    setText("");

    const payload = {
      sender: "userA",
      text: msg,
    };

    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      }

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

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          sender: "userA",
          text: msg,
          risk: data.risk,
          reason: data.reason,
        },
      ]);
    } catch (err) {
      console.error(err);
      setError("Message failed.");
    }
  };

  const getParticipant = (sender) => PARTICIPANTS[sender] ?? PARTICIPANTS.userB;

  return (
    <div className="app-layout">
      <div className="sidebar">
        <h2>Chats</h2>

        <div className="chat-user active">
          <img src="https://i.pravatar.cc/40?img=1" alt="Friend 1" />
          <span>Friend 1</span>
        </div>

        <div className="chat-user">
          <img src="https://i.pravatar.cc/40?img=2" alt="Friend 2" />
          <span>Friend 2</span>
        </div>

        <div className="chat-user">
          <img src="https://i.pravatar.cc/40?img=3" alt="Friend 3" />
          <span>Friend 3</span>
        </div>
      </div>

      <div className="chat-main">
        <div className="chat-header">
          <h3>Child Safety Chat</h3>
          <span className="status">Online</span>
        </div>

        <div className="chat-window">
          {messages.map((m, i) => {
            const participant = getParticipant(m.sender);

            return (
              <div key={i} className={`message ${m.sender === "userA" ? "sent" : "received"}`}>
                <img
                  className="avatar"
                  src={participant.avatar}
                  alt={participant.label}
                />

                <div className="bubble">
                  <div className="name">{participant.label}</div>
                  {m.text}
                  {m.image && <img src={m.image} className="chat-image" alt="Pasted chat content" />}
                </div>
              </div>
            );
          })}
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

      <div className="info-panel">
        <h3>Chat Info</h3>
        <p>Child protection active</p>
        <p>Safety AI monitoring</p>
      </div>
    </div>
  );
}
