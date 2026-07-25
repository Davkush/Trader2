// utils/crypto.ts

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function encryptData(data: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(data));
  
  // Format: salt_b64.iv_b64.ciphertext_b64
  return (
    arrayBufferToBase64(salt) + '.' +
    arrayBufferToBase64(iv) + '.' +
    arrayBufferToBase64(encrypted)
  );
}

export async function decryptData(encryptedData: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const parts = encryptedData.split('.');
  
  if (parts.length === 3) {
    // New dynamic salt format
    const saltPart = parts[0];
    const ivPart = parts[1];
    const cipherPart = parts[2];
    
    const salt = base64ToUint8Array(saltPart);
    const iv = base64ToUint8Array(ivPart);
    const ciphertext = base64ToUint8Array(cipherPart);

    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } else if (parts.length === 2) {
    // Legacy static salt format
    const ivPart = parts[0];
    const cipherPart = parts[1];
    
    const iv = base64ToUint8Array(ivPart);
    const ciphertext = base64ToUint8Array(cipherPart);

    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('trader2-salt'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } else {
    throw new Error('Invalid encrypted data format');
  }
}

/**
 * Resolves a dynamic user-tied password/key derived from their session token & vault salt
 */
export function getDerivedUserPassword(): string {
  if (typeof localStorage === 'undefined') return 'trader-terminal-default-session-salt-2026';
  const token = localStorage.getItem('trading_terminal_session_token');
  const userRaw = localStorage.getItem('trading_terminal_session_user');
  
  let userId = '';
  let vaultSalt = '';
  
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        // Decode base64url payload
        const payloadStr = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr);
        userId = payload.userId || '';
      }
    } catch {}
  }
  
  if (userRaw) {
    try {
      const userObj = JSON.parse(userRaw);
      userId = userId || userObj.id || '';
      vaultSalt = userObj.vaultSalt || '';
    } catch {}
  }
  
  if (userId) {
    // Combine userId with user's specific random vaultSalt
    return `${userId}-${vaultSalt || 'stable-fallback-salt-2026'}`;
  }
  
  return 'trader-terminal-default-session-salt-2026';
}

/**
 * High-level helper to safely save encrypted string/object in localStorage
 */
export async function saveEncryptedToStorage(key: string, value: any, password?: string): Promise<void> {
  try {
    const rawString = typeof value === 'string' ? value : JSON.stringify(value);
    const secret = password || getDerivedUserPassword();
    const encrypted = await encryptData(rawString, secret);
    localStorage.setItem(key, encrypted);
  } catch (err) {
    console.error(`Failed to save key: ${key}`, err);
  }
}

/**
 * High-level helper to safely load and decrypt from localStorage
 */
export async function loadDecryptedFromStorage<T>(key: string, password?: string): Promise<T | null> {
  try {
    const rawVal = localStorage.getItem(key);
    if (!rawVal) return null;
    
    // Check if it's plaintext (e.g. legacy/plain string like "true") or encrypted
    if (rawVal.includes('.')) {
      // It's in encrypted format. Let's decrypt it gracefully using the password or dynamic fallback key.
      const secret = password || getDerivedUserPassword();
      try {
        const decrypted = await decryptData(rawVal, secret);
        try {
          return JSON.parse(decrypted) as T;
        } catch {
          return decrypted as any;
        }
      } catch (err) {
        // Dynamic decryption failed (e.g. key changed or old layout format). Fallback to old fallback key.
        try {
          const decryptedLegacy = await decryptData(rawVal, 'trader-terminal-default-session-salt-2026');
          try {
            return JSON.parse(decryptedLegacy) as T;
          } catch {
            return decryptedLegacy as any;
          }
        } catch {
          console.warn(`Decryption failed for key ${key} with both dynamic and legacy key.`);
          return null;
        }
      }
    }

    try {
      return JSON.parse(rawVal) as T;
    } catch {
      return rawVal as any;
    }
  } catch (err) {
    console.warn(`Failed to decrypt key: ${key}`, err);
    return null;
  }
}
