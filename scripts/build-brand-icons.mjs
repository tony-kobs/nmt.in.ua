/**
 * Збирає іконки вкладки, Apple і PWA зі знака LevelUP.
 * Джерело: public/brand/levelup-mark.svg
 * Запуск: node scripts/build-brand-icons.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { initWasm, Resvg } = require("@resvg/resvg-wasm");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAPER = "#efe8d7";
const TEAL = [53, 183, 174];
const NAVY = [18, 60, 112];

const wasm = await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm"));
await initWasm(wasm);

const source = await readFile(path.join(root, "public/brand/levelup-mark.svg"), "utf8");
const mark = source.replace(/<\/?svg[^>]*>/g, "").trim();

function canvas(inner, background) {
  const backdrop = background
    ? `<rect width="120" height="120" fill="${background}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  ${backdrop}
  ${inner}
</svg>`;
}

const anySvg = canvas(mark);
const maskSvg = canvas(
  `<g transform="translate(60 60) scale(0.86) translate(-60 -60)">${mark}</g>`,
  PAPER,
);

function render(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    shapeRendering: 2,
    font: { loadSystemFonts: false },
  });
  const rendered = resvg.render();
  try {
    if (rendered.width !== size || rendered.height !== size) {
      throw new Error(`expected ${size}px, got ${rendered.width}x${rendered.height}`);
    }
    return {
      png: Buffer.from(rendered.asPng()),
      pixels: Buffer.from(rendered.pixels),
    };
  } finally {
    rendered.free();
    resvg.free();
  }
}

/** Half-covered edge pixels become solid brand colors, so 16/32 stay sharp. */
function posterize(pixels, alphaMin) {
  const out = Buffer.alloc(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < alphaMin) continue;
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const teal =
      (red - TEAL[0]) ** 2 + (green - TEAL[1]) ** 2 + (blue - TEAL[2]) ** 2;
    const navy =
      (red - NAVY[0]) ** 2 + (green - NAVY[1]) ** 2 + (blue - NAVY[2]) ** 2;
    const color = teal <= navy ? TEAL : NAVY;
    out[i] = color[0];
    out[i + 1] = color[1];
    out[i + 2] = color[2];
    out[i + 3] = 255;
  }
  return out;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0, 0);
  return Buffer.concat([length, name, data, crc]);
}

function pngFromRgba(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + count * 16;
  const entries = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

const icon16 = render(anySvg, 16);
const icon32 = render(anySvg, 32);
const png16 = pngFromRgba(16, posterize(icon16.pixels, 100));
const png32 = pngFromRgba(32, posterize(icon32.pixels, 128));
const png48 = render(anySvg, 48).png;
const png192 = render(anySvg, 192).png;
const png512 = render(anySvg, 512).png;
const apple = render(maskSvg, 180).png;
const mask192 = render(maskSvg, 192).png;
const mask512 = render(maskSvg, 512).png;

const files = [
  ["public/favicon.ico", pngIco([
    { size: 48, png: png48 },
    { size: 32, png: png32 },
    { size: 16, png: png16 },
  ])],
  ["public/favicon.png", png192],
  ["public/icons/icon-32.png", png32],
  ["public/icons/icon-192.png", png192],
  ["public/icons/icon-512.png", png512],
  ["public/icons/apple-touch-icon.png", apple],
  ["public/icons/maskable-192.png", mask192],
  ["public/icons/maskable-512.png", mask512],
];

for (const [rel, data] of files) {
  const file = path.join(root, rel);
  await writeFile(file, data);
  console.log(`${rel} ${data.length} bytes`);
}
