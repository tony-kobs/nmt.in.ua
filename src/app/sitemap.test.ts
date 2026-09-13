import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_NAV } from "@/constants/navigation";
import { PUBLIC_PAGE_PATHS } from "@/constants/publicRoutes";
import sitemap from "./sitemap";

test("sitemap lists only public pages that do not require login", () => {
  const paths = sitemap()
    .map((entry) => new URL(entry.url).pathname)
    .sort();

  assert.deepEqual(
    paths,
    [...PUBLIC_PAGE_PATHS].filter((path) => path !== "/t").sort(),
  );

  const publicPaths = new Set<string>(paths);
  const cabinetHrefs = DASHBOARD_NAV.map((item) => item.href).filter(
    (href) => href !== "/",
  );
  for (const href of cabinetHrefs) {
    assert.equal(
      publicPaths.has(href),
      false,
      `cabinet route ${href} in sitemap`,
    );
  }
});
