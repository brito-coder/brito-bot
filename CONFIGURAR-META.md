# Cómo conectar el bot con Instagram (se hace una sola vez)

Esto lo tenés que hacer **vos**, porque pide entrar con tu Facebook. Claude te va guiando en el navegador, pero **la contraseña la escribís siempre vos**. Tarda unos 10 minutos.

Antes de empezar, fijate que la página de Facebook **«Brito»** ([facebook.com/Brito.redes](https://facebook.com/Brito.redes)) esté conectada a **@brito.redes**. Ya lo está, porque Metricool y ManyChat la usan.

---

## Paso 1 · Crear la app de Meta (en modo desarrollo)

1. Entrá a **[developers.facebook.com/apps](https://developers.facebook.com/apps)** con tu Facebook, el mismo que administra la página Brito.
   - Si es la primera vez, te pide registrarte como desarrollador. Es gratis: aceptá y confirmá con tu mail o tu celular.
2. Tocá **Crear app**.
3. Completá los datos:
   - **Nombre:** `brito-bot`
   - **Mail:** el tuyo
4. Cuando pregunte qué querés hacer (*caso de uso*), elegí **Otro**.
5. Cuando pregunte el tipo de app, elegí **Empresa** (*Business*).
6. Si pregunta por un portfolio comercial, podés dejarlo vacío. Tocá **Crear app** y, si la pide, poné tu contraseña de Facebook.

La app queda en **modo desarrollo**, y está bien que quede así. En ese modo solo funciona con las cuentas de quien la creó (o sea, la tuya), que es justo lo que queremos. No hace falta pedirle a Meta que la revise ni pasarla a "en vivo".

## Paso 2 · Sacar el token (la "llave" del bot) y conectar la página Brito

1. Entrá a **[developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)** (el *Explorador de la API Graph*).
2. A la derecha, en **App de Meta**, elegí **brito-bot**.
3. En **Usuario o página**, dejá **Token de usuario**.
4. En **Permisos**, agregá estos, uno por uno:
   - `instagram_basic`
   - `instagram_manage_comments`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`: Meta lo pide para poder leer Instagram a través de la página.
   - `business_management`: hace falta si la página está dentro de un portfolio comercial.
5. Tocá **Generate Access Token**. Se abre una ventanita de Facebook:
   - Elegí **la página Brito** (no AOQUE) y **la cuenta @brito.redes**.
   - Dejá tildados todos los permisos y tocá **Guardar** o **Continuar**.
6. Arriba aparece un texto largo que empieza con `EAA…`. Ese es el token **corto**: dura 1 hora.

## Paso 3 · Hacer que el token dure

1. Copiá ese texto `EAA…` y entrá a **[developers.facebook.com/tools/debug/accesstoken](https://developers.facebook.com/tools/debug/accesstoken)**.
2. Pegalo y tocá **Depurar**.
3. Abajo de todo, tocá **Extender token de acceso** (*Extend Access Token*). Si pide tu contraseña, ponela vos.
4. Aparece un token nuevo, también empieza con `EAA…`. Ese es el **largo**: copialo.

## Paso 4 · Dárselo al bot

En la Terminal que te abre Claude, pegá el token largo y apretá Enter. Lo recibe este comando:

```bash
cd ~/Desktop/Brito/brito-bot && node configurar.mjs
```

El programa hace tres cosas con ese token:

- Busca la página Brito y saca de ahí un **token de página**. Ese no vence mientras no cambies la contraseña de Facebook ni le quites permisos a la app.
- Encuentra el número interno de @brito.redes.
- Guarda las dos cosas en tu Mac (archivo `.env`) y en GitHub, como "secret" que nadie puede ver.

Listo, no hay que hacer nada más. 🎉

---

### Si un día deja de andar

Si cambiás la contraseña de Facebook o le sacás permisos a la app, el token deja de servir. En ese caso repetí los pasos 2, 3 y 4. La app ya está creada, así que el paso 1 no hace falta.
