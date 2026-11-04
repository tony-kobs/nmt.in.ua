import assert from "node:assert/strict";
import test from "node:test";
import {
  checkMarathonImage,
  introMediaIsPublic,
  INTRO_IMAGE_DAY_ID,
  marathonImageIsReadable,
  marathonImagePath,
  MARATHON_IMAGE_MAX_BYTES,
} from "./images";

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

test("the intro photo stays public for a draft and before the course opens", () => {
  assert.equal(introMediaIsPublic("draft"), true);
  assert.equal(introMediaIsPublic("active"), true);
  assert.equal(introMediaIsPublic("finished"), true);
  assert.equal(introMediaIsPublic("archived"), true);
  assert.equal(introMediaIsPublic("paused"), false);
  assert.equal(introMediaIsPublic(""), false);
  assert.equal(marathonImageIsReadable(INTRO_IMAGE_DAY_ID, "draft"), true);
  assert.equal(marathonImageIsReadable(INTRO_IMAGE_DAY_ID, "active"), true);
  assert.equal(marathonImageIsReadable(INTRO_IMAGE_DAY_ID, "paused"), false);
  assert.equal(marathonImageIsReadable(4, "draft"), true);
  assert.equal(marathonImageIsReadable(4, "paused"), true);
});
