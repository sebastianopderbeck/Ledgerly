# Login y datos por usuario — diseño

Fecha: 2026-10-16
Estado: en revisión.

## Objetivo

Que Ledgerly pueda usarlo una segunda persona sin mezclar datos. Todo lo que hoy está en Mongo pasa a
ser del dueño actual (el **owner**); el otro usuario arranca vacío y lo que cargue queda separado. Entrar
exige login.

Es el primer paso para publicar Ledgerly en Vercel. Este diseño se construye y se prueba en local y en la
versión publicada de la Mac; no depende de Vercel.

## Fuera de alcance (proyecto 2: deploy a Vercel)

- Mongo en Atlas y la copia de la base (`mongodump`/`mongorestore` de la base ya migrada).
- Adaptar Express a funciones serverless.
- La búsqueda automática de mails como cron de Vercel, la contraseña de iCloud fuera del Llavero, el OCR
  de imágenes y las notificaciones (hoy dependen de macOS).
- Importación por mail para el segundo usuario: no está prevista. Solo sube PDFs a mano.

## Decisiones tomadas

- **Login con Google y lista de mails.** Sin contraseñas propias, sin registro abierto. Solo entran el
  owner y los mails de `ALLOWED_EMAILS`.
- **`userId` explícito en cada documento personal**, filtrado a mano en cada query. Una sola base.
- **Guarda que falla cerrado.** Un plugin de Mongoose no agrega el filtro: solo verifica que esté. Una
  query sin `userId` sobre un modelo personal tira error, así un filtro olvidado es un 500 en los tests
  y no una filtración.
- **Lo público es compartido**: inflación, series macro y usuarios.
- **El owner es `OWNER_EMAIL`.** Solo el owner usa la importación por mail. La búsqueda automática y los
  scripts corren como el owner.
- **Sesión stateless** en una cookie firmada de 30 días, con la lista re-chequeada en cada request: sacar
  un mail de la lista y reiniciar el server corta el acceso aunque esa persona tenga una cookie vigente.
- **Migración por script idempotente**, no al arrancar el server.

## Identidad y login

### Flujo

OAuth 2.0 de Google del lado del server (authorization code + PKCE), con `google-auth-library`. Scopes:
`openid email profile`.

1. El botón «Entrar con Google» navega a `GET /api/auth/google`. El server genera `state` y el
   `code_verifier` de PKCE, los guarda en la cookie `ledgerly_oauth` (JWT firmado, 10 minutos,
   `Path=/api/auth`) y redirige a Google.
2. Google vuelve a `GET /api/auth/google/callback?code&state`. El server:
   - compara `state` con la cookie; borra la cookie;
   - canjea `code` con el `code_verifier`;
   - verifica el `id_token` (`aud` = `GOOGLE_CLIENT_ID`, emisor de Google, `email_verified: true`);
   - normaliza el mail (minúsculas, sin espacios) y chequea la lista;
   - busca el `User` por mail o lo crea; actualiza `name` y `lastLoginAt`;
   - si lo creó en este login, le siembra las reglas de categoría del sistema;
   - setea la cookie de sesión y redirige a `/`.
3. Si el mail no está en la lista redirige a `/?error=no-autorizado` sin crear nada. Cualquier otra falla
   (state distinto, error de Google, mail sin verificar) redirige a `/?error=login-fallido`.

El cliente de Google se inyecta como dependencia del router de auth, así los tests no hablan con Google.

### Sesión

