// API de Taller al Día: cuentas, códigos por correo, datos del taller y suscripción.
// No depende de Supabase ni de Stripe directamente: recibe el almacenamiento, el correo
// y los cobros ya conectados, así se puede probar en local con versiones de memoria.
import * as L from './lib.ts';

export type Sub = {
  status: string; plan: string | null; periodEnd: number | null; trialEnd: number | null;
  cancelAtPeriodEnd: boolean; trialUsed: boolean;
};
export type Account = {
  id: string; email: string; passwordHash: string; shopName: string;
  emailVerifiedAt: number | null; createdAt: number; stripeCustomerId: string | null; sub: Sub;
};
export type AccountPatch = Partial<Pick<Account, 'passwordHash' | 'shopName' | 'emailVerifiedAt' | 'stripeCustomerId'>> & { sub?: Partial<Sub> };
export type Purpose = 'verify' | 'login' | 'reset';
export type CodeRec = { id: string; accountId: string; purpose: Purpose; codeHash: string; attempts: number; createdAt: number; expiresAt: number; usedAt: number | null };
export type SessionRec = { tokenHash: string; accountId: string; createdAt: number; expiresAt: number; userAgent: string };
export type DeviceRec = { tokenHash: string; accountId: string; createdAt: number; expiresAt: number };
export type Attempt = { fails: number; lockedUntil: number | null };
export type PutResult = { ok: true; version: number } | { ok: false; data: unknown; version: number };

export interface Store {
  getAccountByEmail(email: string): Promise<Account | null>;
  getAccount(id: string): Promise<Account | null>;
  getAccountByCustomer(customerId: string): Promise<Account | null>;
  createAccount(a: { email: string; passwordHash: string; shopName: string }): Promise<Account>;
  updateAccount(id: string, patch: AccountPatch): Promise<Account>;
  getAttempt(key: string): Promise<Attempt | null>;
  failAttempt(key: string, max: number, lockMs: number, now: number): Promise<Attempt>;
  clearAttempt(key: string): Promise<void>;
  createCode(c: CodeRec): Promise<void>;
  getCode(id: string): Promise<CodeRec | null>;
  updateCode(id: string, patch: Partial<CodeRec>): Promise<void>;
  countCodesSince(accountId: string, since: number): Promise<number>;
  createSession(s: SessionRec): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRec | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsForAccount(accountId: string): Promise<void>;
  createDevice(d: DeviceRec): Promise<void>;
  getDevice(tokenHash: string): Promise<DeviceRec | null>;
  deleteDevicesForAccount(accountId: string): Promise<void>;
  getData(accountId: string): Promise<{ data: unknown; version: number } | null>;
  putData(accountId: string, data: unknown, baseVersion: number): Promise<PutResult>;
}

export interface Mailer { send(to: string, subject: string, html: string, text: string): Promise<void> }

export type SubUpdate = { accountId?: string; customerId: string; sub: Omit<Sub, 'trialUsed'> };
export interface Billing {
  checkout(acc: Account, plan: keyof typeof L.PLANS, o: { trial: boolean; successUrl: string; cancelUrl: string }): Promise<{ url: string; customerId: string }>;
  portal(acc: Account, returnUrl: string): Promise<string>;
  webhook(req: Request): Promise<SubUpdate | null>;
}

export type Env = {
  appUrl: string; allowedOrigins: string[]; codeSecret: string;
  pbkdf2Iterations?: number; now?: () => number;
};

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

const MAX_BODY = 4_000_000;
const PURPOSE_TEXT: Record<Purpose, [string, string]> = {
  verify: ['Confirma tu correo', 'Usa este código para confirmar tu correo y activar tu cuenta de Taller al Día.'],
  login: ['Código para entrar', 'Alguien (esperamos que tú) está entrando a Taller al Día desde un celular nuevo.'],
  reset: ['Cambia tu contraseña', 'Usa este código para crear una contraseña nueva.']
};

