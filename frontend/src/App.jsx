import React, { useEffect, useState } from "react";
import ChildChat from "./ChildChat.jsx";
import ParentDashboard from "./ParentDashboard.jsx";

const API_BASE = "https://sentinel-project-la8l.onrender.com";

const App = () => {
  const [approvalPage, setApprovalPage] = useState(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
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

    if (!age.trim()) {
      setAuthError("Enter your age to continue.");
      return;
    }

    const numericAge = Number(age);
    const role = Number.isFinite(numericAge) && numericAge >= 19 ? "adult" : "child";

    setSession({
      name: name.trim(),
      age: age.trim(),
      role,
      status: "online",
    });
    setView("child");
    setAuthError("");
  };

  const handleLogout = () => {
    setSession(null);
    setName("");
    setAge("");
    setView("child");
    setAuthError("");
  };

  if (!session) {
    return (
      <div className="app auth-shell">
        <div className="login-card">
          <div className="login-copy">
            <p className="eyebrow">Sentinel Access</p>
            <h1>Go online with Sentinel</h1>
            <p>
              Enter a name and age to open the chat. Parent notifications still
              stay active in the background for risky content.
            </p>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            <label className="field">
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </label>

            <label className="field">
              <span>Age</span>
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Your age"
              />
            </label>

            {authError && <div className="error-banner">{authError}</div>}

            <button type="submit" className="login-submit">Go Online</button>
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
            Online as <strong>{session.name}</strong>, age {session.age} ({session.role})
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
        {view === "child" ? <ChildChat session={session} /> : <ParentDashboard />}
      </main>
    </div>
  );
};

export default App;

