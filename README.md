# Child Safety Layer for Chat Applications (MVP Demo)

AI-powered safety shield that sits between chat users and the chat system to protect children from grooming, cyberbullying, and unsafe content in real time.

This repository contains:

- **Backend** - FastAPI "safety layer" with rule-based AI, evidence vault, and real-time alerts.
- **Frontend** - React (Vite) demo UI with:
  - Child chat view
  - Parent dashboard with live alerts

> This is an offline-friendly MVP you can run locally and then connect to real services like Stream Chat and Supabase.

---

## 1. Project Architecture

**Flow**

- Person A (child) <-> Person B (other user)
- Every message goes through the **Child Safety Layer API** before reaching the child.
- The safety layer:
  - Analyzes the text
  - Detects grooming / bullying
  - Stores evidence
  - Triggers parent alerts in real time

**Components**

- `backend/` - FastAPI server
  - `POST /analyze-message` - analyze a message and classify risk (`SAFE | MEDIUM | HIGH`)
  - `GET /evidence` - evidence vault of all messages
  - `GET /alerts` - list of alerts (MEDIUM/HIGH)
  - `WS /ws/alerts` - WebSocket for live parent alerts
- `frontend/` - React Vite app
  - `ChildChat` - send messages and see in-chat warnings/delays
  - `ParentDashboard` - see real-time alerts via WebSocket

For a real production system, this API would sit between a chat service (like Stream Chat) and the users.

---

## 2. Tech Stack

- **Frontend**
  - React 18
  - Vite (for dev server & build)
  - Simple CSS (modern dark UI)

- **Backend**
  - Python 3 + FastAPI
  - Uvicorn ASGI server
  - In-memory storage for demo (can be replaced with Supabase/Postgres)

---

## 3. Running Locally

### 3.1 Backend

In PowerShell:

```bash
cd "c:\Users\chand\Desktop\child safety layer 778"

python -m venv .venv
.\.venv\Scripts\activate

pip install -r requirements.txt

uvicorn backend.main:app --reload --port 8000
```

Keep this terminal **open**.

Check it:

- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

### 3.2 Frontend

Open a **new** terminal:

```bash
cd "c:\Users\chand\Desktop\child safety layer 778\frontend"

npm install
npm run dev
```

Open the URL Vite prints (usually `http://127.0.0.1:5173/`).

---

## 4. Using the Demo

### Child Chat tab

- Type **safe** messages - they appear with a green SAFE badge.
- Type **bullying** messages, e.g.:
  - `You are stupid`
  - `Nobody likes you`
- Type **grooming** messages, e.g.:
  - `How old are you?`
  - `Where do you live?`
  - `Are your parents home?`
  - `Send me your photo`

The UI will show:

- **MEDIUM** risk for bullying (yellow badge, warning).
- **HIGH** risk for grooming (red badge, warning + "message under safety review").

### Parent Dashboard tab

- Shows connection status to the WebSocket endpoint.
- Displays a timeline of alerts for **MEDIUM/HIGH** risk messages.
- New alerts appear in **real time** when risky messages are sent in Child Chat.

---

## 5. Evidence Vault and Alerts API

Backend endpoints:

- `POST /analyze-message`
  - Request:
    ```json
    {
      "sender_id": "userB",
      "receiver_id": "childA",
      "message": "Send me your photo"
    }
    ```
  - Response:
    ```json
    {
      "risk": "HIGH",
      "reason": "Matched grooming pattern: 'send me your photo'"
    }
    ```
  - Side effects:
    - Stores message in evidence vault.
    - Creates an alert if risk is MEDIUM or HIGH.
    - Pushes real-time alert via WebSocket.

- `GET /evidence`
  - Returns all stored messages (newest first).

- `GET /alerts`
  - Returns all alerts (newest first).

- `WS /ws/alerts`
  - WebSocket endpoint that pushes JSON payloads for each new alert.

---

## 6. Supabase / Database (Next Step)

Right now, the app uses **in-memory lists** so it works with zero setup.

To connect a real database (Supabase/Postgres), you can create tables like:

- `users` - id, role (child / parent / other), name
- `messages` - id, sender_id, receiver_id, text, risk, reason, created_at
- `alerts` - id, message_id, risk, created_at

See `supabase_schema.sql` as a starting point for SQL.

Then, in the backend, replace the in-memory `evidence_store` and `alerts_store` with insert/select calls to Supabase.

---

## 7. Deployment Overview

You still need to create and manage accounts yourself, but the process is:

- **Frontend -> Netlify**
  - Connect this folder as a site (or push to GitHub and connect repo).
  - Base directory: `frontend`
  - Build command: `npm run build`
  - Publish directory: `dist`

- **Backend -> Render / Railway / other**
  - Create a new web service from this project or its repo.
  - Set start command:
    ```bash
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
    ```
  - Set environment variables for any DB/keys (`SUPABASE_URL`, `SUPABASE_KEY`, etc.).

Then update the frontend API and WebSocket URLs to use your deployed backend URLs.

---

## 8. Judge-Friendly Explanation

- **Problem** - children face grooming, cyberbullying, and unsafe media in chat apps.
- **Solution** - a safety layer that:
  - Monitors chat in real time
  - Detects risk with AI/rules
  - Warns/delays harmful content
  - Notifies parents immediately
  - Stores evidence for reporting
- **Demo setup**
  - One device: child chat
  - One device: other user
  - One device: parent dashboard
- **Impact**
  - Technically strong (real-time, WebSockets, AI logic)
  - Socially impactful (child safety)
