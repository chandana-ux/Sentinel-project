from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import importlib
import os
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


SUPABASE_ENABLED = False
supabase: Any = None
AI_CLASSIFIER_ENABLED = False
classifier: Any = None
pipeline: Any = None

try:
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")

    if SUPABASE_URL and SUPABASE_KEY:
        create_client = importlib.import_module("supabase").create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        SUPABASE_ENABLED = True
except Exception:
    print("Supabase not configured")


try:
    from transformers import pipeline as transformers_pipeline
    pipeline = transformers_pipeline
except Exception:
    pipeline = None
    print("Transformers package not configured")


TWILIO_ENABLED = False
twilio_client = None

try:
    ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
    AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
    TWILIO_FROM = os.getenv("TWILIO_FROM_NUMBER")
    PARENT_PHONE = os.getenv("PARENT_PHONE_NUMBER")

    if ACCOUNT_SID and AUTH_TOKEN and TWILIO_FROM and PARENT_PHONE:
        Client = importlib.import_module("twilio.rest").Client
        twilio_client = Client(ACCOUNT_SID, AUTH_TOKEN)
        TWILIO_ENABLED = True
except Exception:
    print("Twilio not configured")


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
        "https://sentinelproj.netlify.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MessageRequest(BaseModel):
    sender_id: str
    receiver_id: str
    message: str


class MessageResponse(BaseModel):
    risk: str
    reason: str


evidence_store: List[Dict[str, Any]] = []
alerts: List[Dict[str, Any]] = []
websocket_clients: List[WebSocket] = []
chat_clients: List[WebSocket] = []


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_classifier() -> Any:
    global classifier, AI_CLASSIFIER_ENABLED

    if classifier is not None:
        return classifier

    if pipeline is None:
        return None

    try:
        classifier = pipeline("text-classification", model="unitary/toxic-bert")
        AI_CLASSIFIER_ENABLED = True
    except Exception as e:
        print("Transformers model not configured", e)
        classifier = None

    return classifier


def detect_risk(message: str) -> Tuple[str, str]:
    ai_classifier = get_classifier()

    if ai_classifier is not None:
        try:
            result = ai_classifier(message)[0]
            label = str(result.get("label", "")).lower()
            score = float(result.get("score", 0))

            if label == "toxic" and score > 0.8:
                return "HIGH", "AI detected harmful message"

            if label == "toxic":
                return "MEDIUM", "AI detected possible abuse"
        except Exception as e:
            print("AI classifier error", e)

    text = message.lower()

    grooming_patterns = [
        "you seem very mature for your age",
        "you’re not like other kids your age",
        "you're not like other kids",
        "i feel like i can talk to you about anything",
        "you're really easy to talk to",
        "i think we understand each other",
        "you're special",
        "you're my favorite person to chat with",
        "you're very smart for your age",
        "you seem older than most kids",
        "do your parents check your phone",
        "do your parents know you’re talking to me",
        "do your parents know you're talking to me",
        "let's keep this between us",
        "don't tell anyone about our chats",
        "our friendship is a secret",
        "your parents wouldn't understand",
        "they might get mad if they knew",
        "we don't need to tell anyone about this",
        "where do you live",
        "are you home alone",
        "what school do you go to",
        "what's your address",
        "do you have your own room",
        "what time do your parents get home",
        "what's your phone number",
        "let's talk somewhere more private",
        "do you have telegram",
        "do you have snapchat",
        "let's move this chat somewhere else",
        "add me on another app",
        "instagram is not safe for talking",
        "you're the only one who understands me",
        "i feel lonely and you make me feel better",
        "you're the only one i trust",
        "if you stop talking to me i'll be sad",
        "you're very important to me",
        "send me a picture of yourself",
        "send me your photo",
        "send me a selfie",
        "can i see what you look like",
        "send a photo just for me",
        "take a selfie right now",
        "don't tell your parents",
        "dont tell your parents",
        "delete our messages",
        "this is our little secret",
        "promise you won't tell anyone",
        "if you tell someone we could get in trouble",
    ]

    bullying = [
        "stupid",
        "ugly",
        "kill yourself",
        "nobody likes you",
    ]

    for pattern in grooming_patterns:
        if pattern in text:
            return "HIGH", f"Grooming behaviour detected: {pattern}"

    for phrase in bullying:
        if phrase in text:
            return "MEDIUM", f"Bullying keyword detected: {phrase}"

    return "SAFE", "No risk detected"


