import React, { useState } from "react";

const API_BASE = `http://${window.location.hostname || "127.0.0.1"}:8000`;

const ChildChat = () => {
  const [senderId] = useState("userB");
  const [receiverId] = useState("childA");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setError("");
    setLoading(true);

    const text = input.trim();
    setInput("");

    try {
      const res = await fetch(`${API_BASE}/analyze-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_id: senderId,
          receiver_id: receiverId,
          message: text,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to analyze message: ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: senderId,
          text,
          risk: data.risk,
          reason: data.reason,
        },
      ]);
    } catch (err) {
      console.error(err);
      setError(
        "Could not contact safety layer. Check that the backend is running on port 8000."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h2>Child Chat View</h2>
      <p className="panel-subtitle">
        Simulated chat between <strong>{senderId}</strong> and child{" "}
        <strong>{receiverId}</strong>. Each message is checked by the safety
        layer.
      </p>

      <div className="chat-window">
        {messages.length === 0 && (
          <div className="empty-state">
            Start typing messages like <code>Send me your photo</code> or{" "}
            <code>You are stupid</code> to see the safety response.
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chat-message ${
              message.risk === "HIGH"
                ? "high-risk"
                : message.risk === "MEDIUM"
                  ? "medium-risk"
                  : "safe"
            }`}
          >
            <div className="chat-text">{message.text}</div>
            <div className="chat-meta">
              <span className={`badge badge-${message.risk.toLowerCase()}`}>
                {message.risk}
              </span>
              {message.risk !== "SAFE" && (
                <span className="chat-reason">Warning: {message.reason}</span>
              )}
              {message.risk === "HIGH" && (
                <span className="chat-delay">
                  Message under safety review (delayed for child)
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Type a message to the child..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Checking..." : "Send"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
};

export default ChildChat;
