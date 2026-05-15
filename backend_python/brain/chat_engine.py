import os
import json
import httpx
import asyncio
import re
from typing import Dict
from .personality import build_messages
from .tools import TOOLS_SCHEMA, execute_tool

# Keys are resolved lazily so dotenv in main.py loads first
def _get_provider():
    return os.getenv("AI_PROVIDER", "groq").lower()

def _get_key():
    return os.getenv("GROQ_API_KEY")

def _get_model():
    if _get_provider() == "ollama":
        return os.getenv("OLLAMA_MODEL", "llama3.2:3b")
    return os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")

def _get_base_url():
    if _get_provider() == "ollama":
        return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    return "https://api.groq.com/openai/v1"

def _get_tts_model():
    return os.getenv("GROQ_TTS_MODEL", "playai-tts")

def _get_tts_voice():
    return os.getenv("TTS_VOICE", "Aaliyah-PlayAI")

class ChatEngine:
    def __init__(self, memory_engine, sio):
        self.memory = memory_engine
        self.sio = sio
        self.client = httpx.AsyncClient()
        self.tts_queues: Dict[str, list] = {}
        self.tts_processing: Dict[str, bool] = {}

    async def handle_chat(self, sid: str, data: dict):
        text = data.get("text", "")
        context = data.get("context", "")
        
        if not text:
            return

        self.memory.add_short_term(sid, "user", text)
        history = self.memory.get_short_term(sid)[:-1]  # exclude current message
        
        messages = build_messages(context, history, text)
        
        await self.sio.emit("llm_start", to=sid)
        
        try:
            # ----------------------------------------------------------------
            # Step 1: First LLM call — may trigger a tool call
            # ----------------------------------------------------------------
            headers = {
                "Authorization": f"Bearer {_get_key()}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": _get_model(),
                "messages": messages,
                "temperature": 0.7,
                "stream": True,
                "tools": TOOLS_SCHEMA,
                "tool_choice": "auto"
            }
            
            full_response = ""
            tool_call_name = None
            tool_call_args_str = ""
            tool_call_id = None
            is_tool_call = False

            async with self.client.stream(
                "POST",
                f"{_get_base_url()}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0
            ) as response:
                if response.status_code != 200:
                    await response.aread()
                    await self.sio.emit("llm_error", f"API Error: {response.status_code}", to=sid)
                    return
                    
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    content = line[6:]
                    if content == "[DONE]":
                        break
                    try:
                        chunk = json.loads(content)
                        delta = chunk["choices"][0]["delta"]
                        finish_reason = chunk["choices"][0].get("finish_reason")

                        # --- Detect tool call in the stream ---
                        if delta.get("tool_calls"):
                            is_tool_call = True
                            tc = delta["tool_calls"][0]
                            if tc.get("id"):
                                tool_call_id = tc["id"]
                            if tc.get("function", {}).get("name"):
                                tool_call_name = tc["function"]["name"]
                            if tc.get("function", {}).get("arguments"):
                                tool_call_args_str += tc["function"]["arguments"]
                        elif not is_tool_call:
                            # Normal text delta
                            text_delta = delta.get("content", "")
                            full_response += text_delta
                            await self.sio.emit("llm_delta", full_response, to=sid)

                    except json.JSONDecodeError:
                        continue

            # ----------------------------------------------------------------
            # Step 2: If a tool was called, execute it and do a second LLM pass
            # ----------------------------------------------------------------
            if is_tool_call and tool_call_name:
                print(f"[Tool Call] {tool_call_name}({tool_call_args_str})")
                await self.sio.emit("llm_delta", f"🔧 Running tool: `{tool_call_name}`...", to=sid)

                try:
                    tool_args = json.loads(tool_call_args_str) if tool_call_args_str else {}
                except json.JSONDecodeError:
                    tool_args = {}

                # Run the tool
                tool_result = await asyncio.get_event_loop().run_in_executor(
                    None, execute_tool, tool_call_name, tool_args
                )
                print(f"[Tool Result] {tool_result}")

                # Build second-pass messages with the tool result injected
                second_messages = messages + [
                    {
                        "role": "assistant",
                        "tool_calls": [{
                            "id": tool_call_id or "call_1",
                            "type": "function",
                            "function": {
                                "name": tool_call_name,
                                "arguments": tool_call_args_str
                            }
                        }]
                    },
                    {
                        "role": "tool",
                        "tool_call_id": tool_call_id or "call_1",
                        "content": tool_result
                    }
                ]

                second_payload = {
                    "model": _get_model(),
                    "messages": second_messages,
                    "temperature": 0.7,
                    "stream": True
                }

                full_response = ""
                async with self.client.stream(
                    "POST",
                    f"{_get_base_url()}/chat/completions",
                    headers=headers,
                    json=second_payload,
                    timeout=60.0
                ) as response2:
                    if response2.status_code != 200:
                        await response2.aread()
                        await self.sio.emit("llm_error", f"API Error (pass 2): {response2.status_code}", to=sid)
                        return

                    async for line in response2.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        content = line[6:]
                        if content == "[DONE]":
                            break
                        try:
                            chunk = json.loads(content)
                            text_delta = chunk["choices"][0]["delta"].get("content", "")
                            full_response += text_delta
                            await self.sio.emit("llm_delta", full_response, to=sid)
                        except json.JSONDecodeError:
                            continue

            self.memory.add_short_term(sid, "assistant", full_response)
            await self.sio.emit("llm_done", to=sid)
            
            # Queue TTS for final spoken response
            await self.handle_tts(sid, full_response)
            
        except Exception as e:
            print(f"Chat error: {e}")
            await self.sio.emit("llm_error", str(e), to=sid)

    async def handle_tts(self, sid: str, text: str):
        if sid not in self.tts_queues:
            self.tts_queues[sid] = []
        
        sentences = re.split(r'(?<=[.!?]) +', text.strip())
        self.tts_queues[sid].extend([s for s in sentences if s])
        
        if not self.tts_processing.get(sid, False):
            asyncio.create_task(self.process_tts_queue(sid))

    async def process_tts_queue(self, sid: str):
        self.tts_processing[sid] = True
        try:
            while self.tts_queues.get(sid, []):
                text = self.tts_queues[sid].pop(0)
                
                headers = {"Authorization": f"Bearer {_get_key()}"}
                payload = {
                    "model": _get_tts_model(),
                    "input": text,
                    "voice": _get_tts_voice(),
                    "response_format": "mp3"
                }
                
                try:
                    response = await self.client.post(
                        "https://api.groq.com/openai/v1/audio/speech",
                        headers=headers,
                        json=payload,
                        timeout=30.0
                    )
                    if response.status_code == 200:
                        await self.sio.emit("tts_audio", {"audio": response.content, "text": text}, to=sid)
                    else:
                        print(f"TTS Error: {response.status_code}")
                except Exception as e:
                    print(f"TTS post error: {e}")
        finally:
            self.tts_processing[sid] = False

    async def handle_transcription(self, sid: str, audio_bytes: bytes):
        try:
            files = {"file": ("audio.webm", audio_bytes, "audio/webm")}
            data = {"model": "whisper-large-v3-turbo", "language": "en"}
            headers = {"Authorization": f"Bearer {_get_key()}"}
            
            response = await self.client.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers=headers,
                files=files,
                data=data,
                timeout=30.0
            )
            
            if response.status_code == 200:
                result = response.json()
                text = result.get("text", "").strip()
                if text:
                    await self.sio.emit("transcription_result", text, to=sid)
            else:
                await self.sio.emit("llm_error", f"Whisper error: {response.status_code}", to=sid)
        except Exception as e:
            print(f"Transcription error: {e}")
