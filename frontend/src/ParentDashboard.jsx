import React, { useEffect, useState } from "react";

const API_BASE = "https://sentinel-project-la8l.onrender.com";
const WS_URL = "wss://sentinel-project-la8l.onrender.com/ws/alerts";

const normalizeAlert = (item) => {
  if (item.alert && item.message) {
    return {
      id: item.alert.id,
      risk: item.alert.risk,
      created_at: item.alert.created_at,
      sender_id: item.message.sender_id,
      receiver_id: item.message.receiver_id,
      text: item.message.text,
      reason: item.message.reason,
    };
  }

  return {
    id: item.id ?? Date.now(),
    risk: item.risk,
    created_at: item.created_at,
    sender_id: item.sender_id ?? item.sender ?? "unknown",
    receiver_id: item.receiver_id ?? item.receiver ?? "unknown",
    text: item.text ?? item.message ?? "Stored alert",
    reason: item.reason ?? "",
  };
};

const ParentDashboard = () => {
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const res = await fetch(`${API_BASE}/alerts`);
        if (!res.ok) {
          throw new Error(`Failed to load alerts: ${res.status}`);
        }
        const data = await res.json();
        setAlerts(data.map(normalizeAlert));
      } catch (err) {
        console.error("Failed to load alerts", err);
      }
    };

    loadAlerts();

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setConnected(true);
      ws.send("parent_connected");
    };

    ws.onmessage = (event) => {
      try {
        const alert = JSON.parse(event.data);
        console.log("Parent alert", alert);
        setAlerts((prev) => [normalizeAlert(alert), ...prev]);
      } catch (err) {
        console.error("Failed to parse WebSocket message", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="panel">
      <h2>Parent Dashboard</h2>
      <p className="panel-subtitle">
        Live alerts for suspicious or harmful messages. This simulates what a
        parent would see on their phone.
      </p>

      <div className="status-row">
        <span
          className={`status-indicator ${connected ? "online" : "offline"}`}
        />
        <span>
          WebSocket:{" "}
          <strong>{connected ? "Connected (real-time alerts ON)" : "Offline"}</strong>
        </span>
      </div>

      <div className="alerts-list">
        {alerts.length === 0 ? (
          <div className="empty-state">
            No alerts yet. Send a risky message like{" "}
            <code>Send me your photo</code> in the child chat tab.
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-card alert-${alert.risk.toLowerCase()}`}
            >
              <div className="alert-header">
                <span className={`badge badge-${alert.risk.toLowerCase()}`}>
                  {alert.risk}
                </span>
                <span className="alert-time">
                  {alert.created_at
                    ? new Date(alert.created_at).toLocaleTimeString()
                    : ""}
                </span>
              </div>
              <div className="alert-body">
                <p className="alert-message">
                  <strong>Message:</strong> {alert.text}
                </p>
                <p className="alert-meta">
                  <strong>Sender:</strong> {alert.sender_id} <strong>{"->"} Child:</strong>{" "}
                  {alert.receiver_id}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ParentDashboard;
