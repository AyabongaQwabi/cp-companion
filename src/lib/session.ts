'use client';

export interface Session {
  id: string;
  name: string;
  surname: string;
  email: string;
  companies: { id: string; name: string }[];
  creditBalance: number;
}

const KEY = 'cp_companion_session';

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
