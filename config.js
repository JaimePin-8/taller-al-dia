// Dirección del servidor (función "api" de Supabase). La llena tools/configurar.sh.
window.TALLER_CONFIG = {
  apiUrl: ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'http://localhost:8787/api'
    : 'https://egockraitcrcwpbkyjwi.supabase.co/functions/v1/api'
};
