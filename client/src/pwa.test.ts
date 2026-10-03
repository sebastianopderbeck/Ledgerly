import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface ManifestIcon { src: string; sizes: string; type: string; purpose: string; }

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
}

const clientDir = `${resolve(import.meta.dirname, "..")}/`;

const readClientFile = (path: string): string => readFileSync(`${clientDir}${path}`, "utf8");

const manifestPath = "public/manifest.webmanifest";

describe("Ledgerly instalable", () => {
  it("hay un manifest en public", () => {
    expect(existsSync(`${clientDir}${manifestPath}`)).toBe(true);
  });

  it("el manifest abre la app a pantalla completa desde el inicio", () => {
    const manifest = JSON.parse(readClientFile(manifestPath)) as Manifest;
    expect(manifest).toMatchObject({
      name: "Ledgerly",
      short_name: "Ledgerly",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#0b0f19",
      theme_color: "#0b0f19",
    });
  });

  it("declara íconos de 192 y 512 y uno maskable", () => {
    const manifest = JSON.parse(readClientFile(manifestPath)) as Manifest;
    expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "512x512 maskable",
    ]);
  });

  it("cada ícono declarado existe en public", () => {
    const manifest = JSON.parse(readClientFile(manifestPath)) as Manifest;
    const missing = manifest.icons.filter((icon) => !existsSync(`${clientDir}public${icon.src}`)).map((icon) => icon.src);
    expect(missing).toEqual([]);
  });

  it("index.html enlaza el manifest y habilita pantalla completa y zonas seguras en iOS", () => {
    const html = readClientFile("index.html");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />');
  });
});
