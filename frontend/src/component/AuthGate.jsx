import React, { useMemo, useState } from 'react';
import './AuthGate.css';

const defaults = {
  name: '',
  callSign: '',
  email: '',
  role: '',
  location: '',
  priorities: '',
  preferences: '',
  assistantStyle: 'Calm, direct, and proactive',
  privateDetails: '',
  accessCode: ''
};

export default function AuthGate({ userProfile }) {
  const [mode, setMode] = useState(userProfile.hasUsers ? 'signin' : 'signup');
  const [form, setForm] = useState(defaults);
  const [identity, setIdentity] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');

  const completion = useMemo(() => {
    const keys = ['name', 'callSign', 'role', 'priorities', 'preferences', 'privateDetails'];
    const filled = keys.filter(key => form[key].trim()).length;
    return Math.round((filled / keys.length) * 100);
  }, [form]);

  const update = (key, value) => {
    setError('');
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSignUp = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Operator name is required.');
      return;
    }
    try {
      userProfile.signUp(form);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignIn = (event) => {
    event.preventDefault();
    try {
      userProfile.signIn(identity, accessCode);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="auth-root">
      <section className="auth-circuit-panel auth-left-array" aria-hidden="true">
        <div className="auth-radar">
          <span />
          <span />
          <span />
        </div>
        <div className="auth-cube-row">
          {[284, 408, 73, 395].map(value => (
            <div className="auth-chip" key={value}>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="auth-mainframe">
        <div className="auth-frame-header">
          <span>V.E.D. OPERATOR LINK</span>
          <span>{mode === 'signup' ? 'CREATE PROFILE' : 'RESTORE PROFILE'}</span>
        </div>

        <div className="auth-mode-toggle">
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); }}>
            SIGN IN
          </button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>
            SIGN UP
          </button>
        </div>

        {mode === 'signin' ? (
          <form className="auth-form" onSubmit={handleSignIn}>
            <label>
              <span>Operator name / callsign / email</span>
              <input
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                placeholder="Suchi / VED-01 / you@example.com"
              />
            </label>
            <label>
              <span>Access code</span>
              <input
                value={accessCode}
                type="password"
                onChange={(event) => setAccessCode(event.target.value)}
                placeholder="Local profile code"
              />
            </label>
            <button className="auth-primary" type="submit">SYNC PROFILE</button>
            {!userProfile.hasUsers && (
              <p className="auth-hint">No local profiles yet. Create one with Sign Up.</p>
            )}
          </form>
        ) : (
          <form className="auth-form auth-grid-form" onSubmit={handleSignUp}>
            <label>
              <span>Your name</span>
              <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="What should V.E.D. call you?" />
            </label>
            <label>
              <span>Callsign</span>
              <input value={form.callSign} onChange={(event) => update('callSign', event.target.value)} placeholder="Operator callsign" />
            </label>
            <label>
              <span>Email / local ID</span>
              <input value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="Optional local sign-in ID" />
            </label>
            <label>
              <span>Access code</span>
              <input type="password" value={form.accessCode} onChange={(event) => update('accessCode', event.target.value)} placeholder="Create a local access code" />
            </label>
            <label>
              <span>Role / work</span>
              <input value={form.role} onChange={(event) => update('role', event.target.value)} placeholder="Student, founder, developer..." />
            </label>
            <label>
              <span>Location / timezone</span>
              <input value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="City, schedule, timezone" />
            </label>
            <label>
              <span>Assistant style</span>
              <select value={form.assistantStyle} onChange={(event) => update('assistantStyle', event.target.value)}>
                <option>Calm, direct, and proactive</option>
                <option>Friendly, detailed, and motivating</option>
                <option>Fast, concise, and tactical</option>
                <option>Creative, futuristic, and playful</option>
              </select>
            </label>
            <label className="auth-wide">
              <span>Current priorities</span>
              <textarea value={form.priorities} onChange={(event) => update('priorities', event.target.value)} placeholder="Projects, exams, goals, health routines, people to remember..." />
            </label>
            <label className="auth-wide">
              <span>Preferences V.E.D. should know</span>
              <textarea value={form.preferences} onChange={(event) => update('preferences', event.target.value)} placeholder="How you like answers, reminders, planning, coding help..." />
            </label>
            <label className="auth-wide">
              <span>Personal details to remember</span>
              <textarea value={form.privateDetails} onChange={(event) => update('privateDetails', event.target.value)} placeholder="Name pronunciation, routines, important context, constraints..." />
            </label>
            <button className="auth-primary auth-wide" type="submit">INITIALIZE OPERATOR MEMORY</button>
          </form>
        )}

        {error && <div className="auth-error">{error}</div>}
      </section>

      <section className="auth-circuit-panel auth-right-array" aria-hidden="true">
        <div className="auth-gear">
          <span />
        </div>
        <div className="auth-spectrum">
          {Array.from({ length: 22 }, (_, index) => (
            <span key={index} style={{ '--h': `${22 + ((index * 13) % 88)}px` }} />
          ))}
        </div>
        <div className="auth-completion">
          <strong>{mode === 'signup' ? completion : userProfile.hasUsers ? 100 : 0}</strong>
          <span>PROFILE LOAD</span>
        </div>
      </section>
    </main>
  );
}
