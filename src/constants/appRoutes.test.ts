import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { isKnownPage } from "./appRoutes";

const APP = path.resolve("src/app");

function pages(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...pages(full));
      continue;
    }
    if (name === "page.tsx") found.push(full);
  }
  return found;
}

function examplePath(file: string): string {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep);
  const segments = rel
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .map((segment) => (segment.startsWith("[") ? "example" : segment));
  return `/${segments.filter(Boolean).join("/")}` || "/";
}

test("every app page is a known route and an unknown path is not", () => {
  const examples = pages(APP).map(examplePath);
  assert.ok(examples.includes("/"));
  assert.ok(examples.includes("/session/example"));
  for (const example of examples) {
    assert.equal(isKnownPage(example), true, example);
  }
  assert.equal(isKnownPage("/nonexist-xyz"), false);
  assert.equal(isKnownPage("/session"), false);
  assert.equal(isKnownPage("/login"), true);
  assert.equal(isKnownPage("/materials/textbook"), true);
});
