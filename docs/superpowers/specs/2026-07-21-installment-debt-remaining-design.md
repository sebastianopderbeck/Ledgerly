# KPI "Deuda en cuotas" = lo que resta pagar — Diseño

## Objetivo

El KPI "Deuda en cuotas" (`KpiCards.tsx:78`) debe mostrar el monto que **resta
pagar** de las compras en cuotas, no un total inflado.

## Problema actual

`GET /stats/summary` calcula `futureInstallmentTotal` proyectando las cuotas
restantes con `computeFutureInstallments` sobre TODAS las transacciones en cuotas
de TODOS los resúmenes. Como la misma compra aparece una vez por resumen (cuota
1/12 en un resumen, 2/12 en el siguiente, …), la suma cuenta cada cuota-fila y
se infla con varios resúmenes.

## Definición correcta

"Lo que resta pagar" = para cada compra en cuotas activa, las cuotas que faltan
**después** del último resumen (`installmentTotal − installmentCurrent`, es decir
la cuota del resumen en curso NO se cuenta) × monto de la cuota.

Se calcula sobre un snapshot: el **último resumen de cada tarjeta** lista cada
cuota activa exactamente una vez con su cuota actual, así que sumar sobre ese
snapshot evita el doble conteo.

Respeta moneda (`currency`) y tarjeta (`cardLabel`); es independiente del rango
de fechas.

## Backend

### Helper puro `remainingInstallmentDebt`

En `server/src/stats/futureInstallments.ts`:

```ts
type InstallmentDebtTx = Pick<InstallmentTx, "amount" | "currency" | "isInstallment" | "installmentCurrent" | "installmentTotal">;

export function remainingInstallmentDebt(txns: InstallmentDebtTx[], currency: Currency): number {
  let total = 0;
  for (const tx of txns) {
    if (tx.currency !== currency) continue;
    if (!tx.isInstallment || tx.installmentCurrent === null || tx.installmentTotal === null) continue;
    total += (tx.installmentTotal - tx.installmentCurrent) * tx.amount;
  }
  return total;
}
```

Pura, testeable sin Mongo. Mismas guardas que `computeFutureInstallments`.

### Ruta `GET /stats/summary`

Reemplazar el cálculo de `futureInstallmentTotal`:

1. Buscar statements (filtrando por `cardLabel` si viene).
2. `latestStatementIdsPerIssuer` → ids del último resumen por emisor.
3. Traer las cuotas de esos resúmenes (`type: "purchase"`, `isInstallment: true`,
   `statementId ∈ ids`).
4. `futureInstallmentTotal = remainingInstallmentDebt(esasCuotas, currency)`.

Sin ids ⇒ 0. Se deja de usar `computeFutureInstallments` dentro de summary (sigue
usándose en los endpoints `/future-installments*`).

## Cliente

Sin cambios. `KpiCards.tsx` ya lee `data.futureInstallmentTotal`; la etiqueta
"Deuda en cuotas" queda igual.

## Tests

### Server

- Unit `remainingInstallmentDebt`:
  - Suma `(total − actual) × monto` de una cuota.
  - Ignora no-cuotas, otra moneda y cuotas terminadas (remaining 0).
- Integración `stats.test.ts` (`/summary`):
  - Con la misma compra en cuotas en un resumen viejo (cuota 1/4) y en el último
    (cuota 2/4), `futureInstallmentTotal` usa solo el último (2 × monto), no la
    suma de ambos.
  - Los tests existentes de summary siguen verdes (un solo resumen ⇒ 3000).

## Fuera de alcance

- La proyección por mes de "Cuotas a vencer" (`/stats/future-installments*`) tiene
  el mismo inflado subyacente con múltiples resúmenes; no se corrige acá.
- Renombrar la etiqueta o el campo `futureInstallmentTotal`.
