// Punto de entrada de la función "api" en Supabase.
import { createHandler } from './handler.ts';
import { pgStore } from './store_pg.ts';
import { resendMailer, stripeBilling } from './services.ts';

const need = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Falta la variable ${k}`);
  return v;
};

const handler = createHandler({
  store: pgStore(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY')),
  mailer: resendMailer(need('RESEND_API_KEY'), need('MAIL_FROM')),
  billing: stripeBilling({
    secretKey: need('STRIPE_SECRET_KEY'),
    webhookSecret: need('STRIPE_WEBHOOK_SECRET'),
    portalConfig: Deno.env.get('STRIPE_PORTAL_CONFIG') || undefined
  }),
  env: {
    appUrl: need('APP_URL'),
    allowedOrigins: need('ALLOWED_ORIGINS').split(',').map(s => s.trim()),
    codeSecret: need('CODE_SECRET')
  }
});

Deno.serve(handler);
