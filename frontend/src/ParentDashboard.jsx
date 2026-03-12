import React, { useEffect, useState } from "react";

const host = window.location.hostname || "127.0.0.1";
const API_BASE = `http://${host}:8000`;
const WS_URL = `ws://${host}:8000/ws/alerts`;

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
        setAlerts(data);
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
        const payload = JSON.parse(event.data);
        const { alert, message } = payload;
        setAlerts((prev) => [
          {
            id: alert.id,
            evidence_id: alert.evidence_id,
            risk: alert.risk,
            created_at: alert.created_at,
            sender_id: message.sender_id,
            receiver_id: message.receiver_id,
            text: message.text,
          },
          ...prev,
        ]);
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
                  <strong>Message:</strong> {alert.text || "Stored alert"}
                </p>
                <p className="alert-meta">
                  <strong>Sender:</strong> {alert.sender_id || "unknown"}{" "}
                  <strong>{"->"} Child:</strong> {alert.receiver_id || "unknown"}
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
