---
name: inspecting-ledgerly-pdfs
description: Use when writing or debugging a Ledgerly PDF parser — visaSignature, icbc, icbcMortgage, autoPlan, or payslip — or when a parser drops rows, misreads an amount, or fails to detect a document kind. Also use before changing anything in server/src/pdf/extract.ts or the ingestion pipeline, and when adding a fixture that must match what the extractor really returns.
---

# Inspecting Ledgerly's real PDFs

**REQUIRED SUB-SKILL:** Use `reading-pdfs-as-markdown` for the conversion itself. This skill only maps it onto this repo.

## Where the real documents live

`examples/` is gitignored — everything in it is real financial data. Never commit it, and never write converted output there.

| Path | Kind | Parser |
|---|---|---|
| `examples/UltimaLiquidacion.pdf` | statement | `server/src/parsers/visaSignature.ts` |
| `examples/Resumen14jul2026.pdf` | statement (encrypted) | `server/src/parsers/icbc.ts` |
| `examples/credito/*.pdf` | mortgage coupon | `server/src/parsers/icbcMortgage.ts` |
| `examples/auto/*.pdf` | car-plan coupon | `server/src/parsers/autoPlan.ts` |
| `examples/recibos/*.PDF` | payslip | `server/src/parsers/payslip.ts` |

Convert into the session scratchpad, never into the repo:

```bash
~/.claude/skills/reading-pdfs-as-markdown/pdf2md.sh examples/UltimaLiquidacion.pdf "$SCRATCH/visa.md"
```

## Two different texts, and which one a parser sees

- **What the parser sees at runtime:** `extractPdfText` (`server/src/pdf/extract.ts`) — unpdf with `mergePages: false`, pages joined by `\n`. One row per line, but intra-line spacing collapsed to single spaces.
- **What markitdown shows you:** the same rows *with column offsets preserved*. Use it to see which column an amount belongs to, then express that in the parser using the tokens available in the runtime text.

Do not write a parser against markitdown's column offsets — the runtime text does not have them.

## Regenerating the real captures

`examples/visa-real.txt` and `icbc-real.txt` are real `extractPdfText` output, consumed by `icbc.test.ts` and `visaSignature.test.ts`:

```bash
npx tsx server/scripts/capture-fixtures.ts
```

Regenerate them after any change to `extract.ts`, or the tests keep validating the old shape.

## Verifying a parser change

Unit tests use synthetic fixtures in `server/src/parsers/__fixtures__/`, which are hand-written and do **not** match runtime extraction byte-for-byte. They cannot catch an extraction regression on their own. Before and after any change to `extract.ts` or a parser, parse every real PDF and diff the results — 103 files across the four directories. Identical JSON means the change is safe.

## Tests that touch `examples/`

A fresh clone has no `examples/`, so every test reading it must guard with `existsSync` + `describe.skipIf`.

**`skipIf` alone is not enough.** Vitest runs the `describe` callback during collection even when the suite is skipped, so a `readFileSync` sitting directly in the describe body still throws and fails the whole file. Defer every read into `beforeAll` or the `it` body:

```ts
const realPath = fileURLToPath(new URL("../../../examples/visa-real.txt", import.meta.url));
const hasReal = existsSync(realPath);

describe.skipIf(!hasReal)("...", () => {
  let result: ParsedStatement;
  beforeAll(() => {
    result = visaSignatureParser.parse(readFileSync(realPath, "utf8"), realMeta);
  });
});
```

To verify a guard actually works, hide the directory and run the suite — it must report skips, never failures:

```bash
mv examples .examples-hidden && npx vitest run; mv .examples-hidden examples
```
