import { useState, useEffect, useRef, useCallback } from 'react';
import Meyda from 'meyda';

const DB_NAME = 'VedVoiceDB';
const DB_VERSION = 3;
const STORE_NAME = 'profiles';
const PROFILE_KEY = 'ved_voice_profile_v3';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveProfile(profileArray) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(profileArray, PROFILE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function loadProfile() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(PROFILE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function clearProfile() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(PROFILE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0, normA = 0, normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const ENROLLMENT_PROMPTS = [
  "Say: 'V.E.D., initialize system diagnostics'",
  "Say: 'V.E.D., display the main power grid'",
  "Say: 'V.E.D., run a full security sweep'",
  "Say: 'V.E.D., calculate the optimal trajectory'",
  "Say: 'V.E.D., activate night protocol'"
];

const useVoiceAuthorization = ({ enabled = false, active = false } = {}) => {
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [enrollmentStep, setEnrollmentStep] = useState(0);
  const [score, setScore] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [status, setStatus] = useState('Voice profile not enrolled');
  const [error, setError] = useState('');
  const [threshold] = useState(0.72);

  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const analyzerRef = useRef(null);
  const profileRef = useRef(null);
  const isEnrollingRef = useRef(false);
  const mfccAccumulatorRef = useRef([]);
  const frameCountRef = useRef(0);
  const activeRef = useRef(false);

  // Initialize Meyda settings
  useEffect(() => {
    Meyda.numberOfMFCCCoefficients = 26;
  }, []);

  // Auto-load profile
  useEffect(() => {
    if (!enabled) return;
    loadProfile().then((savedProfile) => {
      if (savedProfile) {
        profileRef.current = savedProfile;
        setIsEnrolled(true);
        setStatus('Voice profile loaded');
      }
    }).catch(err => setError(`Profile load failed: ${err.message}`));
  }, [enabled]);

  const stopAnalyzer = useCallback(() => {
    activeRef.current = false;
    setIsVerifying(false);
    if (analyzerRef.current) {
      try { analyzerRef.current.stop(); } catch (_) {}
      analyzerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }
  }, []);

  const startAnalyzer = useCallback(async () => {
    if (analyzerRef.current) return; // already running
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtx();
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);

      analyzerRef.current = Meyda.createMeydaAnalyzer({
        audioContext: audioContextRef.current,
        source,
        bufferSize: 512,
        featureExtractors: ['mfcc'],
        callback: (features) => {
          if (!features?.mfcc) return;
          const mfcc = features.mfcc;

          if (isEnrollingRef.current) {
            if (mfccAccumulatorRef.current.length === 0) {
              mfccAccumulatorRef.current = new Array(mfcc.length).fill(0);
            }
            for (let i = 0; i < mfcc.length; i++) {
              mfccAccumulatorRef.current[i] += mfcc[i];
            }
            frameCountRef.current += 1;
          } else if (profileRef.current && activeRef.current) {
            const sim = cosineSimilarity(Array.from(mfcc), Array.from(profileRef.current));
            setScore(prev => prev * 0.8 + sim * 0.2);
            setConfidence(prev => prev * 0.85 + sim * 0.15);
          }
        }
      });
      analyzerRef.current.start();
      activeRef.current = true;
    } catch (err) {
      setError(`Microphone access failed: ${err.message}`);
    }
  }, []);

  // Start/stop verification based on active prop
  useEffect(() => {
    if (!enabled) return;
    if (active && isEnrolled && enrollmentStep === 0) {
      startAnalyzer().then(() => {
        setIsVerifying(true);
        setStatus('Voice lock monitoring');
      });
    } else if (!active && analyzerRef.current && !isEnrollingRef.current) {
      stopAnalyzer();
      setStatus(isEnrolled ? 'Voice profile loaded' : 'Voice profile not enrolled');
    }
  }, [active, enabled, isEnrolled, enrollmentStep, startAnalyzer, stopAnalyzer]);

  // Cleanup on unmount
  useEffect(() => () => stopAnalyzer(), [stopAnalyzer]);

  const startEnrollment = useCallback(async () => {
    if (!enabled) return;
    setError('');
    setIsEnrolled(false);
    setScore(0);
    setConfidence(0);
    isEnrollingRef.current = true;
    mfccAccumulatorRef.current = [];
    frameCountRef.current = 0;

    try {
      await clearProfile();
      profileRef.current = null;
      await startAnalyzer();

      const processStep = async (step) => {
        if (step > ENROLLMENT_PROMPTS.length) {
          // Finish enrollment
          if (frameCountRef.current === 0) throw new Error('No voice detected. Please speak clearly.');
          const avgMfcc = mfccAccumulatorRef.current.map(val => val / frameCountRef.current);
          const profileArray = new Float32Array(avgMfcc);
          await saveProfile(profileArray);
          profileRef.current = profileArray;
          isEnrollingRef.current = false;
          setIsEnrolled(true);
          setEnrollmentStep(0);
          setStatus('Voice profile enrolled successfully');
          return;
        }
        setEnrollmentStep(step);
        setStatus(`Recording phrase ${step} of ${ENROLLMENT_PROMPTS.length}...`);
        await new Promise(resolve => setTimeout(resolve, 4000));
        processStep(step + 1);
      };

      processStep(1);
    } catch (err) {
      setError(err.message);
      isEnrollingRef.current = false;
      setEnrollmentStep(0);
    }
  }, [enabled, startAnalyzer]);

  const resetEnrollment = useCallback(async () => {
    isEnrollingRef.current = false;
    stopAnalyzer();
    await clearProfile();
    profileRef.current = null;
    setIsEnrolled(false);
    setIsVerifying(false);
    setEnrollmentStep(0);
    setScore(0);
    setConfidence(0);
    setStatus('Voice profile cleared');
    setError('');
  }, [stopAnalyzer]);

  return {
    isEnrolled,
    isVerifying,
    enrollmentStep,
    score,
    confidence,
    threshold,
    status,
    error,
    startEnrollment,
    resetEnrollment,
    enrollmentPrompts: ENROLLMENT_PROMPTS,
    currentPrompt: enrollmentStep > 0 ? ENROLLMENT_PROMPTS[enrollmentStep - 1] : '',
    isAuthorized: !active || !isEnrolled || confidence >= threshold,
  };
};

export default useVoiceAuthorization;
