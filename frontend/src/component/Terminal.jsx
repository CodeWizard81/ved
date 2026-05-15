import React, { useEffect, useRef, useState } from 'react';
import './Terminal.css';

const ScanLine = () => <div className="scan-line" />;

const TTS_LABELS = {
  idle: { label: 'TTS INIT', cls: 'tts-idle' },
  loading: { label: 'TTS LOADING', cls: 'tts-loading' },
  ready: { label: 'TTS READY', cls: 'tts-ready' },
  speaking: { label: 'TTS SPEAK', cls: 'tts-speaking' },
  error: { label: 'TTS ERROR', cls: 'tts-error' },
};

const AssistantList = ({ tab, llmHistory, logLines, assistantMemory }) => {
  if (tab === 'history') {
    return llmHistory.length === 0 ? (
      <p className="placeholder-text">No conversation history yet.</p>
    ) : (
      llmHistory.map((entry, i) => (
        <div key={i} className={`history-entry role-${entry.role}`}>
          <span className="history-role">{entry.role === 'user' ? '> YOU' : '> V.E.D.'}</span>
          <p className="history-text">{entry.content}</p>
        </div>
      ))
    );
  }

  if (tab === 'reminders') {
    return !assistantMemory?.data.reminders.length ? (
      <p className="placeholder-text">No reminders yet.</p>
    ) : (
      assistantMemory.data.reminders.map(item => (
        <div key={item.id} className={`assistant-item ${item.done ? 'done' : ''}`}>
          <button
            className="mini-toggle"
            onClick={() => assistantMemory.toggleReminder(item.id)}
            title={item.done ? 'Mark active' : 'Mark done'}
          >
            {item.done ? 'DONE' : 'TODO'}
          </button>
          <div>
            <p className="assistant-item-text">{item.text}</p>
            <span>{item.when || 'No time set'}</span>
          </div>
          <button className="mini-delete" onClick={() => assistantMemory.deleteItem('reminders', item.id)}>x</button>
        </div>
      ))
    );
  }

  if (tab === 'notes') {
    return !assistantMemory?.data.notes.length ? (
      <p className="placeholder-text">No notes saved yet.</p>
    ) : (
      assistantMemory.data.notes.map(item => (
        <div key={item.id} className="assistant-item">
          <div>
            <p className="assistant-item-text">{item.text}</p>
            <span>{new Date(item.createdAt).toLocaleString()}</span>
          </div>
          <button className="mini-delete" onClick={() => assistantMemory.deleteItem('notes', item.id)}>x</button>
        </div>
      ))
    );
  }

  if (tab === 'memory') {
    return !assistantMemory?.data.memories.length ? (
      <p className="placeholder-text">No memories saved yet.</p>
    ) : (
      assistantMemory.data.memories.map(item => (
        <div key={item.id} className="assistant-item">
          <div>
            <p className="assistant-item-text">{item.text}</p>
            <span>{new Date(item.createdAt).toLocaleString()}</span>
          </div>
          <button className="mini-delete" onClick={() => assistantMemory.deleteItem('memories', item.id)}>x</button>
        </div>
      ))
    );
  }

  return logLines.length === 0 ? (
    <p className="placeholder-text">No system logs yet.</p>
  ) : (
    logLines.map((line, i) => (
      <div key={i} className={`log-line log-${line.type}`}>
        <span className="log-ts">{new Date(line.ts).toLocaleTimeString()}</span>
        <span className="log-badge">[{line.type.toUpperCase()}]</span>
        <span className="log-msg">{line.text}</span>
      </div>
    ))
  );
};

