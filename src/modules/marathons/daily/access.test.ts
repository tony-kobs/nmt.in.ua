import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_NAV_HREFS } from "@/modules/auth/types";
import {
  isMarathonOnlyStudent,
  marathonOnlyMayOpen,
  marathonOnlyRedirectTarget,
  visibleSidebar,
} from "./access";

const MAP = "/marathon/math-5/map";

test("a legacy marathon scope still sees the full student cabinet", () => {
  const links = visibleSidebar({
    role: "student",
    cabinetScope: "marathon",
    marathonHref: MAP,
  });
  const hrefs = links.map((item) => item.href);
  assert.ok(hrefs.includes("/"));
  assert.ok(hrefs.includes("/results"));
  assert.ok(hrefs.includes("/simulator"));
  assert.ok(hrefs.includes(MAP));
  assert.equal(links.find((item) => item.href === MAP)?.labelKey, "marathon");
});

test("a legacy marathon scope without a joined marathon still has cabinet sections", () => {
  const hrefs = visibleSidebar({
    role: "student",
    cabinetScope: "marathon",
    marathonHref: null,
  }).map((item) => item.href);
  assert.ok(hrefs.includes("/results"));
  assert.ok(!hrefs.some((href) => href.startsWith("/marathon/")));
});

test("a platform student sees the marathon item beside the usual sections", () => {
  const links = visibleSidebar({
    role: "student",
    cabinetScope: "full",
    marathonHref: MAP,
  });
  const hrefs = links.map((item) => item.href);
  assert.ok(hrefs.includes("/"));
  assert.ok(hrefs.includes("/results"));
  assert.ok(hrefs.includes("/simulator"));
  assert.ok(hrefs.includes(MAP));
  assert.equal(hrefs.filter((href) => href === MAP).length, 1);
  assert.ok(!hrefs.includes("/admin/marathons"));
  assert.ok(!hrefs.includes("/assign"));
});

test("a platform student without a joined marathon does not see the item", () => {
  const hrefs = visibleSidebar({
    role: "student",
    cabinetScope: "full",
    marathonHref: null,
  }).map((item) => item.href);
  assert.ok(!hrefs.some((href) => href.startsWith("/marathon/")));
  assert.ok(hrefs.includes("/results"));
});

test("teachers and admins keep their menus when a marathon href is present", () => {
  const teacher = visibleSidebar({
    role: "teacher",
    cabinetScope: "marathon",
    marathonHref: MAP,
  }).map((item) => item.href);
  assert.ok(teacher.includes("/assign"));
  assert.ok(teacher.includes("/students"));
  assert.ok(!teacher.includes("/"));
  assert.ok(!teacher.includes(MAP));

  const admin = visibleSidebar({
    role: "admin",
    cabinetScope: "marathon",
    marathonHref: MAP,
  }).map((item) => item.href);
  assert.deepEqual([...admin].sort(), [...ADMIN_NAV_HREFS].sort());
  assert.equal(isMarathonOnlyStudent("teacher", "marathon"), false);
  assert.equal(isMarathonOnlyStudent("admin", "marathon"), false);
  assert.equal(isMarathonOnlyStudent("student", "full"), false);
  assert.equal(isMarathonOnlyStudent("student", "marathon"), true);
});

test("marathon scope no longer redirects cabinet URLs", () => {
  assert.equal(marathonOnlyRedirectTarget("/results", MAP), null);
  assert.equal(marathonOnlyRedirectTarget("/", MAP), null);
  assert.equal(marathonOnlyRedirectTarget("/simulator", MAP), null);
  assert.equal(marathonOnlyRedirectTarget("/account", MAP), null);
  assert.equal(marathonOnlyRedirectTarget("/marathon/math-5/day/2", MAP), null);
  assert.equal(marathonOnlyMayOpen("/marathon/math-5/final"), true);
  assert.equal(marathonOnlyMayOpen("/account"), true);
  assert.equal(marathonOnlyMayOpen("/results"), false);
});
