# Ledgerly

Gastos corrientes a partir del PDF del resumen de tarjeta (Visa Signature / ICBC).
Vite + React 18 + MUI · Express + MongoDB.

## Requisitos
- Node ≥ 20, Bun ≥ 1.1, Docker (para Mongo local).

## Puesta en marcha
```bash
bun install
cp .env.example .env
docker compose up -d       # MongoDB en localhost:27017
bun run seed               # reglas de categoría base
bun run dev                # API :4000 + SPA :5173
```

## Scripts
- `bun run dev` — backend + frontend
- `bun run test` — toda la suite (Vitest)
- `bun run typecheck` — TypeScript de todo el monorepo
- `bun run seed` — siembra reglas de categoría

## Privacidad
Los PDFs reales (`examples/`) están gitignoreados; los fixtures de test son sintéticos.
No se commitea data financiera real.
