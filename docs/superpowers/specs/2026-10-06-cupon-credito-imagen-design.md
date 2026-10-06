# Cupón del crédito desde una imagen — diseño

Fecha: 2026-10-06
Estado: aprobado para plan

## Objetivo

Desde octubre de 2026 el cupón mensual del crédito hipotecario UVA ya no llega como PDF («INFORME DE
COBRO DE CUOTA PRESTAMO»). Llega como una **captura de la app del banco** con este contenido:

```
Cuota NN/240
Vencimiento        DD/MM/AAAA
Capital            $ n.nnn,nn
Intereses          $ n.nnn,nn
IVA                $ n,nn
Seguros            $ n.nnn,nn
Total pagado       $ n.nnn,nn
Total en UVA       UVA nnn,nn
```

La captura tiene que importarse desde la pantalla **Importar**, igual que un PDF, y quedar guardada
como un `MortgageCoupon` más. Así Créditos, Patrimonio, Flujo de caja y Vencimientos la toman sin
cambios. Los cupones en PDF se siguen importando igual que hoy.

## Decisiones tomadas

- **OCR con Vision de macOS**, invocado con `osascript -l JavaScript`. No suma dependencias, todo
  queda local y no manda datos financieros a ningún servicio. Una prueba con la captura real leyó
  los 15 textos exactos: la primera corrida tardó ~26 s (arranque en frío) y las siguientes ~0,4 s.
  Sólo funciona en macOS, que es donde corre el servicio instalado. En otro sistema la importación
  de imágenes falla con un mensaje claro.
- **Vision devuelve el label y el monto como observaciones separadas**, cada una con su caja. Se
  reagrupan por fila en líneas de texto («Capital $ 150.000,10»), así que el parser recibe texto
  plano como los demás parsers del repo y se puede testear sin OCR.
- **Mapeo a `MortgageCoupon`:**

  | Captura         | Campo            |
  |-----------------|------------------|
  | Cuota N/M       | `cuotaNro` = N   |
  | Vencimiento     | `fechaDebito`    |
  | Capital         | `capital`        |
  | Intereses       | `intereses`      |
  | Seguros         | `seguroIncendio` |
  | Total pagado    | `totalDebitado`  |
  | Total en UVA    | `cuotaPuraUva`   |

  El IVA no tiene campo en el modelo. Sólo entra en el control de sumas.
- **Campos que la captura no trae:**
  - `cotizacionUva = round2((capital + intereses) / cuotaPuraUva)`. Validado contra un cupón PDF
    real: difiere en ±0,01 por redondeo.
  - `prestamoNro`, `tea`, `tna` y `cft` se copian del cupón guardado con la `fechaDebito` más
    reciente. Hoy hay un solo préstamo. Si no hay ningún cupón guardado, la importación falla.
- **Control de sumas:** `capital + intereses + IVA + seguros` tiene que dar `Total pagado` al
  centavo (la cuenta se hace en centavos enteros). Si no da, se rechaza la imagen: un monto mal
  leído por el OCR no llega a la base.
- **Dedupe y reemplazo:** los mismos de hoy, por `(prestamoNro, cuotaNro)` con `?replace=true`.
  Tampoco cambia el tipo de cambio oficial al importar. Para que el camino PDF y el de imagen no
  dupliquen esa lógica, se extrae a una función común.
- **Formatos aceptados:** PNG, JPEG y HEIC (las capturas del iPhone pueden llegar en HEIC), con el
  mismo límite de 15 MB.
- **Fuera de alcance:** imágenes adjuntas en mails (la sync sigue procesando sólo PDFs), otros
  formatos de captura y cualquier cambio de UI más allá del dropzone.

## Componentes

### `server/src/ocr/visionOcr.jxa` + `server/src/ocr/recognizeImage.ts`

- **`visionOcr.jxa`:** script JXA que recibe la ruta de una imagen y corre `VNRecognizeTextRequest`
  en modo preciso, en `es-ES` y sin corrección de idioma. Imprime un JSON
  `[{ text, x, y, height }]` en coordenadas normalizadas con origen arriba a la izquierda. `y` es el
  centro vertical de la caja.
- **`recognizeImage(data: Uint8Array, fileName: string): Promise<OcrObservation[]>`:**
  - Escribe la imagen en un temporal dentro de `os.tmpdir()`, conservando la extensión original.
  - Corre `osascript -l JavaScript <script> <temp>` con `execFile` y un timeout de 60 s.
  - Parsea el JSON y borra el temporal en un `finally`.
  - Errores:
    - Fuera de `darwin` → `OcrUnavailableError`.
    - Falla del proceso o timeout → `OcrFailedError`.

### `server/src/ocr/toLines.ts`

`toLines(observations: OcrObservation[]): string`

- Ordena las observaciones por `y`.
- Agrupa en la misma fila las que tienen el centro a menos de media altura de la fila.
- Dentro de cada fila ordena por `x` y une los textos con un espacio.
- Devuelve las filas unidas por `\n`.

Es pura y no conoce el formato del cupón.

### `server/src/parsers/icbcMortgageImage.ts`

`icbcMortgageImageParser` con `detect(text)` y `parse(text): ParsedCouponImage`.

- **`detect`:** el texto tiene `Cuota \d+/\d+` y `Total en UVA`.
- **`parse`:** devuelve
  `{ cuotaNro, cuotasTotales, fechaDebito, capital, intereses, iva, seguros, totalPagado, totalUva }`.
  - Los montos aceptan `$` con o sin espacio, porque el OCR a veces lo pega al número.
  - El UVA se lee de `UVA nnn,nn`.
  - Si falta un campo, o el total en UVA es 0, tira error.
