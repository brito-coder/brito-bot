# brito-bot 🤖

Herramienta gratis para **@brito.redes** que reemplaza dos cosas pagas:

1. **Responde en público los comentarios** de los reels que vos elijas (lo que ManyChat Free dejó de hacer después de los 25 contactos por mes).
2. **Publica reels en Instagram** sin el límite de 20 posteos por mes de Metricool.

Reglas que el bot cumple siempre:

- Responde **solo en público**, debajo del comentario. **Nunca manda mensajes directos**: los DM los seguís contestando vos.
- **Nunca responde dos veces el mismo comentario.** Lleva un registro (`estado/respondidos.json`) y, además, si ve que la cuenta ya respondió ese comentario (aunque lo hayas hecho vos a mano), lo saltea.
- Solo toca los reels que estén anotados en `config/reels.json`.
- Como mucho manda 30 respuestas cada vez que corre, con una pausa de unos segundos entre una y otra, para que Instagram no lo tome como spam.

---

## Dónde corre y por qué

Corre en **GitHub Actions**, en el repositorio público [`brito-coder/brito-bot`](https://github.com/brito-coder/brito-bot).

- **Es gratis y sin tope**: en los repositorios públicos, GitHub no cobra los minutos.
- **Funciona con la Mac apagada.** Lo descartado: un programa en la Mac (launchd) solo anda con la compu prendida y despierta. Los capítulos salen a las 21 h, justo cuando más comentarios entran.
- **No pone en riesgo tu web.** Lo descartado: Netlify. Con el plan gratis, si se gastan los créditos del mes, Netlify **pausa todos tus sitios**, incluido britoredes.netlify.app. Además, tu web hoy se sube arrastrando la carpeta, y las funciones programadas necesitan otra forma de subirla.
- **Está todo a la vista**: los códigos, las frases y el registro se ven en GitHub. El token **no** se ve: se guarda como "secret" y nadie lo puede leer, ni siquiera vos desde la web.

Lo único malo es que GitHub no es exacto con el reloj. Pide correr cada 5 minutos, pero cuando hay mucha gente usándolo se puede atrasar y pasar a cada 10 o 15 minutos. Para responder votos alcanza y sobra.

> Que el repositorio sea público no expone nada privado. Ahí se ven el código, las frases (que igual se publican en Instagram) y los números de los comentarios ya respondidos, sin nombres de usuario.

---

## Cómo agregar un reel para que el bot lo responda

1. Entrá a [`config/reels.json`](https://github.com/brito-coder/brito-bot/blob/main/config/reels.json) en GitHub y tocá el lápiz ✏️ (Edit). Se puede hacer desde el celular.
2. Dentro de `"reels": [ ... ]`, agregá un bloque así:

```json
{
  "nombre": "DECIDÍ VOS cap 2",
  "link": "https://www.instagram.com/reel/XXXXXXXXX/",
  "activo": true,
  "frases": [
    "¡Voto contado! 🗳️ El viernes a las 21 h se ve qué pasa.",
    "Anotado 👀 Seguí la cuenta para ver cómo termina.",
    "¡Ese voto suma! 🔥"
  ]
}
```

3. Tocá **Commit changes**. En la próxima vuelta (unos 5 minutos) el bot ya empieza a responder.

Para tener en cuenta:

- **El link** es el del reel. Lo sacás con *Compartir → Copiar enlace*.
- **Las frases** se van turnando: la primera respuesta usa la frase 1, la segunda la frase 2, y así, y cuando se terminan vuelve a empezar. Poné por lo menos 3 o 4 frases distintas, así no queda todo igual (Instagram castiga las respuestas repetidas).
- **`{usuario}`** dentro de una frase se cambia por el @ de la persona. Por ejemplo, `"¡Gracias {usuario}!"` se publica como `¡Gracias @juan!`.
- **Si hay más de un reel**, separá cada bloque con una coma `,`. Si te olvidás de la coma, el bot no arranca. Si pasa eso, avisale a Claude.
- **Para frenar un reel** sin borrarlo, cambiá `"activo": true` por `"activo": false`.

Opciones extra, para poner dentro del bloque si las necesitás:

- `"solo_si_contiene": ["A", "B"]`: responde solo los comentarios que digan alguna de esas palabras.
- `"solo_desde": "2026-11-11T00:00:00"`: ignora los comentarios anteriores a esa fecha. Sirve para no responder los viejos de un reel que ya tiene muchos.

---

## Cómo publicar un reel

**Desde el celular o la web (sin la Mac):**

1. Entrá a [Actions → Publicar reel](https://github.com/brito-coder/brito-bot/actions/workflows/publicar.yml) y tocá **Run workflow**.
2. Completá los datos:
   - **video**: un link público que termine en `.mp4`.
   - **caption**: el texto del reel.
   - **bot** (opcional): un nombre para el reel. Si lo ponés, el bot empieza a responder sus comentarios con las frases por defecto.
3. Tocá **Run workflow**. En 1 a 3 minutos el reel queda publicado.

**Desde la Mac, con un archivo** (normalmente lo hace Claude):

```bash
node publicar.mjs --archivo ~/Desktop/reel.mp4 --caption-archivo caption.txt --bot "DECIDÍ VOS cap 2"
```

Esto sube el video a la página pública del repositorio (GitHub Pages), espera a que Instagram lo procese y lo publica. Si le agregás `--prueba`, hace todo menos el último paso: sirve para chequear que el video anda sin publicar nada.

Para tener en cuenta:

- Instagram pide videos **MP4 verticales 9:16**, de 3 segundos a 15 minutos, de menos de 300 MB.
- Se pueden publicar hasta **50 posteos por día** por la API.
- **Las frases por defecto** (`frases_por_defecto` en `config/reels.json`) son las que usa el bot cuando agregás un reel desde acá. Cambialas cuando quieras.

---

## Si algo deja de andar

- **Ver qué hizo el bot:** entrá a [Actions](https://github.com/brito-coder/brito-bot/actions). Cada vuelta muestra qué comentarios respondió.
- **Error "token" o "session has been invalidated":** pasa si cambiaste la contraseña de Facebook o le sacaste permisos a la app. Hay que sacar un token nuevo (ver [`CONFIGURAR-META.md`](CONFIGURAR-META.md)) y correr `node configurar.mjs`.
- **Probar sin publicar nada:** corré `node comentarios.mjs --prueba`. Muestra qué respondería, sin mandar nada.
- **Si GitHub deja de correr el bot:** GitHub apaga las tareas programadas de un repositorio que pasa 60 días sin cambios. El bot guarda su registro seguido, así que no debería pasar. Si igual pasa, entrá a Actions y tocá **Enable workflow**.

## Archivos

| Archivo | Para qué es |
| --- | --- |
| `config/reels.json` | Los reels que responde el bot y sus frases. **Es el único que vas a tocar.** |
| `comentarios.mjs` | El que responde los comentarios. |
| `publicar.mjs` | El que publica reels. |
| `configurar.mjs` | Guarda el token. Se usa una sola vez. |
| `estado/` | El registro de lo que ya se respondió. No lo toques. |
| `CONFIGURAR-META.md` | Paso a paso para crear la app de Meta y sacar el token. |
