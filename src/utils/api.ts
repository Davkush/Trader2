export const SESSION_TOKEN_KEY = 'trading_terminal_session_token';
export const SESSION_USER_KEY = 'trading_terminal_session_user';

export function getSessionToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function getSessionUser(): { id: string; email: string; vaultSalt?: string } | null {
  if (typeof localStorage === 'undefined') return null;
  const user = localStorage.getItem(SESSION_USER_KEY);
  try {
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: { id: string; email: string; vaultSalt?: string }) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
  }
}

export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    const token = getSessionToken() || 'quant-vault-preview-token-2026';
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    headers,
  });
}
