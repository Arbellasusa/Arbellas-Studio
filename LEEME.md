# Arbella Studio: instalación

Esta es una app web instalable (PWA). Se publica gratis en GitHub Pages y se instala en el iPhone desde Safari.

Tiene dos partes:

| Parte | Dónde vive | Para qué sirve |
|---|---|---|
| La app (`index.html`, `manifest.json`, `sw.js`, `icons/`) | GitHub Pages | Pantallas, armado y exportación del video |
| El servidor de IA (`servidor-ia/worker.js`) | Cloudflare Workers (gratis) | Guarda tus claves de Anthropic (guiones) y Leonardo AI (fotos) |

La app también funciona sin el servidor. En ese caso arma el guion con una plantilla básica y la IA no mira tus fotos.

---

## Parte 1: Publicar la app en GitHub Pages

1. Entra a github.com y crea un repositorio nuevo, por ejemplo `arbella-studio`. Márcalo como **Public**.
2. En el repositorio toca **Add file → Upload files**.
3. Arrastra **todo lo que hay en esta carpeta**: `index.html`, `manifest.json`, `sw.js`, `.nojekyll` y la carpeta `icons`. La carpeta `servidor-ia` no hace falta subirla, aunque no pasa nada si la subes.
   - Si `.nojekyll` no aparece porque está oculto: en Mac presiona `Cmd + Shift + .` en Finder. Es opcional.
4. Toca **Commit changes**.
5. Ve a **Settings → Pages**. En "Branch" elige `main` y la carpeta `/ (root)`, y toca **Save**.
6. Espera 1 o 2 minutos. Tu app queda en:
   `https://arbellasusa.github.io/Arbellas-Studio/`

## Parte 2: Crear el servidor de IA en Cloudflare

Esto mantiene tu clave en secreto. Si pones la clave dentro de la app, cualquiera que abra la página la podría copiar y gastar tu saldo.

1. **Saca tu clave de IA.** Entra a console.anthropic.com, crea una cuenta, agrega saldo en **Billing** (con $5 alcanza para cientos de guiones) y crea una clave en **API Keys**. Cópiala: empieza con `sk-ant-`.
2. **Crea el Worker.** Entra a dash.cloudflare.com (la cuenta es gratis) y ve a **Workers & Pages → Create → Create Worker**. Ponle de nombre `arbella-ia` y toca **Deploy**.
3. Toca **Edit code**. Borra todo lo que trae, pega el contenido de `servidor-ia/worker.js` y toca **Deploy**.
4. Ve a **Settings → Variables and Secrets** y agrega estas variables:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Secret | tu clave `sk-ant-...` |
   | `APP_TOKEN` | Secret | una contraseña que inventes, por ejemplo `Arbellas-2026-xyz` |
   | `ALLOWED_ORIGIN` | Text | `https://arbellasusa.github.io` (sin nada más al final) |
   | `LEONARDO_API_KEY` | Secret | tu clave de API de Leonardo (ver Parte 2B) |
   | `GEMINI_API_KEY` | Secret | tu clave de Google AI Studio (ver Parte 2C) |

5. Copia la dirección del Worker. Se ve así: `https://arbella-ia.TU-SUBDOMINIO.workers.dev`

## Parte 2B: Conectar Leonardo AI (arreglar fotos)

1. Entra a **app.leonardo.ai** con tu cuenta.
2. En el menú busca **API Access** (o ve a tu perfil → **API**). La API se paga aparte de la suscripción normal: compra créditos de API (el paquete más pequeño alcanza para cientos de fotos).
3. Toca **Create New Key**, ponle de nombre `Arbellas Studio` y copia la clave.
4. En Cloudflare, en tu Worker, agrégala como **Secret** con el nombre `LEONARDO_API_KEY`.
5. Si ya tenías el Worker hecho, entra a **Edit code**, reemplaza todo por el `worker.js` nuevo y toca **Deploy**.

En la app, sube tus fotos y **toca una foto**. Se abre "Arreglar foto" con estas opciones:

