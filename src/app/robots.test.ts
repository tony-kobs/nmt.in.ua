import assert from "node:assert/strict";
import test from "node:test";
import { ROBOTS_DISALLOW, absoluteUrl, isNoIndexPath } from "@/constants/seo";
import robots from "./robots";

test("robots.txt points at the sitemap and hides private sections", () => {
  const body = robots();
  assert.equal(body.sitemap, absoluteUrl("/sitemap.xml"));
  const rule = body.rules;
  const first = Array.isArray(rule) ? rule[0] : rule;
  assert.ok(first);
  assert.equal(first.userAgent, "*");
  assert.deepEqual(first.allow, "/");
  assert.deepEqual(first.disallow, [...ROBOTS_DISALLOW]);
  const disallow = new Set<string>(ROBOTS_DISALLOW);
  for (const prefix of [
    "/login",
    "/register",
    "/admin",
    "/parent",
    "/promo",
    "/account",
    "/assign",
    "/session/",
  ]) {
    assert.equal(disallow.has(prefix), true, prefix);
  }
  assert.equal(disallow.has("/session"), false);
  assert.equal(isNoIndexPath("/marathon/onemath"), false);
  assert.equal(isNoIndexPath("/marathon/onemath/map"), true);
  assert.equal(disallow.has("/marathon"), false);
});
