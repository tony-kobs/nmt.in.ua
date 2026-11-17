import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_NAV } from "@/constants/navigation";
import { PUBLIC_PAGE_PATHS } from "@/constants/publicRoutes";
import { isNoIndexPath } from "@/constants/seo";
import sitemap, { teacherSitemapPaths } from "./sitemap";

const REDIRECTS = ["/materials", "/practice/interactive", "/register/teacher"];

test("sitemap lists public pages and only live marathon or teacher cards beyond them", async () => {
  const entries = await sitemap();
  const paths = entries.map((entry) => new URL(entry.url).pathname).sort();

  const expected = new Set<string>(
    PUBLIC_PAGE_PATHS.filter((path) => path !== "/t" && !isNoIndexPath(path)),
  );

  for (const path of expected) {
    assert.equal(paths.includes(path), true, `missing ${path}`);
  }
  for (const entry of entries) {
    assert.ok(entry.lastModified instanceof Date);
    assert.equal(Number.isNaN(entry.lastModified.getTime()), false);
  }
  for (const path of paths) {
    const dynamic = path.startsWith("/marathon/") || path.startsWith("/t/");
    assert.equal(expected.has(path) || dynamic, true, `unexpected sitemap path ${path}`);
    assert.equal(path.includes("?"), false, `query url ${path}`);
    assert.equal(isNoIndexPath(path), false, `private path ${path}`);
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
