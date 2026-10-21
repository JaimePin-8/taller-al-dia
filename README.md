# Taller al Día

App web para celular (PWA) que ayuda a un taller mecánico a no perder dinero:

- **Recordatorios de servicio** (aceite, frenos, afinación…) por fecha **o** kilometraje, lo que llegue primero. La app estima cuánto maneja cada cliente con su historial.
- **Seguimiento de cotizaciones**: lo que recomendaste y el cliente no autorizó.
- **Cobranza**: autos entregados con saldo pendiente.
- **Clientes inactivos**: los que llevan meses sin venir.
- **Aviso de “auto listo”** y **nota de servicio** por WhatsApp con el próximo servicio incluido.
- Panel con dinero por recuperar, cobrado del mes y lo que regresó gracias a un aviso.

Todo se envía con un toque por WhatsApp (abre el chat con el mensaje escrito). Los datos se guardan en el teléfono; en Ajustes se descarga un respaldo.

## Probar en la computadora

```bash
python3 -m http.server 5190 --directory ~/taller-al-dia
```

Abre http://localhost:5190 y toca “Probar con datos de ejemplo”.

## Instalar en el celular

Necesita estar publicada en un sitio con HTTPS (Netlify, Vercel, GitHub Pages, etc.). Después:

- **iPhone**: abrir en Safari → Compartir → “Agregar a inicio”.
- **Android**: abrir en Chrome → menú → “Instalar app”.

Funciona sin internet una vez instalada.

## Archivos

- `app.js` — datos, motor de recordatorios, pantallas y acciones.
- `styles.css` — estilos (modo claro y oscuro automático).
- `sw.js` — caché para uso sin conexión. Sube `CACHE` de versión al publicar cambios.
