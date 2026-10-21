// Reglas de seguridad y utilidades criptográficas (sin dependencias).

export const PASSWORD_MIN = 11;          // "mayor a 10 caracteres"
export const PASSWORD_MAX = 128;
export const MAX_FAILS = 3;              // intentos antes de bloquear
export const LOCK_SECONDS = 15 * 60;     // bloqueo de 15 minutos
export const IP_MAX_FAILS = 20;          // freno extra por IP contra ataques a muchas cuentas
export const CODE_TTL_MS = 10 * 60_000;  // el código del correo vence en 10 min
export const CODE_MAX_TRIES = 5;
export const CODES_PER_HOUR = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const SESSION_TTL_MS = 30 * 86_400_000;
export const DEVICE_TTL_MS = 30 * 86_400_000;
export const TRIAL_DAYS = 14;
export const PLANS = { mensual: 'taller_mensual', anual: 'taller_anual' } as const;
export const ACCESS_STATUSES = ['trialing', 'active', 'past_due'];

const enc = new TextEncoder();

export function passwordProblems(pw: string): string[] {
  const p: string[] = [];
  if (pw.length < PASSWORD_MIN) p.push(`al menos ${PASSWORD_MIN} caracteres`);
  if (pw.length > PASSWORD_MAX) p.push(`máximo ${PASSWORD_MAX} caracteres`);
  if (!/[^\p{L}\p{N}\s]/u.test(pw)) p.push('un carácter especial (!@#$%&*…)');
  if (!/\p{L}/u.test(pw)) p.push('una letra');
  if (!/\p{N}/u.test(pw)) p.push('un número');
  return p;
}

export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
export const validEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const validUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function maskEmail(e: string) {
  const [u, d] = e.split('@');
  return `${u.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
}

export const hasAccess = (status: string) => ACCESS_STATUSES.includes(status);

function b64url(buf: ArrayBuffer | Uint8Array) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export function timingSafeEqual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function pbkdf2(pw: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

// PBKDF2-SHA256 con sal aleatoria (600 000 iteraciones, recomendación de OWASP).
export async function hashPassword(pw: string, iterations = 600_000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2_sha256$${iterations}$${b64url(salt)}$${b64url(await pbkdf2(pw, salt, iterations))}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, it, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2_sha256' || !+it || !salt || !hash) return false;
  return timingSafeEqual(b64url(await pbkdf2(pw, unb64url(salt), +it)), hash);
}

export const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

export async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

// Código de 6 dígitos sin sesgo (muestreo por rechazo).
export function randomCode() {
  const max = 4_294_000_000; // múltiplo de 1 000 000 menor que 2^32
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= max);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}
