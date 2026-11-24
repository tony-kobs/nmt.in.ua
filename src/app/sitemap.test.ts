import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_NAV } from "@/constants/navigation";
import { absoluteUrl, createPageMetadata, isNoIndexPath, sitemapStaticPaths } from "@/constants/seo";
import sitemap, { teacherSitemapPaths } from "./sitemap";

const REDIRECTS = ["/materials", "/practice/interactive", "/register/teacher"];

test("sitemap lists public pages and only live marathon or teacher cards beyond them", async () => {
  const entries = await sitemap();
  const paths = entries.map((entry) => new URL(entry.url).pathname).sort();

  const expected = new Set<string>(sitemapStaticPaths());
  assert.equal(expected.has("/welcome"), false);
  assert.equal(isNoIndexPath("/welcome"), false);

  for (const path of expected) {
    assert.equal(paths.includes(path), true, `missing ${path}`);
  }
  for (const entry of entries) {
    assert.ok(entry.lastModified instanceof Date);
    assert.equal(Number.isNaN(entry.lastModified.getTime()), false);
    const path = new URL(entry.url).pathname;
    const dynamic =
      path.startsWith("/marathon/") ||
      path.startsWith("/t/") ||
      path.startsWith("/nmt/temy/");
    assert.equal(expected.has(path) || dynamic, true, `unexpected sitemap path ${path}`);
    assert.equal(path.includes("?"), false, `query url ${path}`);
    assert.equal(isNoIndexPath(path), false, `private path ${path}`);
    const meta = createPageMetadata({
      title: "Сторінка",
      description: "Публічна сторінка.",
      path,
    });
    assert.equal(meta.alternates?.canonical, absoluteUrl(path), path);
    assert.equal(meta.alternates?.canonical, entry.url, path);
    const robots = meta.robots;
    assert.ok(robots && typeof robots === "object" && !Array.isArray(robots));
    if (robots && typeof robots === "object" && !Array.isArray(robots)) {
      assert.equal(robots.index, true, path);
      assert.equal(robots.follow, true, path);
    }
  }

  const publicPaths = new Set<string>(paths);
  const cabinetHrefs = DASHBOARD_NAV.map((item) => item.href).filter((href) => href !== "/");
  for (const href of cabinetHrefs) {
    assert.equal(publicPaths.has(href), false, `cabinet route ${href} in sitemap`);
  }
  for (const href of REDIRECTS) {
    assert.equal(publicPaths.has(href), false, `redirect ${href} in sitemap`);
  }
  assert.equal(publicPaths.has("/materials/textbook"), false);
  assert.equal(publicPaths.has("/login"), false);
  assert.equal(publicPaths.has("/register"), false);
  assert.equal(publicPaths.has("/promo"), false);
  assert.equal(publicPaths.has("/parent"), false);
});

test("teacher sitemap keeps real cards and drops demo, seed and numeric slugs", () => {
  assert.deepEqual(
    teacherSitemapPaths([
      "mikhail",
      "demo-teacher",
      "Demo-Teacher",
      "local-teacher",
      "angryteacher",
      "32132132112312",
      "000",
      "mykhailo",
      "angry-teacher",
      "123abc",
      "demo",
      " mikhail ",
      "",
      "bad slug",
      "a/b",
    ]),
    ["/t/mikhail", "/t/mykhailo", "/t/angry-teacher", "/t/123abc", "/t/demo"],
  );
});
