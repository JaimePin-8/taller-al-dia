// Almacenamiento en memoria para pruebas y para el servidor local de desarrollo.
import type { Account, CodeRec, DeviceRec, SessionRec, Store } from './handler.ts';

export function memoryStore(): Store & { _accounts: Map<string, Account> } {
  const accounts = new Map<string, Account>();
  const attempts = new Map<string, { fails: number; lockedUntil: number | null; updatedAt: number }>();
  const codes = new Map<string, CodeRec>();
  const sessions = new Map<string, SessionRec>();
  const devices = new Map<string, DeviceRec>();
  const data = new Map<string, { data: unknown; version: number }>();
  const clone = <T>(x: T): T => structuredClone(x);
  const find = (f: (a: Account) => boolean) => { for (const a of accounts.values()) if (f(a)) return clone(a); return null; };

  return {
    _accounts: accounts,
    async getAccountByEmail(email) { return find(a => a.email === email); },
    async getAccount(id) { return find(a => a.id === id); },
    async getAccountByCustomer(c) { return find(a => a.stripeCustomerId === c); },
    async createAccount({ email, passwordHash, shopName, privacyVersion, privacyAcceptedAt }) {
      if (find(a => a.email === email)) throw new Error('duplicado');
      const a: Account = { id: crypto.randomUUID(), email, passwordHash, shopName, privacyVersion, privacyAcceptedAt, emailVerifiedAt: null, createdAt: Date.now(), stripeCustomerId: null,
        sub: { status: 'none', plan: null, periodEnd: null, trialEnd: null, cancelAtPeriodEnd: false, trialUsed: false } };
      accounts.set(a.id, a);
      return clone(a);
    },
    async updateAccount(id, patch) {
      const a = accounts.get(id)!;
      const { sub, ...rest } = patch;
      Object.assign(a, rest);
      if (sub) Object.assign(a.sub, sub);
      return clone(a);
    },
    async getAttempt(key) { const a = attempts.get(key); return a ? { fails: a.fails, lockedUntil: a.lockedUntil } : null; },
    async failAttempt(key, max, lockMs, now) {
      const a = attempts.get(key);
      let fails = a && now - a.updatedAt < 86_400_000 ? a.fails + 1 : 1;
      let lockedUntil: number | null = null;
      if (fails >= max) { fails = 0; lockedUntil = now + lockMs; }
      attempts.set(key, { fails, lockedUntil, updatedAt: now });
      return { fails, lockedUntil };
    },
    async clearAttempt(key) { attempts.delete(key); },
    async createCode(c) { codes.set(c.id, clone(c)); },
    async getCode(id) { const c = codes.get(id); return c ? clone(c) : null; },
    async updateCode(id, patch) { Object.assign(codes.get(id)!, patch); },
    async countCodesSince(accountId, since) { return [...codes.values()].filter(c => c.accountId === accountId && c.createdAt >= since).length; },
    async createSession(s) { sessions.set(s.tokenHash, clone(s)); },
    async getSession(h) { const s = sessions.get(h); return s ? clone(s) : null; },
    async deleteSession(h) { sessions.delete(h); },
    async deleteSessionsForAccount(id) { for (const [k, s] of sessions) if (s.accountId === id) sessions.delete(k); },
    async createDevice(dv) { devices.set(dv.tokenHash, clone(dv)); },
    async getDevice(h) { const dv = devices.get(h); return dv ? clone(dv) : null; },
    async deleteDevicesForAccount(id) { for (const [k, dv] of devices) if (dv.accountId === id) devices.delete(k); },
    async getData(id) { const r = data.get(id); return r ? clone(r) : null; },
    async putData(id, d, base) {
      const cur = data.get(id);
      if ((cur?.version ?? 0) !== base) return { ok: false, data: clone(cur?.data ?? null), version: cur?.version ?? 0 };
      data.set(id, { data: clone(d), version: base + 1 });
      return { ok: true, version: base + 1 };
    }
  };
}
