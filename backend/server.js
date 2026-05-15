const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const ALLOWED_ORIGINS = CLIENT_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean);
const MAX_INPUT_CHARS = Number(process.env.MAX_INPUT_CHARS || 2000);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'POST']
};

app.use(cors(corsOptions));
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_LLM_MODEL || 'llama-3.1-8b-instant';
const GUARD_MODEL = process.env.GROQ_GUARD_MODEL || 'meta-llama/llama-prompt-guard-2-22m';
const TTS_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const TTS_VOICE = process.env.TTS_VOICE || 'daniel';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech';

const SYSTEM_PROMPT = `You are V.E.D. — a hyper-intelligent AI assistant integrated into a holographic HUD interface.
Respond concisely and precisely. Your tone is calm, analytical, and slightly futuristic.
Keep responses under 3 sentences unless deeper detail is explicitly requested.
Prefix your responses with nothing — speak directly.`;

// ── Conversation history & Storage ─────────────────────────────────────────
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
let sessions = new Map();

if (fs.existsSync(SESSIONS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    sessions = new Map(Object.entries(data));
  } catch(e) {
    console.error("Failed to load sessions:", e);
  }
}

function saveSessions() {
  const obj = Object.fromEntries(sessions);
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// ── TTS Queue System ───────────────────────────────────────────────────────
const ttsQueues = new Map();
const ttsProcessing = new Set();

async function processTTSQueue(socket) {
  if (ttsProcessing.has(socket.id)) return;
  ttsProcessing.add(socket.id);
  
  try {
    while (true) {
      const queue = ttsQueues.get(socket.id);
      if (!queue || queue.length === 0) break;
      
      const text = queue.shift();
      await streamTTS(text, socket);
    }
  } finally {
    ttsProcessing.delete(socket.id);
  }
}

function queueTTS(text, socket) {
  if (!ttsQueues.has(socket.id)) ttsQueues.set(socket.id, []);
  ttsQueues.get(socket.id).push(text);
  processTTSQueue(socket).catch(console.error);
}

// ── AI Intent Extraction ───────────────────────────────────────────────────
async function extractIntent(text, socket) {
  if (!GROQ_API_KEY) return;
  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { 
            role: 'system', 
            content: `You are an intent parser. Analyze the user's input and extract if they want to add a reminder, add a note, or save a memory. Output ONLY valid JSON in this format: {"intent": "reminder" | "note" | "memory" | "none", "text": "<the specific content to remember or note>", "when": "<time or date if reminder, else empty>"}` 
          },
          { role: 'user', content: text }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });
    if (res.ok) {
      const json = await res.json();
      const contentStr = json.choices?.[0]?.message?.content;
      if (!contentStr) return;
      const data = JSON.parse(contentStr);
      if (data.intent && data.intent !== 'none') {
        socket.emit('assistant_action', data);
      }
    }
  } catch (err) {
    console.error('Intent parsing error:', err);
  }
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    model: GROQ_MODEL,
    voice: TTS_VOICE,
    hasGroqKey: Boolean(GROQ_API_KEY)
  });
});