export function createHandler(d: { store: Store; mailer: Mailer; billing: Billing; env: Env }) {
  const { store, mailer, billing, env } = d;
  const now = () => (env.now ? env.now() : Date.now());
  const iters = env.pbkdf2Iterations ?? 600_000;
  let dummy: Promise<string> | null = null;
  const dummyHash = () => (dummy ??= L.hashPassword('contraseña-ficticia-#1', iters));

  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  async function body(req: Request): Promise<Record<string, unknown>> {
    const t = await req.text();
    if (t.length > MAX_BODY) throw new HttpError(413, 'Los datos son demasiado grandes.');
    try { const j = JSON.parse(t || '{}'); if (j && typeof j === 'object') return j; } catch { /* abajo */ }
    throw new HttpError(400, 'Solicitud inválida.');
  }

  function lockedError(until: number) {
    const secs = Math.max(1, Math.ceil((until - now()) / 1000));
    const mins = Math.ceil(secs / 60);
    return new HttpError(429, `Demasiados intentos fallidos. Por seguridad tu acceso quedó bloqueado. Intenta de nuevo en ${mins} ${mins === 1 ? 'minuto' : 'minutos'} o cambia tu contraseña.`, { code: 'locked', retryAfter: secs });
  }

  async function checkLock(key: string) {
    const a = await store.getAttempt(key);
    if (a?.lockedUntil && a.lockedUntil > now()) throw lockedError(a.lockedUntil);
  }

  function meOf(acc: Account) {
    return {
      id: acc.id, email: acc.email, shopName: acc.shopName, emailVerified: !!acc.emailVerifiedAt,
      subscription: acc.sub, hasAccess: L.hasAccess(acc.sub.status), trialDays: L.TRIAL_DAYS
    };
  }

  function mailHtml(title: string, intro: string, code: string, outro: string) {
    return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:auto;padding:24px;color:#1b1d1f">
      <h2 style="margin:0 0 12px">${title}</h2><p>${intro}</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f3f2ee;border-radius:12px;padding:16px;text-align:center">${code}</p>
      <p style="color:#6b6f74;font-size:14px">${outro}</p>
      <p style="color:#6b6f74;font-size:13px">— Taller al Día</p></div>`;
  }

  async function challenge(acc: Account, purpose: Purpose) {
    if (await store.countCodesSince(acc.id, now() - 3_600_000) >= L.CODES_PER_HOUR) {
      throw new HttpError(429, 'Pediste demasiados códigos. Espera un rato e inténtalo de nuevo.', { code: 'too_many_codes' });
    }
    const code = L.randomCode(), id = crypto.randomUUID();
    await store.createCode({ id, accountId: acc.id, purpose, codeHash: await L.hmac(env.codeSecret, `${id}:${code}`), attempts: 0, createdAt: now(), expiresAt: now() + L.CODE_TTL_MS, usedAt: null });
    const [title, intro] = PURPOSE_TEXT[purpose];
    const outro = 'El código vence en 10 minutos. Si no fuiste tú, ignora este correo y cambia tu contraseña.';
    await mailer.send(acc.email, `${code} es tu código de Taller al Día`, mailHtml(title, intro, code, outro), `${title}\n\n${intro}\n\nCódigo: ${code}\n\n${outro}`);
    return ok({ challengeId: id, purpose, email: L.maskEmail(acc.email) });
  }

  // Valida un código; cuenta el intento aunque falle.
  async function useCode(id: unknown, code: unknown, purposes: Purpose[]) {
    const gone = new HttpError(400, 'Ese código ya no es válido. Pide uno nuevo.', { code: 'code_expired' });
    if (!L.validUuid(id)) throw gone;
    const rec = await store.getCode(id as string);
    if (!rec || !purposes.includes(rec.purpose) || rec.usedAt || rec.expiresAt < now() || rec.attempts >= L.CODE_MAX_TRIES) throw gone;
    const attempts = rec.attempts + 1;
    const good = /^\d{6}$/.test(String(code ?? '')) && L.timingSafeEqual(await L.hmac(env.codeSecret, `${rec.id}:${code}`), rec.codeHash);
    await store.updateCode(rec.id, good ? { attempts, usedAt: now() } : { attempts });
    if (!good) {
      const left = L.CODE_MAX_TRIES - attempts;
      throw left > 0
        ? new HttpError(400, `Código incorrecto. Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`}.`, { code: 'bad_code', remaining: left })
        : new HttpError(400, 'Demasiados intentos con ese código. Pide uno nuevo.', { code: 'code_expired' });
    }
    const acc = await store.getAccount(rec.accountId);
    if (!acc) throw gone;
    return { rec, acc };
  }

  async function issueSession(acc: Account, req: Request, trustDevice: boolean) {
    const token = L.randomToken();
    await store.createSession({ tokenHash: await L.sha256(token), accountId: acc.id, createdAt: now(), expiresAt: now() + L.SESSION_TTL_MS, userAgent: (req.headers.get('user-agent') || '').slice(0, 200) });
    let deviceToken: string | undefined;
    if (trustDevice) {
      deviceToken = L.randomToken();
      await store.createDevice({ tokenHash: await L.sha256(deviceToken), accountId: acc.id, createdAt: now(), expiresAt: now() + L.DEVICE_TTL_MS });
    }
    return ok({ token, deviceToken, me: meOf(acc) });
  }

  async function auth(req: Request) {
    const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/);
    const expired = new HttpError(401, 'Tu sesión terminó. Inicia sesión de nuevo.', { code: 'session' });
    if (!m) throw expired;
    const tokenHash = await L.sha256(m[1]);
    const s = await store.getSession(tokenHash);
    if (!s || s.expiresAt < now()) throw expired;
    const acc = await store.getAccount(s.accountId);
    if (!acc) throw expired;
    return { acc, tokenHash };
  }

  function passwordOrThrow(pw: string) {
    const p = L.passwordProblems(pw);
    if (p.length) throw new HttpError(400, `La contraseña debe tener ${p.join(', ')}.`, { code: 'weak_password', problems: p });
  }

  const ip = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '';

  const routes: Record<string, (req: Request) => Promise<Response>> = {
    async 'POST /signup'(req) {
      const b = await body(req);
      const email = L.normEmail(b.email), pw = String(b.password ?? ''), shopName = String(b.shopName ?? '').trim().slice(0, 80);
      if (!shopName) throw new HttpError(400, 'Escribe el nombre de tu taller.');
      if (!L.validEmail(email)) throw new HttpError(400, 'Escribe un correo válido.');
      passwordOrThrow(pw);
      let acc = await store.getAccountByEmail(email);
      if (acc?.emailVerifiedAt) throw new HttpError(409, 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.', { code: 'exists' });
      const passwordHash = await L.hashPassword(pw, iters);
      acc = acc ? await store.updateAccount(acc.id, { passwordHash, shopName }) : await store.createAccount({ email, passwordHash, shopName });
      return challenge(acc, 'verify');
    },

    async 'POST /login'(req) {
      const b = await body(req);
      const email = L.normEmail(b.email), pw = String(b.password ?? '');
      if (!L.validEmail(email) || !pw) throw new HttpError(400, 'Escribe tu correo y tu contraseña.');
      const ekey = `email:${email}`, addr = ip(req), ikey = addr ? `ip:${addr}` : null;
      await checkLock(ekey);
      if (ikey) await checkLock(ikey);
      const acc = await store.getAccountByEmail(email);
      // Con correo inexistente igual se calcula un hash para no delatar qué cuentas existen.
      const good = acc ? await L.verifyPassword(pw, acc.passwordHash) : (await L.verifyPassword(pw, await dummyHash()), false);
      if (!good || !acc) {
        const a = await store.failAttempt(ekey, L.MAX_FAILS, L.LOCK_SECONDS * 1000, now());
        if (ikey) await store.failAttempt(ikey, L.IP_MAX_FAILS, L.LOCK_SECONDS * 1000, now());
        if (a.lockedUntil && a.lockedUntil > now()) {
          if (acc) mailer.send(acc.email, 'Bloqueamos el acceso a tu cuenta por 15 minutos',
            `<div style="font-family:system-ui,sans-serif;max-width:460px;margin:auto;padding:24px"><h2>Acceso bloqueado temporalmente</h2><p>Hubo ${L.MAX_FAILS} intentos fallidos de entrar a tu cuenta de Taller al Día, así que la bloqueamos 15 minutos.</p><p>Si no fuiste tú, cambia tu contraseña desde “Olvidé mi contraseña”.</p></div>`,
            `Hubo ${L.MAX_FAILS} intentos fallidos de entrar a tu cuenta de Taller al Día. La bloqueamos 15 minutos. Si no fuiste tú, cambia tu contraseña desde "Olvidé mi contraseña".`).catch(() => {});
          throw lockedError(a.lockedUntil);
        }
        const left = L.MAX_FAILS - a.fails;
        throw new HttpError(401, `Correo o contraseña incorrectos. Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`} antes de un bloqueo de 15 minutos.`, { code: 'bad_credentials', remaining: left });
      }
      await store.clearAttempt(ekey);
      if (!acc.emailVerifiedAt) return challenge(acc, 'verify');
      if (typeof b.deviceToken === 'string' && b.deviceToken) {
        const dev = await store.getDevice(await L.sha256(b.deviceToken));
        if (dev && dev.accountId === acc.id && dev.expiresAt > now()) return issueSession(acc, req, false);
      }
      return challenge(acc, 'login');
    },

    async 'POST /verify'(req) {
      const b = await body(req);
      let { acc, rec } = await useCode(b.challengeId, b.code, ['verify', 'login']);
      if (rec.purpose === 'verify' && !acc.emailVerifiedAt) acc = await store.updateAccount(acc.id, { emailVerifiedAt: now() });
      return issueSession(acc, req, b.trustDevice !== false);
    },

    async 'POST /resend'(req) {
      const b = await body(req);
      const rec = L.validUuid(b.challengeId) ? await store.getCode(b.challengeId as string) : null;
      if (!rec || rec.usedAt) throw new HttpError(400, 'Vuelve a empezar para pedir otro código.', { code: 'code_expired' });
      const wait = rec.createdAt + L.RESEND_COOLDOWN_MS - now();
      if (wait > 0) throw new HttpError(429, `Espera ${Math.ceil(wait / 1000)} segundos para pedir otro código.`, { code: 'cooldown', retryAfter: Math.ceil(wait / 1000) });
      const acc = await store.getAccount(rec.accountId);
      if (!acc) throw new HttpError(400, 'Vuelve a empezar para pedir otro código.', { code: 'code_expired' });
      await store.updateCode(rec.id, { usedAt: now() });
      return challenge(acc, rec.purpose);
    },

    async 'POST /forgot'(req) {
      const b = await body(req);
      const email = L.normEmail(b.email);
      if (!L.validEmail(email)) throw new HttpError(400, 'Escribe un correo válido.');
      const acc = await store.getAccountByEmail(email);
      // Misma respuesta exista o no la cuenta.
      if (!acc) return ok({ challengeId: crypto.randomUUID(), purpose: 'reset', email: L.maskEmail(email) });
      return challenge(acc, 'reset');
    },

    async 'POST /reset'(req) {
      const b = await body(req);
      const pw = String(b.password ?? '');
      passwordOrThrow(pw);
      let { acc } = await useCode(b.challengeId, b.code, ['reset']);
      acc = await store.updateAccount(acc.id, { passwordHash: await L.hashPassword(pw, iters), emailVerifiedAt: acc.emailVerifiedAt ?? now() });
      await store.deleteSessionsForAccount(acc.id);
      await store.deleteDevicesForAccount(acc.id);
      await store.clearAttempt(`email:${acc.email}`);
      return issueSession(acc, req, b.trustDevice !== false);
    },

    async 'POST /logout'(req) {
      const { tokenHash } = await auth(req);
      await store.deleteSession(tokenHash);
      return ok({ ok: true });
    },

    async 'POST /logout-all'(req) {
      const { acc } = await auth(req);
      await store.deleteSessionsForAccount(acc.id);
      await store.deleteDevicesForAccount(acc.id);
      return ok({ ok: true });
    },

    async 'GET /me'(req) {
      const { acc } = await auth(req);
      return ok(meOf(acc));
    },

    async 'GET /data'(req) {
      const { acc } = await auth(req);
      const row = await store.getData(acc.id);
      return ok(row ?? { data: null, version: 0 });
    },

    async 'PUT /data'(req) {
      const { acc } = await auth(req);
      if (!L.hasAccess(acc.sub.status)) throw new HttpError(402, 'Tu suscripción no está activa.', { code: 'no_subscription' });
      const b = await body(req);
      if (!b.data || typeof b.data !== 'object' || !Number.isInteger(b.baseVersion) || (b.baseVersion as number) < 0) throw new HttpError(400, 'Solicitud inválida.');
      const r = await store.putData(acc.id, b.data, b.baseVersion as number);
      return r.ok ? ok({ version: r.version }) : ok({ error: 'Hay cambios más nuevos en otro dispositivo.', code: 'conflict', data: r.data, version: r.version }, 409);
    },

    async 'POST /billing/checkout'(req) {
      const { acc } = await auth(req);
      const b = await body(req);
      const plan = b.plan === 'anual' ? 'anual' : b.plan === 'mensual' ? 'mensual' : null;
      if (!plan) throw new HttpError(400, 'Elige el plan mensual o anual.');
      if (['trialing', 'active'].includes(acc.sub.status)) throw new HttpError(409, 'Ya tienes una suscripción activa. Adminístrala desde Ajustes.', { code: 'already_subscribed' });
      const r = await billing.checkout(acc, plan, { trial: !acc.sub.trialUsed, successUrl: `${env.appUrl}?pago=ok`, cancelUrl: `${env.appUrl}?pago=cancelado` });
      if (r.customerId !== acc.stripeCustomerId) await store.updateAccount(acc.id, { stripeCustomerId: r.customerId });
      return ok({ url: r.url });
    },

    async 'POST /billing/portal'(req) {
      const { acc } = await auth(req);
      if (!acc.stripeCustomerId) throw new HttpError(400, 'Aún no tienes una suscripción.');
      return ok({ url: await billing.portal(acc, env.appUrl) });
    },

    async 'POST /stripe/webhook'(req) {
      let u: SubUpdate | null;
      try { u = await billing.webhook(req); } catch (e) { console.error('webhook', e); throw new HttpError(400, 'Firma inválida.'); }
      if (u) {
        const acc = (u.accountId && await store.getAccount(u.accountId)) || await store.getAccountByCustomer(u.customerId);
        if (acc) {
          await store.updateAccount(acc.id, {
            stripeCustomerId: u.customerId,
            sub: { ...u.sub, trialUsed: acc.sub.trialUsed || !!u.sub.trialEnd || L.hasAccess(u.sub.status) }
          });
        } else console.warn('webhook sin cuenta', u.customerId);
      }
      return ok({ received: true });
    }
  };

  return async function handle(req: Request): Promise<Response> {
    const origin = req.headers.get('origin') || '';
    const cors: Record<string, string> = {
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    if (env.allowedOrigins.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;
    const withCors = (r: Response) => { for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); r.headers.set('Cache-Control', 'no-store'); return r; };
    if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));

    const path = new URL(req.url).pathname.replace(/^.*?\/api(?=\/|$)/, '') || '/';
    const fn = routes[`${req.method} ${path}`];
    try {
      if (!fn) throw new HttpError(404, 'No encontrado.');
      return withCors(await fn(req));
    } catch (e) {
      if (e instanceof HttpError) return withCors(ok({ error: e.message, ...e.extra }, e.status));
      console.error(e);
      return withCors(ok({ error: 'Error del servidor. Intenta de nuevo.' }, 500));
    }
  };
}
