import { describe, it, expect, vi } from "vitest";
import {
  certisendCouponUrl, extractCertisendCouponIds, extractCertisendPdfUrl, fetchCertisendCouponPdf,
} from "./certisend.js";
import { IcloudApiError } from "./icloudErrors.js";

const ID = "0a1b2c3d-1111-4222-8333-444455556666";
const OTHER_ID = "ffffffff-aaaa-4bbb-8ccc-000000000001";
const PAGE_URL = `https://go.certisend.com/coupon/${ID}`;
const PDF_URL = `https://html2pdf.certisend.com/convert/?key=k1&page_size=A4&page_numbers=false&url=https://go.certisend.com/coupon_print/${ID}`;
const pageWith = (href: string): string => `<html><body><a href="${href}">PDF</a></body></html>`;
const PAGE_HTML = pageWith(PDF_URL.replaceAll("&", "&amp;"));
const PDF_BYTES = new Uint8Array([37, 80, 68, 70, 45, 49]);

const htmlResponse = (body: string, init: ResponseInit = {}): Response =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const pdfResponse = (bytes: Uint8Array<ArrayBuffer> = PDF_BYTES, headers: Record<string, string> = {}): Response =>
  new Response(bytes, { status: 200, headers: { "content-type": "application/pdf", ...headers } });

const fetchReturning = (...responses: Array<Response | Error>) => {
  const queue = [...responses];
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const next = queue.shift();
    if (!next) throw new Error("sin respuesta preparada");
    if (next instanceof Error) throw next;
    return next;
  });
};

describe("extractCertisendCouponIds", () => {
  it("encuentra el link directo en minúsculas, sin repetidos y en orden de aparición", () => {
    const upper = `https://go.certisend.com/coupon/${ID.toUpperCase()}`;
    const html = `<a href="${PAGE_URL}">x</a> ${upper} https://go.certisend.com/coupon/${OTHER_ID}`;
    expect(extractCertisendCouponIds(html)).toEqual([ID, OTHER_ID]);
  });

  it("lo encuentra aunque venga embebido en otra URL", () => {
    const html = `<a href="https://web.certisend.com/panel/abc/${PAGE_URL}">ver</a>`;
    expect(extractCertisendCouponIds(html)).toEqual([ID]);
  });

  it("ignora los links de seguimiento, otros hosts y uuids mal formados", () => {
    const html = [
      "https://go.certisend.com/AbC123/xYz789",
      `https://otro.example/coupon/${ID}`,
      `http://go.certisend.com/coupon/${ID}`,
      "https://go.certisend.com/coupon/1234-no-es-uuid",
      `https://go.certisend.com/coupon_print/${ID}`,
    ].join(" ");
    expect(extractCertisendCouponIds(html)).toEqual([]);
  });
});

describe("certisendCouponUrl", () => {
  it("arma la URL directa del cupón", () => {
    expect(certisendCouponUrl(ID)).toBe(PAGE_URL);
  });
});

describe("extractCertisendPdfUrl", () => {
  it("devuelve el link de conversión con los &amp; decodificados", () => {
    expect(extractCertisendPdfUrl(PAGE_HTML, ID)).toBe(PDF_URL);
  });

  it("rechaza otro host, http en vez de https y otra ruta", () => {
    expect(extractCertisendPdfUrl(pageWith(PDF_URL.replace("html2pdf.certisend.com", "html2pdf.malo.example")), ID)).toBeNull();
    expect(extractCertisendPdfUrl(pageWith(PDF_URL.replace("https:", "http:")), ID)).toBeNull();
    expect(extractCertisendPdfUrl(pageWith(PDF_URL.replace("/convert/", "/otra/")), ID)).toBeNull();
  });

  it("rechaza un link cuyo url apunta a otro cupón", () => {
    expect(extractCertisendPdfUrl(pageWith(PDF_URL), OTHER_ID)).toBeNull();
  });

  it("devuelve null si no hay link", () => {
    expect(extractCertisendPdfUrl("<html><body>nada</body></html>", ID)).toBeNull();
  });
});

describe("fetchCertisendCouponPdf", () => {
  it("baja la página y el PDF pidiendo exactamente esas dos URLs", async () => {
    const fetchMock = fetchReturning(htmlResponse(PAGE_HTML), pdfResponse());
    const bytes = await fetchCertisendCouponPdf(ID, { fetch: fetchMock });
    expect(Array.from(bytes)).toEqual(Array.from(PDF_BYTES));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([PAGE_URL, PDF_URL]);
  });

  it("rechaza un id inválido sin pedir nada", async () => {
    const fetchMock = fetchReturning();
    await expect(fetchCertisendCouponPdf("../../etc/passwd", { fetch: fetchMock })).rejects.toBeInstanceOf(IcloudApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("una página que no responde ok es IcloudApiError", async () => {
    const fetchMock = fetchReturning(htmlResponse("no", { status: 404 }));
    await expect(fetchCertisendCouponPdf(ID, { fetch: fetchMock })).rejects.toThrow("certisend respondió 404 al abrir el cupón.");
  });

  it("una página que no es HTML es IcloudApiError", async () => {
    const json = new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    await expect(fetchCertisendCouponPdf(ID, { fetch: fetchReturning(json) })).rejects.toBeInstanceOf(IcloudApiError);
  });

  it("una página sin link de PDF es IcloudApiError", async () => {
    const fetchMock = fetchReturning(htmlResponse("<html></html>"));
    await expect(fetchCertisendCouponPdf(ID, { fetch: fetchMock }))
      .rejects.toThrow("El cupón de certisend no trae el link para bajarlo en PDF.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un PDF que no responde ok o no es PDF es IcloudApiError", async () => {
    const failing = new Response("x", { status: 500 });
    await expect(fetchCertisendCouponPdf(ID, { fetch: fetchReturning(htmlResponse(PAGE_HTML), failing) }))
      .rejects.toThrow("certisend respondió 500 al bajar el PDF del cupón.");
    const notPdf = new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    await expect(fetchCertisendCouponPdf(ID, { fetch: fetchReturning(htmlResponse(PAGE_HTML), notPdf) }))
      .rejects.toThrow("certisend no devolvió un PDF para el cupón.");
  });

  it("un PDF más grande que el máximo es IcloudApiError, por content-length o por bytes reales", async () => {
    const byHeader = fetchReturning(htmlResponse(PAGE_HTML), pdfResponse(PDF_BYTES, { "content-length": "999999" }));
    await expect(fetchCertisendCouponPdf(ID, { fetch: byHeader, maxBytes: 100 })).rejects.toBeInstanceOf(IcloudApiError);
    const byBytes = fetchReturning(htmlResponse(PAGE_HTML), pdfResponse(new Uint8Array(200)));
    await expect(fetchCertisendCouponPdf(ID, { fetch: byBytes, maxBytes: 100 })).rejects.toBeInstanceOf(IcloudApiError);
  });

  it("un corte de red o un timeout es IcloudApiError con el motivo", async () => {
    const down = fetchReturning(new Error("getaddrinfo ENOTFOUND go.certisend.com"));
    await expect(fetchCertisendCouponPdf(ID, { fetch: down }))
      .rejects.toThrow("No se pudo bajar el cupón de certisend: getaddrinfo ENOTFOUND go.certisend.com");
    const slow = vi.fn(async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }));
    await expect(fetchCertisendCouponPdf(ID, { fetch: slow, timeoutMs: 10 }))
      .rejects.toThrow(/No se pudo bajar el cupón de certisend/);
  });
});
