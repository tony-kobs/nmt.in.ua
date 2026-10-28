import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import manifest from "@/app/manifest";
import {
  DEFAULT_OG_IMAGE_PATH,
  ICON_PATHS,
  absoluteUrl,
  createPageMetadata,
  siteIcons,
} from "./seo";

const root = path.resolve(process.cwd());

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(path.join(root, file));
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(buf.subarray(12, 16).toString("ascii"), "IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function icoEntries(file: string): string[] {
  const buf = readFileSync(path.join(root, file));
  assert.equal(buf.readUInt16LE(0), 0);
  assert.equal(buf.readUInt16LE(2), 1);
  const count = buf.readUInt16LE(4);
  const sizes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = 6 + i * 16;
    const width = buf[offset] || 256;
    const height = buf[offset + 1] || 256;
    const bytes = buf.readUInt32LE(offset + 8);
    const start = buf.readUInt32LE(offset + 12);
    assert.equal(buf.subarray(start, start + 4).toString("hex"), "89504e47");
    assert.ok(bytes > 8);
    sizes.push(`${width}x${height}`);
  }
  return sizes;
}

test("createPageMetadata includes canonical, OG image, and twitter card", () => {
  const meta = createPageMetadata({
    title: "Результати за темами",
    description: "Прогрес по темах НМТ.",
    path: "/results",
  });

  assert.equal(meta.alternates?.canonical, absoluteUrl("/results"));

  const og = meta.openGraph;
  assert.ok(og && typeof og === "object" && !Array.isArray(og));
  if (og && typeof og === "object" && !Array.isArray(og)) {
    assert.equal(og.locale, "uk_UA");
    const images = og.images;
    assert.ok(Array.isArray(images) && images.length > 0);
    const first = images[0];
    assert.equal(
      typeof first === "object" && first !== null && "url" in first
        ? first.url
        : first,
      DEFAULT_OG_IMAGE_PATH,
    );
  }

  const twitter = meta.twitter;
  assert.ok(twitter && typeof twitter === "object" && !Array.isArray(twitter));
  if (twitter && typeof twitter === "object" && !Array.isArray(twitter)) {
    assert.equal(
      "card" in twitter ? twitter.card : undefined,
      "summary_large_image",
    );
  }
});

test("site icons list sized brand files and skip the app favicon route", () => {
  assert.equal(existsSync(path.join(root, "src/app/favicon.ico")), false);

  const icons = siteIcons();
  assert.ok(icons && typeof icons === "object" && !Array.isArray(icons) && !(icons instanceof URL));
  if (!icons || typeof icons !== "object" || Array.isArray(icons) || icons instanceof URL) return;

  const icon = icons.icon;
  assert.ok(Array.isArray(icon));
  const list = icon as Array<{ url: string; sizes?: string; type?: string }>;
  assert.deepEqual(
    list.map((item) => item.url),
    [ICON_PATHS.faviconIco, ICON_PATHS.icon32, ICON_PATHS.icon192],
  );
  assert.equal(list[0]?.sizes, "16x16 32x32 48x48");
  assert.equal(list[0]?.type, "image/x-icon");
  for (const item of list) {
    assert.notEqual(item.type, "image/svg+xml");
    assert.ok(item.sizes && item.sizes !== "any");
  }

  const apple = icons.apple;
  assert.ok(Array.isArray(apple));
  const touch = (apple as Array<{ url: string; sizes?: string; type?: string }>)[0];
  assert.equal(touch?.url, ICON_PATHS.appleTouch);
  assert.equal(touch?.sizes, "180x180");
  assert.equal(touch?.type, "image/png");
});

test("favicon files match the sizes declared to browsers", () => {
  assert.deepEqual(icoEntries("public/favicon.ico"), ["48x48", "32x32", "16x16"]);
  assert.deepEqual(pngSize("public/icons/icon-32.png"), { width: 32, height: 32 });
  assert.deepEqual(pngSize("public/icons/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngSize("public/favicon.png"), { width: 192, height: 192 });
  assert.deepEqual(pngSize("public/icons/icon-512.png"), { width: 512, height: 512 });
  assert.deepEqual(pngSize("public/icons/apple-touch-icon.png"), { width: 180, height: 180 });
  assert.deepEqual(pngSize("public/icons/maskable-192.png"), { width: 192, height: 192 });
  assert.deepEqual(pngSize("public/icons/maskable-512.png"), { width: 512, height: 512 });
});

test("web manifest icons are png with explicit sizes", () => {
  const icons = manifest().icons ?? [];
  assert.deepEqual(
    icons.map((icon) => `${icon.src} ${icon.sizes} ${icon.type} ${icon.purpose}`),
    [
      `${ICON_PATHS.icon192} 192x192 image/png any`,
      `${ICON_PATHS.icon512} 512x512 image/png any`,
      `${ICON_PATHS.maskable192} 192x192 image/png maskable`,
      `${ICON_PATHS.maskable512} 512x512 image/png maskable`,
    ],
  );
});

test("createPageMetadata sets noIndex for private routes", () => {
  const meta = createPageMetadata({
    title: "Сесія",
    description: "Приватна сесія.",
    path: "/session/1",
    noIndex: true,
  });

  const robots = meta.robots;
  assert.ok(robots && typeof robots === "object" && !Array.isArray(robots));
  if (robots && typeof robots === "object" && !Array.isArray(robots)) {
    assert.equal(robots.index, false);
    assert.equal(robots.follow, false);
  }
});
