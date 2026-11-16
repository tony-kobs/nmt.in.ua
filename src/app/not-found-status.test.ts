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

function walkTs(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, files);
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

test("notFound() is not rendered under a loading.tsx boundary", () => {
  const app = path.join(root, "src/app");
  const files = walkTs(app);
  const loadingDirs = files
    .filter((file) => path.basename(file) === "loading.tsx")
    .map((file) => path.dirname(file));

  for (const file of files) {
    if (path.basename(file) === "loading.tsx") continue;
    const source = fs.readFileSync(file, "utf8");
    if (!/\bnotFound\(/.test(source)) continue;
    const parent = loadingDirs.find((dir) => file.startsWith(`${dir}${path.sep}`));
    assert.equal(parent, undefined, `${path.relative(root, file)} calls notFound under a loading boundary`);
  }
});
