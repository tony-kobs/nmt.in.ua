import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { hasLocalMatch } = require("next/dist/shared/lib/match-local-pattern.js") as {
  hasLocalMatch: (
    patterns: Array<{ pathname: string; search?: string }> | undefined,
    url: string,
  ) => boolean;
};

/** Every `next/image` src under `src/`, plus a query on marathon media. */
const LOCAL_IMAGE_URLS = [
  "/landing/faq-student.jpg",
  "/landing/features-mascot.webp",
  "/landing/teachers/mykhailo-maksymov.webp",
  "/landing/marathon-placeholder.webp",
  "/status/error.webp",
  "/status/not-found.webp",
  "/nmt/osvita/task.webp",
  `/api/marathon-media/${"ab".repeat(16)}`,
  `/api/marathon-media/${"ab".repeat(16)}?v=1`,
];

test("images.localPatterns allows every local public image", () => {
  const source = readFileSync(fileURLToPath(new URL("../../next.config.ts", import.meta.url)), "utf8");
  const block = source.match(/localPatterns:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  assert.match(block, /pathname:\s*"\/\*\*"/);
  assert.doesNotMatch(block, /\bsearch\s*:/);
  assert.doesNotMatch(block, /marathon-media/);

  const patterns = [{ pathname: "/**" }];
  for (const url of LOCAL_IMAGE_URLS) {
    assert.equal(hasLocalMatch(patterns, url), true, url);
  }
  assert.equal(
    hasLocalMatch([{ pathname: "/api/marathon-media/**", search: "" }], "/landing/faq-student.jpg"),
    false,
  );
});
