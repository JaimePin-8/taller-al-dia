#!/usr/bin/env node
// Prepara Stripe para Taller al Día: producto, precios ($250/mes y $2,500/año),
// portal del cliente (cancelar, cambiar plan o tarjeta) y el webhook hacia la API.
// Uso: STRIPE_SECRET_KEY=sk_... node tools/stripe-setup.mjs https://<ref>.supabase.co/functions/v1/api
// Imprime al final STRIPE_WEBHOOK_SECRET=... y STRIPE_PORTAL_CONFIG=...

const key = process.env.STRIPE_SECRET_KEY;
const apiUrl = process.argv[2];
const appUrl = process.argv[3] || 'https://jaimepin-8.github.io/taller-al-dia/';
if (!key?.startsWith('sk_') || !apiUrl?.startsWith('https://')) {
  console.error('Uso: STRIPE_SECRET_KEY=sk_... node tools/stripe-setup.mjs https://<ref>.supabase.co/functions/v1/api');
  process.exit(1);
}

function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const name = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') flatten(v, name, out);
    else out.push([name, String(v)]);
  }
  return out;
}

async function stripe(method, path, params) {
  const qs = params ? new URLSearchParams(flatten(params)).toString() : '';
  const r = await fetch(`https://api.stripe.com/v1${path}${method === 'GET' && qs ? `?${qs}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : qs
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Stripe ${path}: ${j.error?.message || r.status}`);
  return j;
}

const log = m => console.error(m);
log(key.startsWith('sk_live_') ? '⚠️  Modo REAL (se harán cobros de verdad)' : 'Modo de prueba');

// 1. Producto y precios (se reutilizan si ya existen).
const found = await stripe('GET', '/prices', { lookup_keys: ['taller_mensual', 'taller_anual'], active: true });
let monthly = found.data.find(p => p.lookup_key === 'taller_mensual');
let yearly = found.data.find(p => p.lookup_key === 'taller_anual');
let product = monthly?.product || yearly?.product;
if (!product) {
  product = (await stripe('POST', '/products', { name: 'Taller al Día', description: 'Recordatorios de servicio, cotizaciones y cobranza para talleres mecánicos.' })).id;
  log(`Producto creado: ${product}`);
}
if (!monthly) {
  monthly = await stripe('POST', '/prices', { product, currency: 'mxn', unit_amount: 25000, recurring: { interval: 'month' }, lookup_key: 'taller_mensual', nickname: 'Mensual' });
  log('Precio mensual creado: $250 MXN');
}
if (!yearly) {
  yearly = await stripe('POST', '/prices', { product, currency: 'mxn', unit_amount: 250000, recurring: { interval: 'year' }, lookup_key: 'taller_anual', nickname: 'Anual' });
  log('Precio anual creado: $2,500 MXN');
}

// 2. Portal del cliente.
const portal = await stripe('POST', '/billing_portal/configurations', {
  business_profile: { headline: 'Taller al Día · Administra tu suscripción' },
  default_return_url: appUrl,
  features: {
    customer_update: { enabled: true, allowed_updates: ['email', 'name'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'unused', 'missing_features', 'other'] } },
    subscription_update: { enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products: [{ product, prices: [monthly.id, yearly.id] }] }
  }
});
log(`Portal configurado: ${portal.id}`);

// 3. Webhook (si ya había uno a la misma dirección, se reemplaza para obtener su clave).
const hookUrl = `${apiUrl}/stripe/webhook`;
const hooks = await stripe('GET', '/webhook_endpoints', { limit: 100 });
for (const h of hooks.data.filter(h => h.url === hookUrl)) {
  await stripe('DELETE', `/webhook_endpoints/${h.id}`);
  log(`Webhook anterior reemplazado: ${h.id}`);
}
const hook = await stripe('POST', '/webhook_endpoints', {
  url: hookUrl,
  description: 'Taller al Día',
  enabled_events: [
    'checkout.session.completed',
    'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
    'invoice.paid', 'invoice.payment_failed'
  ]
});
log(`Webhook creado: ${hookUrl}`);

console.log(`STRIPE_WEBHOOK_SECRET=${hook.secret}`);
console.log(`STRIPE_PORTAL_CONFIG=${portal.id}`);
