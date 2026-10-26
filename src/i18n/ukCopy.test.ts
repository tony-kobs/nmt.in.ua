import assert from "node:assert/strict";
import test from "node:test";

import en from "../../messages/en.json";
import uk from "../../messages/uk.json";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function walk(value: Json, path: string, out: Map<string, string>) {
  if (typeof value === "string") {
    out.set(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      walk(child, path ? `${path}.${key}` : key, out);
    }
  }
}

/** Top-level ICU names, in order. Nested plural text is allowed to differ. */
function placeholderNames(text: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      if (depth === 0) start = index + 1;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        names.push(text.slice(start, index).split(",", 1)[0]!.trim());
        start = -1;
      }
      if (depth < 0) return ["<unbalanced>"];
    }
  }
  if (depth !== 0) return ["<unbalanced>"];
  return names;
}

test("uk.json and en.json share keys and ICU placeholder names", () => {
  const ukLeaves = new Map<string, string>();
  const enLeaves = new Map<string, string>();
  walk(uk, "", ukLeaves);
  walk(en, "", enLeaves);

  assert.deepEqual([...ukLeaves.keys()].sort(), [...enLeaves.keys()].sort());

  for (const [path, text] of ukLeaves) {
    assert.deepEqual(
      placeholderNames(text),
      placeholderNames(enLeaves.get(path) ?? ""),
      path,
    );
  }
});

test("Ukrainian copy uses «» and does not keep straight double quotes", () => {
  const leaves = new Map<string, string>();
  walk(uk, "", leaves);
  for (const [path, text] of leaves) {
    assert.equal(text.includes('"'), false, path);
    assert.equal((text.match(/«/g) ?? []).length, (text.match(/»/g) ?? []).length, path);
    assert.equal(
      /(?<![\p{L}])(?:[Нн]е)?[Вв]ірн/u.test(text),
      false,
      path,
    );
  }
});
