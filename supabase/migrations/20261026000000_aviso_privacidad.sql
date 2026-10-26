-- Constancia de aceptación del aviso de privacidad (versión y fecha) por cuenta.
alter table public.accounts
  add column privacy_version text,
  add column privacy_accepted_at timestamptz;