| Opción | Qué hace | Tiempo |
|---|---|---|
| Quitar fondo | Deja solo el producto, con fondo transparente | ~5 s |
| Fondo blanco de estudio | Producto sobre blanco con sombra suave, estilo catálogo | ~5 s |
| Crear escena | Pone el producto en una escena nueva (estudio de lujo, recámara, exterior, flat lay, solo mejorar luz o tu propia instrucción) | 20–60 s |

La foto arreglada reemplaza a la original en el video y lleva la marca **IA**. Con **Deshacer** vuelves a la original.

Las escenas las crea la IA: revisa que el color, el encaje y los detalles de la prenda sigan iguales antes de publicar, para que el cliente reciba lo mismo que ve.

## Parte 2C: Conectar el video IA de Google (motor de Google Flow)

Google Flow no tiene API propia. Su motor de video sí está en la API de Gemini: desde el 22 de octubre de 2026 se llama **Gemini Omni Flash** (antes Veo 3.1).

1. Entra a **aistudio.google.com** con tu cuenta de Google.
2. Toca **Get API key → Create API key** y cópiala.
3. Activa la facturación del proyecto en AI Studio (**Billing**). La generación de video normalmente no entra en la capa gratis.
4. En Cloudflare agrégala como **Secret** con el nombre `GEMINI_API_KEY` y toca **Deploy**.

En la app, toca una foto, baja a **Video con IA de Google**, elige el movimiento y toca **Animar esta foto**. Tarda de 1 a 3 minutos. El clip queda como apertura del anuncio, con tu gancho encima. En el paso 3 lo puedes guardar solo o quitarlo.

## Parte 3: Instalar en el iPhone

1. Abre **Safari** (tiene que ser Safari) y entra a `https://arbellasusa.github.io/Arbellas-Studio/`
2. Toca **Compartir** (el cuadro con la flecha) y elige **Agregar a pantalla de inicio**, luego **Agregar**.
3. Abre la app desde el ícono nuevo.
4. Toca **Ajustes**, pega la dirección del Worker y tu `APP_TOKEN`, toca **Guardar** y después **Probar conexión**. Cuando el punto se pone verde, la IA está conectada.

## Uso diario

- **Exportar video:** espera a que termine de grabar, toca **Guardar o compartir** y elige **Guardar video**. Queda en Fotos, listo para subir a TikTok.
- Mientras graba, no cambies de app ni bloquees el teléfono.
- **Costo de la IA:** cada guion con fotos cuesta unos pocos centavos. Puedes ver el gasto en console.anthropic.com. Te conviene poner un límite mensual en **Billing → Limits**.

## Actualizar la app más adelante

1. Sube el `index.html` nuevo a GitHub.
2. Abre `sw.js` y cambia `arbella-studio-v1` por `arbella-studio-v2` (v3, v4… en cada cambio). Así el iPhone toma la versión nueva.
3. Cierra la app del todo y ábrela otra vez. A veces hay que abrirla dos veces.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| "La contraseña no coincide" | La contraseña en Ajustes debe ser idéntica a `APP_TOKEN`. |
| "Origen no permitido" | `ALLOWED_ORIGIN` debe ser exactamente `https://TU-USUARIO.github.io`, sin barra al final. |
| "No se pudo conectar" | Revisa que la dirección del Worker empiece con `https://` y esté bien copiada. |
| Error de saldo o crédito | Guiones: agrega saldo en console.anthropic.com → Billing. Fotos: compra créditos de API en app.leonardo.ai. |
| "Falta LEONARDO_API_KEY" | Agrega la clave de Leonardo como Secret en Cloudflare. |
| "Falta GEMINI_API_KEY" | Agrega la clave de Google AI Studio como Secret en Cloudflare. |
| "Google (403)" o de facturación | Activa Billing en tu proyecto de AI Studio. |
| No sale "Agregar a pantalla de inicio" | Usa Safari. En el menú de Compartir, toca "Editar acciones" y actívalo. |
