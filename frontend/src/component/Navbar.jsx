import React, { useState } from 'react';
import './Navbar.css';

const Navbar = ({
  activeView,
  setActiveView,
  voiceAuth,
  voiceLockEnabled,
  setVoiceLockEnabled,
  userProfile,
  assistantMemory
}) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <nav className="futuristic-navbar">
      <div className="nav-brand-hud">
        V.E.D.
      </div>
      
      <ul className="nav-links-hud">
        <li className={`nav-link-item-hud ${activeView === 'home' ? 'active' : ''}`}>
          <a href="#home" className="nav-link-hud" onClick={(e) => { e.preventDefault(); setActiveView?.('home'); }}>Home</a>
        </li>
        <li className={`nav-link-item-hud ${activeView === 'dashboard' ? 'active' : ''}`}>
          <a href="#dashboard" className="nav-link-hud" onClick={(e) => { e.preventDefault(); setActiveView?.('dashboard'); }}>Dashboard</a>
        </li>
        <li className="nav-link-item-hud" onClick={(e) => { e.preventDefault(); setShowSettings(!showSettings); }}>
          <a href="#settings" className="nav-link-hud">Settings</a>
        </li>
        <li className="nav-link-item-hud">
          <a href="#about" className="nav-link-hud">About</a>
        </li>
      </ul>

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <h3>SYSTEM CONFIGURATION</h3>
            <button className="close-btn" onClick={() => setShowSettings(false)}>x</button>
          </div>
          <div className="settings-section-label">OPERATOR PROFILE</div>

          <div className="setting-group assistant-data-summary">
            <label>{userProfile?.activeProfile?.callSign || userProfile?.activeProfile?.name || 'Operator'}</label>
            <div className="settings-readout">
              {userProfile?.activeProfile?.name || 'No name'} / {userProfile?.activeProfile?.role || 'No role set'}
            </div>
            <button 
              className="settings-action-btn"
              onClick={() => {
                userProfile?.signOut();
                setShowSettings(false);
              }}
            >
              SIGN OUT
            </button>
          </div>

          <div className="settings-section-label">VOICE LOCK</div>

          <div className="setting-group voice-setting-group">
            <label>Authentication status</label>
            <div className="voice-profile-row">
              <button 
                className="settings-action-btn"
                onClick={voiceAuth?.startEnrollment}
                disabled={voiceAuth?.enrollmentStep > 0}
              >
                {voiceAuth?.isEnrolled ? 'RE-ENROLL' : 'ENROLL'}
              </button>
              {voiceAuth?.isEnrolled && (
                <button 
                  className="settings-action-btn danger"
                  onClick={voiceAuth?.resetEnrollment}
                  disabled={voiceAuth?.enrollmentStep > 0}
                >
                  CLEAR
                </button>
              )}
            </div>
            <span className="settings-readout">
              {voiceAuth?.status || 'Voice profile not enrolled'}
            </span>
            {voiceAuth?.error && (
              <span className="settings-readout danger-readout">{voiceAuth.error}</span>
            )}
            {voiceAuth?.error && (
              <span className="settings-readout">
                Windows: Settings > Privacy & security > Microphone > enable microphone access and desktop app access.
              </span>
            )}
          </div>

          <div className="setting-group">
            <label>Voice Lock: {voiceLockEnabled ? 'ARMED' : 'OPEN'}</label>
            <button
              className={`settings-action-btn ${voiceLockEnabled ? 'danger' : ''}`}
              onClick={() => setVoiceLockEnabled?.(!voiceLockEnabled)}
            >
              {voiceLockEnabled ? 'DISARM VOICE LOCK' : 'ARM VOICE LOCK'}
            </button>
            <span className="settings-readout">
              Confidence {Math.round((voiceAuth?.confidence || 0) * 100)}% / Required {Math.round((voiceAuth?.threshold || 0.78) * 100)}%
            </span>
            <span className="settings-readout">
              Profile quality {Math.round((voiceAuth?.quality || 0) * 100)}% / Frames {voiceAuth?.isEnrolled ? 'stored locally' : 'none'}
            </span>
          </div>

          <div className="settings-section-label">PERSONAL DATA</div>

          <div className="setting-group assistant-data-summary">
            <label>Local memory core</label>
            <div className="settings-readout">
              {assistantMemory?.data.memories.length || 0} memories / {assistantMemory?.data.notes.length || 0} notes / {assistantMemory?.data.reminders.filter(item => !item.done).length || 0} active reminders
            </div>
            <button 
              className="settings-action-btn danger"
              onClick={assistantMemory?.clearAll}
            >
              CLEAR PERSONAL DATA
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
