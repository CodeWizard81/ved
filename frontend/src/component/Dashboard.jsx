import React from 'react';
import './Dashboard.css';

const empty = (label) => <p className="dashboard-empty">{label}</p>;

function DashboardList({ items, type, onDelete, onToggle }) {
  if (!items.length) return empty(`No ${type} yet.`);

  return (
    <div className="dashboard-list">
      {items.map(item => (
        <div key={item.id || item.createdAt || item.text} className={`dashboard-row ${item.done ? 'done' : ''}`}>
          {type === 'reminders' && (
            <button className="dash-pill" onClick={() => onToggle?.(item.id)}>
              {item.done ? 'DONE' : 'ACTIVE'}
            </button>
          )}
          <div className="dashboard-row-main">
            <p>{item.text || item.content}</p>
            <span>
              {item.when || item.role || (item.createdAt ? new Date(item.createdAt).toLocaleString() : '')}
            </span>
          </div>
          {item.id && (
            <button className="dash-delete" onClick={() => onDelete?.(type, item.id)}>x</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({
  isListening,
  isThinking,
  ttsStatus,
  isMuted,
  llmResponse,
  llmHistory,
  logLines,
  voiceAuth,
  voiceLockEnabled,
  assistantMemory,
  stopSpeaking,
  toggleMute,
  testSpeak
}) {
  const memories = assistantMemory?.data.memories || [];
  const notes = assistantMemory?.data.notes || [];
  const reminders = assistantMemory?.data.reminders || [];
  const activeReminders = reminders.filter(item => !item.done);
  const recentHistory = llmHistory.slice(-8).map((item, index) => ({ ...item, id: `${index}-${item.role}` }));
  const recentLogs = logLines.slice(-10).map((item, index) => ({ ...item, id: `${index}-${item.ts}`, text: item.text, role: item.type }));

  return (
    <main className="dashboard-root">
      <section className="dashboard-hero">
        <div>
          <span className="dash-kicker">AUTONOMOUS COMMAND MATRIX</span>
          <h1>Robotic Assistant Core</h1>
        </div>
        <div className="dashboard-sensor-stack" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="dashboard-actions">
          <button onClick={testSpeak}>TEST VOICE</button>
          <button onClick={toggleMute}>{isMuted ? 'UNMUTE' : 'MUTE'}</button>
          {ttsStatus === 'speaking' && <button onClick={stopSpeaking}>STOP</button>}
        </div>
      </section>

      <section className="dashboard-metrics">
        <div className="metric-card">
          <span>Audio</span>
          <strong>{isListening ? 'Listening' : 'Standby'}</strong>
        </div>
        <div className="metric-card">
          <span>Processor</span>
          <strong>{isThinking ? 'Thinking' : 'Idle'}</strong>
        </div>
        <div className="metric-card">
          <span>Voice Access</span>
          <strong>{voiceLockEnabled ? `${Math.round((voiceAuth?.confidence || 0) * 100)}%` : 'Open'}</strong>
        </div>
        <div className="metric-card">
          <span>Reminders</span>
          <strong>{activeReminders.length} Active</strong>
        </div>
        <div className="metric-card">
          <span>Memory</span>
          <strong>{memories.length} Items</strong>
        </div>
        <div className="metric-card">
          <span>Notes</span>
          <strong>{notes.length} Saved</strong>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-panel response-wide">
          <div className="dashboard-panel-title">Current Response</div>
          {llmResponse ? (
            <p className="dashboard-response">{llmResponse}</p>
          ) : (
            empty('No active response stream.')
          )}
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-title">Reminders</div>
          <DashboardList
            items={reminders}
            type="reminders"
            onDelete={assistantMemory?.deleteItem}
            onToggle={assistantMemory?.toggleReminder}
          />
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-title">Notes</div>
          <DashboardList items={notes} type="notes" onDelete={assistantMemory?.deleteItem} />
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-title">Memory</div>
          <DashboardList items={memories} type="memories" onDelete={assistantMemory?.deleteItem} />
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-title">Conversation History</div>
          <DashboardList items={recentHistory} type="history" />
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-panel-title">System Log</div>
          <DashboardList items={recentLogs} type="log" />
        </div>
      </section>
    </main>
  );
}
