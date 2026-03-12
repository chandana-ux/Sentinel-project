from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal, List
from datetime import datetime, timezone

# Supabase setup (optional - will work without it)
try:
    from supabase import create_client
    SUPABASE_URL = "https://uscsxcymrpbhxgjyauxy.supabase.co"
    SUPABASE_KEY = "sb_publishable_xp8FLaRSvKxMqCS4T--Scw_GLdeC7Bh"
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    SUPABASE_ENABLED = True
except Exception as e:
    print(f"Supabase not available: {e}")
    SUPABASE_ENABLED = False


class AnalyzeMessageRequest(BaseModel):
    sender_id: str
    receiver_id: str
    message: str


class AnalyzeMessageResponse(BaseModel):
    risk: Literal["SAFE", "MEDIUM", "HIGH"]
    reason: str


class EvidenceRecord(BaseModel):
    id: int
    sender_id: str
    receiver_id: str
    message: str
    risk: Literal["SAFE", "MEDIUM", "HIGH"]
    reason: str
    timestamp: datetime


class Alert(BaseModel):
    id: int
    evidence_id: int
    risk: Literal["MEDIUM", "HIGH"]
    created_at: datetime


app = FastAPI(title="Child Safety Layer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for demo & UI.
evidence_store: List[EvidenceRecord] = []
alerts_store: List[Alert] = []

# Connected WebSocket clients for live alerts
alert_subscribers: List[WebSocket] = []

def save_message_to_db(record: EvidenceRecord) -> int:
    """Save message to Supabase 'messages' table."""
    if not SUPABASE_ENABLED:
        return record.id
    
    try:
        response = supabase.table("messages").insert({
            "sender_id": record.sender_id,
            "receiver_id": record.receiver_id,
            "text": record.message,
            "risk": record.risk,
            "reason": record.reason,
        }).execute()
        
        if response.data:
            print(f"Message saved to Supabase with ID: {response.data[0]['id']}")
            return response.data[0]["id"]
        return record.id
    except Exception as e:
        print(f"Error saving message to Supabase: {e}")
        return record.id

def save_alert_to_db(alert: Alert, message_id: int) -> None:
    """Save alert to Supabase 'alerts' table."""
    if not SUPABASE_ENABLED:
        return
    
    try:
        supabase.table("alerts").insert({
            "message_id": message_id,
            "risk": alert.risk,
        }).execute()
        print(f"Alert saved to Supabase for message {message_id}")
    except Exception as e:
        print(f"Error saving alert to Supabase: {e}")

def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@app.get("/health")
def health_check():
    return {"status": "ok"}


def simple_risk_detector(message: str) -> AnalyzeMessageResponse:
    text = message.lower()

    grooming_patterns = [
        "how old are you",
        "where do you live",
        "are your parents home",
        "send me your photo",
        "dont tell your parents",
        "don't tell your parents",
    ]

    bullying_keywords = [
        "stupid",
        "nobody likes you",
        "kill yourself",
        "ugly",
    ]

    # High risk if clear grooming phrase or explicit request for photo
    for pattern in grooming_patterns:
        if pattern in text:
            return AnalyzeMessageResponse(
                risk="HIGH",
                reason=f"Matched grooming pattern: '{pattern}'",
            )

    # Medium risk if bullying keyword
    for word in bullying_keywords:
        if word in text:
            return AnalyzeMessageResponse(
                risk="MEDIUM",
                reason=f"Matched bullying keyword: '{word}'",
            )

    return AnalyzeMessageResponse(risk="SAFE", reason="No risky patterns detected")


async def _broadcast_alert(alert: Alert, record: EvidenceRecord) -> None:
    """Send new alert to all connected WebSocket subscribers."""
    disconnected: List[WebSocket] = []
    payload = {
        "alert": {
            "id": alert.id,
            "evidence_id": alert.evidence_id,
            "risk": alert.risk,
            "created_at": alert.created_at.isoformat(),
        },
        "message": {
            "sender_id": record.sender_id,
            "receiver_id": record.receiver_id,
            "text": record.message,
            "risk": record.risk,
            "reason": record.reason,
            "timestamp": record.timestamp.isoformat(),
        },
    }
    for ws in alert_subscribers:
        try:
            await ws.send_json(payload)
        except (RuntimeError, ConnectionError):
            disconnected.append(ws)

    # Clean up disconnected websockets
    for ws in disconnected:
        if ws in alert_subscribers:
            alert_subscribers.remove(ws)


@app.post("/analyze-message", response_model=AnalyzeMessageResponse)
async def analyze_message(payload: AnalyzeMessageRequest):
    result = simple_risk_detector(payload.message)

    # Store evidence for ALL messages (in-memory)
    record = EvidenceRecord(
        id=len(evidence_store) + 1,
        sender_id=payload.sender_id,
        receiver_id=payload.receiver_id,
        message=payload.message,
        risk=result.risk,
        reason=result.reason,
        timestamp=utc_now(),
    )
    
    # Save to Supabase and get the database ID
    db_id = save_message_to_db(record)
    record.id = db_id
    evidence_store.append(record)

    # If risk is MEDIUM or HIGH, also create an alert
    if result.risk in ("MEDIUM", "HIGH"):
        alert_id = len(alerts_store) + 1
        alert = Alert(
            id=alert_id,
            evidence_id=db_id,
            risk=result.risk,
            created_at=utc_now(),
        )
        alerts_store.append(alert)
        
        # Save alert to Supabase
        save_alert_to_db(alert, db_id)
        
        # Notify any connected parent dashboards in real time
        await _broadcast_alert(alert, record)

    return result


@app.get("/evidence", response_model=List[EvidenceRecord])
def list_evidence():
    """List all stored messages (evidence vault)."""
    # Newest first
    return list(reversed(evidence_store))


@app.get("/alerts", response_model=List[Alert])
def list_alerts():
    """List alerts for parent dashboard (MEDIUM/HIGH only)."""
    # Newest first
    return list(reversed(alerts_store))


@app.websocket("/ws/alerts")
async def alerts_websocket(websocket: WebSocket):
    """WebSocket endpoint for parent dashboards to receive live alerts."""
    await websocket.accept()
    alert_subscribers.append(websocket)
    try:
        # Keep the connection open; we don't expect messages from the client.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in alert_subscribers:
            alert_subscribers.remove(websocket)



