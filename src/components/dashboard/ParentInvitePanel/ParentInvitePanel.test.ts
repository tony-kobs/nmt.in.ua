import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, type ComponentProps, type ComponentType, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import test from "node:test";
import uk from "../../../../messages/uk.json";
import type { AuthUser } from "@/modules/auth/types";

const Provider = NextIntlClientProvider as ComponentType<PropsWithChildren<Omit<ComponentProps<typeof NextIntlClientProvider>, "children">>>;
const require = createRequire(import.meta.url);
const oldCss = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
};
const { ParentInvitePanel }: typeof import("./ParentInvitePanel") = require("./ParentInvitePanel");
if (oldCss) require.extensions[".css"] = oldCss;
else delete require.extensions[".css"];

function render(user: Pick<AuthUser, "id" | "role" | "realRole">, students = [{ studentUserId: 7, displayName: "Fixture", login: "fixture" }]) {
  return renderToStaticMarkup(createElement(Provider, { locale: "uk", timeZone: "UTC", messages: uk },
    createElement(ParentInvitePanel, { user, students })));
}

test("student UI offers creation without identity inputs or preloaded links", () => {
  const html = render({ id: 7, role: "student" });
  assert.ok(html.includes(uk.ParentInvites.create));
  assert.ok(!html.includes('name="studentId"') && !html.includes('name="role"'));
  assert.ok(!html.includes('type="submit" disabled=""'));
  assert.ok(!html.includes("/register/parent?token="));
});

test("teacher must select from own roster and cannot issue with an empty roster", () => {
  const html = render({ id: 8, role: "teacher" });
  assert.ok(html.includes(uk.ParentInvites.chooseStudent));
  assert.ok(html.includes('type="submit" disabled=""'));
  const empty = render({ id: 8, role: "teacher" }, []);
  assert.ok(empty.includes(uk.ParentInvites.noStudents));
  assert.ok(empty.includes('type="submit" disabled=""'));
});

test("parent, staff and viewAs render no invitation UI", () => {
  for (const user of [{ id: 1, role: "parent" as const }, { id: 1, role: "admin" as const },
    { id: 1, role: "dev" as const }, { id: 1, role: "student" as const, realRole: "admin" as const },
    { id: 1, role: "teacher" as const, realRole: "dev" as const }]) {
    assert.equal(render(user), "");
  }
});
