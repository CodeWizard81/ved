import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import socket from '../socket';

const STORAGE_KEY = 'ved_personal_assistant_v1';

const DEFAULT_DATA = {
  memories: [],
  notes: [],
  reminders: []
};

const hasItems = (data) => (
  Boolean(data?.memories?.length) ||
  Boolean(data?.notes?.length) ||
  Boolean(data?.reminders?.length)
);

const makeItem = (text, extra = {}) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  text: text.trim(),
  createdAt: new Date().toISOString(),
  ...extra
});

function loadData() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    const parsed = JSON.parse(raw);
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : []
    };
  } catch {
    return DEFAULT_DATA;
  }
}

function saveData(nextData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
}

function parseReminder(text) {
  const cleaned = text.trim();
  const lower = cleaned.toLowerCase();
  const patterns = [
    /^remind me to\s+(.+?)\s+(?:at|on|by)\s+(.+)$/i,
    /^set a reminder to\s+(.+?)\s+(?:at|on|by)\s+(.+)$/i,
    /^reminder\s*:\s*(.+?)\s+(?:at|on|by)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return { text: match[1].trim(), when: match[2].trim() };
  }

  if (lower.startsWith('remind me to ')) {
    return { text: cleaned.replace(/^remind me to\s+/i, '').trim(), when: '' };
  }

  if (lower.startsWith('set a reminder to ')) {
    return { text: cleaned.replace(/^set a reminder to\s+/i, '').trim(), when: '' };
  }

  return null;
}

export default function usePersonalAssistant(profileContext = '', userId = 'operator') {
  const [data, setData] = useState(loadData);
  const dataRef = useRef(data);
  dataRef.current = data;

  const syncToBackend = useCallback((nextData) => {
    if (!userId) return;
    socket.emit('personal_data_sync', {
      userId,
      payload: nextData
    });
  }, [userId]);

  const updateData = useCallback((updater) => {
    setData(prev => {
      const next = updater(prev);
      saveData(next);
      syncToBackend(next);
      return next;
    });
  }, [syncToBackend]);

  useEffect(() => {
    if (!userId) return undefined;

    const handleSnapshot = (snapshot) => {
      const next = {
        memories: Array.isArray(snapshot?.memories) ? snapshot.memories : [],
        notes: Array.isArray(snapshot?.notes) ? snapshot.notes : [],
        reminders: Array.isArray(snapshot?.reminders) ? snapshot.reminders : []
      };

      if (hasItems(next)) {
        setData(next);
        saveData(next);
        return;
      }

      if (hasItems(dataRef.current)) {
        syncToBackend(dataRef.current);
      }
    };

    socket.on('personal_data_snapshot', handleSnapshot);
    socket.emit('personal_data_request', { userId });

    return () => {
      socket.off('personal_data_snapshot', handleSnapshot);
    };
  }, [dataRef, syncToBackend, userId]);

  const addMemory = useCallback((text) => {
    if (!text.trim()) return null;
    const item = makeItem(text);
    updateData(prev => ({ ...prev, memories: [item, ...prev.memories].slice(0, 30) }));
    return item;
  }, [updateData]);

  const addNote = useCallback((text) => {
    if (!text.trim()) return null;
    const item = makeItem(text);
    updateData(prev => ({ ...prev, notes: [item, ...prev.notes].slice(0, 50) }));
    return item;
  }, [updateData]);

  const addReminder = useCallback((text, when = '') => {
    if (!text.trim()) return null;
    const item = makeItem(text, { when: when.trim(), done: false });
    updateData(prev => ({ ...prev, reminders: [item, ...prev.reminders].slice(0, 50) }));
    return item;
  }, [updateData]);

  const deleteItem = useCallback((type, id) => {
    updateData(prev => ({
      ...prev,
      [type]: prev[type].filter(item => item.id !== id)
    }));
  }, [updateData]);

  const toggleReminder = useCallback((id) => {
    updateData(prev => ({
      ...prev,
      reminders: prev.reminders.map(item => (
        item.id === id ? { ...item, done: !item.done } : item
      ))
    }));
  }, [updateData]);

  const clearAll = useCallback(() => {
    updateData(() => DEFAULT_DATA);
    if (userId) socket.emit('personal_data_clear', { userId });
  }, [updateData, userId]);

  const context = useMemo(() => {
    const memories = data.memories.slice(0, 8).map(item => `- ${item.text}`).join('\n');
    const notes = data.notes.slice(0, 6).map(item => `- ${item.text}`).join('\n');
    const reminders = data.reminders
      .filter(item => !item.done)
      .slice(0, 8)
      .map(item => `- ${item.text}${item.when ? ` (${item.when})` : ''}`)
      .join('\n');

    return [
      profileContext,
      memories && `Saved memories:\n${memories}`,
      notes && `Recent notes:\n${notes}`,
      reminders && `Active reminders:\n${reminders}`
    ].filter(Boolean).join('\n\n');
  }, [data, profileContext]);

  const handleCommand = useCallback((rawText) => {
    const text = rawText.trim();
    const lower = text.toLowerCase();

    if (lower.startsWith('remember that ')) {
      const item = addMemory(text.replace(/^remember that\s+/i, ''));
      return item ? `Memory saved: ${item.text}` : null;
    }

    if (lower.startsWith('remember ')) {
      const item = addMemory(text.replace(/^remember\s+/i, ''));
      return item ? `Memory saved: ${item.text}` : null;
    }

    if (lower.startsWith('take a note ') || lower.startsWith('take note ')) {
      const item = addNote(text.replace(/^take a note\s+/i, '').replace(/^take note\s+/i, ''));
      return item ? `Note captured: ${item.text}` : null;
    }

    if (lower.startsWith('note ')) {
      const item = addNote(text.replace(/^note\s+/i, ''));
      return item ? `Note captured: ${item.text}` : null;
    }

    const reminder = parseReminder(text);
    if (reminder) {
      const item = addReminder(reminder.text, reminder.when);
      if (!item) return null;
      return `Reminder set: ${item.text}${item.when ? ` at ${item.when}` : ''}`;
    }

    if (lower.includes('what do you remember')) {
      if (!data.memories.length) return 'I do not have saved memories yet.';
      return `I remember: ${data.memories.slice(0, 5).map(item => item.text).join('; ')}`;
    }

    if (lower.includes('show my notes')) {
      if (!data.notes.length) return 'No notes saved yet.';
      return `Recent notes: ${data.notes.slice(0, 5).map(item => item.text).join('; ')}`;
    }

    if (lower.includes('show my reminders')) {
      const active = data.reminders.filter(item => !item.done);
      if (!active.length) return 'No active reminders.';
      return `Active reminders: ${active.slice(0, 5).map(item => `${item.text}${item.when ? ` at ${item.when}` : ''}`).join('; ')}`;
    }

    return null;
  }, [addMemory, addNote, addReminder, data.memories, data.notes, data.reminders]);

  useEffect(() => {
    const handleAction = (action) => {
      if (action.intent === 'reminder') {
        addReminder(action.text, action.when || '');
      } else if (action.intent === 'note') {
        addNote(action.text);
      } else if (action.intent === 'memory') {
        addMemory(action.text);
      }
    };
    
    socket.on('assistant_action', handleAction);
    return () => socket.off('assistant_action', handleAction);
  }, [addMemory, addNote, addReminder]);

  return {
    data,
    context,
    handleCommand,
    addMemory,
    addNote,
    addReminder,
    deleteItem,
    toggleReminder,
    clearAll
  };
}
