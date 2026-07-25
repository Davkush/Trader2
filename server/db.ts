// server/db.ts
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

let client = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const DB_PATH = path.join(process.cwd(), 'prisma', 'dev.db');

let isHealing = false;

function isMalformedDbError(err: any): boolean {
  const errMsg = String(err?.message || err?.stack || err || '');
  return (
    errMsg.includes('malformed') ||
    errMsg.includes('database disk image is malformed') ||
    errMsg.includes('SqliteError { extended_code: 11') ||
    errMsg.includes('extended_code: 11')
  );
}

async function healDatabase() {
  if (isHealing) {
    while (isHealing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return;
  }
  isHealing = true;
  console.warn('[DB RESILIENCE] Malformed SQLite database detected. Re-initializing database...');

  try {
    try {
      await client.$disconnect();
    } catch {}

    const journalPath = `${DB_PATH}-journal`;
    const walPath = `${DB_PATH}-wal`;
    const shmPath = `${DB_PATH}-shm`;

    for (const p of [DB_PATH, journalPath, walPath, shmPath]) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          console.log(`[DB RESILIENCE] Deleted file: ${p}`);
        } catch (err) {
          console.error(`[DB RESILIENCE] Failed to delete ${p}:`, err);
        }
      }
    }

    console.log('[DB RESILIENCE] Running npx prisma db push...');
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    console.log('[DB RESILIENCE] Database schema successfully synchronized.');

    client = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    console.log('[DB RESILIENCE] Seeding default system bots...');
    try {
      const { loadBots } = require('./botsEngine');
      await loadBots();
      console.log('[DB RESILIENCE] Default system bots successfully seeded.');
    } catch (seedErr) {
      console.error('[DB RESILIENCE] Failed to seed system bots during heal:', seedErr);
    }
  } catch (error) {
    console.error('[DB RESILIENCE] Critical error during database heal/reset:', error);
  } finally {
    isHealing = false;
  }
}

const handler: ProxyHandler<any> = {
  get(target, prop, receiver) {
    if (typeof prop === 'symbol') {
      return Reflect.get(client, prop);
    }
    if (prop === 'then') return undefined; // Avoid promise-like behavior on the client itself

    const val = Reflect.get(client, prop); // Use live client reference

    if (typeof val === 'function') {
      return async function (this: any, ...args: any[]) {
        try {
          return await val.apply(client, args);
        } catch (err: any) {
          if (isMalformedDbError(err)) {
            await healDatabase();
            const newVal = Reflect.get(client, prop);
            return await newVal.apply(client, args);
          }
          throw err;
        }
      };
    }

    if (val && typeof val === 'object') {
      if (val._resilient) return val;
      
      const delegateProxy = new Proxy(val, {
        get(subTarget, subProp) {
          if (typeof subProp === 'symbol') {
            return Reflect.get(subTarget, subProp);
          }
          if (subProp === '_resilient') return true;
          if (subProp === 'then') return undefined;

          const subVal = Reflect.get(subTarget, subProp);
          if (typeof subVal === 'function') {
            return async function (this: any, ...args: any[]) {
              try {
                return await subVal.apply(subTarget, args);
              } catch (err: any) {
                if (isMalformedDbError(err)) {
                  await healDatabase();
                  const newDelegate = Reflect.get(client, prop);
                  const newMethod = Reflect.get(newDelegate, subProp);
                  return await newMethod.apply(newDelegate, args);
                }
                throw err;
              }
            };
          }
          return subVal;
        },
      });
      return delegateProxy;
    }

    return val;
  },
};

export const prisma = new Proxy(client, handler) as unknown as PrismaClient;