- `totalsMatch(parsed): boolean` hace el control de sumas en centavos. El importador lo usa para
  dar un mensaje preciso; ningún parser del repo depende de los errores de ingesta.
- Es pura: no consulta la base.
- `ParsedCouponImage` vive en `shared/src/types.ts`, junto a `ParsedCoupon`.

### `server/src/import/saveCoupon.ts`

Lo que hoy hace `importCoupon` después de parsear se extrae acá:
`saveCoupon({ coupon: ParsedCoupon, fileName, sourceHash, replace })`.

- Dedupe por `(prestamoNro, cuotaNro)`.
- Reemplazo.
- Tipo de cambio oficial.
- `create`.

`importCoupon` pasa a ser hash → `parseCoupon` → `saveCoupon` y su comportamiento no cambia.

### `server/src/import/importCouponImage.ts`

`importCouponImage({ data, fileName, replace }): Promise<ImportPdfOutcome>`

1. `recognizeImage` → `toLines` → `detect`. Si no detecta → `UnrecognizedCouponImageError`.
2. `parse`. Si las sumas no cierran → `CouponImageTotalsError`. Si falta un campo →
   `UnrecognizedCouponImageError`.
3. Busca el cupón con la `fechaDebito` más reciente. Si no hay ninguno → `MissingPreviousCouponError`.
4. Arma el `ParsedCoupon` con lo leído, la cotización calculada y los datos copiados.
5. `saveCoupon` con el sha256 de la imagen.
6. Devuelve el mismo `{ result: { kind: "coupon", … }, file }` que el camino PDF. El armado de esa
   respuesta se comparte con `importPdf`.

### Errores nuevos (`server/src/ingestion/errors.ts`)

Todos extienden `IngestionError`, así que la ruta los devuelve como 422 con su mensaje.

| Clase                         | Mensaje                                                |
|-------------------------------|--------------------------------------------------------|
| `OcrUnavailableError`         | La lectura de imágenes sólo funciona en macOS          |
| `OcrFailedError`              | No se pudo leer el texto de la imagen                  |
| `UnrecognizedCouponImageError`| No se reconoció la captura del cupón                   |
| `CouponImageTotalsError`      | Los montos leídos no cierran con el total pagado       |
| `MissingPreviousCouponError`  | Importá primero un cupón PDF del préstamo              |

### Ruta `POST /api/import` (`server/src/http/routes/import.ts`)

- El filtro de multer acepta PDF o imagen, por mimetype o extensión: `image/png`, `image/jpeg`,
  `image/heic`, `.png`, `.jpg`, `.jpeg` y `.heic`.
- El rechazo pasa a decir «Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)».
- Imagen → `importCouponImage`. PDF → `importPdf`, igual que hoy.

### Cliente: `client/src/components/FileDropzone.tsx`

- `accept="application/pdf,image/png,image/jpeg,image/heic"`. En el celular esto habilita elegir
  desde Fotos.
- La validación local acepta los mismos tipos.
- Textos:
  - Desktop: «Arrastrá el PDF o la captura del crédito». Sin la «o» final, como ya está en el
    árbol de trabajo.
  - Botón: «Elegir archivo» también en mobile.
  - Rechazo: «Sólo se aceptan PDF o imágenes (PNG, JPG, HEIC)».
- `ImportPage` no cambia: el resultado es un `kind: "coupon"` y ya tiene su alerta.

## Tests

Los fixtures sintéticos usan montos inventados.

- **`toLines.test.ts`:**
  - Observaciones desordenadas, con alturas levemente distintas en la misma fila.
  - Label y monto se unen en orden de `x`.
  - Las filas salen en orden de `y`.
- **`icbcMortgageImage.test.ts`** (fixture `__fixtures__/icbc-mortgage-image.sample.txt`):
  - `detect` positivo, y negativo con el texto del cupón PDF.
  - Todos los campos, con `$` pegado y con espacio.
  - Error si falta un campo o si el total en UVA es 0.
  - `totalsMatch` da `false` si se altera un monto.
- **`saveCoupon`:** los tests actuales de `importCoupon` siguen pasando sin cambios.
- **`importCouponImage.test.ts`** (`withDb`, `recognizeImage` y `fetchOficialRate` mockeados):
  - Copia `prestamoNro`, `tea`, `tna` y `cft` del cupón más reciente.
  - Calcula la cotización.
  - Duplicado y `replace`.
  - Cada error mapeado a su clase.
- **`import.test.ts`:**
  - Un `.png` con OCR mockeado → 201 `kind: "coupon"`.
  - Un `.txt` → 400 con el mensaje nuevo.
- **`FileDropzone.test.tsx`:**
  - Acepta un PNG.
  - Rechaza un `.txt` y muestra el mensaje.
- **Punta a punta real** (`importCouponImage.real.test.ts`):
  - Corre el OCR real sobre la captura en `examples/credito/imagenes/*.png` (gitignoreado) y compara
    `toLines` + `parse` contra los totales de la propia captura (control de sumas OK).
  - Usa `describe.skipIf(process.platform !== "darwin" || !hasImage)`. Las lecturas van diferidas a
    `beforeAll`/`it`, según la convención del repo para `examples/`.

## Verificación

- `bun run test` y `bun run typecheck` en verde.
- Con el servicio de desarrollo en un puerto distinto de 4100, subir la captura real desde Importar.
  - Tiene que aparecer como cuota 14 en Créditos, con la cotización calculada.
  - Reimportarla tiene que dar «Ya estaba importado».
- Riesgo a confirmar después del deploy: que `osascript` con Vision funcione desde el LaunchAgent
  del servicio (corre en la sesión del usuario, así que se espera que sí).
