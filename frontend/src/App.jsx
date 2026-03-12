import React, { useState } from "react";
import ChildChat from "./ChildChat.jsx";
import ParentDashboard from "./ParentDashboard.jsx";

const App = () => {
  const [view, setView] = useState("child");

  return (
    <div className="app">
      <header className="app-header">
        <h1>Child Safety Layer</h1>
        <p>AI safety shield for chat applications</p>
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

