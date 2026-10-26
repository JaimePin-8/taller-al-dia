// Almacenamiento en Postgres (Supabase) usando la llave de servicio.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import type { Account, AccountPatch, CodeRec, Store } from './handler.ts';

const ts = (v: string | null) => (v ? Date.parse(v) : null);
const iso = (n: number | null | undefined) => (n == null ? null : new Date(n).toISOString());

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const toAccount = (r: Row | null): Account | null => r && {
  id: r.id, email: r.email, passwordHash: r.password_hash, shopName: r.shop_name,
  emailVerifiedAt: ts(r.email_verified_at), createdAt: ts(r.created_at)!, stripeCustomerId: r.stripe_customer_id,
  privacyVersion: r.privacy_version, privacyAcceptedAt: ts(r.privacy_accepted_at),
  sub: {
    status: r.sub_status, plan: r.sub_plan, periodEnd: ts(r.sub_period_end), trialEnd: ts(r.sub_trial_end),
    cancelAtPeriodEnd: r.sub_cancel_at_period_end, trialUsed: r.sub_trial_used
  }
};

function accountPatch(p: AccountPatch): Row {
  const o: Row = {};
  if ('passwordHash' in p) o.password_hash = p.passwordHash;
  if ('shopName' in p) o.shop_name = p.shopName;
  if ('emailVerifiedAt' in p) o.email_verified_at = iso(p.emailVerifiedAt);
  if ('stripeCustomerId' in p) o.stripe_customer_id = p.stripeCustomerId;
  if ('privacyVersion' in p) o.privacy_version = p.privacyVersion;
  if ('privacyAcceptedAt' in p) o.privacy_accepted_at = iso(p.privacyAcceptedAt);
  const s = p.sub;
  if (s) {
    if ('status' in s) o.sub_status = s.status;
    if ('plan' in s) o.sub_plan = s.plan;
    if ('periodEnd' in s) o.sub_period_end = iso(s.periodEnd);
    if ('trialEnd' in s) o.sub_trial_end = iso(s.trialEnd);
    if ('cancelAtPeriodEnd' in s) o.sub_cancel_at_period_end = s.cancelAtPeriodEnd;
    if ('trialUsed' in s) o.sub_trial_used = s.trialUsed;
  }
  return o;
}

const toCode = (r: Row | null): CodeRec | null => r && {
  id: r.id, accountId: r.account_id, purpose: r.purpose, codeHash: r.code_hash, attempts: r.attempts,
  createdAt: ts(r.created_at)!, expiresAt: ts(r.expires_at)!, usedAt: ts(r.used_at)
};

export function pgStore(url: string, serviceKey: string): Store {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // deno-lint-ignore no-explicit-any
  const run = async <T = any>(q: PromiseLike<{ data: T; error: unknown }>) => {
    const { data, error } = await q;
    if (error) throw error;
    return data;
  };
  const acc = (col: string, val: string) => run(db.from('accounts').select('*').eq(col, val).maybeSingle()).then(toAccount);

  return {
    getAccountByEmail: email => acc('email', email),
    getAccount: id => acc('id', id),
    getAccountByCustomer: c => acc('stripe_customer_id', c),
    async createAccount({ email, passwordHash, shopName, privacyVersion, privacyAcceptedAt }) {
      return toAccount(await run(db.from('accounts').insert({ email, password_hash: passwordHash, shop_name: shopName, privacy_version: privacyVersion, privacy_accepted_at: iso(privacyAcceptedAt) }).select('*').single()))!;
    },
    async updateAccount(id, patch) {
      return toAccount(await run(db.from('accounts').update(accountPatch(patch)).eq('id', id).select('*').single()))!;
    },
    async getAttempt(key) {
      const r = await run(db.from('auth_attempts').select('fails, locked_until').eq('key', key).maybeSingle());
      return r ? { fails: r.fails, lockedUntil: ts(r.locked_until) } : null;
    },
    async failAttempt(key, max, lockMs) {
      const rows = await run(db.rpc('auth_fail', { p_key: key, p_max: max, p_lock_seconds: Math.round(lockMs / 1000) }));
      return { fails: rows[0].fails, lockedUntil: ts(rows[0].locked_until) };
    },
    async clearAttempt(key) { await run(db.from('auth_attempts').delete().eq('key', key)); },
    async createCode(c) {
      await run(db.from('email_codes').insert({ id: c.id, account_id: c.accountId, purpose: c.purpose, code_hash: c.codeHash, attempts: c.attempts, created_at: iso(c.createdAt), expires_at: iso(c.expiresAt) }));
    },
    async getCode(id) { return toCode(await run(db.from('email_codes').select('*').eq('id', id).maybeSingle())); },
    async updateCode(id, p) {
      const o: Row = {};
      if ('attempts' in p) o.attempts = p.attempts;
      if ('usedAt' in p) o.used_at = iso(p.usedAt);
      await run(db.from('email_codes').update(o).eq('id', id));
    },
    async countCodesSince(accountId, since) {
      const { count, error } = await db.from('email_codes').select('id', { count: 'exact', head: true }).eq('account_id', accountId).gte('created_at', iso(since)!);
      if (error) throw error;
      return count ?? 0;
    },
    async createSession(s) {
      await run(db.from('sessions').insert({ token_hash: s.tokenHash, account_id: s.accountId, created_at: iso(s.createdAt), expires_at: iso(s.expiresAt), user_agent: s.userAgent }));
    },
    async getSession(h) {
      const r = await run(db.from('sessions').select('*').eq('token_hash', h).maybeSingle());
      return r && { tokenHash: r.token_hash, accountId: r.account_id, createdAt: ts(r.created_at)!, expiresAt: ts(r.expires_at)!, userAgent: r.user_agent ?? '' };
    },
    async deleteSession(h) { await run(db.from('sessions').delete().eq('token_hash', h)); },
    async deleteSessionsForAccount(id) { await run(db.from('sessions').delete().eq('account_id', id)); },
    async createDevice(d) {
      await run(db.from('trusted_devices').insert({ token_hash: d.tokenHash, account_id: d.accountId, created_at: iso(d.createdAt), expires_at: iso(d.expiresAt) }));
    },
    async getDevice(h) {
      const r = await run(db.from('trusted_devices').select('*').eq('token_hash', h).maybeSingle());
      return r && { tokenHash: r.token_hash, accountId: r.account_id, createdAt: ts(r.created_at)!, expiresAt: ts(r.expires_at)! };
    },
    async deleteDevicesForAccount(id) { await run(db.from('trusted_devices').delete().eq('account_id', id)); },
    async getData(id) {
      const r = await run(db.from('shop_data').select('data, version').eq('account_id', id).maybeSingle());
      return r ? { data: r.data, version: r.version } : null;
    },
    async putData(id, data, base) {
      if (base === 0) {
        const { error } = await db.from('shop_data').insert({ account_id: id, data, version: 1 });
        if (!error) return { ok: true, version: 1 };
        if ((error as Row).code !== '23505') throw error;
      } else {
        // Solo actualiza si nadie más guardó desde la versión que tiene el teléfono.
        const rows = await run(db.from('shop_data').update({ data, version: base + 1, updated_at: new Date().toISOString() }).eq('account_id', id).eq('version', base).select('version'));
        if (rows?.length) return { ok: true, version: rows[0].version };
      }
      const cur = await this.getData(id);
      return { ok: false, data: cur?.data ?? null, version: cur?.version ?? 0 };
    }
  };
}
