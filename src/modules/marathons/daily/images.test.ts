import assert from "node:assert/strict";
import test from "node:test";
import { checkMarathonImage, marathonImagePath, MARATHON_IMAGE_MAX_BYTES } from "./images";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("a marathon image accepts a sniffed png and rejects svg, empty and oversized bytes", () => {
  assert.equal(checkMarathonImage(png).ok, true);
  assert.equal(checkMarathonImage(Uint8Array.from([0x3c, 0x73, 0x76, 0x67])).ok, false);
  assert.equal(checkMarathonImage(new Uint8Array()).ok, false);
  const huge = new Uint8Array(MARATHON_IMAGE_MAX_BYTES + 1);
  huge.set(png);
  const rejected = checkMarathonImage(huge);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "size");
  assert.equal(marathonImagePath("a".repeat(32)), "/api/marathon-media/" + "a".repeat(32));
  assert.equal(marathonImagePath("not-a-token"), null);
});
