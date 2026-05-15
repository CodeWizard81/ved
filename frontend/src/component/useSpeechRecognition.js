import { useEffect, useRef, useState, useCallback } from 'react';
import Meyda from 'meyda';
import socket from '../socket';

const useSpeechRecognition = ({ 
  enabled = false,
  ignoreAudio = false, 
  voiceLockEnabled = false,
  voiceConfidence = 0,
  voiceThreshold = 0.78,
  isVoiceEnrolled = false,
  assistantContext = '',
  onAssistantCommand
} = {}) => {
  const [interimText, setInterimText] = useState('');
  const [finalText,   setFinalText]   = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking,  setIsThinking]  = useState(false);
  const [llmResponse, setLlmResponse] = useState('');
  const [llmHistory,  setLlmHistory]  = useState([]);
  const [logLines,    setLogLines]    = useState([]);

  // Refs
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const analyzerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const isRecordingRef = useRef(false);
  const silenceStartRef = useRef(0);
  const ignoreAudioRef = useRef(false);
  const activeRef = useRef(false);

  // Security & context refs
  const lastAuthBlockRef = useRef(0);
  const voiceLockRef = useRef({ enabled: false, confidence: 0, threshold: 0.78, enrolled: false });
  const assistantContextRef = useRef('');
  const onAssistantCommandRef = useRef(null);

  ignoreAudioRef.current = ignoreAudio;
  voiceLockRef.current = { enabled: voiceLockEnabled, confidence: voiceConfidence, threshold: voiceThreshold, enrolled: isVoiceEnrolled };
  assistantContextRef.current = assistantContext;
  onAssistantCommandRef.current = onAssistantCommand;

  const addLog = useCallback((type, text) => {
    setLogLines(prev => [...prev, { type, text, ts: Date.now() }]);
  }, []);

  // ── WebSocket Subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    socket.on('llm_start', () => { setIsThinking(true); setLlmResponse(''); });
    socket.on('llm_delta', (fullResponse) => { setLlmResponse(fullResponse); });
    socket.on('llm_done', () => { setIsThinking(false); });
    socket.on('llm_error', (errMsg) => {
      setLlmResponse(`[ERROR] ${errMsg}`);
      addLog('error', errMsg);
      setIsThinking(false);
    });

    socket.on('transcription_result', (text) => {
      if (!text) return;
      
      const toSend = text;
      setFinalText(toSend);
      setInterimText('');
      setTimeout(() => setFinalText(''), 2000); // clear after brief display

      const voiceLock = voiceLockRef.current;
      if (voiceLock.enabled) {
        const now = Date.now();
        if (!voiceLock.enrolled) {
          if (now - lastAuthBlockRef.current > 2500) {
            addLog('error', 'Voice Lock is enabled, but no voice profile is enrolled.');
            lastAuthBlockRef.current = now;
          }
          return;
        }
        if (voiceLock.confidence < voiceLock.threshold) {
          if (now - lastAuthBlockRef.current > 2500) {
            addLog('error', `Voice Lock blocked command. Confidence ${Math.round(voiceLock.confidence * 100)}% / required ${Math.round(voiceLock.threshold * 100)}%.`);
            lastAuthBlockRef.current = now;
          }
          return;
        }
      }

      addLog('user', toSend);
      setLlmHistory(prev => [...prev, { role: 'user', content: toSend }]);
      const localResponse = onAssistantCommandRef.current?.(toSend);
      if (localResponse) {
        setLlmResponse(localResponse);
        setLlmHistory(prev => [...prev, { role: 'assistant', content: localResponse }]);
        addLog('assistant', localResponse);
        socket.emit('manual_tts', localResponse);
        return;
      }
      socket.emit('chat_message', {
        text: toSend,
        context: assistantContextRef.current
      });
    });

    return () => {
      socket.off('llm_start');
      socket.off('llm_delta');
      socket.off('llm_done');
      socket.off('llm_error');
      socket.off('transcription_result');
    };
  }, [addLog]);

  // ── Groq Whisper + VAD Logic ──────────────────────────────────────────────
  const startRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'recording') return;
    audioChunksRef.current = [];
    try {
      mediaRecorderRef.current.start();
      isRecordingRef.current = true;
    } catch(e) {}
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
    try {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
    } catch(e) {}
    silenceStartRef.current = 0;
  };

  const startMic = useCallback(async () => {
    if (activeRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaStreamSource(stream);

      await audioCtx.audioWorklet.addModule(`${process.env.PUBLIC_URL || ''}/rms-processor.js`);
      const rmsNode = new AudioWorkletNode(audioCtx, 'rms-processor');
      rmsNode.port.onmessage = (event) => {
        if (!activeRef.current || ignoreAudioRef.current) {
           if (isRecordingRef.current) stopRecording();
           return;
        }

        const rms = event.data || 0;
        const isSpeaking = rms > 0.015; // Threshold

        if (isSpeaking) {
          silenceStartRef.current = 0;
          if (!isRecordingRef.current) startRecording();
        } else {
          if (isRecordingRef.current) {
            if (silenceStartRef.current === 0) silenceStartRef.current = Date.now();
            else if (Date.now() - silenceStartRef.current > 1200) { // 1.2s silence
              stopRecording();
            }
          }
        }
      };
      
      source.connect(rmsNode);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        if (blob.size > 2000) { // filter out empty blips
           socket.emit('transcribe_audio', blob);
           setInterimText('Transcribing via Whisper...');
        }
        isRecordingRef.current = false;
      };

      audioCtxRef.current = audioCtx;
      streamRef.current = stream;
      analyzerRef.current = rmsNode;
      mediaRecorderRef.current = mediaRecorder;
      activeRef.current = true;
      setIsListening(true);
    } catch (err) {
      addLog('error', `Microphone access denied or unavailable: ${err.message}`);
      setIsListening(false);
    }
  }, [addLog]);

  const stopMic = useCallback(() => {
    activeRef.current = false;
    setIsListening(false);
    if (analyzerRef.current) { try { analyzerRef.current.disconnect(); } catch(e){} }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch(e){}
    }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch(e){} }
  }, []);

  useEffect(() => {
    if (enabled) {
      startMic();
    } else {
      stopMic();
    }
    return () => stopMic();
  }, [enabled, startMic, stopMic]);

  const manualStart = useCallback(() => {
    stopMic();
    setTimeout(startMic, 300);
  }, [startMic, stopMic]);

  return {
    interimText,
    finalText,
    isListening,
    isThinking,
    llmResponse,
    llmHistory,
    logLines,
    manualStart,
  };
};

export default useSpeechRecognition;
