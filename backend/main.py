from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timezone
from io import BytesIO
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
IMAGE_MODERATION_ENABLED = False
image_moderator: Any = None

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
    id: int
    risk: str
    reason: str
    message: str
    approval_required: bool
    approval_status: str


class ImageScanRequest(BaseModel):
    image: str


class ImageScanResponse(BaseModel):
    risk: str
    reason: str
    blocked: bool


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


def decode_image_data(image_data: str) -> Optional[bytes]:
    if "," not in image_data:
        return None

    _, encoded = image_data.split(",", 1)

    try:
        return base64.b64decode(encoded)
    except Exception:
        return None


def get_image_moderator() -> Any:
    global image_moderator, IMAGE_MODERATION_ENABLED

    if image_moderator is not None:
        return image_moderator

    if pipeline is None:
        return None

    try:
        image_moderator = pipeline(
            "image-classification",
            model="Falconsai/nsfw_image_detection",
        )
        IMAGE_MODERATION_ENABLED = True
    except Exception as e:
        print("Image moderation model not configured", e)
        image_moderator = None

    return image_moderator


def detect_image_risk(image_data: str) -> Tuple[str, str, bool]:
    text = image_data.lower()

    if "nsfw" in text:
        return "HIGH", "Unsafe image content detected", True

    moderator = get_image_moderator()
    image_bytes = decode_image_data(image_data)

    if moderator is not None and image_bytes is not None:
        try:
            image_module = importlib.import_module("PIL.Image")
            image = image_module.open(BytesIO(image_bytes))
            results = moderator(image)

            for result in results:
                label = str(result.get("label", "")).lower()
                score = float(result.get("score", 0))

                if any(term in label for term in ("nsfw", "porn", "sexy")) and score >= 0.5:
                    return "HIGH", f"AI image moderation flagged: {label}", True
        except Exception as e:
            print("Image moderation error", e)

    return "SAFE", "No unsafe image detected", False


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
        "you're not like other kids your age",
        "you're not like other kids",
        "i feel like i can talk to you about anything",
        "you're really easy to talk to",
        "i think we understand each other",
        "you're special",
        "you're my favorite person to chat with",
        "you're very smart for your age",
        "you seem older than most kids",
        "do your parents check your phone",
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
                    "approval_status": record["approval_status"],
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


def update_message_approval_db(record: Dict[str, Any]) -> None:
    if not SUPABASE_ENABLED:
        return

    try:
        (
            supabase.table("messages")
            .update(
                {
                    "text": record["message"],
                    "approval_status": record["approval_status"],
                }
            )
            .eq("id", record["id"])
            .execute()
        )
    except Exception as e:
        print("Message approval update error", e)


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


def build_sms_alert(risk: str, message: str, sender_id: str, message_id: int) -> str:
    return (
        "SENTINEL CHILD SAFETY ALERT\n\n"
        f"Risk: {risk}\n"
        f"Message: {message}\n\n"
        "Approve message:\n"
        f"https://sentinelproj.netlify.app/approve/{message_id}\n\n"
        "Block message:\n"
        f"https://sentinelproj.netlify.app/block/{message_id}"
    )


def find_message_record(message_id: int) -> Optional[Dict[str, Any]]:
    for record in evidence_store:
        if record["id"] == message_id:
            return record
    return None


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


async def broadcast_chat_update(record: Dict[str, Any]) -> None:
    await broadcast_chat_message(
        {
            "type": "message_update",
            "id": record["id"],
            "sender": record["sender_id"],
            "text": record["message"],
            "approval_status": record["approval_status"],
            "warning": (
                "Message flagged as risky. Parent approval required."
                if record["approval_status"] == "pending"
                else None
            ),
        }
    )


@app.post("/analyze-message", response_model=MessageResponse)
async def analyze_message(data: MessageRequest):
    risk, reason = detect_risk(data.message)
    created_at = utc_now_iso()
    original_message = data.message
    message_text = original_message
    approval_required = risk == "HIGH"
    approval_status = "pending" if approval_required else "approved"

    record = {
        "id": len(evidence_store) + 1,
        "sender_id": data.sender_id,
        "receiver_id": data.receiver_id,
        "message": message_text,
        "risk": risk,
        "reason": reason,
        "created_at": created_at,
        "approval_status": approval_status,
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
            "text": original_message,
            "reason": record["reason"],
        }
        alerts.append(alert)
        save_alert_db(db_message_id, alert)
        await broadcast_alert(alert, record)
        send_sms(build_sms_alert(risk, original_message, data.sender_id, record["id"]))

    if risk == "HIGH":
        await asyncio.sleep(5)
    elif risk == "MEDIUM":
        await asyncio.sleep(2)

    return {
        "id": record["id"],
        "risk": risk,
        "reason": reason,
        "message": message_text,
        "approval_required": approval_required,
        "approval_status": approval_status,
    }


@app.post("/scan-image", response_model=ImageScanResponse)
async def scan_image(payload: ImageScanRequest):
    risk, reason, blocked = detect_image_risk(payload.image)
    return {"risk": risk, "reason": reason, "blocked": blocked}


@app.get("/alerts")
def get_alerts():
    return list(reversed(alerts))


@app.get("/approve/{msg_id}")
async def approve_message(msg_id: int):
    record = find_message_record(msg_id)
    if record is not None:
        record["approval_status"] = "approved"
        update_message_approval_db(record)
        await broadcast_chat_update(record)
    return {"status": "approved", "id": msg_id}


@app.get("/block/{msg_id}")
async def block_message(msg_id: int):
    record = find_message_record(msg_id)
    if record is not None:
        record["approval_status"] = "blocked"
        record["message"] = "[BLOCKED: Inappropriate message detected]"
        update_message_approval_db(record)
        await broadcast_chat_update(record)
    return {"status": "blocked", "id": msg_id}


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
