import assert from "node:assert/strict";
import test from "node:test";
import type { UserRole } from "@/modules/auth/types";

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
  assert.ok(hrefs.includes("/marathon"));
  assert.ok(!hrefs.includes("/leaderboard"));
  assert.equal(links.find((item) => item.href === "/marathon")?.labelKey, "marathon");
});

test("a student without a joined marathon still sees the marathon shelf", () => {
  const hrefs = visibleSidebar({
    role: "student",
    cabinetScope: "full",
    marathonHref: null,
  }).map((item) => item.href);
  assert.ok(hrefs.includes("/results"));
  assert.ok(hrefs.includes("/marathon"));
  assert.ok(!hrefs.includes("/leaderboard"));
  assert.equal(hrefs.filter((href) => href === "/marathon").length, 1);
});

test("a platform student sees the marathon shelf beside the usual sections", () => {
  const links = visibleSidebar({
    role: "student",
    cabinetScope: "full",
    marathonHref: MAP,
  });
  const hrefs = links.map((item) => item.href);
  assert.ok(hrefs.includes("/"));
  assert.ok(hrefs.includes("/results"));
  assert.ok(hrefs.includes("/simulator"));
  assert.ok(hrefs.includes("/marathon"));
  assert.equal(hrefs.filter((href) => href === "/marathon").length, 1);
  assert.ok(!hrefs.includes("/leaderboard"));
  assert.ok(!hrefs.includes("/admin/marathons"));
  assert.ok(!hrefs.includes("/admin/support"));
  assert.ok(!hrefs.includes("/assign"));
});

test("teachers and admins keep their menus when a marathon href is present", () => {
  const teacher = visibleSidebar({
    role: "teacher",
    cabinetScope: "marathon",
    marathonHref: MAP,
  }).map((item) => item.href);
  assert.ok(teacher.includes("/assign"));
  assert.ok(teacher.includes("/students"));
  assert.ok(teacher.includes("/leaderboard"));
  assert.ok(!teacher.includes("/"));
  assert.ok(!teacher.includes("/marathon"));
  assert.ok(!teacher.includes("/admin/support"));
  assert.ok(!teacher.includes(MAP));

  const admin = visibleSidebar({
    role: "admin",
    cabinetScope: "marathon",
    marathonHref: MAP,
  }).map((item) => item.href);
  assert.deepEqual([...admin].sort(), [...ADMIN_NAV_HREFS].sort());
  const dev = visibleSidebar({
    role: "dev",
    cabinetScope: "full",
    marathonHref: null,
  }).map((item) => item.href);
  assert.deepEqual([...dev].sort(), [...ADMIN_NAV_HREFS].sort());

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

test("each role's sidebar icons are distinct", () => {
  const roles: UserRole[] = ["student", "teacher", "admin", "dev"];
  for (const role of roles) {
    const icons = visibleSidebar({
      role,
      cabinetScope: "full",
      marathonHref: null,
    }).map((item) => item.icon);
    assert.equal(new Set(icons).size, icons.length, role);
  }
});
