import { describe, it, expect } from 'vitest';
import { encryptValue, decryptValue } from './secretsVault';

describe('Secrets Vault Crypto', () => {
  it('should encrypt and decrypt a value successfully in a round-trip', () => {
    const secret = 'super-secret-api-key-12345';
    const encrypted = encryptValue(secret);
    expect(encrypted).not.toBe(secret);
    expect(encrypted).toContain(':');

    const decrypted = decryptValue(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('should return empty string for empty inputs', () => {
    expect(encryptValue('')).toBe('');
    expect(decryptValue('')).toBe('');
  });

  it('should throw an error for invalid format', () => {
    expect(() => decryptValue('invalid-format-no-colons')).toThrow('Invalid encrypted format');
    expect(() => decryptValue('part1:part2')).toThrow('Invalid encrypted format');
  });

  it('should throw an error when decryption is attempted with a tampered auth tag', () => {
    const secret = 'sensitive-credentials';
    const encrypted = encryptValue(secret);
    
    // Format is iv:encrypted:authTag
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);

    // Tamper with the auth tag (part 3)
    parts[2] = '00000000000000000000000000000000'; // overwrite with zeroed-out tag
    const tampered = parts.join(':');

    // Decipher should fail integrity check and throw error
    expect(() => decryptValue(tampered)).toThrow();
  });

  it('should throw an error when decryption is attempted with tampered cipher text', () => {
    const secret = 'sensitive-credentials';
    const encrypted = encryptValue(secret);
    
    const parts = encrypted.split(':');
    // Tamper with the encrypted ciphertext (part 2)
    parts[1] = parts[1].substring(0, parts[1].length - 2) + '00';
    const tampered = parts.join(':');

    expect(() => decryptValue(tampered)).toThrow();
  });
});
