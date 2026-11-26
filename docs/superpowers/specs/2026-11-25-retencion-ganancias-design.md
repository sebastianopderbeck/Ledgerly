# Control de la retención de Ganancias — diseño

Fecha: 2026-11-25
Estado: en revisión.

## Objetivo

Saber si el empleador **retiene bien el Impuesto a las Ganancias (4ta categoría) en el año en curso**. Ledgerly
ya tiene los recibos de sueldo con cada concepto; con eso y las tablas que publica ARCA puede rehacer la cuenta
que hace el empleador y compararla con lo que figura retenido en los recibos.

La pregunta que responde: «a hoy, ¿me retuvieron lo que corresponde, de más o de menos?». Si es de más, es plata
que el empleador debería devolver; si es de menos, la va a descontar más adelante.

## Decisiones tomadas

Las de la conversación:

- **Solo el año en curso.** Nada de revisar años cerrados: el régimen 2021–2024 era otro (exenciones,
  deducción especial incrementada, reliquidaciones retroactivas) y para un año cerrado ya no hay nada que
  corregir con el empleador.
- **Sección en la página Sueldo, calculada en el cliente**, como «Ajustes vs IPC» (`salaryRaises.ts` +
  `SalaryRaisesSection.tsx`). Sin endpoint nuevo ni cambios en la API: los recibos ya llegan completos con
  `usePayslips()`.
- **Las tablas de ARCA son datos en el código.** ARCA las publica solo en PDF, dos veces por año (enero y
  julio). Se transcriben a un módulo de datos y cada semestre se agrega la tabla nueva.
- **SiRADIG: solo el crédito hipotecario.** El usuario no tiene cargas de familia ni otras deducciones. No hay
  formulario para cargar deducciones.

Decisiones mías (a revisar):

- **Método de cálculo calibrado contra los recibos reales** (ver «Cómo calcula el empleador»). Se probaron las
  variantes que la RG 4003 deja elegir y se tomó la que reproduce lo retenido.
- **Tolerancia del veredicto: 1 %** del impuesto esperado acumulado. En la calibración, los meses sin cambio de
  tabla quedaron por debajo de eso.
- **El año de la sección es el del último recibo** (por su mes de cobro), no el filtro de años de la página.
  La sección es «el año en curso»; el filtro no la afecta.
- **Hipotecario: tope anual prorrateado por mes** ($20.000 × mes / 12). Cambia la cuenta en unos pocos miles de
  pesos por año; cómo lo aplica el empleador mes a mes no está claro en la norma y no se puede distinguir en
  la calibración.

## Cómo calcula el empleador (lo que hay que reproducir)

Fuente: RG (AFIP) 4003/2017, Anexo II, con los cambios de la RG 5531/2024. El cálculo es **acumulado en el año**:
cada mes se recalcula todo desde enero y la retención del mes es la diferencia con lo ya retenido.

Para cada **mes de cobro** `m` (1..12) del año fiscal:

1. **Mes de cobro de cada recibo.** Un recibo mensual del período `AAAA-MM` se cobra el mes siguiente; el
   sueldo de diciembre cuenta para el año siguiente. Un recibo de SAC (`tipo: "sac"`) se cobra en el mismo mes
   de su período (junio o diciembre). El parser hoy pone `fechaPago` como fin del período (inventada), por eso
   la regla va en el dominio y no se lee del recibo.
2. **Ganancia bruta acumulada** = suma de los conceptos `remunerativo` de los recibos mensuales cobrados hasta
   `m`, más el **SAC por doceavas** (punto 4).
3. **Aportes acumulados** = suma de los aportes deducibles de esos recibos (jubilación, ley 19.032, obra social,
   S.E.C., FAECYS, por código: ver «Conceptos del recibo»), más sus doceavas (punto 4).
4. **SAC por doceavas (opción «a» del Apartado C).** Cada recibo mensual cobrado **después del último SAC
   pagado en el año** suma 1/12 de su remunerativo a la ganancia bruta y 1/12 de sus aportes a los aportes. En
   el mes en que se cobra un SAC, entran el SAC real y sus aportes reales, y dejan de contar las doceavas de
   los meses anteriores a ese pago.
5. **Deducciones personales acumuladas del mes** (tabla art. 30 de ARCA): ganancia no imponible (inc. a) +
   deducción especial para empleados (inc. c, **apartado 2**).
6. **Doceava parte de la deducción especial (Apartado E):** 1/12 de la suma del punto 5.
7. **Hipotecario:** $20.000 × `m` / 12.
8. **Ganancia neta sujeta a impuesto acumulada** = 2 − 3 − 5 − 6 − 7 (las doceavas del punto 4 ya están dentro
   de 2 y 3; no se suman de nuevo). Si da negativa, el impuesto es 0.
9. **Impuesto esperado acumulado** = escala del art. 94 **del mes `m`** (tabla acumulada de ARCA para ese mes):
   `pagarán + (gnsi − sobre el excedente de) × %`.
