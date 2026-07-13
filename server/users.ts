import crypto from 'crypto';
import { prisma } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'trading-terminal-super-secret-key-2026';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  vaultSalt?: string | null;
  createdAt: Date;
}

export async function createUser(id: string, email: string, passwordHash: string, salt: string, vaultSalt: string) {
  return prisma.user.create({
    data: {
      id,
      email: email.toLowerCase(),
      passwordHash,
      salt,
      vaultSalt,
    },
  });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
  });
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashPassword(password: string, salt: string, iterations: number = 100000): string {
  return crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
}

export function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const hashNew = hashPassword(password, salt, 100000);
  if (timingSafeEqualStrings(hashNew, storedHash)) {
    return true;
  }
  const hashLegacy = hashPassword(password, salt, 1000);
  if (timingSafeEqualStrings(hashLegacy, storedHash)) {
    return true;
  }
  return false;
}

export function generateToken(userId: string, email: string): string {
  const payload = {
    userId,
    email,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  };
  const payloadStr = JSON.stringify(payload);
  const base64Payload = Buffer.from(payloadStr).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(base64Payload).digest('base64url');
  return `${base64Payload}.${signature}`;
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [base64Payload, signature] = parts;
    
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(base64Payload).digest('base64url');
    if (!timingSafeEqualStrings(signature, expectedSignature)) return null;
    
    const payloadStr = Buffer.from(base64Payload, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadStr);
    
    if (payload.expiresAt < Date.now()) {
      return null;
    }
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}
