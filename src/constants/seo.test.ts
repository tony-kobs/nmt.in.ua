import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import manifest from "@/app/manifest";
import {
  ICON_PATHS,
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  SITE_DESCRIPTION,
  absoluteUrl,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildOrganizationJsonLd,
  buildPrepCourseJsonLd,
  buildTeacherProfileJsonLd,
  createPageMetadata,
  fitMetaDescription,
  fitMetaTitle,
  googleSiteVerification,
  EXCLUDED_TEACHER_SITEMAP_SLUGS,
  isExcludedTeacherSlug,
  isNoIndexPath,
  metadataGroupSuffix,
  siteIcons,
  sitemapStaticPaths,
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
  assert.equal(meta.alternates?.languages, undefined);

  const welcome = createPageMetadata({
    title: "Вітальна",
    description: "Та сама сторінка, що й головна.",
    path: "/welcome",
    canonicalPath: "/",
  });
  assert.equal(welcome.alternates?.canonical, absoluteUrl("/"));

  const og = meta.openGraph;
  assert.ok(og && typeof og === "object" && !Array.isArray(og));
  if (og && typeof og === "object" && !Array.isArray(og)) {
    assert.equal(og.locale, "uk_UA");
    assert.equal(og.alternateLocale, undefined);
    const images = og.images;
    assert.ok(Array.isArray(images) && images.length > 0);
    const first = images[0];
    assert.equal(
      typeof first === "object" && first !== null && "url" in first ? first.url : first,
      "/opengraph-image",
    );
  }
  const teacher = createPageMetadata({
    title: "Михайло",
    description: "Викладач.",
    path: "/t/mykhailo",
  });
  const teacherOg = teacher.openGraph;
  if (teacherOg && typeof teacherOg === "object" && !Array.isArray(teacherOg)) {
    const images = teacherOg.images;
    const first = Array.isArray(images) ? images[0] : images;
    assert.equal(
      typeof first === "object" && first !== null && "url" in first ? first.url : first,
      "/t/mykhailo/opengraph-image-1hqqxu",
    );
  }
  assert.equal(metadataGroupSuffix("/(marketing)/diagnostic"), "2o0ybf");
  assert.equal(existsSync(path.join(root, "src/app/opengraph-image.tsx")), true);
  assert.equal(existsSync(path.join(root, "src/app/twitter-image.tsx")), true);
  assert.equal(existsSync(path.join(root, "public/og/og-default.png")), true);

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

test("public metadata stays within Google length limits", () => {
  assert.ok([...SITE_DESCRIPTION].length <= META_DESCRIPTION_MAX);
  assert.equal(fitMetaDescription(SITE_DESCRIPTION), SITE_DESCRIPTION);

  const home = fitMetaTitle("Підготовка до НМТ з математики");
  const welcome = fitMetaTitle("Вітальна сторінка");
  assert.notEqual(home, welcome);
  assert.ok([...home].length <= META_TITLE_MAX);
  assert.ok([...welcome].length <= META_TITLE_MAX);
  assert.equal(home.endsWith("| LevelUP"), true);

  const long = fitMetaTitle(`${"Дуже довга назва теми ".repeat(8)}кінець`);
  assert.ok([...long].length <= META_TITLE_MAX);
  assert.equal(long.endsWith("| LevelUP"), true);

  const clipped = fitMetaDescription(`${"речення про підготовку ".repeat(20)}`);
  assert.ok([...clipped].length <= META_DESCRIPTION_MAX);
  assert.equal(clipped.endsWith(" "), false);
});

test("private routes are noindex even when the caller forgets the flag", () => {
  for (const path of [
    "/login",
    "/register",
    "/register?role=teacher",
    "/account",
    "/parent",
    "/promo",
    "/admin/marathons",
    "/assign",
    "/assign/promo",
    "/materials/textbook",
    "/materials/textbook?topic=ALG-08-FRACTIONS",
    "/session/4",
    "/marathon/demo/map",
    "/diagnostic/session/9",
    "/t/demo-teacher",
    "/t/Demo-Teacher",
    "/t/local-teacher",
    "/t/angryteacher",
    "/t/32132132112312",
    "/t/000",
  ]) {
    assert.equal(isNoIndexPath(path), true, path);
    const meta = createPageMetadata({
      title: "Службова",
      description: "Службова сторінка.",
      path,
    });
    const robots = meta.robots;
    assert.ok(robots && typeof robots === "object" && !Array.isArray(robots));
    if (robots && typeof robots === "object" && !Array.isArray(robots)) {
      assert.equal(robots.index, false, path);
    }
  }

  for (const path of [
    "/",
    "/welcome",
    "/diagnostic",
    "/t/mikhail",
    "/t/mykhailo",
    "/t/angry-teacher",
    "/t/123abc",
    "/marathon/onemath",
    "/interns/sasha-dubrovina28",
  ]) {
    assert.equal(isNoIndexPath(path), false, path);
    const meta = createPageMetadata({
      title: "Публічна",
      description: "Публічна сторінка.",
      path,
    });
    const robots = meta.robots;
    assert.ok(robots && typeof robots === "object" && !Array.isArray(robots));
    if (robots && typeof robots === "object" && !Array.isArray(robots)) {
      assert.equal(robots.index, true, path);
    }
  }
  assert.deepEqual(
    [...EXCLUDED_TEACHER_SITEMAP_SLUGS],
    ["angryteacher", "demo-teacher", "local-teacher"],
  );
  assert.equal(isExcludedTeacherSlug("  DEMO-TEACHER "), true);
  assert.equal(isExcludedTeacherSlug("32132132112312"), true);
  assert.equal(isExcludedTeacherSlug("mikhail"), false);
  assert.equal(isExcludedTeacherSlug("demo"), false);
  assert.deepEqual(sitemapStaticPaths(), [
    "/",
    "/welcome",
    "/diagnostic",
    "/interns/sasha-dubrovina28",
  ]);
});

test("structured data is valid JSON-LD", () => {
  const samples = [
    buildOrganizationJsonLd(),
    buildPrepCourseJsonLd(),
    buildFaqJsonLd([{ question: "Скільки коштує?", answer: "Безкоштовно." }]),
    buildBreadcrumbJsonLd([
      { name: "Головна", path: "/" },
      { name: "Вступний тест", path: "/diagnostic" },
    ]),
    buildTeacherProfileJsonLd({
      name: "Михайло Максимов",
      path: "/t/mykhailo",
      headline: "Викладач математики",
      description: "Готує до НМТ.",
      city: "Київ",
      contactUrl: "https://example.com",
    }),
  ];
  for (const sample of samples) {
    const json = JSON.stringify(sample);
    assert.equal(json.includes("undefined"), false);
    const parsed = JSON.parse(json) as { "@context"?: string; "@type"?: string; "@graph"?: unknown[] };
    assert.equal(parsed["@context"], "https://schema.org");
    assert.ok(parsed["@type"] || Array.isArray(parsed["@graph"]));
  }
  const org = buildOrganizationJsonLd();
  assert.equal(org.logo, absoluteUrl(ICON_PATHS.icon512));
  const course = buildPrepCourseJsonLd();
  assert.equal(course["@type"], "Course");
  assert.equal(course.offers.price, "0");
  const teacher = buildTeacherProfileJsonLd({
    name: "Михайло",
    path: "/t/mykhailo",
  });
  const types = teacher["@graph"].map((node) => node["@type"]);
  assert.deepEqual(types, ["ProfilePage", "Person"]);
});

test("google site verification renders only when the env is set", () => {
  const key = "NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION";
  const previous = process.env[key];
  delete process.env[key];
  assert.equal(googleSiteVerification(), undefined);
  process.env[key] = "  token-value  ";
  assert.equal(googleSiteVerification(), "token-value");
  process.env[key] = "   ";
  assert.equal(googleSiteVerification(), undefined);
  if (previous === undefined) delete process.env[key];
  else process.env[key] = previous;
});

test("open graph font file is a TrueType face", () => {
  const font = readFileSync(path.join(root, "src/lib/seo/fonts/Manrope-SemiBold.ttf"));
  assert.equal(font.readUInt32BE(0), 0x00010000);
  assert.ok(font.length > 1000);
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
