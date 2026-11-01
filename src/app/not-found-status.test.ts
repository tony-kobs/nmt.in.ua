import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("loading files do not wrap the root not-found page or notFound() routes", () => {
  assert.equal(fs.existsSync(path.join(root, "src/app/not-found.tsx")), true);
  assert.equal(fs.existsSync(path.join(root, "src/app/loading.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "src/app/(home)/loading.tsx")), true);
  assert.equal(fs.existsSync(path.join(root, "src/app/(marketing)/loading.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "src/app/(marketing)/(flow)/loading.tsx")), true);
  assert.equal(fs.existsSync(path.join(root, "src/app/(app)/loading.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "src/app/(app)/(cabinet)/loading.tsx")), true);
  const marathonLayout = fs.readFileSync(
    path.join(root, "src/app/(marketing)/marathon/[slug]/layout.tsx"),
    "utf8",
  );
  assert.match(marathonLayout, /notFound\(\)/);
});
