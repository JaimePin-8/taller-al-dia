// Conexiones reales: Stripe para cobros y Resend para correos.
import Stripe from 'npm:stripe@17.4.0';
import * as L from './lib.ts';
import type { Billing, Mailer, SubUpdate } from './handler.ts';

export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(to, subject, html, text) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text })
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    }
  };
}

export function stripeBilling(o: { secretKey: string; webhookSecret: string; portalConfig?: string }): Billing {
  const stripe = new Stripe(o.secretKey, { httpClient: Stripe.createFetchHttpClient() });
  const crypto = Stripe.createSubtleCryptoProvider();

  async function priceFor(plan: keyof typeof L.PLANS) {
    const { data } = await stripe.prices.list({ lookup_keys: [L.PLANS[plan]], active: true, limit: 1 });
    if (!data[0]) throw new Error(`Falta el precio ${L.PLANS[plan]} en Stripe (corre tools/stripe-setup.mjs)`);
    return data[0].id;
  }

  // Siempre se lee la suscripción actual para no depender del orden de los eventos.
  async function toUpdate(id: string): Promise<SubUpdate> {
    const s = await stripe.subscriptions.retrieve(id);
    const item = s.items.data[0];
    // deno-lint-ignore no-explicit-any
    const periodEnd = (s as any).current_period_end ?? (item as any)?.current_period_end ?? null;
    return {
      accountId: s.metadata?.account_id,
      customerId: typeof s.customer === 'string' ? s.customer : s.customer.id,
      sub: {
        status: s.status,
        plan: item?.price?.recurring?.interval === 'year' ? 'anual' : 'mensual',
        periodEnd: periodEnd ? periodEnd * 1000 : null,
        trialEnd: s.trial_end ? s.trial_end * 1000 : null,
        cancelAtPeriodEnd: s.cancel_at_period_end || !!s.cancel_at
      }
    };
  }

  return {
    async checkout(acc, plan, { trial, successUrl, cancelUrl }) {
      let customer = acc.stripeCustomerId;
      if (!customer) customer = (await stripe.customers.create({ email: acc.email, name: acc.shopName, metadata: { account_id: acc.id } })).id;
      const s = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer,
        client_reference_id: acc.id,
        line_items: [{ price: await priceFor(plan), quantity: 1 }],
        subscription_data: { metadata: { account_id: acc.id }, ...(trial ? { trial_period_days: L.TRIAL_DAYS } : {}) },
        payment_method_collection: 'always',
        locale: 'es',
        success_url: successUrl,
        cancel_url: cancelUrl
      });
      return { url: s.url!, customerId: customer };
    },

    async portal(acc, returnUrl) {
      const s = await stripe.billingPortal.sessions.create({
        customer: acc.stripeCustomerId!, return_url: returnUrl, locale: 'es',
        ...(o.portalConfig ? { configuration: o.portalConfig } : {})
      });
      return s.url;
    },

    async webhook(req) {
      const ev = await stripe.webhooks.constructEventAsync(await req.text(), req.headers.get('stripe-signature') ?? '', o.webhookSecret, undefined, crypto);
      if (ev.type.startsWith('customer.subscription.')) return toUpdate((ev.data.object as Stripe.Subscription).id);
      if (ev.type === 'checkout.session.completed') {
        const cs = ev.data.object as Stripe.Checkout.Session;
        if (cs.subscription) return toUpdate(typeof cs.subscription === 'string' ? cs.subscription : cs.subscription.id);
      }
      if (ev.type === 'invoice.payment_failed' || ev.type === 'invoice.paid') {
        const inv = ev.data.object as Stripe.Invoice;
        // deno-lint-ignore no-explicit-any
        const sub = (inv as any).subscription ?? (inv as any).parent?.subscription_details?.subscription;
        if (sub) return toUpdate(typeof sub === 'string' ? sub : sub.id);
      }
      return null;
    }
  };
}
