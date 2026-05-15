import { useState, useRef, useCallback, useEffect } from 'react';
import socket from '../socket';

/**
 * useKokoroTTS (Audio Streaming via WebSocket)
 * Listens for binary audio chunks from the backend and queues them.
 */
const useKokoroTTS = () => {
  const [ttsStatus, setTtsStatus] = useState('ready');
  const [isMuted,   setIsMuted]   = useState(false);

  const audioCtxRef      = useRef(null);
  const isMutedRef       = useRef(false);
  const queueRef         = useRef([]);
  const isProcessingRef  = useRef(false);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef([]);

  isMutedRef.current = isMuted;

  // ── Stop current playback ────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    queueRef.current = [];
    isProcessingRef.current = false;
    
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (_) {}
    });
    activeSourcesRef.current = [];
    
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setTtsStatus('ready');
  }, []);

  // ── Process the Queue ────────────────────────────────────────────────────
  const processQueue = async () => {
    if (isProcessingRef.current || queueRef.current.length === 0 || isMutedRef.current) return;
    isProcessingRef.current = true;
    setTtsStatus('speaking');

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        nextStartTimeRef.current = 0;
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      while (queueRef.current.length > 0 && !isMutedRef.current) {
        const audioData = queueRef.current.shift();

        try {
          // Decode the ArrayBuffer sent by Socket.io
          const audioBuffer = await ctx.decodeAudioData(audioData);
          if (isMutedRef.current) break;

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);

          // Schedule it right after the previous one, or now if we lagged behind
          const scheduleAt = Math.max(nextStartTimeRef.current, ctx.currentTime);
          source.start(scheduleAt);
          
          nextStartTimeRef.current = scheduleAt + audioBuffer.duration;
          activeSourcesRef.current.push(source);

          source.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
            // If queue empty and all sources done, we are ready
            if (queueRef.current.length === 0 && activeSourcesRef.current.length === 0) {
              setTtsStatus('ready');
              isProcessingRef.current = false;
            }
          };

        } catch (err) {
          console.error('[TTS] decodeAudioData error:', err);
        }
      }
    } catch (err) {
      console.error('[TTS] processQueue error:', err);
      setTtsStatus('error');
    }

    if (queueRef.current.length === 0 && activeSourcesRef.current.length === 0) {
      setTtsStatus('ready');
    }
    isProcessingRef.current = false;
  };

  // ── WebSocket Listener ───────────────────────────────────────────────────
  useEffect(() => {
    socket.on('tts_audio', (data) => {
      if (isMutedRef.current) return;
      // Python backend sends {audio: <binary>, text: <str>}
      // socket.io delivers binary fields as ArrayBuffer in the browser
      let buf = null;
      if (data instanceof ArrayBuffer) {
        buf = data;
      } else if (data?.audio) {
        // May be Buffer (Node) or ArrayBuffer depending on client
        buf = data.audio instanceof ArrayBuffer
          ? data.audio
          : data.audio?.buffer ?? null;
      }
      if (!buf) return;
      queueRef.current.push(buf);
      if (!isProcessingRef.current) {
        processQueue();
      }
    });

    return () => {
      socket.off('tts_audio');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Manual synthesis (for test buttons) ───────────────────────────────────
  const speak = useCallback((text) => {
    if (!text?.trim() || isMutedRef.current) return;
    stopSpeaking();
    socket.emit('manual_tts', text);
  }, [stopSpeaking]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev) stopSpeaking();
      return !prev;
    });
  }, [stopSpeaking]);

  return { speak, enqueueText: () => {}, ttsStatus, isMuted, toggleMute, stopSpeaking };
};

export default useKokoroTTS;