def save_message_db(record: Dict[str, Any]) -> Optional[int]:
    if not SUPABASE_ENABLED:
        return None

    try:
        response = (
            supabase.table("messages")
            .insert(
                {
                    "sender_id": record["sender_id"],
                    "receiver_id": record["receiver_id"],
                    "text": record["message"],
                    "risk": record["risk"],
                    "reason": record["reason"],
                    "created_at": record["created_at"],
                }
            )
            .execute()
        )
        if response.data:
            return response.data[0]["id"]
    except Exception as e:
        print("Database error", e)

    return None


def save_message_to_db(record: Dict[str, Any]) -> Optional[int]:
    return save_message_db(record)


def save_alert_db(message_id: Optional[int], alert: Dict[str, Any]) -> None:
    if not SUPABASE_ENABLED or not message_id:
        return

    try:
        (
            supabase.table("alerts")
            .insert(
                {
                    "message_id": message_id,
                    "risk": alert["risk"],
                    "created_at": alert["created_at"],
                }
            )
            .execute()
        )
    except Exception as e:
        print("Alert database error", e)


def send_sms(text: str) -> None:
    if not TWILIO_ENABLED or not twilio_client:
        return

    try:
        twilio_client.messages.create(body=text, from_=TWILIO_FROM, to=PARENT_PHONE)
    except Exception as e:
        print("SMS error", e)


async def broadcast_alert(alert: Dict[str, Any], record: Dict[str, Any]) -> None:
    payload = {
        "alert": alert,
        "message": {
            "sender_id": record["sender_id"],
            "receiver_id": record["receiver_id"],
            "text": record["message"],
            "risk": record["risk"],
            "reason": record["reason"],
            "created_at": record["created_at"],
        },
    }
    dead = []

    for ws in websocket_clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)

    for ws in dead:
        if ws in websocket_clients:
            websocket_clients.remove(ws)


async def broadcast_chat_message(payload: Dict[str, Any]) -> None:
    dead = []

    for ws in chat_clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)

    for ws in dead:
        if ws in chat_clients:
            chat_clients.remove(ws)


@app.post("/analyze-message", response_model=MessageResponse)
async def analyze_message(data: MessageRequest):
    risk, reason = detect_risk(data.message)
    created_at = utc_now_iso()

    if risk == "HIGH":
        await asyncio.sleep(5)

    record = {
        "id": len(evidence_store) + 1,
        "sender_id": data.sender_id,
        "receiver_id": data.receiver_id,
        "message": data.message,
        "risk": risk,
        "reason": reason,
        "created_at": created_at,
    }

    db_message_id = save_message_to_db(record)
    if db_message_id:
        record["id"] = db_message_id

    evidence_store.append(record)

    if risk != "SAFE":
        alert = {
            "id": len(alerts) + 1,
            "message_id": record["id"],
            "risk": risk,
            "created_at": created_at,
            "sender_id": record["sender_id"],
            "receiver_id": record["receiver_id"],
            "text": record["message"],
            "reason": record["reason"],
        }
        alerts.append(alert)
        save_alert_db(db_message_id, alert)
        await broadcast_alert(alert, record)
        send_sms(f"Child Safety Alert\nRisk: {risk}\nMessage: {data.message}")

    return {"risk": risk, "reason": reason}


@app.get("/alerts")
def get_alerts():
    return list(reversed(alerts))


@app.get("/messages")
def get_messages():
    return list(reversed(evidence_store))


@app.get("/evidence")
def get_evidence():
    return list(reversed(evidence_store))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws/alerts")
async def alert_socket(ws: WebSocket):
    await ws.accept()
    websocket_clients.append(ws)

    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in websocket_clients:
            websocket_clients.remove(ws)


@app.websocket("/ws/chat")
async def chat_socket(ws: WebSocket):
    await ws.accept()
    chat_clients.append(ws)

    try:
        while True:
            data = await ws.receive_json()
            await broadcast_chat_message(data)
    except WebSocketDisconnect:
        pass
    finally:
        if ws in chat_clients:
            chat_clients.remove(ws)


if __name__ == "__main__":
    uvicorn = importlib.import_module("uvicorn")
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
