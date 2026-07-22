# "Cuotas a vencer" desde el último resumen — Diseño

## Objetivo

Que la proyección de cuotas a vencer (`/stats/future-installments` y
`/stats/future-installments/detail`) no se infle con varios resúmenes, igual que
ya se corrigió el KPI "Deuda en cuotas".

## Problema actual

Ambos endpoints alimentan `computeFutureInstallments` /
`computeFutureInstallmentsDetail` con `installmentMatch(query)` = TODAS las
transacciones en cuotas de TODOS los resúmenes. La misma compra aparece una vez
por resumen (cuota 1/12, 2/12, …), así que sus cuotas restantes se proyectan una
vez por resumen → los meses se duplican/triplican.

## Definición correcta

Proyectar solo desde el **último resumen de cada tarjeta**: ahí cada compra en
cuotas activa aparece una sola vez con su cuota actual. Se reutiliza
`latestStatementIdsPerIssuer` (el mismo snapshot del KPI). Respeta `currency` y
`cardLabel`.

Las funciones `computeFutureInstallments` / `computeFutureInstallmentsDetail` no
cambian; solo cambia el conjunto de transacciones que reciben.

## Backend

### Helper compartido en `server/src/http/routes/stats.ts`

```ts
async function latestStatementInstallmentTxs(q: Record<string, unknown>) {
  const statementFilter = typeof q.cardLabel === "string" ? { cardLabel: q.cardLabel } : {};
  const statements = await StatementModel.find(statementFilter).lean();
  const ids = latestStatementIdsPerIssuer(
    statements.map((s) => ({
      id: s._id,
      issuer: s.issuer,
      closingDate: s.closingDate ?? null,
      uploadedAt: (s as unknown as { uploadedAt: Date }).uploadedAt,
    })),
  );
  return TransactionModel.find({ type: "purchase", isInstallment: true, statementId: { $in: ids } }).lean();
}
```

### Endpoints

- `GET /stats/future-installments`: usar `latestStatementInstallmentTxs(q)` en vez
  de `installmentMatch`.
- `GET /stats/future-installments/detail`: idem.
- `GET /stats/summary`: refactor para reusar el helper (mismo comportamiento; su
  cálculo de cuotas del último resumen ya existe inline y se mueve al helper).

`installmentMatch` queda sin usar y se elimina.

## Cliente

Sin cambios. Los charts consumen los mismos endpoints; los tests de cliente los
mockean, así que no se ven afectados.

## Tests

### Server (`stats.test.ts`)

- `future-installments` no duplica con varios resúmenes: con la misma compra en
  un resumen viejo (cuota 1/4) y en el último (cuota 2/4), el total proyectado es
  `restante_del_último × monto` (= 2 × monto), no la suma de ambas proyecciones.
- `future-installments/detail` no duplica: la cantidad total de ítems proyectados
  es la del último resumen (2), no 2 + 3.
- Tests existentes siguen verdes (un solo resumen por tarjeta ⇒ mismo resultado).

Las aserciones se hacen sobre el **total**/**conteo** agregado (no sobre meses
puntuales) para no acoplarse a la ubicación de los meses.

## Fuera de alcance

- La ubicación de los meses proyectados (semántica de `date` = fecha de compra vs
  fecha de la cuota); solo se corrige la duplicación.
- Cambios en `computeFutureInstallments` / `computeFutureInstallmentsDetail`.
