// Servidor local para desarrollar sin Supabase, Stripe ni Resend.
// Los correos se imprimen en la terminal y el pago se simula.
//   npx deno@2.1.4 run --allow-net dev/server.ts
import { createHandler, type Billing } from '../supabase/functions/api/handler.ts';
import { memoryStore } from '../supabase/functions/api/store_memory.ts';

const PORT = 8787;
const APP = 'http://localhost:5190/';
const store = memoryStore();
const outbox: { to: string; subject: string; text: string; at: string }[] = [];

const billing: Billing = {
  async checkout(acc, plan, o) {
    const q = new URLSearchParams({ acc: acc.id, plan, trial: o.trial ? '1' : '0', ok: o.successUrl, no: o.cancelUrl });
    return { url: `http://localhost:${PORT}/dev/pagar?${q}`, customerId: acc.stripeCustomerId ?? `cus_dev_${acc.id.slice(0, 8)}` };
  },
  async portal(acc, returnUrl) {
    return `http://localhost:${PORT}/dev/portal?${new URLSearchParams({ acc: acc.id, back: returnUrl })}`;
  },
  async webhook() { return null; }
};

const handler = createHandler({
  store, billing,
  mailer: {
    async send(to, subject, _html, text) {
      outbox.push({ to, subject, text, at: new Date().toISOString() });
      console.log(`\n✉️  Para: ${to}\n   ${subject}\n`);
    }
  },
  env: { appUrl: APP, allowedOrigins: ['http://localhost:5190'], codeSecret: 'solo-desarrollo', pbkdf2Iterations: 100_000 }
});

const page = (body: string) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">${body}</body>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });

Deno.serve({ port: PORT }, async req => {
  const u = new URL(req.url);
  if (u.pathname === '/dev/correos') return Response.json(outbox.slice(-10).reverse(), { headers: { 'access-control-allow-origin': '*' } });
  if (u.pathname === '/dev/pagar') {
    const p = u.searchParams;
    if (req.method === 'POST') {
      const trial = p.get('trial') === '1', day = 86_400_000;
      await store.updateAccount(p.get('acc')!, { stripeCustomerId: `cus_dev_${p.get('acc')!.slice(0, 8)}`, sub: {
        status: trial ? 'trialing' : 'active', plan: p.get('plan'), trialEnd: trial ? Date.now() + 14 * day : null,
        periodEnd: Date.now() + (trial ? 14 : p.get('plan') === 'anual' ? 365 : 30) * day, cancelAtPeriodEnd: false, trialUsed: true } });
      return Response.redirect(p.get('ok')!, 303);
    }
    const price = p.get('plan') === 'anual' ? '$2,500 MXN al año' : '$250 MXN al mes';
    return page(`<h2>Pago simulado (desarrollo)</h2><p>Plan ${p.get('plan')}: <b>${price}</b>${p.get('trial') === '1' ? '<br>14 días gratis, el primer cobro llega después.' : ''}</p>
      <form method="post"><button style="font-size:18px;padding:12px 20px">Pagar con tarjeta de prueba</button></form><p><a href="${p.get('no')}">Cancelar</a></p>`);
  }
  if (u.pathname === '/dev/portal') {
    const p = u.searchParams;
    if (req.method === 'POST') {
      await store.updateAccount(p.get('acc')!, { sub: { status: 'canceled', cancelAtPeriodEnd: false } });
      return Response.redirect(p.get('back')!, 303);
    }
    return page(`<h2>Portal de suscripción (desarrollo)</h2><form method="post"><button>Cancelar suscripción ahora</button></form><p><a href="${p.get('back')}">Volver</a></p>`);
  }
  return handler(req);
});
