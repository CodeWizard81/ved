import './App.css';
import Navbar from './component/Navbar';
import AuthGate from './component/AuthGate';
import Terminal from './component/Terminal';
import Dashboard from './component/Dashboard';
import NeuralMicInterface from './component/NeuralMicInterface';
import useSpeechRecognition from './component/useSpeechRecognition';
import useKokoroTTS from './component/useKokoroTTS';
import useVoiceAuthorization from './component/useVoiceAuthorization';
import usePersonalAssistant from './component/usePersonalAssistant';
import useLocalUserProfile from './component/useLocalUserProfile';
import './jarvisVedTheme.css';
import { useState, useEffect } from 'react';
import socket from './socket';


const PRIVACY_CONSENT_KEY = 'ved_privacy_consent_v1';

function App() {
  const [hasPrivacyConsent, setHasPrivacyConsent] = useState(() => (
    window.localStorage.getItem(PRIVACY_CONSENT_KEY) === 'accepted'
  ));
  const [activeView, setActiveView] = useState('home');
  const [voiceLockEnabled, setVoiceLockEnabled] = useState(false);
  
  const [cursorPosition, setCursorPosition] = useState({ x: 50, y: 50 });

  const { speak, ttsStatus, isMuted, toggleMute, stopSpeaking } = useKokoroTTS();
  
  const userProfile = useLocalUserProfile();
  const assistantMemory = usePersonalAssistant(
    userProfile.profileContext,
    userProfile.activeProfile?.id || 'operator'
  );
  const voiceAuth = useVoiceAuthorization({
    enabled: hasPrivacyConsent,
    active: voiceLockEnabled
  });

  useEffect(() => {
    if (!hasPrivacyConsent) return;

    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [hasPrivacyConsent]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      setCursorPosition({
        x: Math.round((event.clientX / window.innerWidth) * 100),
        y: Math.round((event.clientY / window.innerHeight) * 100)
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  const acceptPrivacyConsent = () => {
    window.localStorage.setItem(PRIVACY_CONSENT_KEY, 'accepted');
    setHasPrivacyConsent(true);
  };

  const {
    interimText,
    finalText,
    isListening,
    isThinking,
    llmResponse,
    llmHistory,
    logLines,
    manualStart,
  } = useSpeechRecognition({ 
    enabled: hasPrivacyConsent && Boolean(userProfile.activeProfile),
    ignoreAudio: ttsStatus === 'speaking',
    voiceLockEnabled,
    voiceConfidence: voiceAuth.confidence,
    voiceThreshold: voiceAuth.threshold,
    isVoiceEnrolled: voiceAuth.isEnrolled,
    assistantContext: assistantMemory.context,
    onAssistantCommand: assistantMemory.handleCommand
  });

  return (
    <div
      className="App robotic-ui"
      style={{
        '--cursor-x': `${cursorPosition.x}%`,
        '--cursor-y': `${cursorPosition.y}%`
      }}
    >
      <div className="robotic-target-layer" aria-hidden="true">
        <span className="robotic-crosshair" />
        <span className="robotic-corner robotic-corner-tl" />
        <span className="robotic-corner robotic-corner-tr" />
        <span className="robotic-corner robotic-corner-bl" />
        <span className="robotic-corner robotic-corner-br" />
      </div>
      {!hasPrivacyConsent && (
        <div className="privacy-consent">
          <div className="privacy-consent-panel">
            <h1>V.E.D. Voice Access</h1>
            <p>
              V.E.D. uses your microphone for speech commands and can store assistant memory,
              notes, and reminders in this browser. Audio is processed for commands only after
              you enable access.
            </p>
            <div className="privacy-consent-actions">
              <button type="button" onClick={acceptPrivacyConsent}>Enable Voice Interface</button>
            </div>
          </div>
        </div>
      )}
      {!userProfile.activeProfile && (
        <AuthGate userProfile={userProfile} />
      )}
      
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
        voiceAuth={voiceAuth}
        voiceLockEnabled={voiceLockEnabled}
        setVoiceLockEnabled={setVoiceLockEnabled}
        userProfile={userProfile}
        assistantMemory={assistantMemory}
      />
      {activeView !== 'dashboard' && (
        <NeuralMicInterface
          isListening={isListening}
          isThinking={isThinking}
          manualStart={manualStart}
        />
      )}
      {activeView === 'dashboard' ? (
        <Dashboard
          isListening={isListening}
          isThinking={isThinking}
          ttsStatus={ttsStatus}
          isMuted={isMuted}
          llmResponse={llmResponse}
          llmHistory={llmHistory}
          logLines={logLines}
          voiceAuth={voiceAuth}
          voiceLockEnabled={voiceLockEnabled}
          assistantMemory={assistantMemory}
          stopSpeaking={stopSpeaking}
          toggleMute={toggleMute}
          testSpeak={() => speak("Dashboard online. Personal assistant systems are synchronized.")}
        />
      ) : (
        <Terminal
        interimText={interimText}
        finalText={finalText}
        isListening={isListening}
        isThinking={isThinking}
        llmResponse={llmResponse}
        llmHistory={llmHistory}
        logLines={logLines}
        ttsStatus={ttsStatus}
        isMuted={isMuted}
        toggleMute={toggleMute}
        stopSpeaking={stopSpeaking}
        manualStart={manualStart}
        testSpeak={() => speak("Systems online. Voice module is fully operational.")}
        voiceAuth={voiceAuth}
        voiceLockEnabled={voiceLockEnabled}
        assistantMemory={assistantMemory}
      />
      )}
    </div>
  );
}

export default App;
