import crypto from 'crypto';
import express from 'express';
import { VaultStoreRequestSchema, VaultRetrieveRequestSchema } from '../src/types';

// Resolve encryption key securely (never exposed to client)
const VAULT_ENCRYPTION_KEY = process.env.VAULT_ENCRYPTION_KEY || 'default-insecure-dev-vault-encryption-key-fallback';
// Force 32 bytes via sha256
const ENCRYPTION_KEY = crypto.createHash('sha256').update(VAULT_ENCRYPTION_KEY).digest();

// In-memory secrets vault storage
const inMemoryVault: Record<string, string> = {};

/**
 * Encrypt plaintext using AES-256-GCM
 */
export function encryptValue(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(12); // Standard 12-byte IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Return combined hex payload: iv:encrypted:authTag
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypt ciphertext using AES-256-GCM
 */
export function decryptValue(encryptedText: string): string {
  if (!encryptedText) return '';
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format. Expected iv:encrypted:authTag');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const authTag = Buffer.from(parts[2], 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Router registration helper
export function registerSecretsVaultRoutes(app: express.Express, authMiddleware: express.RequestHandler) {
  // Store a secret key
  app.post("/api/secrets/vault/store", authMiddleware, (req: any, res) => {
    try {
      const result = VaultStoreRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues.map(e => e.message).join(', ') });
      }

      const { keyName, keyValue } = result.data;
      const userId = req.userId || 'system';
      const userKey = `${userId}_${keyName}`;

      // Store encrypted value or clear if empty
      if (!keyValue) {
        delete inMemoryVault[userKey];
        return res.json({ success: true, cleared: true, keyName });
      }

      const encrypted = encryptValue(keyValue);
      inMemoryVault[userKey] = encrypted;
      
      res.json({ 
        success: true, 
        keyName, 
        token: `vault-token-${Math.random().toString(36).substring(2, 10)}` 
      });
    } catch (err: any) {
      console.error("Secrets Vault Store Error:", err);
      res.status(500).json({ error: `Vault encryption failed: ${err.message}` });
    }
  });

  // Retrieve a secret key
  app.post("/api/secrets/vault/retrieve", authMiddleware, (req: any, res) => {
    try {
      const result = VaultRetrieveRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues.map(e => e.message).join(', ') });
      }

      const { keyName } = result.data;
      const userId = req.userId || 'system';
      const userKey = `${userId}_${keyName}`;

      if (!inMemoryVault[userKey]) {
        return res.json({ value: "" });
      }
      
      const decrypted = decryptValue(inMemoryVault[userKey]);
      res.json({ value: decrypted });
    } catch (err: any) {
      console.error("Secrets Vault Retrieve Error:", err);
      res.status(500).json({ error: `Vault decryption failed: ${err.message}` });
    }
  });
}
