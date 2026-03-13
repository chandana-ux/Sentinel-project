import React, { useEffect, useRef, useState } from "react";

const API_BASE = "https://sentinel-project-la8l.onrender.com";
const CHAT_WS_URL = "wss://sentinel-project-la8l.onrender.com/ws/chat";
const DANGEROUS_WORDS = [
  "send me your photo",
  "send pic",
  "send selfie",
  "dont tell your parents",
  "where do you live",
];

export default function ChildChat({ session }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const wsRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const currentRole = session?.role === "adult" ? "adult" : "child";
  const otherRole = currentRole === "adult" ? "child" : "adult";

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
        setMessages((prev) => {
          if (payload.type === "message_update") {
            return prev.map((message) =>
              message.id === payload.id
                ? {
                    ...message,
                    text: payload.text,
                    approval_status: payload.approval_status,
                    warning: payload.warning ?? undefined,
                  }
                : message
            );
          }

          return [...prev, payload];
        });
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

  const scanImage = async (imageData) => {
    const res = await fetch(`${API_BASE}/scan-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: imageData,
      }),
    });

    return res.json();
  };

  const handleImageFile = (file) => {
    if (!file) {
      return;
    }

    const role = currentRole;

    const reader = new FileReader();
    reader.onload = async () => {
      const imageData = reader.result;
      let risk = "SAFE";
      let reason = "No unsafe image detected";
      let blocked = false;

      try {
        const data = await scanImage(imageData);
        risk = data.risk ?? risk;
        reason = data.reason ?? reason;
        blocked = Boolean(data.blocked);
      } catch (err) {
        console.error(err);
        reason = "Image scan failed";
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `image-${Date.now()}`,
          sender: role,
          text: blocked ? "[Image blocked]" : "[Image sent]",
          image: blocked ? null : imageData,
          risk,
          warning: blocked ? reason : undefined,
          blocked,
        },
      ]);
    };

    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const handlePaste = (event) => {
      const items = event.clipboardData?.items ?? [];

      for (const item of items) {
        if (item.type.includes("image")) {
          handleImageFile(item.getAsFile());
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    handleImageFile(file);
    event.target.value = "";
  };

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!text.trim()) return;

    const rawText = text.trim();
    const msg = rawText.toLowerCase();
    const role = currentRole;

    try {
      const res = await fetch(`${API_BASE}/analyze-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender_id: session?.name ?? role,
          receiver_id: otherRole,
          message: rawText,
        }),
      });

      const data = await res.json();
      const payload = {
        id: data.id,
        sender: role,
        text: data.message ?? rawText,
        approval_status: data.approval_status,
      };

      if (data.approval_required) {
        payload.warning = "Message flagged as risky. Parent approval required.";
      } else if (data.risk === "HIGH") {
        payload.warning = "This message may be dangerous.";
      } else if (data.risk === "MEDIUM" || DANGEROUS_WORDS.some((word) => msg.includes(word))) {
        payload.warning = "This message was flagged and the parent notification was sent.";
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      } else {
        setMessages((prev) => [...prev, payload]);
        setError("Live chat is reconnecting. Your message was shown locally and parent checks still ran.");
      }

      setText("");
    } catch (err) {
      console.error(err);
      setError("Message failed.");
    }
  };

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
            const role = m.sender === currentRole ? "current-user" : "other-user";
            const senderLabel = m.sender === currentRole ? currentRole : otherRole;
            return (
              <div key={i} className={`message ${role}`}>
                <div className="bubble">
                  <div className="sender">{senderLabel === "adult" ? "Adult" : "Child"}</div>
                  {m.text}
                  {m.image && <img src={m.image} className="chat-image" alt="Pasted chat content" />}
                  {m.warning && <div className="warning">Warning: {m.warning}</div>}
                </div>
              </div>
            );
          })}
        </div>

        <form className="chat-input" onSubmit={sendMessage}>
          <input
            ref={galleryInputRef}
            className="media-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
          />
          <input
            ref={cameraInputRef}
            className="media-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
          />
          <button type="button" className="media-button" onClick={() => galleryInputRef.current?.click()}>
            Gallery
          </button>
          <button type="button" className="media-button" onClick={() => cameraInputRef.current?.click()}>
            Camera
          </button>
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