10. **Retenido acumulado** = suma de retención (0430) y devolución (0433) de los recibos cobrados hasta `m`.
    El **ajuste 0446 queda afuera**: es el ajuste de la liquidación anual del año anterior (ver «Conceptos
    del recibo»).
11. **Diferencia** = retenido acumulado − impuesto esperado acumulado. Positiva: retenido de más.

**Calibración.** Se corrió este cálculo, en un script descartable y sin escribir nada, contra los recibos reales
de 2026 probando las variantes posibles: mes de cobro igual al período o el siguiente; SAC al cobrarse, doceavas
opción «a» u opción «b»; con o sin Apartado E; con o sin el 0446; distintos conjuntos de aportes. La combinación
de arriba es la que mejor reproduce lo retenido: desvío menor al 1 % en todos los meses salvo **enero y julio**.
En esos dos meses el empleador retuvo con las tablas del semestre anterior (ARCA publica las nuevas tarde) y lo
corrigió al mes siguiente, así que el acumulado vuelve a coincidir en febrero y en agosto.

La calibración cubrió los meses de cobro de enero a octubre de 2026, así que el **SAC de diciembre** todavía no
se contrastó con un recibo real. Se aplica la misma regla que en junio y se va a poder verificar con el recibo
de diciembre.

Quedan fuera (no aplican al caso y la calibración no los necesita):

- el tope de retención mensual (alícuota máxima sobre la remuneración bruta del mes, RG 4003 art. 7): la
  retención está muy por debajo;
- cargas de familia, otras deducciones de SiRADIG, otros empleos;
- conceptos no remunerativos: hoy solo aparece el redondeo (9999).

## Conceptos del recibo

Los conceptos se identifican por **código**, en un módulo propio del dominio:

| Código | Concepto | Uso |
|---|---|---|
| 0401, 0403 | JUBILACION | aporte deducible |
| 0402, 0454 | LEY 19032 | aporte deducible |
| 0405, 0407, 0314 | OBRA SOCIAL | aporte deducible |
| 0422 | S.E.C. | aporte deducible (cuota sindical) |
| 0425 | F.A.E.C.Y.S. | aporte deducible |
| 0430 | RETENCION 4º CATEGORÍA | retenido |
| 0433 | DEVOLUCIÓN RETENCIÓN 4º | retenido (con su signo) |
| 0446 | AJUSTE RETENCION 4º CATEGORIA | ajuste del año anterior: no entra en la cuenta, se informa aparte |

Los montos se toman **con el signo que trae el recibo** (las devoluciones vienen negativas). Los códigos de
acuerdos de comercio (0466, 0469, 0470) y el bono 0431 no aparecen en 2026 y no se incluyen.

## Las tablas de ARCA

Un módulo de datos con las tablas **por año**, transcriptas de los PDF oficiales. Para cada mes de cobro 1..12:

- **Art. 94:** los 9 tramos acumulados del mes (`desde`, `hasta` o «en adelante», `pagarán`, `%`,
  `sobre el excedente de`).
- **Art. 30:** ganancia no imponible acumulada y deducción especial apartado 2 acumulada.
- El tope anual del hipotecario ($20.000, art. 85 inc. a).

Para 2026 alcanza con los PDF del **segundo semestre**: repiten enero–junio igual que los del primero (se
verificó) y agregan julio–diciembre con los valores nuevos.

- Escala art. 94, julio a diciembre 2026:
  `https://www.arca.gob.ar/gananciasYBienes/ganancias/personas-humanas-sucesiones-indivisas/declaracion-jurada/documentos/Tabla-Art-94-LIG-per-jul-a-dic-2026.pdf`
- Deducciones art. 30, julio a diciembre 2026:
  `https://www.arca.gob.ar/gananciasYBienes/ganancias/personas-humanas-sucesiones-indivisas/deducciones/documentos/Deducciones-personales-art-30-jul-dic-2026.pdf`

Cada semestre se agregan los meses nuevos (o un año nuevo) en el mismo módulo; no se toca el cálculo.

**Sin tablas para el año:** si el año de la sección no tiene tablas cargadas (por ejemplo, en enero de 2027,
cuando llega el sueldo de diciembre), la sección lo dice («Faltan las tablas de ARCA de 2027») en vez de
calcular. Lo mismo si faltan los meses de un semestre: se calcula hasta el último mes con tabla y se avisa.

## Recibos faltantes

Como la cuenta es acumulada, un recibo que falta tuerce todos los meses siguientes y el veredicto. Al
esperado le falta el sueldo entero de ese mes, pero las deducciones del mes se restan igual. Al retenido le
falta solo lo de ese recibo. Así sale un «te retienen de más» falso, muy por encima de la tolerancia.