- Cookie `ledgerly_session`: JWT HS256 firmado con `SESSION_SECRET` (`jose`), payload `{ sub: userId }`,
  vence a los 30 días. Atributos: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` de 30 días, y
  `Secure` cuando `PUBLIC_URL` es `https`.
- Middleware `requireUser` en todo `/api` salvo las rutas públicas: verifica la cookie, carga el `User` y
  chequea que su mail siga en la lista. Si algo falla, 401. Si pasa, deja `req.user` (`{ id, email, name,
  isOwner }`, tipado con augmentation de Express) y `userIdOf(req)` devuelve el `ObjectId`.
- Middleware `requireOwner` para `/api/mail/*`: 403 si `!req.user.isOwner`.
- Defensa CSRF además de `SameSite=Lax`: en `POST`/`PUT`/`PATCH`/`DELETE`, si viene `Origin` y no es el
  origin de `PUBLIC_URL`, 403.
- Se saca `cors({ origin: "http://localhost:5173" })`: en dev el cliente llega por el proxy de Vite, todo
  es mismo origen.

### Endpoints

| Ruta | Acceso | Qué hace |
|---|---|---|
| `GET /api/health` | pública | sin cambios (lo usa el deploy de la Mac) |
| `GET /api/auth/google` | pública | arranca el login |
| `GET /api/auth/google/callback` | pública | termina el login |
| `GET /api/auth/me` | sesión | `{ email, name, isOwner }` |
| `POST /api/auth/logout` | pública | borra la cookie de sesión, 204 |
| `/api/mail/*` | owner | sin cambios de contrato |
| resto de `/api/*` | sesión | sin cambios de contrato |

### Config

`readAuthConfig(env)` valida al arrancar y, si falta algo, el server no arranca y dice qué falta.

| Variable | Uso |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | cliente OAuth tipo «Aplicación web» |
| `SESSION_SECRET` | firma de cookies; al menos 32 caracteres |
| `OWNER_EMAIL` | el owner; siempre puede entrar |
| `ALLOWED_EMAILS` | los demás, separados por coma; puede estar vacía |
| `PUBLIC_URL` | origin de la app; arma la redirect URI `${PUBLIC_URL}/api/auth/google/callback` |

`createApp(config)` recibe la config; los tests le pasan una de prueba.

## Datos por usuario

### Qué es de quién

- **Por usuario (14 colecciones):** `statements`, `transactions`, `categoryrules`, `mortgagecoupons`,
  `autocoupons`, `payslips`, `hiddensubscriptions`, `manualsubscriptions`, `annualsubscriptions`,
  `manualassets`, `fixedservices`, `budgets`, `mailsyncruns`, `mailattachments`.
- **Compartido:** `users` (nueva), `inflationrates`, `macroseries`.

### `UserModel`

Colección `users`: `email` (string, requerido, único, en minúsculas), `name` (string), `lastLoginAt`
(Date), `timestamps: { createdAt: true, updatedAt: false }`.

### Plugin `userScoped`

Cada schema personal hace `schema.plugin(userScoped)`. El plugin:

- agrega `userId: { type: ObjectId, ref: "User", required: true, index: true }`;
- engancha `pre` en `find`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`, `countDocuments`,
  `updateOne`, `updateMany`, `deleteOne`, `deleteMany`, `replaceOne` y `distinct`: si el filtro no tiene
  `userId`, tira `UnscopedQueryError(modelo, operación)`;
- engancha `pre("aggregate")`: si el primer stage no es un `$match` con `userId`, tira el mismo error.

Las inserciones (`create`, `insertMany`, `save`) quedan cubiertas por `required`. El error nombra modelo y
operación, nunca el filtro. Las operaciones sobre un documento ya cargado (`doc.save()`, `doc.deleteOne()`)
parten de un documento que se leyó con `userId`; si la guarda las intercepta igual, se reemplazan por la
query con `{ _id, userId }`. Un test del plugin fija cuál de los dos casos es.

Consecuencia: los `findById`/`findByIdAndUpdate`/`findByIdAndDelete` (17, en 11 rutas e `importPdf`) pasan a
`findOne({ _id, userId })` y equivalentes. Un id de otro usuario da 404.

### Índices

| Colección | Antes | Después |
|---|---|---|
| `statements` | `sourceHash` único | `{ userId, sourceHash }` único |
| `mortgagecoupons` | `{ prestamoNro, cuotaNro }` único | `{ userId, prestamoNro, cuotaNro }` único |
| `autocoupons` | `{ grupo, orden, cuotaNro }` único | `{ userId, grupo, orden, cuotaNro }` único |
| `payslips` | `{ cuil, periodo, tipo }` único | `{ userId, cuil, periodo, tipo }` único |
| `hiddensubscriptions`, `manualsubscriptions`, `annualsubscriptions` | `key` único | `{ userId, key }` único |
| `budgets` | `category` único | `{ userId, category }` único |
| `mailattachments` | `{ source, messageId, partId }` único | `{ userId, source, messageId, partId }` único |
| `mailsyncruns` | `{ source, startedAt }` | `{ userId, source, startedAt }` |

Los índices simples que ya existen (`statementId`, `date`, `merchant`, etc.) quedan; `userId` suma el suyo.

### Cómo viaja el `userId`

Siempre explícito, como argumento. Nada de estado global ni contexto implícito.

- **Rutas** (`http/routes/*`): leen `userIdOf(req)` y lo ponen en cada filtro y en cada documento nuevo.
  En los `aggregate` de `stats.ts`, como primer `$match`.
- **Importadores:** `importStatement`, `importPdf`, `importPayslip`, `importAutoCoupon`, `importCoupon`,
  `saveCoupon` e `importCouponImage` reciben `userId`. La deduplicación por `sourceHash` y por
  `fingerprint`, y las reglas con las que se categoriza, son las del usuario.
- **`loadSubscriptions(userId)`**.
- **`refreshMacroData(userId)`**: refresca las series compartidas y recalcula el dólar
  (`refreshAllRates(userId)`) solo de los cupones, cupones del auto y recibos de ese usuario.
- **`seedCategoryRules(userId)`**: idempotente por `{ userId, pattern, source: "system" }`.
- **Mail:** `runMailSync({ userId, ... })`, `findLastMailRun(userId, source)` y los `MailAttachment`
  llevan el `userId` del owner.
- `stats/*` son funciones puras y no cambian.

### Usuario nuevo

En el primer login se crea el `User` y se le siembran las reglas del sistema. Todo lo demás arranca vacío.

### Búsqueda automática de mails y scripts

- `resolveOwnerId(env)`: busca el `User` de `OWNER_EMAIL`; si no existe, error «Falta el usuario owner:
  corré bun run migrate:owner».
- La búsqueda automática resuelve el owner en cada corrida. Si no existe, la corrida queda registrada
  como error con ese mensaje y no importa nada.
- Corren como owner: `seed`, `seed:coupons`, `seed:auto`, `seed:sueldo`, `seed:fx`, `seed:fx:auto`,
  `seed:fingerprints`.
- No cambian (son compartidos): `seed:inflation`, `seed:macro`.

## Migración y puesta en marcha

### `bun run migrate:owner`

Script idempotente:

1. Crea el `User` del owner (`OWNER_EMAIL`) si no existe.
2. En las 14 colecciones personales: `updateMany({ userId: { $exists: false } }, { $set: { userId } })`.
3. `syncIndexes()` en los 14 modelos: borra los únicos viejos y crea los compuestos.
4. Imprime por colección cuántos documentos actualizó. Solo conteos.

Una segunda corrida actualiza 0 y deja los índices igual. Con una base vacía sirve como primer paso de
una instalación nueva: crea el owner y después `bun run seed` siembra sus reglas.

### Orden (va al README)

1. Backup: `mongodump` de la base actual.
2. Google Cloud: proyecto nuevo para el login (separado del de Gmail, así el login pide solo
   `openid email profile` y no arrastra la advertencia de app no verificada del permiso de Gmail).
   Pantalla de consentimiento Externa y publicada; cliente OAuth «Aplicación web» con las redirect URIs
   `http://localhost:5173/api/auth/google/callback` y `https://ledger.<tailnet>.ts.net/api/auth/google/callback`.
3. Variables nuevas en el `.env` de dev y en `~/Services/ledgerly/.env`.
4. Merge → auto-deploy. Si falta una variable el server no arranca, el health check falla y el
   auto-deploy vuelve solo al commit anterior.
5. `bun run migrate:owner` (dev y publicada usan el mismo Mongo). Entre el paso 4 y este la app se ve
   vacía; no se pierde nada.
6. Login con la cuenta del owner.
7. Sumar el mail del otro usuario a `ALLOWED_EMAILS` y reiniciar el servicio.

## Cliente

- **`useMe()`**: React Query, key `["me"]`, `GET /api/auth/me`. Un 401 resuelve en `null`, no en error.
- **`AuthGate`**, dentro del `BrowserRouter` y envolviendo el `Layout`, con early returns:
  cargando → splash con la marca; `me === null` → `<LoginPage />` en cualquier ruta; si no, la app.
- **`LoginPage`**: marca de Ledgerly y botón «Entrar con Google», un link a `/api/auth/google`
  (navegación completa). Con `?error=no-autorizado`: «Ese mail no tiene acceso a Ledgerly». Con
  `?error=login-fallido`: «No se pudo entrar con Google. Probá de nuevo».
- **Sesión vencida en uso:** `apiFetch` tira `UnauthorizedError` ante un 401. `QueryCache` y
  `MutationCache` tienen un `onError` que, ante ese error, pone `["me"]` en `null`, y el gate muestra el
  login.
- **Menú de usuario** en `TopActionsPill`: avatar con la inicial del nombre; el menú muestra el mail y
  «Salir». «Salir» hace `POST /api/auth/logout` y `queryClient.clear()`, así el próximo que use el
  dispositivo no ve datos en caché.
- **Mails solo para el owner:** `MailImportSection` se renderiza solo si `me.isOwner`.
- No hay service worker; la PWA es solo el manifest, así que no hay caché de API que limpiar aparte.

## Errores

| Caso | Respuesta |
|---|---|
| Sin cookie, cookie inválida o vencida, mail fuera de la lista | 401 `{ error: "Sesión vencida o inexistente" }` |
| No-owner en `/api/mail/*` | 403 `{ error: "Solo el dueño puede importar por mail" }` |
| `Origin` ajeno en método que modifica | 403 `{ error: "Origen no permitido" }` |
| Id de otro usuario | 404, igual que un id inexistente |
| `UnscopedQueryError` | 500; se loguea modelo y operación |
| Callback: mail no permitido | redirect `/?error=no-autorizado` |
| Callback: otra falla | redirect `/?error=login-fallido` |

Si Google no responde solo falla el login: las sesiones abiertas siguen andando.

## Testing

TDD, como el resto del repo.

- **Sesión:** firma y verificación; cookie alterada, vencida o firmada con otro secret → inválida.
- **Config:** cada variable faltante falla nombrándola; `SESSION_SECRET` corto falla; la lista se
  normaliza (mayúsculas, espacios) y siempre incluye al owner.
- **Callback de OAuth** con el cliente de Google falso: camino feliz (crea el user, siembra reglas una
  sola vez, setea la cookie, redirige a `/`); `state` distinto; mail fuera de la lista (no crea user);
  `email_verified: false`.
- **Middlewares:** `requireUser` (sin cookie, cookie válida, mail sacado de la lista); `requireOwner`;
  chequeo de `Origin`.
- **Plugin `userScoped`:** cada operación sin `userId` tira `UnscopedQueryError`, con `userId` pasa;
  `aggregate` sin `$match` inicial con `userId` tira.
- **Aislamiento (test clave)**, dos usuarios A y B:
  - los dos importan el mismo PDF sintético y ambos quedan `imported`;
  - B hace `GET`, `PATCH` y `DELETE` sobre ids de A → 404, y los datos de A no cambian;
  - listados, stats, flujo, patrimonio, suscripciones y presupuestos de B muestran solo lo de B;
  - B en `/api/mail/*` → 403.
- **Migración:** documentos sin `userId` quedan del owner; segunda corrida actualiza 0; el índice único
  viejo no está y el compuesto sí; crea el owner si falta.
- **Tests existentes:** corren como un usuario de prueba con un helper que arma un `request.agent(app)`
  con la cookie; los fixtures y las lecturas directas a modelos llevan `userId`.
- **Cliente** (con `afterEach(cleanup)`): `AuthGate` en sus tres estados; `LoginPage` con cada `error`;
  «Salir» limpia la caché y vuelve al login; un 401 en medio de la app vuelve al login; «Mails» oculto
  para quien no es owner.

## Riesgos a validar primero

Antes de tocar los modelos, con el cliente OAuth real:

1. **Que Google acepte la redirect URI de `*.ts.net`.** Si no la acepta, hay que decidir cómo se entra
   a la versión de la Mac antes de seguir.
2. **Login desde la PWA instalada en el iPhone.** iOS puede abrir Google en un navegador aparte y la
   cookie no volver a la PWA. Si pasa, se ajusta el flujo antes de seguir.
