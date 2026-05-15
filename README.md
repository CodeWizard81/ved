<div align="center">

<h1>🤖 V.E.D.</h1>
<h3>Voice-Enabled Diagnostic — Your Personal AI Companion</h3>

<p>
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white" />
  <img src="https://img.shields.io/badge/Groq-FF6A00?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0wIDE4Yy00LjQxIDAtOC0zLjU5LTgtOHMzLjU5LTggOC04IDggMy41OSA4IDgtMy41OSA4LTggOHoiLz48L3N2Zz4=&logoColor=white" />
  <img src="https://img.shields.io/badge/Ollama-Local_AI-4A90D9?style=for-the-badge" />
</p>

<p>
  <strong>V.E.D.</strong> is a full-stack, voice-interactive AI assistant that combines a Python FastAPI backend with a React frontend to deliver real-time, streaming AI conversations — powered by either <strong>Groq Cloud</strong> or a fully <strong>local Ollama model</strong>.
</p>

</div>

---

## ✨ Features

| Feature | Details |
|---|---|
| 🎙️ **Voice Input** | Real-time speech-to-text using Groq's Whisper Large v3 Turbo |
| 🔊 **Voice Output (TTS)** | Sentence-streamed audio via Groq's PlayAI TTS engine |
| 🧠 **Intelligent Memory** | SQLite-backed short-term and long-term memory across sessions |
| 🛠️ **Function Calling** | Real-time tool execution (weather, time) via Groq's function-calling API |
| 🌦️ **Live Weather** | 7-day forecasts + hourly breakdowns via Open-Meteo (no API key needed) |
| 🔒 **Speaker Verification** | MFCC-based local voice authentication using Meyda |
| 🔄 **Streaming Responses** | Token-level streaming via Socket.IO for a fluid chat experience |
| 🌐 **Dual AI Provider** | Switch between Groq Cloud API and a local Ollama model via `.env` |
| 💾 **Persistent Personal Data** | User profile and preferences stored in SQLite |
| ✨ **Futuristic UI** | Animated terminal interface with Three.js, Framer Motion, and a custom JARVIS-VED theme |

---

## 🏗️ Architecture

```
VED/
├── backend_python/          # 🐍 Python FastAPI + Socket.IO Core
│   ├── main.py              # Server entry point, event handlers
│   ├── requirements.txt     # Python dependencies
│   ├── .env                 # Environment configuration (not committed)
│   └── brain/
│       ├── chat_engine.py   # LLM streaming, tool calling, TTS pipeline
│       ├── memory_engine.py # SQLite session & personal data management
│       ├── personality.py   # V.E.D. system prompt & message builder
│       └── tools.py         # Function-calling tools (weather, time)
│
├── frontend/                # ⚛️ React 19 UI
│   └── src/
│       ├── App.js           # Root component & routing
│       ├── socket.js        # Socket.IO client singleton
│       ├── component/       # Terminal, Chat, Speaker Verification UI
│       └── jarvisVedTheme.css  # Futuristic design system
│
└── backend/                 # (Legacy) Node.js backend
    └── server.js
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** & npm
- A **Groq API Key** (free at [console.groq.com](https://console.groq.com)) — *or* a running [Ollama](https://ollama.com) instance

---

### 1. Clone the Repository

```bash
git clone https://github.com/CodeWizard81/ved.git
cd ved
```

---

### 2. Backend Setup (Python)

```bash
cd backend_python

# Create & activate virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### Configure Environment

Create a `.env` file inside `backend_python/`:

```env
# ─── AI Provider ──────────────────────────────────
# Choose: "groq" or "ollama"
AI_PROVIDER=groq

# ─── Groq Cloud (used when AI_PROVIDER=groq) ───────
GROQ_API_KEY=your_groq_api_key_here
GROQ_LLM_MODEL=llama-3.3-70b-versatile
GROQ_TTS_MODEL=playai-tts
TTS_VOICE=Aaliyah-PlayAI

# ─── Ollama Local (used when AI_PROVIDER=ollama) ───
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.2:3b
```

#### Start the Backend

```bash
python main.py
```

The API server starts at **`http://localhost:8000`**.  
Health check: [http://localhost:8000/health](http://localhost:8000/health)

---

### 3. Frontend Setup (React)

```bash
cd ../frontend
npm install
npm start
```

The UI opens at **`http://localhost:3000`**.

---

## 🧰 Available Tools (Function Calling)

V.E.D. can autonomously call real-world tools mid-conversation:

| Tool | Trigger Phrases | Description |
|---|---|---|
| `get_current_time` | *"What time is it?"*, *"What's today's date?"* | Returns local date & time |
| `get_weather` | *"Weather in Tokyo"*, *"Will it rain tomorrow?"* | Full weather via Open-Meteo: current conditions, 6-hour hourly, 7-day forecast, UV index |

> New tools can be added in `backend_python/brain/tools.py` and registered in `TOOL_REGISTRY` + `TOOLS_SCHEMA`.

---

## 🌐 Using Local AI with Ollama

To run V.E.D. **100% offline**, with no API keys required:

1. Install [Ollama](https://ollama.com/download)
2. Pull your desired model:
   ```bash
   ollama pull llama3.2:3b
   ```
3. Start Ollama (it runs at `http://localhost:11434`)
4. Set `AI_PROVIDER=ollama` in your `.env`
5. Restart the backend

> **Recommended hardware:** Intel Core i5-1240P or better. For optimal speed on laptops, use smaller models like `llama3.2:3b` or `phi3:mini`.

---

## 🔊 Voice & TTS Pipeline

```
Microphone Input
      │
      ▼
WebM Audio (Socket.IO)
      │
      ▼
Groq Whisper Large v3 Turbo (STT)
      │
      ▼
Transcribed Text → Chat Engine → LLM (streaming)
                                      │
                                      ▼
                             Tool Call? ──yes──► Execute Tool ──► Second LLM Pass
                                      │
                                      ▼
                             Text Response (streamed token-by-token)
                                      │
                                      ▼
                             Sentence Splitter → TTS Queue
                                      │
                                      ▼
                             Groq PlayAI TTS → MP3 Audio (Socket.IO)
                                      │
                                      ▼
                             Browser Audio Playback 🔊
```

---

## 🔒 Speaker Verification

V.E.D. includes a **local, privacy-first** speaker verification system:

- Uses **MFCC** audio fingerprinting via the [Meyda](https://meyda.js.org/) library
- Runs entirely **in-browser** — no audio data is sent to any server for auth
- Enrolled voice profiles are stored in **IndexedDB**
- Configurable similarity threshold for sensitivity tuning

---

## 📦 Key Dependencies

### Backend (Python)
| Package | Purpose |
|---|---|
| `fastapi` | REST API framework |
| `uvicorn` | ASGI server |
| `python-socketio` | Real-time WebSocket events |
| `httpx` | Async HTTP client for LLM/TTS APIs |
| `openmeteo-requests` | Cached weather data fetching |
| `python-dotenv` | Environment variable management |

### Frontend (React)
| Package | Purpose |
|---|---|
| `react` 19 | UI framework |
| `socket.io-client` | Real-time server communication |
| `framer-motion` | Smooth UI animations |
| `three` | 3D/WebGL visual effects |
| `meyda` | Audio feature extraction (MFCC) |
| `kokoro-js` | Client-side TTS fallback |

---

## 📜 License

This project is licensed under the **MIT License**.

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/CodeWizard81">CodeWizard81</a></sub>
</div>
