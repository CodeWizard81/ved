import os
import uvicorn
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from brain.chat_engine import ChatEngine
from brain.memory_engine import MemoryEngine

load_dotenv()

# Initialize FastAPI
app = FastAPI(title="V.E.D. Core Intelligence API")

app.add_middleware( 

    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Socket.IO with max_http_buffer_size set appropriately for audio
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', max_http_buffer_size=10000000)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Initialize Brain
memory_engine = MemoryEngine()
chat_engine = ChatEngine(memory_engine, sio)

@app.on_event("startup")
async def startup():
    memory_engine.init_db()

@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "V.E.D. Python Core",
        "model": os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile"),
        "hasGroqKey": bool(os.getenv("GROQ_API_KEY")),
    }

@sio.event
async def connect(sid, environ):
    print(f"[-] Client connected: {sid}")
    memory_engine.create_session(sid)

@sio.event
async def disconnect(sid):
    print(f"[-] Client disconnected: {sid}")
    memory_engine.clear_session(sid)

@sio.event
async def chat_message(sid, data):
    print(f"[-] Chat message from {sid}: {data.get('text', '')}")
    await chat_engine.handle_chat(sid, data)

@sio.event
async def manual_tts(sid, text):
    await chat_engine.handle_tts(sid, text)

@sio.
async def transcribe_audio(sid, audio_bytes):
    await chat_engine.handle_transcription(sid, audio_bytes)

@sio.event
async def personal_data_request(sid, data):
    user_id = (data or {}).get("userId", "operator")
    payload = memory_engine.load_personal_data(user_id)
    await sio.emit("personal_data_snapshot", payload, to=sid)

@sio.event
async def personal_data_sync(sid, data):
    data = data or {}
    user_id = data.get("userId", "operator")
    payload = memory_engine.save_personal_data(user_id, data.get("payload", {}))
    await sio.emit("personal_data_saved", payload, to=sid)

@sio.event
async def personal_data_clear(sid, data):
    user_id = (data or {}).get("userId", "operator")
    payload = memory_engine.clear_personal_data(user_id)
    await sio.emit("personal_data_snapshot", payload, to=sid)

if __name__ == "__main__":
    print("Starting V.E.D. Python Core...")
    uvicorn.run("main:socket_app", host="0.0.0.0", port=8000, reload=True)
