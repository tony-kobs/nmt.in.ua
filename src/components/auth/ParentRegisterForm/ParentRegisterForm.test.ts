import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, type ComponentProps, type ComponentType, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import test from "node:test";
import uk from "../../../../messages/uk.json";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";

// createElement supplies children separately; next-intl requires them inside its props type.
const IntlProvider = NextIntlClientProvider as ComponentType<
  PropsWithChildren<Omit<ComponentProps<typeof NextIntlClientProvider>, "children">>
>;

// Node has no CSS Modules loader; render the actual components with class-name stubs.
const require = createRequire(import.meta.url);
const previousCssLoader = require.extensions[".css"];
require.extensions[".css"] = (module) => {
  module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
};
const { ParentRegisterForm }: typeof import("./ParentRegisterForm") = require("./ParentRegisterForm");
const { RegisterForm }: typeof import("../RegisterForm/RegisterForm") = require("../RegisterForm/RegisterForm");
if (previousCssLoader) require.extensions[".css"] = previousCssLoader;
else delete require.extensions[".css"];

test("parent form renders translated credentials and token, without role or student identity", () => {
  for (const [locale, messages] of [["uk", uk], ["en", en], ["de", de]] as const) {
    const html = renderToStaticMarkup(createElement(IntlProvider,
      { locale, timeZone: "UTC", messages }, createElement(ParentRegisterForm, { token: "preview-only" })));
    assert.ok(html.includes(messages.ParentRegister.title));
    for (const name of ["token", "displayName", "email", "password", "passwordConfirm"]) {
      assert.ok(html.includes(`name="${name}"`));
    }
    assert.ok(!html.includes('name="role"') && !html.includes('name="studentId"'));
    assert.match(html, /type="hidden" name="token"/);
    assert.match(html, /autoComplete="new-password"/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  }
});

test("existing student and teacher forms keep their original fields and headings", () => {
  for (const role of ["student", "teacher"] as const) {
    const html = renderToStaticMarkup(createElement(IntlProvider,
      { locale: "uk", timeZone: "UTC", messages: uk },
      createElement(RegisterForm, { role, nextPath: "/" })));
    assert.ok(html.includes(role === "student" ? uk.RegisterForm.title : uk.RegisterForm.titleTeacher));
    assert.ok(html.includes(`name="role" value="${role}"`));
    assert.ok(!html.includes('name="token"'));
  }
});