Regla (decisión mía): para cada mes de cobro `m` del año, se esperan el recibo mensual del período anterior
(en enero, el de diciembre del año anterior), y en junio y diciembre también el recibo de SAC. **Se calcula
hasta el último mes de cobro sin huecos desde enero**, y se avisa qué recibo falta («Falta el recibo de marzo
2026: la cuenta llega hasta marzo»). Los KPIs y el veredicto son de ese último mes completo. Que falte el
mes en curso no es un hueco, porque todavía no se cobró.

## Lo que se ve

Una sección colapsable en la página Sueldo, debajo de «Ajustes vs IPC», con el mismo estilo:

```
▸ Retención de Ganancias 2026
  [Impuesto esperado acum.]  [Retenido acum.]  [Diferencia  · Coincide | De más | De menos]

  Mes de cobro | Sueldos            | Ganancia neta sujeta acum. | Esperado acum. | Retenido acum. | Diferencia
  Ene          | Dic 2025           | …                          | …              | …              | …  ⓘ cambio de tablas
  …
  Jun          | May 2026 + 1er SAC | …
```

- **KPIs del último mes de cobro con recibo:** esperado acumulado, retenido acumulado y diferencia con el
  veredicto. «Coincide» si `|diferencia| ≤ 1 %` del esperado; si no, «Te retienen de más» o «Te retienen de
  menos».
- **Tabla mes a mes** con lo mismo. En enero y julio una nota corta: el empleador suele aplicar las tablas
  nuevas un mes tarde y corregir al siguiente.
- Si hubo un **0446** en el año, una línea aparte: «Ajuste de la liquidación anual <año anterior>: $X (no entra
  en la cuenta de <año>)».
- En mobile, tarjetas en vez de tabla, como `SalaryRaiseCards`.
- Sin recibos en el año: la sección no se muestra.

## Arquitectura

Sigue la separación datos / vista del repo. Los módulos de dominio van en `client/src/`, como `salaryRaises.ts`
y `payslipConcepts.ts`. Son TS plano, sin React, y cada uno tiene su spec al lado.

| Archivo | Qué tiene |
|---|---|
| `gananciasTablas.ts` | Tablas de ARCA por año (art. 94 por mes, art. 30 acumulado por mes, tope hipotecario). Solo datos. |
| `gananciasConceptos.ts` | Códigos del recibo: aportes deducibles, retención, devolución, ajuste del año anterior. |
| `gananciasRetencion.ts` | Funciones puras: mes de cobro de un recibo, acumulados con doceavas, impuesto según la tabla del mes, comparación por mes y veredicto. Entra `PayslipDTO[]`, sale una estructura lista para mostrar. |
| `components/GananciasRetentionSection.tsx` (+ tabla y tarjetas) | Solo vista. |

`PayslipsPage` calcula el resultado con `useMemo` y lo pasa a la sección, como hace con `salaryRaises`.

## Tests

- **Tablas:** cada año cargado tiene 12 meses con 9 tramos; los tramos son continuos (`hasta` de uno = `desde`
  del siguiente) y `pagarán` de cada tramo = `pagarán` anterior + (`hasta` − `desde`) × `%` del anterior, con
  tolerancia de centavos. Diciembre de art. 30 coincide con el valor anual del PDF. Esto atrapa errores de
  transcripción.
- **Cálculo:** recibos sintéticos (nunca datos reales) para: mes de cobro (diciembre pasa al año siguiente; SAC
  en su mes), doceavas antes y después del SAC de junio, Apartado E, ganancia neta negativa → impuesto 0, signo
  de las devoluciones, 0446 excluido e informado, tolerancia del veredicto en el borde, año sin tablas, mes sin
  tabla.
- **Componente:** con `cleanup` explícito (el auto-cleanup de RTL está apagado en el repo). Render de KPIs y
  veredicto, nota de enero/julio, línea del 0446, aviso de tablas faltantes.

**Criterio de cierre**, verificado a mano contra los recibos reales con solo lecturas (nunca escribir en la
base): con el cálculo ya implementado, la diferencia queda **dentro del 1 % del esperado acumulado en todos
los meses de cobro de 2026 con recibo, salvo enero y julio**. En esos dos meses la diferencia es positiva, por
el atraso de tablas, y se corrige al mes siguiente. El script de la calibración no queda en el repo y no es
la referencia.

Recibos faltantes: tests con un hueco a mitad de año (se calcula hasta el mes anterior y se avisa), con el
SAC de junio faltante, y con el mes en curso todavía sin cobrar (no es hueco).

## No-objetivos

- Años cerrados, liquidación anual o proyección a diciembre.
- Cargar deducciones de SiRADIG desde la app.
- Bajar o parsear los PDF de ARCA automáticamente.
- Mover el cálculo al servidor o mandar avisos.
- Otros empleadores o más de un CUIL.

## Para quien lo construya

- Nombres internos, cómo partir los componentes de vista y los textos exactos, siempre que sigan el estilo de
  la página.
- Si el valor que se muestra en la columna «Sueldos» lista los períodos o solo el principal.
