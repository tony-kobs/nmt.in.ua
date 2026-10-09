import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

/**
 * Formula pictures for Telegram. MathJax (pure JS) writes SVG paths,
 * resvg-wasm turns them into PNG. No native addon, so the same code runs
 * in a Vercel function. The wasm file is traced from this module.
 */
const require = createRequire(path.join(process.cwd(), "package.json"));
const cache = new Map<string, Uint8Array>();
const CACHE_LIMIT = 200;

type MathDocument = {
  convert: (tex: string, options: { display: boolean }) => unknown;
};

type MathEngine = {
  adaptor: { outerHTML: (node: unknown) => string };
  document: MathDocument;
};

let engine: Promise<MathEngine> | null = null;

let wasmReady: Promise<void> | null = null;

function mathEngine(): Promise<MathEngine> {
  if (!engine) {
    engine = Promise.resolve().then((): MathEngine => {
      const adaptor = liteAdaptor();
      RegisterHTMLHandler(adaptor);
      const html = adaptor as MathEngine["adaptor"];
      const document = mathjax.document("", {
        InputJax: new TeX({ packages: AllPackages }),
        OutputJax: new SVG({ fontCache: "local" }),
      }) as MathDocument;
      return { adaptor: html, document };
    });
  }
  return engine;
}

function wasmEngine() {
  if (!wasmReady) {
    wasmReady = readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")).then((bytes) =>
      initWasm(bytes),
    );
  }
  return wasmReady;
}

function svgMarkup(outer: string): string | null {
  const start = outer.indexOf("<svg");
  const end = outer.lastIndexOf("</svg>");
  if (start < 0 || end < start) return null;
  const svg = outer.slice(start, end + "</svg>".length);
  if (!svg.includes("<path")) return null;
  return svg;
}

export async function texToSvg(tex: string, display: boolean): Promise<string | null> {
  const trimmed = tex.trim();
  if (!trimmed) return null;
  try {
    const { adaptor, document } = await mathEngine();
    const outer = adaptor.outerHTML(document.convert(trimmed, { display }));
    return svgMarkup(outer);
  } catch {
    return null;
  }
}

export async function svgToPng(svg: string): Promise<Uint8Array | null> {
  try {
    await wasmEngine();
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: 880 },
      background: "#fdfbf4",
      font: { loadSystemFonts: false },
    });
    const rendered = resvg.render();
    try {
      const png = rendered.asPng();
      return png.byteLength > 8 ? png : null;
    } finally {
      rendered.free();
      resvg.free();
    }
  } catch {
    return null;
  }
}

export type FormulaRenderer = (tex: string, display: boolean) => Promise<Uint8Array | null>;

/** Returns PNG bytes, or null when the formula cannot be drawn. */
export async function renderFormulaPng(
  tex: string,
  display = false,
  render: FormulaRenderer = defaultFormulaPng,
): Promise<Uint8Array | null> {
  const key = `${display ? "d" : "i"}:${tex.trim()}`;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const png = await render(tex, display);
    if (!png || png.byteLength < 8) return null;
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, png);
    return png;
  } catch {
    return null;
  }
}

async function defaultFormulaPng(tex: string, display: boolean): Promise<Uint8Array | null> {
  const svg = await texToSvg(tex, display);
  if (!svg) return null;
  return svgToPng(svg);
}
