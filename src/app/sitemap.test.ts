import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_NAV } from "@/constants/navigation";
import { PUBLIC_PAGE_PATHS } from "@/constants/publicRoutes";
import sitemap from "./sitemap";

test("sitemap lists public pages and only live marathon or teacher cards beyond them", async () => {
  const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname).sort();

  const expected = new Set<string>(
    PUBLIC_PAGE_PATHS.filter(
      (path) =>
        path !== "/t" &&
        path !== "/verify-email" &&
        path !== "/keep-account" &&
        path !== "/forgot-password" &&
        path !== "/reset-password",
    ),
  );

  for (const path of expected) {
    assert.equal(paths.includes(path), true, `missing ${path}`);
  }
  for (const path of paths) {
    const dynamic = path.startsWith("/marathon/") || path.startsWith("/t/");
    assert.equal(expected.has(path) || dynamic, true, `unexpected sitemap path ${path}`);
  }

  const publicPaths = new Set<string>(paths);
  const cabinetHrefs = DASHBOARD_NAV.map((item) => item.href).filter((href) => href !== "/");
  for (const href of cabinetHrefs) {
    assert.equal(publicPaths.has(href), false, `cabinet route ${href} in sitemap`);
  }
});