const Terminal = ({
  interimText,
  finalText,
  isListening,
  isThinking,
  llmResponse,
  llmHistory,
  logLines,
  ttsStatus,
  isMuted,
  toggleMute,
  stopSpeaking,
  manualStart,
  testSpeak,
  voiceAuth,
  voiceLockEnabled,
  assistantMemory,
}) => {
  const transcriptRef = useRef(null);
  const responseRef = useRef(null);
  const historyRef = useRef(null);
  const [tab, setTab] = useState('reminders');

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [interimText, finalText, voiceAuth?.enrollmentStep, voiceAuth?.sampleProgress]);

  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [llmResponse, isThinking]);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [llmHistory, logLines, assistantMemory?.data, tab]);

  const displayText = finalText + interimText;
  const ttsInfo = TTS_LABELS[ttsStatus] || TTS_LABELS.idle;
  const turns = Math.floor(llmHistory.length / 2);

  return (
    <aside className="terminal-root unified-terminal">
      <ScanLine />
      <section className="hud-panel unified-terminal-panel">
        <header className="unified-terminal-header">
          <div className="hud-panel-title">
            <span className="brand-diamond">::</span>
            <span>V.E.D. NEURAL INTERFACE</span>
            <span className="brand-version">v2.7.1</span>
          </div>

          <div className="terminal-compact-status">
            <span>{isListening ? 'LISTENING' : 'MIC OFFLINE'}</span>
            <span>{isThinking ? 'PROCESSING' : 'IDLE'}</span>
            <span>TURNS / {turns}</span>
          </div>
        </header>

        <div className="unified-terminal-grid">
          <section className="terminal-module speech-panel">
            <div className="pane-label">AUDIO INPUT STREAM</div>
            <div className="pane-content" ref={transcriptRef}>
              {voiceAuth?.enrollmentStep > 0 ? (
                <div className="enrollment-ui">
                  <h4>VOICEPRINT CAPTURE</h4>
                  <p>Phrase {voiceAuth.enrollmentStep} of {voiceAuth.enrollmentPrompts.length}</p>
                  <p className="enrollment-prompt">"{voiceAuth.currentPrompt}"</p>
                  <div className="voice-progress-track">
                    <span style={{ width: `${Math.round((voiceAuth.sampleProgress || 0) * 100)}%` }} />
                  </div>
                </div>
              ) : displayText ? (
                <p className="speech-text">
                  <span className="final-text">{finalText}</span>
                  <span className="interim-text">{interimText}</span>
                  <span className="cursor-block">|</span>
                </p>
              ) : isListening ? (
                <p className="placeholder-text">Awaiting voice input...</p>
              ) : (
                <div className="mic-offline-block">
                  <p className="placeholder-text">Microphone offline</p>
                  <button className="start-mic-btn" onClick={manualStart}>START LISTENING</button>
                </div>
              )}
            </div>
          </section>

          <section className="terminal-module response-panel">
            <div className="pane-label response-label">
              <span>V.E.D. RESPONSE STREAM</span>
              {isThinking && (
                <span className="thinking-dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
              )}
              <div className="tts-controls">
                <span className={`tts-badge ${ttsInfo.cls}`}>{ttsInfo.label}</span>
                <button className="tts-btn text-btn" onClick={testSpeak} title="Test voice">TEST</button>
                {ttsStatus === 'speaking' && (
                  <button className="tts-btn stop-btn" onClick={stopSpeaking} title="Stop speaking">STOP</button>
                )}
                <button
                  className={`tts-btn text-btn mute-btn ${isMuted ? 'muted' : ''}`}
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute V.E.D.' : 'Mute V.E.D.'}
                >
                  {isMuted ? 'UNMUTE' : 'MUTE'}
                </button>
              </div>
            </div>
            <div className="pane-content" ref={responseRef}>
              {llmResponse ? (
                <p className="response-text">
                  <span className="response-prefix">V.E.D. &gt; </span>
                  {llmResponse}
                  {isThinking && <span className="stream-cursor">|</span>}
                </p>
              ) : isThinking ? (
                <p className="placeholder-text thinking-placeholder">
                  <span className="thinking-bar" />
                  Generating response...
                </p>
              ) : (
                <p className="placeholder-text">Waiting for query...</p>
              )}
            </div>
          </section>

          <section className="terminal-module memory-panel">
            <div className="terminal-tabs">
              {['reminders', 'notes', 'memory', 'history', 'log'].map(t => (
                <button
                  key={t}
                  className={`tab-btn ${tab === t ? 'active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="pane-content history-content" ref={historyRef}>
              <AssistantList
                tab={tab}
                llmHistory={llmHistory}
                logLines={logLines}
                assistantMemory={assistantMemory}
              />
            </div>
          </section>
        </div>
      </section>
    </aside>
  );
};

export default Terminal;