io.on('connection', (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);
  if (!sessions.has(socket.id)) {
    sessions.set(socket.id, []);
    saveSessions();
  }

  socket.on('chat_message', async (payload) => {
    const text = typeof payload === 'string' ? payload : payload?.text;
    const personalContext = typeof payload === 'object' && typeof payload?.context === 'string'
      ? payload.context.trim().slice(0, 4000)
      : '';
    if (typeof text !== 'string') return;
    const userText = text.trim().slice(0, MAX_INPUT_CHARS);
    if (!userText) return;

    // --- Intent Detection for Theme Change ---
    const lower = userText.toLowerCase();
    if (lower.includes("change mode") || lower.includes("switch mode") || lower.includes("alternate mode")) {
      socket.emit('trigger_theme_change');
    }

    let history = sessions.get(socket.id);
    if (!history) {
      history = [];
      sessions.set(socket.id, history);
    }
    history.push({ role: 'user', content: userText });
    saveSessions();

    // Trigger Intent Extraction in parallel
    extractIntent(userText, socket).catch(console.error);
    
    try {
      if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is not configured on the backend.');
      }

      socket.emit('llm_start'); // signal thinking

      // 1. Prompt Guard
      const guardRes = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GUARD_MODEL,
          messages: [{ role: 'user', content: userText }]
        })
      });

      if (guardRes.ok) {
        const guardJson = await guardRes.json();
        const scoreStr = guardJson.choices?.[0]?.message?.content;
        if (scoreStr) {
          const score = parseFloat(scoreStr);
          if (score > 0.5) {
            const rejectMsg = "V.E.D. SECURITY ALERT: Input blocked by prompt guard protocol. Unsafe instructions detected.";
            socket.emit('llm_sentence', rejectMsg);
            socket.emit('llm_done');
            queueTTS(rejectMsg, socket);
            history.push({ role: 'assistant', content: rejectMsg });
            saveSessions();
            return;
          }
        }
      }

      // 2. Main LLM Stream
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(personalContext
          ? [{
              role: 'system',
              content: `Use this local personal-assistant context when relevant. Do not reveal it unless the user asks about saved memories, notes, or reminders.\n\n${personalContext}`
            }]
          : []),
        ...history
      ];

      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 512,
        })
      });

      if (!res.ok) {
        throw new Error(`Groq LLM Error: ${await res.text()}`);
      }

      // Read the stream
      let accumulated = '';
      let fullResponse = '';
      let lastSentenceIndex = 0;

      // We handle the stream using native fetch body reader
      // Node 18+ Response.body is a ReadableStream
      for await (const chunk of res.body) {
        const textChunk = Buffer.from(chunk).toString('utf-8');
        const lines = textChunk.split('\n');
        
        for (const line of lines) {
          const t = line.trim();
          if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(t.slice(6));
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              fullResponse += delta;
              socket.emit('llm_delta', fullResponse); // update UI text
              
              const match = accumulated.substring(lastSentenceIndex).match(/([.!?]+)(?:\s|\n|$)/);
              if (match) {
                const punctuationIndex = lastSentenceIndex + match.index + match[1].length;
                const newSentence = accumulated.substring(lastSentenceIndex, punctuationIndex).trim();
                if (newSentence) {
                  socket.emit('llm_sentence', newSentence);
                  // Queue TTS stream sequentially
                  queueTTS(newSentence, socket);
                }
                lastSentenceIndex = punctuationIndex;
              }
            }
          } catch (e) {
            // ignore JSON parse errors on partial chunks
          }
        }
      }

      // Flush remaining
      const remainingText = accumulated.substring(lastSentenceIndex).trim();
      if (remainingText) {
        socket.emit('llm_sentence', remainingText);
        queueTTS(remainingText, socket);
      }

      history.push({ role: 'assistant', content: fullResponse });
      saveSessions();
      socket.emit('llm_done');

    } catch (err) {
      console.error(err);
      socket.emit('llm_error', err.message);
    }
  });

  socket.on('manual_tts', async (text) => {
    if (typeof text !== 'string') return;
    const ttsText = text.trim().slice(0, MAX_INPUT_CHARS);
    if (!ttsText) return;
    queueTTS(ttsText, socket);
  });

  socket.on('transcribe_audio', async (audioBuffer) => {
    try {
      if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is missing.');
      // WebM is standard for browser MediaRecorder
      const blob = new Blob([audioBuffer], { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en'); // Optional but helps accuracy/speed

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: formData
      });

      if (!res.ok) {
        throw new Error(`Whisper API Error: ${await res.text()}`);
      }

      const json = await res.json();
      if (json.text && json.text.trim()) {
        socket.emit('transcription_result', json.text.trim());
      }
    } catch (err) {
      console.error('[Whisper] error:', err);
      socket.emit('llm_error', 'Transcription failed: ' + err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Client disconnected: ${socket.id}`);
    sessions.delete(socket.id);
  });
});

async function streamTTS(text, socket) {
  try {
    if (!GROQ_API_KEY) {
      console.error('TTS skipped: GROQ_API_KEY is not configured.');
      return;
    }

    const res = await fetch(GROQ_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        voice: TTS_VOICE,
        response_format: 'wav' // send raw WAV buffer
      })
    });

    if (!res.ok) {
      console.error('TTS Error', await res.text());
      return;
    }

    const arrayBuffer = await res.arrayBuffer();
    // Send binary buffer directly to frontend via socket.io
    socket.emit('tts_audio', { text, buffer: Buffer.from(arrayBuffer) });
  } catch (err) {
    console.error('streamTTS failed:', err);
  }
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[!] V.E.D. backend running on port ${PORT}`);
  });
}

module.exports = { app, server, io, corsOptions };
