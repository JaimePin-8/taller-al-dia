#!/usr/bin/env bash
# Configura el servidor de Taller al Día en tu proyecto de Supabase, Stripe y Resend.
# Córrelo en tu terminal: bash tools/configurar.sh
# Las llaves se escriben ocultas y no se guardan en ningún archivo del proyecto.
set -euo pipefail
cd "$(dirname "$0")/.."


# Lee una llave: la copias y presionas Enter (se toma del portapapeles) o la pegas en el campo oculto.
pedir_llave() {
  local msg="$1" pref="$2" k
  while true; do
    read -rsp "$msg: copia la llave y presiona Enter (o pégala aquí): " k >&2; echo >&2
    [[ -z "$k" ]] && k=$(pbpaste 2>/dev/null | tr -d '[:space:]')
    if [[ "$k" == "$pref"* ]]; then echo "     Llave recibida (${#k} caracteres)." >&2; printf '%s' "$k"; return; fi
    echo "     No se copió una llave que empiece con $pref. Cópiala de nuevo y vuelve a presionar Enter." >&2
  done
}

SB="npx -y supabase@2.119.0"
APP_URL="https://jaimepin-8.github.io/taller-al-dia/"
ORIGIN="https://jaimepin-8.github.io"

echo
echo "== Taller al Día: configuración del servidor =="
echo "Antes necesitas: un proyecto en supabase.com, una cuenta en stripe.com y una en resend.com."
echo "Los pasos están en CONFIGURAR.md."
echo

if ! $SB projects list >/dev/null 2>&1; then
  echo "1/6  Inicia sesión en Supabase (se abre el navegador)…"
  $SB login
fi

read -rp "2/6  Project ref de Supabase (Project Settings → General, 20 letras): " REF
[[ "$REF" =~ ^[a-z]{20}$ ]] || { echo "Ese no parece un Project ref."; exit 1; }
echo "     Te pedirá la contraseña de la base de datos que pusiste al crear el proyecto."
$SB link --project-ref "$REF"
$SB db push
API="https://$REF.supabase.co/functions/v1/api"

echo
STRIPE_KEY=$(pedir_llave "3/6  Llave secreta de Stripe" "sk_")
[[ "$STRIPE_KEY" == sk_test_* || "$STRIPE_KEY" == sk_live_* ]] || { echo "Esa no es una llave secreta de Stripe (debe empezar con sk_test_ o sk_live_)."; exit 1; }
STRIPE_OUT=$(STRIPE_SECRET_KEY="$STRIPE_KEY" node tools/stripe-setup.mjs "$API" "$APP_URL")
WEBHOOK_SECRET=$(printf '%s\n' "$STRIPE_OUT" | sed -n 's/^STRIPE_WEBHOOK_SECRET=//p')
PORTAL_CONFIG=$(printf '%s\n' "$STRIPE_OUT" | sed -n 's/^STRIPE_PORTAL_CONFIG=//p')

echo
RESEND_KEY=$(pedir_llave "4/6  Llave de Resend" "re_")
read -rp "     Remitente de los correos [Taller al Día <onboarding@resend.dev>]: " MAIL_FROM
MAIL_FROM=${MAIL_FROM:-"Taller al Día <onboarding@resend.dev>"}

echo "5/6  Guardando llaves en Supabase y subiendo la función…"
ENV_FILE=$(mktemp)
chmod 600 "$ENV_FILE"
trap 'rm -f "$ENV_FILE"' EXIT
cat > "$ENV_FILE" <<EOF
STRIPE_SECRET_KEY=$STRIPE_KEY
STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET
STRIPE_PORTAL_CONFIG=$PORTAL_CONFIG
RESEND_API_KEY=$RESEND_KEY
MAIL_FROM="$MAIL_FROM"
CODE_SECRET=$(openssl rand -hex 32)
APP_URL=$APP_URL
ALLOWED_ORIGINS=$ORIGIN
EOF
$SB secrets set --project-ref "$REF" --env-file "$ENV_FILE"
$SB functions deploy api --project-ref "$REF" --no-verify-jwt

echo "6/6  Conectando la app con el servidor…"
sed -i '' "s#https://TU-PROYECTO.supabase.co#https://$REF.supabase.co#" config.js
grep -q "$REF" config.js && echo "     config.js listo."

echo
echo "✅ Servidor listo: $API"
echo "   Falta publicar la app (git push). Pídeselo a Claude o córrelo tú."
