# Ledgerly

Gastos corrientes a partir del PDF del resumen de tarjeta (Visa Signature / ICBC).
Vite + React 18 + MUI · Express + MongoDB.

## Requisitos
- Node ≥ 20, Docker (para Mongo local).

## Puesta en marcha
```bash
npm install
cp .env.example .env
docker compose up -d       # MongoDB en localhost:27017
npm run seed               # reglas de categoría base
npm run dev                # API :4000 + SPA :5173
```

## Scripts
- `npm run dev` — backend + frontend
- `npm test` — toda la suite (Vitest)
- `npm run typecheck` — TypeScript de todo el monorepo
- `npm run seed` — siembra reglas de categoría

## Privacidad
Los PDFs reales (`examples/`) están gitignoreados; los fixtures de test son sintéticos.
No se commitea data financiera real.
