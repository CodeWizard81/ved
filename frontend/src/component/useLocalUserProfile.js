import { useCallback, useEffect, useMemo, useState } from 'react';

const USERS_KEY = 'ved_local_users_v1';
const SESSION_KEY = 'ved_active_user_v1';

const emptyProfile = {
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

function loadUsers() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USERS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveUsers(users) {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function makeUserId(email, name) {
  const base = (email || name || 'operator').trim().toLowerCase();
  return base.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `operator-${Date.now()}`;
}

export default function useLocalUserProfile() {
  const [users, setUsers] = useState(loadUsers);
  const [activeUserId, setActiveUserId] = useState(() => window.localStorage.getItem(SESSION_KEY) || '');

  const activeProfile = activeUserId ? users[activeUserId] || null : null;

  useEffect(() => {
    saveUsers(users);
  }, [users]);

  const signUp = useCallback((profileInput) => {
    const profile = { ...emptyProfile, ...profileInput };
    if (!profile.accessCode?.trim()) {
      throw new Error('Create an access code for this local profile.');
    }
    const userId = makeUserId(profile.email, profile.name);
    const nextProfile = {
      ...profile,
      id: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setUsers(prev => ({ ...prev, [userId]: nextProfile }));
    setActiveUserId(userId);
    window.localStorage.setItem(SESSION_KEY, userId);
    return nextProfile;
  }, []);

  const signIn = useCallback((identity, accessCode) => {
    const normalized = identity.trim().toLowerCase();
    const found = Object.values(loadUsers()).find(user => (
      user.email?.toLowerCase() === normalized ||
      user.name?.toLowerCase() === normalized ||
      user.callSign?.toLowerCase() === normalized ||
      user.id === normalized
    ));

    if (!found) {
      throw new Error('No local operator profile found for that name, callsign, or email.');
    }

    if ((found.accessCode || '') !== accessCode) {
      throw new Error('Access code rejected.');
    }

    setUsers(loadUsers());
    setActiveUserId(found.id);
    window.localStorage.setItem(SESSION_KEY, found.id);
    return found;
  }, []);

  const updateProfile = useCallback((updates) => {
    if (!activeUserId) return null;
    let nextProfile = null;
    setUsers(prev => {
      const current = prev[activeUserId];
      if (!current) return prev;
      nextProfile = { ...current, ...updates, updatedAt: new Date().toISOString() };
      return { ...prev, [activeUserId]: nextProfile };
    });
    return nextProfile;
  }, [activeUserId]);

  const signOut = useCallback(() => {
    setActiveUserId('');
    window.localStorage.removeItem(SESSION_KEY);
  }, []);

  const profileContext = useMemo(() => {
    if (!activeProfile) return '';
    const details = [
      activeProfile.name && `User name: ${activeProfile.name}`,
      activeProfile.callSign && `Preferred callsign: ${activeProfile.callSign}`,
      activeProfile.role && `Role/work: ${activeProfile.role}`,
      activeProfile.location && `Location/time context: ${activeProfile.location}`,
      activeProfile.priorities && `Current priorities: ${activeProfile.priorities}`,
      activeProfile.preferences && `Preferences: ${activeProfile.preferences}`,
      activeProfile.assistantStyle && `Preferred assistant style: ${activeProfile.assistantStyle}`,
      activeProfile.privateDetails && `Important personal details: ${activeProfile.privateDetails}`
    ].filter(Boolean);

    return details.length ? `Operator profile:\n${details.map(item => `- ${item}`).join('\n')}` : '';
  }, [activeProfile]);

  return {
    users,
    hasUsers: Object.keys(users).length > 0,
    activeProfile,
    profileContext,
    signUp,
    signIn,
    signOut,
    updateProfile,
    emptyProfile
  };
}
