// Pruebas de la API con almacenamiento en memoria: deno test dev/
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1.0.8';
import { createHandler, type Billing, type SubUpdate } from '../supabase/functions/api/handler.ts';
import { memoryStore } from '../supabase/functions/api/store_memory.ts';
import * as L from '../supabase/functions/api/lib.ts';

const GOOD_PW = 'Taller#2026ok';

function setup() {
  let clock = Date.parse('2026-10-21T12:00:00Z');
  const mails: { to: string; subject: string; text: string }[] = [];
  const store = memoryStore();
  let nextWebhook: SubUpdate | null = null;
  const checkouts: { trial: boolean; plan: string }[] = [];
  const billing: Billing = {
    async checkout(acc, plan, o) { checkouts.push({ trial: o.trial, plan }); return { url: 'https://checkout.test/x', customerId: acc.stripeCustomerId ?? 'cus_1' }; },
    async portal() { return 'https://portal.test/x'; },
    async webhook() { return nextWebhook; }
  };
  const h = createHandler({
    store, billing,
    mailer: { async send(to, subject, _html, text) { mails.push({ to, subject, text }); } },
    env: { appUrl: 'https://app.test/', allowedOrigins: ['https://app.test'], codeSecret: 'secreto', pbkdf2Iterations: 1000, now: () => clock }
  });
  const call = async (method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) => {
    const r = await h(new Request(`https://x.supabase.co/functions/v1/api${path}`, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }
    }));
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  const lastCode = () => mails.at(-1)!.text.match(/Código: (\d{6})/)![1];
  return {
    call, mails, store, checkouts, lastCode,
    tick: (ms: number) => { clock += ms; },
    setWebhook: (u: SubUpdate) => { nextWebhook = u; },
    async signup(email = 'jaime@taller.mx') {
      const s = await call('POST', '/signup', { email, password: GOOD_PW, shopName: 'Taller Garza', acceptPrivacy: '2026-10-26' });
      assertEquals(s.status, 200);
      const v = await call('POST', '/verify', { challengeId: s.body.challengeId, code: lastCode() });
      assertEquals(v.status, 200);
      return v.body as { token: string; deviceToken: string; me: { id: string } };
    }
  };
}

Deno.test('política de contraseña: más de 10 caracteres y carácter especial', () => {
  assert(L.passwordProblems('Corta#1').length > 0);
  assert(L.passwordProblems('SinEspecial2026').some(p => p.includes('especial')));
  assert(L.passwordProblems('abcdefghij#').some(p => p.includes('número')));
  assertEquals(L.passwordProblems('abcdefgh#1'), ['al menos 11 caracteres']); // 10 no alcanza
  assertEquals(L.passwordProblems(GOOD_PW), []);
});

Deno.test('hash de contraseña y códigos', async () => {
  const h = await L.hashPassword(GOOD_PW, 1000);
  assert(await L.verifyPassword(GOOD_PW, h));
  assert(!await L.verifyPassword(GOOD_PW + 'x', h));
  for (let i = 0; i < 50; i++) assertMatch(L.randomCode(), /^\d{6}$/);
});

Deno.test('registro rechaza contraseña débil y exige confirmar el correo', async () => {
  const t = setup();
  const weak = await t.call('POST', '/signup', { email: 'a@b.mx', password: 'contraseña123', shopName: 'X', acceptPrivacy: '2026-10-26' });
  assertEquals(weak.status, 400);
  assertEquals(weak.body.code, 'weak_password');
  const noConsent = await t.call('POST', '/signup', { email: 'A@B.mx', password: GOOD_PW, shopName: 'X' });
  assertEquals([noConsent.status, noConsent.body.code], [400, 'privacy']);
  assertEquals(t.mails.length, 0);
  const s = await t.call('POST', '/signup', { email: 'A@B.mx', password: GOOD_PW, shopName: 'X', acceptPrivacy: '2026-10-26' });
  assertEquals(s.body.purpose, 'verify');
  assertEquals((await t.store.getAccountByEmail('a@b.mx'))?.privacyVersion, '2026-10-26');
  assertEquals(t.mails[0].to, 'a@b.mx');
  // Sin confirmar, entrar vuelve a pedir el código de confirmación.
  const l = await t.call('POST', '/login', { email: 'a@b.mx', password: GOOD_PW });
  assertEquals(l.body.purpose, 'verify');
});

