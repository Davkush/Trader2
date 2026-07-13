import { describe, it, expect, beforeEach } from 'vitest';
import { encryptData, decryptData, saveEncryptedToStorage, loadDecryptedFromStorage } from './crypto';

const storageMock: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => storageMock[key] || null,
  setItem: (key: string, val: string) => { storageMock[key] = val; },
  removeItem: (key: string) => { delete storageMock[key]; },
  clear: () => { for (const k in storageMock) delete storageMock[k]; },
  length: 0,
  key: (idx: number) => null,
};

describe('Web Crypto Encryption Utilities Unit Tests', () => {
  const secretPassword = 'my-super-secret-pass-2026';
  const originalPayload = { userId: 'usr_10029', activeBots: ['bot_a', 'bot_b'], balance: 25400.50 };

  beforeEach(() => {
    localStorage.clear();
  });

  it('should encrypt and correctly decrypt strings with a secret password', async () => {
    const rawString = JSON.stringify(originalPayload);
    const encrypted = await encryptData(rawString, secretPassword);
    
    expect(encrypted).toContain('.');
    expect(encrypted).not.toEqual(rawString);

    const decrypted = await decryptData(encrypted, secretPassword);
    expect(decrypted).toEqual(rawString);
    expect(JSON.parse(decrypted)).toEqual(originalPayload);
  });

  it('should throw an error if decrypting with an incorrect password', async () => {
    const rawString = 'Sensitive trade credentials';
    const encrypted = await encryptData(rawString, secretPassword);

    await expect(decryptData(encrypted, 'wrong-password')).rejects.toThrow();
  });

  it('should handle saving and loading encrypted values from localStorage gracefully', async () => {
    const key = 'secure_user_positions';
    await saveEncryptedToStorage(key, originalPayload, secretPassword);

    const encryptedInStore = localStorage.getItem(key);
    expect(encryptedInStore).not.toBeNull();
    expect(encryptedInStore).toContain('.');

    const loadedPayload = await loadDecryptedFromStorage<typeof originalPayload>(key, secretPassword);
    expect(loadedPayload).toEqual(originalPayload);
  });

  it('should successfully encrypt and decrypt very large payloads without call stack limits', async () => {
    const largeString = 'a'.repeat(200000); // 200KB payload
    const encrypted = await encryptData(largeString, secretPassword);
    expect(encrypted).toContain('.');
    
    const decrypted = await decryptData(encrypted, secretPassword);
    expect(decrypted).toBe(largeString);
  });

  it('should fallback gracefully to legacy unencrypted values in localStorage', async () => {
    const key = 'legacy_plain_key';
    const plainString = 'true';
    localStorage.setItem(key, plainString);

    const value = await loadDecryptedFromStorage<boolean>(key, secretPassword);
    expect(value).toBe(true);
  });
});
