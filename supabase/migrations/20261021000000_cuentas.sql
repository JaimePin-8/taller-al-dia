-- Cuentas, sesiones, códigos por correo, bloqueo por intentos, datos del taller y suscripción.
-- Solo la función "api" (con la llave de servicio) puede leer o escribir estas tablas.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  password_hash text not null,
  shop_name text not null default '',
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  stripe_customer_id text unique,
  sub_status text not null default 'none',
  sub_plan text,
  sub_period_end timestamptz,
  sub_trial_end timestamptz,
  sub_cancel_at_period_end boolean not null default false,
  sub_trial_used boolean not null default false
);

create table public.sessions (
  token_hash text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index sessions_account_idx on public.sessions(account_id);

create table public.trusted_devices (
  token_hash text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index trusted_devices_account_idx on public.trusted_devices(account_id);

create table public.email_codes (
  id uuid primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'login', 'reset')),
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index email_codes_account_idx on public.email_codes(account_id, created_at);

create table public.auth_attempts (
  key text primary key,
  fails int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.shop_data (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
alter table public.trusted_devices enable row level security;
alter table public.email_codes enable row level security;
alter table public.auth_attempts enable row level security;
alter table public.shop_data enable row level security;
revoke all on public.accounts, public.sessions, public.trusted_devices, public.email_codes, public.auth_attempts, public.shop_data from anon, authenticated;

-- Registra un intento fallido de forma atómica. Al llegar a p_max bloquea p_lock_seconds y reinicia el contador.
create or replace function public.auth_fail(p_key text, p_max int, p_lock_seconds int)
returns table (fails int, locked_until timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  insert into public.auth_attempts as a (key, fails, locked_until, updated_at)
  values (p_key, 1, null, now())
  on conflict (key) do update
    set fails = case when a.updated_at < now() - interval '1 day' then 1 else a.fails + 1 end,
        locked_until = null,
        updated_at = now();
  update public.auth_attempts a
     set fails = 0, locked_until = now() + make_interval(secs => p_lock_seconds)
   where a.key = p_key and a.fails >= p_max;
  return query select a.fails, a.locked_until from public.auth_attempts a where a.key = p_key;
end $$;

revoke execute on function public.auth_fail(text, int, int) from public, anon, authenticated;
grant execute on function public.auth_fail(text, int, int) to service_role;