Deno.test('3 intentos fallidos bloquean 15 minutos, aun con la contraseña correcta', async () => {
  const t = setup();
  await t.signup();
  const bad = () => t.call('POST', '/login', { email: 'jaime@taller.mx', password: 'Equivocada#123' });
  const r1 = await bad();
  assertEquals([r1.status, r1.body.remaining], [401, 2]);
  const r2 = await bad();
  assertEquals([r2.status, r2.body.remaining], [401, 1]);
  const r3 = await bad();
  assertEquals([r3.status, r3.body.code], [429, 'locked']);
  assertEquals(r3.body.retryAfter, 900);
  assert(t.mails.some(m => m.subject.includes('Bloqueamos')));
  const during = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW });
  assertEquals(during.status, 429);
  t.tick(14 * 60_000);
  assertEquals((await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW })).status, 429);
  t.tick(61_000);
  const after = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW });
  assertEquals(after.status, 200);
});

Deno.test('correo inexistente responde igual y también se bloquea', async () => {
  const t = setup();
  const r = await t.call('POST', '/login', { email: 'nadie@x.mx', password: 'Lo-que-sea#1' });
  assertEquals([r.status, r.body.remaining], [401, 2]);
  await t.call('POST', '/login', { email: 'nadie@x.mx', password: 'Lo-que-sea#1' });
  assertEquals((await t.call('POST', '/login', { email: 'nadie@x.mx', password: 'Lo-que-sea#1' })).status, 429);
  assertEquals(t.mails.length, 0);
});

Deno.test('celular nuevo pide código por correo; celular de confianza no', async () => {
  const t = setup();
  const first = await t.signup();
  const fresh = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW });
  assertEquals(fresh.body.purpose, 'login');
  assert(!fresh.body.token);
  const trusted = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW, deviceToken: first.deviceToken });
  assert(trusted.body.token);
  // El celular de confianza vence a los 30 días.
  t.tick(31 * 86_400_000);
  const expired = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW, deviceToken: first.deviceToken });
  assertEquals(expired.body.purpose, 'login');
});

Deno.test('código: 5 intentos, vence a los 10 min y no se reutiliza', async () => {
  const t = setup();
  await t.signup();
  const c = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW });
  const code = t.lastCode();
  for (let i = 4; i >= 1; i--) {
    const r = await t.call('POST', '/verify', { challengeId: c.body.challengeId, code: '000000' === code ? '111111' : '000000' });
    assertEquals(r.body.remaining, i);
  }
  const fifth = await t.call('POST', '/verify', { challengeId: c.body.challengeId, code: '999999' === code ? '888888' : '999999' });
  assertEquals(fifth.body.code, 'code_expired');
  assertEquals((await t.call('POST', '/verify', { challengeId: c.body.challengeId, code })).status, 400);

  const c2 = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW });
  const code2 = t.lastCode();
  t.tick(11 * 60_000);
  assertEquals((await t.call('POST', '/verify', { challengeId: c2.body.challengeId, code: code2 })).body.code, 'code_expired');

  const c3 = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW });
  const code3 = t.lastCode();
  assertEquals((await t.call('POST', '/verify', { challengeId: c3.body.challengeId, code: code3 })).status, 200);
  assertEquals((await t.call('POST', '/verify', { challengeId: c3.body.challengeId, code: code3 })).status, 400);
});

Deno.test('reenviar código: espera de 60 s y máximo 5 por hora', async () => {
  const t = setup();
  await t.signup();
  let c = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: GOOD_PW });
  assertEquals((await t.call('POST', '/resend', { challengeId: c.body.challengeId })).body.code, 'cooldown');
  t.tick(61_000);
  c = await t.call('POST', '/resend', { challengeId: c.body.challengeId });
  assertEquals(c.status, 200);
  t.tick(61_000);
  c = await t.call('POST', '/resend', { challengeId: c.body.challengeId });
  t.tick(61_000);
  c = await t.call('POST', '/resend', { challengeId: c.body.challengeId });
  t.tick(61_000);
  const sixth = await t.call('POST', '/resend', { challengeId: c.body.challengeId });
  assertEquals(sixth.body.code, 'too_many_codes'); // signup + 4 en la última hora
});

