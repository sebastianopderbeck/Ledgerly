import { MAX_PDF_BYTES } from "../import/importPdf.js";
import { IcloudApiError } from "./icloudErrors.js";

export interface CertisendDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

const COUPON_ID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const COUPON_LINK = new RegExp(`https://go\\.certisend\\.com/coupon/(${COUPON_ID_PATTERN})(?![0-9a-f])`, "gi");
const COUPON_ID = new RegExp(`^${COUPON_ID_PATTERN}$`, "i");
const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const PDF_HOST = "html2pdf.certisend.com";
const PDF_PATH_PREFIX = "/convert/";
const COUPON_PRINT_PREFIX = "https://go.certisend.com/coupon_print/";
const DEFAULT_TIMEOUT_MS = 30_000;
const UNEXPECTED_ERROR = "Error inesperado";

const messageOf = (err: unknown): string => (err instanceof Error && err.message ? err.message : UNEXPECTED_ERROR);

export function extractCertisendCouponIds(html: string): string[] {
  const ids = [...html.matchAll(COUPON_LINK)].map((match) => match[1].toLowerCase());
  return [...new Set(ids)];
}

export const certisendCouponUrl = (id: string): string => `https://go.certisend.com/coupon/${id}`;

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export function extractCertisendPdfUrl(couponHtml: string, id: string): string | null {
  const expectedPrint = `${COUPON_PRINT_PREFIX}${id}`;
  for (const match of couponHtml.matchAll(HREF)) {
    const href = (match[1] ?? match[2] ?? "").replaceAll("&amp;", "&").trim();
    const url = parseUrl(href);
    if (
      url
      && url.protocol === "https:"
      && url.host === PDF_HOST
      && url.pathname.startsWith(PDF_PATH_PREFIX)
      && url.searchParams.get("url") === expectedPrint
    ) return href;
  }
  return null;
}

const readCapped = async (response: Response, maxBytes: number): Promise<Uint8Array> => {
  const tooBig = new IcloudApiError("El PDF del cupón de certisend es demasiado grande.");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooBig;
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooBig;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

export async function fetchCertisendCouponPdf(id: string, deps: CertisendDeps = {}): Promise<Uint8Array> {
  const { fetch: doFetch = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_PDF_BYTES } = deps;
  if (!COUPON_ID.test(id)) throw new IcloudApiError("El identificador del cupón de certisend no es válido.");
  const get = (url: string): Promise<Response> =>
    doFetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error" });

  try {
    const page = await get(certisendCouponUrl(id));
    if (!page.ok) throw new IcloudApiError(`certisend respondió ${page.status} al abrir el cupón.`);
    if (!(page.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
      throw new IcloudApiError("certisend no devolvió una página HTML al abrir el cupón.");
    }
    const pdfUrl = extractCertisendPdfUrl(await page.text(), id);
    if (!pdfUrl) throw new IcloudApiError("El cupón de certisend no trae el link para bajarlo en PDF.");

    const pdf = await get(pdfUrl);
    if (!pdf.ok) throw new IcloudApiError(`certisend respondió ${pdf.status} al bajar el PDF del cupón.`);
    if (!(pdf.headers.get("content-type") ?? "").toLowerCase().includes("application/pdf")) {
      throw new IcloudApiError("certisend no devolvió un PDF para el cupón.");
    }
    return await readCapped(pdf, maxBytes);
  } catch (err) {
    if (err instanceof IcloudApiError) throw err;
    throw new IcloudApiError(`No se pudo bajar el cupón de certisend: ${messageOf(err)}`);
  }
}
