import React, { useEffect, useState } from "react";
import ChildChat from "./ChildChat.jsx";
import ParentDashboard from "./ParentDashboard.jsx";

const DEMO_PARENT_PIN = "1234";
const API_BASE = "https://sentinel-project-la8l.onrender.com";

const App = () => {
  const [approvalPage, setApprovalPage] = useState(null);
  const [role, setRole] = useState("child");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState("");
  const [session, setSession] = useState(null);
  const [view, setView] = useState("child");

  useEffect(() => {
    const match = window.location.pathname.match(/^\/(approve|block)\/(\d+)$/);
    if (!match) {
      return;
    }

    const [, action, id] = match;
    const runApproval = async () => {
      try {
        const res = await fetch(`${API_BASE}/${action}/${id}`);
        const data = await res.json();
        setApprovalPage({
          state: "done",
          action,
          id,
          status: data.status,
        });
      } catch (err) {
        console.error(err);
        setApprovalPage({
          state: "error",
          action,
          id,
        });
      }
    };

    setApprovalPage({
      state: "loading",
      action,
      id,
    });
    runApproval();
  }, []);

  if (approvalPage) {
    const actionLabel = approvalPage.action === "approve" ? "approved" : "blocked";

    return (
      <div className="app auth-shell">
        <div className="login-card approval-card">
          <div className="login-copy">
            <p className="eyebrow">Sentinel Parent Approval</p>
            <h1>
              {approvalPage.state === "loading" && "Updating message status..."}
              {approvalPage.state === "done" && `Message ${actionLabel}.`}
              {approvalPage.state === "error" && "Could not update message status."}
            </h1>
            <p>
              {approvalPage.state === "done" &&
                `Message ID ${approvalPage.id} is now marked as ${approvalPage.status}.`}
              {approvalPage.state === "loading" &&
                `Applying your ${approvalPage.action} action for message ID ${approvalPage.id}.`}
              {approvalPage.state === "error" &&
                "Please retry from the SMS link or open the parent dashboard manually."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleLogin = (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setAuthError("Enter a display name to continue.");
      return;
    }

    if (role === "parent" && pin !== DEMO_PARENT_PIN) {
      setAuthError("Parent PIN is incorrect. Use 1234 for the demo.");
      return;
    }

    setSession({
      role,
      name: name.trim(),
    });
    setView(role === "parent" ? "parent" : "child");
    setAuthError("");
    setPin("");
  };

  const handleLogout = () => {
    setSession(null);
    setName("");
    setPin("");
    setRole("child");
    setView("child");
    setAuthError("");
  };

  if (!session) {
    return (
      <div className="app auth-shell">
        <div className="login-card">
          <div className="login-copy">
            <p className="eyebrow">Sentinel Access</p>
            <h1>Sign in to the safety layer</h1>
            <p>
              Use Child mode to test the chat experience, or Parent mode to open
              the live alert dashboard.
            </p>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            <div className="role-toggle" aria-label="Choose login role">
              <button
                type="button"
                className={role === "child" ? "role-chip active" : "role-chip"}
                onClick={() => setRole("child")}
              >
                Child
              </button>
              <button
                type="button"
                className={role === "parent" ? "role-chip active" : "role-chip"}
                onClick={() => setRole("parent")}
              >
                Parent
              </button>
            </div>

            <label className="field">
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={role === "parent" ? "Parent name" : "Child name"}
              />
            </label>

            {role === "parent" && (
              <label className="field">
                <span>Demo PIN</span>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter 1234"
                />
              </label>
            )}

            {authError && <div className="error-banner">{authError}</div>}

            <button type="submit" className="login-submit">
              Continue as {role === "parent" ? "Parent" : "Child"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Child Safety Layer</h1>
        <p>AI safety shield for chat applications</p>
        <div className="session-bar">
          <span>
            Signed in as <strong>{session.name}</strong> ({session.role})
          </span>
          <button className="session-action" onClick={handleLogout}>
            Log out
          </button>
        </div>
        <div className="tabs">
          <button
            className={view === "child" ? "tab active" : "tab"}
            onClick={() => setView("child")}
          >
            Child Chat
          </button>
          <button
            className={view === "parent" ? "tab active" : "tab"}
            onClick={() => setView("parent")}
          >
            Parent Dashboard
          </button>
        </div>
      </header>
      <main className="app-main">
        {view === "child" ? <ChildChat /> : <ParentDashboard />}
      </main>
    </div>
  );
};

export default App;

