# Ledgerly

Gastos corrientes a partir del PDF del resumen de tarjeta (Visa Signature / ICBC).
Vite + React 18 + MUI · Express + MongoDB.

## Requisitos
- Node ≥ 20, Bun ≥ 1.1, Docker (para Mongo local).

## Puesta en marcha
```bash
bun install
cp .env.example .env
docker compose up -d       # MongoDB en localhost:27018
bun run seed               # reglas de categoría base
bun run dev                # API :4000 + SPA :5173
```

## Scripts
- `bun run dev` — backend + frontend
- `bun run test` — toda la suite (Vitest)
- `bun run typecheck` — TypeScript de todo el monorepo
- `bun run seed` — siembra reglas de categoría
- `bun run build` — build del cliente (`client/dist`)
- `bun run start` — server sin watch, sirviendo `client/dist`
- `bun run service:install` — instala la versión publicada (ver abajo)
- `bun run deploy [ref]` — publica `origin/main` (o `ref`) en la versión publicada
- `bun run test:scripts` — prueba `install-service.sh` / `deploy.sh` con `launchctl` y `lsof` simulados

## Versión publicada (privada)

Ledgerly corre de fondo en la Mac y se abre desde mis dispositivos vía Tailscale, sin exponerse a
internet. Diseño: `docs/superpowers/specs/2026-10-02-publicacion-privada-design.md`.

### Instalación (una vez)
1. Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**; `docker compose up -d`.
2. `bun run service:install` — clona `origin/main` en `~/Services/ledgerly`, crea su `.env`
   (puerto 4100, solo `127.0.0.1`), registra el servicio `com.ledgerly.server` y hace el primer deploy.
3. Tailscale en la Mac: `brew install --cask tailscale-app`, iniciar sesión, activar **Launch at login**.
4. Tailscale en el celular: misma cuenta.
5. [Admin de Tailscale](https://login.tailscale.com/admin): DNS → **MagicDNS** y **HTTPS Certificates**;
   Machines → renombrar la Mac a algo neutro (p. ej. `ledger`) y **Disable key expiry**.
6. `tailscale serve --bg http://127.0.0.1:4100` → `https://ledger.<tailnet>.ts.net`.
   **Nunca `tailscale funnel`**: eso publica en internet.

### Actualizar
Pushear a `main` y correr `bun run deploy`. Para volver a un commit: `bun run deploy <sha>`.
Si cambia la versión de Node (nvm): `bun run service:install`.

### Disponibilidad
Solo con la Mac **enchufada y con la tapa abierta**. Tapa cerrada o batería = Mac dormida.

### Logs
```bash
tail -f ~/Library/Logs/Ledgerly/server.log ~/Library/Logs/Ledgerly/server.err.log
```

### Desinstalar
```bash
launchctl bootout gui/$(id -u)/com.ledgerly.server
rm ~/Library/LaunchAgents/com.ledgerly.server.plist
tailscale serve reset
```

## Privacidad
Los PDFs reales (`examples/`) están gitignoreados; los fixtures de test son sintéticos.
No se commitea data financiera real.
