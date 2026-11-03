import assert from "node:assert/strict";
import test from "node:test";

import { TEXTBOOK_IMAGE_MAX_BYTES } from "@/modules/textbook/imageLimits";
import { clientImageError } from "./imageFile";

test("clientImageError accepts a normal image and rejects svg, empty and oversized files", () => {
  assert.equal(
    clientImageError({ size: 1200, type: "image/webp", name: "fig.webp" }),
    null,
  );
  assert.equal(
    clientImageError({ size: 10, type: "image/svg+xml", name: "fig.svg" }),
    "type",
  );
  assert.equal(clientImageError({ size: 10, type: "", name: "fig.SVG" }), "type");
  assert.equal(clientImageError({ size: 0, type: "image/png", name: "empty.png" }), "type");
  assert.equal(
    clientImageError({ size: 20, type: "text/plain", name: "notes.txt" }),
    "type",
  );
  assert.equal(
    clientImageError({
      size: TEXTBOOK_IMAGE_MAX_BYTES + 1,
      type: "image/png",
      name: "big.png",
    }),
    "size",
  );
});