Deno.test('recuperar contraseña quita el bloqueo y cierra sesiones y celulares', async () => {
  const t = setup();
  const s = await t.signup();
  for (let i = 0; i < 3; i++) await t.call('POST', '/login', { email: 'jaime@taller.mx', password: 'Mala#contraseña1' });
  const f = await t.call('POST', '/forgot', { email: 'jaime@taller.mx' });
  const weak = await t.call('POST', '/reset', { challengeId: f.body.challengeId, code: t.lastCode(), password: 'corta' });
  assertEquals(weak.body.code, 'weak_password');
  const r = await t.call('POST', '/reset', { challengeId: f.body.challengeId, code: t.lastCode(), password: 'NuevaClave$2027' });
  assertEquals(r.status, 200);
  assertEquals((await t.call('GET', '/me', undefined, s.token)).status, 401);
  const old = await t.call('POST', '/login', { email: 'jaime@taller.mx', password: 'NuevaClave$2027', deviceToken: s.deviceToken });
  assertEquals(old.body.purpose, 'login'); // el celular viejo dejó de ser de confianza
  const ghost = await t.call('POST', '/forgot', { email: 'nadie@x.mx' });
  assertEquals(ghost.status, 200);
});

Deno.test('suscripción: prueba de 14 días una sola vez y datos solo con acceso', async () => {
  const t = setup();
  const s = await t.signup();
  const me = await t.call('GET', '/me', undefined, s.token);
  assertEquals(me.body.hasAccess, false);
  assertEquals((await t.call('PUT', '/data', { data: { a: 1 }, baseVersion: 0 }, s.token)).status, 402);

  assertEquals((await t.call('POST', '/billing/checkout', { plan: 'anual' }, s.token)).status, 200);
  assertEquals(t.checkouts[0], { trial: true, plan: 'anual' });

  t.setWebhook({ accountId: s.me.id, customerId: 'cus_1', sub: { status: 'trialing', plan: 'anual', periodEnd: null, trialEnd: Date.now() + 14 * 86_400_000, cancelAtPeriodEnd: false } });
  assertEquals((await t.call('POST', '/stripe/webhook', {})).status, 200);
  const me2 = await t.call('GET', '/me', undefined, s.token);
  assertEquals([me2.body.hasAccess, me2.body.subscription.trialUsed], [true, true]);
  assertEquals((await t.call('POST', '/billing/checkout', { plan: 'mensual' }, s.token)).status, 409);

  const p1 = await t.call('PUT', '/data', { data: { clients: [1] }, baseVersion: 0 }, s.token);
  assertEquals(p1.body.version, 1);
  const stale = await t.call('PUT', '/data', { data: { clients: [2] }, baseVersion: 0 }, s.token);
  assertEquals([stale.status, stale.body.version], [409, 1]);
  assertEquals((await t.call('GET', '/data', undefined, s.token)).body.data, { clients: [1] });

  t.setWebhook({ customerId: 'cus_1', sub: { status: 'canceled', plan: 'anual', periodEnd: null, trialEnd: null, cancelAtPeriodEnd: false } });
  await t.call('POST', '/stripe/webhook', {});
  assertEquals((await t.call('GET', '/me', undefined, s.token)).body.hasAccess, false);
  assertEquals((await t.call('GET', '/data', undefined, s.token)).status, 200); // puede descargar sus datos
  await t.call('POST', '/billing/checkout', { plan: 'mensual' }, s.token);
  assertEquals(t.checkouts[1].trial, false);
});

Deno.test('sesión: cerrar sesión, token falso y CORS', async () => {
  const t = setup();
  const s = await t.signup();
  assertEquals((await t.call('GET', '/me', undefined, 'falso')).status, 401);
  const r = await t.call('GET', '/me', undefined, s.token, { origin: 'https://app.test' });
  assertEquals(r.headers.get('access-control-allow-origin'), 'https://app.test');
  const evil = await t.call('GET', '/me', undefined, s.token, { origin: 'https://malo.test' });
  assertEquals(evil.headers.get('access-control-allow-origin'), null);
  await t.call('POST', '/logout', {}, s.token);
  assertEquals((await t.call('GET', '/me', undefined, s.token)).status, 401);
});
