# Taller al Día

App web para celular (PWA) que ayuda a un taller mecánico a no perder dinero:

- **Recordatorios de servicio** (aceite, frenos, afinación…) por fecha **o** kilometraje, lo que llegue primero. La app estima cuánto maneja cada cliente con su historial.
- **Seguimiento de cotizaciones**: lo que recomendaste y el cliente no autorizó.
- **Cobranza**: autos entregados con saldo pendiente.
- **Clientes inactivos**: los que llevan meses sin venir.
- **Aviso de “auto listo”** y **nota de servicio** por WhatsApp con el próximo servicio incluido.
- Panel con dinero por recuperar, cobrado del mes y lo que regresó gracias a un aviso.

Todo se envía con un toque por WhatsApp (abre el chat con el mensaje escrito).

**Cuentas y suscripción** (ver [CONFIGURAR.md](CONFIGURAR.md)): cada taller entra con correo y contraseña segura, con código por correo en celulares nuevos y bloqueo de 15 minutos tras 3 intentos fallidos. Suscripción con Stripe: $250 al mes o $2,500 al año, 14 días gratis. Los datos se guardan en la nube (Supabase) y en el teléfono para usarse sin internet.

## Probar en la computadora

Ver “Desarrollo en tu computadora” en [CONFIGURAR.md](CONFIGURAR.md).

## Instalar en el celular

Necesita estar publicada en un sitio con HTTPS (Netlify, Vercel, GitHub Pages, etc.). Después:

- **iPhone**: abrir en Safari → Compartir → “Agregar a inicio”.
- **Android**: abrir en Chrome → menú → “Instalar app”.

Funciona sin internet una vez instalada.

## Archivos

- `app.js` — datos, motor de recordatorios, pantallas, acceso, suscripción y sincronización.
- `config.js` — dirección del servidor.
- `supabase/` — tablas (`migrations/`) y la función `api` (cuentas, códigos, datos y Stripe).
- `dev/` — servidor local simulado y pruebas automáticas.
- `tools/` — scripts para configurar Supabase y Stripe.
- `styles.css` — estilos (modo claro y oscuro automático).
- `sw.js` — caché para uso sin conexión. Sube `CACHE` de versión al publicar cambios.
