# Poner en marcha cuentas y suscripción

La app usa tres servicios. Los tres tienen plan gratis para empezar:

| Servicio | Para qué | Costo |
|---|---|---|
| **Supabase** | Base de datos y servidor (cuentas, datos de cada taller) | Gratis. El plan gratis pausa el proyecto si pasa 1 semana sin uso; con clientes que pagan conviene el plan Pro (25 USD/mes). |
| **Stripe** | Cobrar $250/mes o $2,500/año con tarjeta | Sin mensualidad; comisión por cada cobro. |
| **Resend** | Mandar los códigos por correo | Gratis hasta 3,000 correos al mes. |

## 1. Crear las cuentas (una sola vez)

1. **Supabase**: entra a supabase.com → *New project*. Ponle nombre `taller-al-dia`, región *East US* (la más cercana a México) y guarda la contraseña de la base de datos. Copia el **Project ref** (Project Settings → General).
2. **Stripe**: crea tu cuenta en stripe.com. Empieza en **modo de prueba** y copia la llave secreta `sk_test_…` (Developers → API keys). Cuando quieras cobrar de verdad, activa la cuenta con tus datos fiscales y repite el paso 2 con la llave `sk_live_…`.
3. **Resend**: crea tu cuenta en resend.com y una API key `re_…`.
   - Para probar puedes usar el remitente `onboarding@resend.dev`, pero **solo entrega correos a tu propio correo**.
   - Para clientes reales necesitas un dominio propio (ej. `tallerdia.mx`) verificado en Resend (Domains → Add domain) y usar algo como `Taller al Día <no-responder@tallerdia.mx>`.

## 2. Configurar el servidor

En la terminal:

```bash
cd ~/taller-al-dia && bash tools/configurar.sh
```

El script pide el Project ref, la contraseña de la base de datos y las llaves (se escriben ocultas). Después crea las tablas, los precios en Stripe, el portal del cliente y el webhook, y sube la función `api`.

## 3. Publicar

Sube los cambios a GitHub (`git push`) y en 1 minuto la app publicada pide iniciar sesión.

## Cómo funciona la seguridad

- **Contraseña**: más de 10 caracteres, con al menos un carácter especial, una letra y un número. Se guarda cifrada (PBKDF2-SHA256, 600,000 iteraciones), nunca en texto.
- **3 intentos**: al tercer intento fallido el acceso se bloquea **15 minutos**, aunque después se escriba la contraseña correcta. Llega un correo de aviso al dueño. Cambiar la contraseña con “Olvidé mi contraseña” quita el bloqueo. También hay un freno de 20 intentos por dirección IP.
- **Código por correo**: la primera vez en cada celular se pide un código de 6 dígitos (vence en 10 minutos, 5 intentos). Ese celular queda de confianza 30 días. También se pide para confirmar el correo al crear la cuenta y para cambiar la contraseña.
- **Sesiones**: duran 30 días. “Cerrar sesión en todos los celulares” (en Ajustes) las corta todas y vuelve a pedir código en cada celular.
- Las tablas solo las puede leer la función `api`; desde fuera nadie puede consultarlas directamente.

## Suscripción

- 14 días gratis (pide tarjeta; si cancela antes no se le cobra). La prueba solo se da una vez por cuenta.
- **Mensual $250** o **Anual $2,500** (en lugar de $3,000: ahorra $500).
- Desde Ajustes → *Administrar suscripción y tarjeta* el cliente cambia de plan, cambia su tarjeta o cancela (sigue usando la app hasta el fin del periodo pagado).
- Si un cobro falla, la app sigue funcionando mientras Stripe reintenta. Si la suscripción termina, la app pide reactivarla. Los datos no se borran y el cliente puede descargarlos.

## Desarrollo en tu computadora

Sin tocar Supabase, Stripe ni Resend (los correos salen en la terminal y el pago se simula):

```bash
npx -y deno@2.1.4 run --allow-net dev/server.ts
```

En otra terminal:

```bash
python3 -m http.server 5190
```

Abre http://localhost:5190. Los códigos también se ven en http://localhost:8787/dev/correos.

Pruebas automáticas de seguridad:

```bash
npx -y deno@2.1.4 test dev/
```
