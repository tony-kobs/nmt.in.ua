import assert from "node:assert/strict";
import test from "node:test";
import { getFoldPosition, getFoldTransform } from "./pageFold";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

for (const [width, height] of [[320, 740], [375, 812], [768, 1024], [1440, 1104], [1920, 1080]]) {
  test(`fold preserves paper geometry and the reveal boundary at ${width}x${height}`, () => {
    for (const [top, bottom] of [[100, 100], [85, 100], [30, 78], [-25, 35], [-70, -15]]) {
      const [a, b, c, d, e, f] = getFoldTransform(width, height, top, bottom)
        .slice(7, -1).split(",").map(Number);
      const reflect = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
      close(a * d - b * c, -1);
      close(a * a + b * b, 1);
      close(c * c + d * d, 1);
      close(a * c + b * d, 0);

      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const x = width * (top + (bottom - top) * fraction) / 100;
        const y = height * fraction;
        const [foldX, foldY] = reflect(x, y);
        close(foldX, x);
        close(foldY, y);
        const [turnedX, turnedY] = reflect(x + 50, y);
        const turnedBoundary = width * (top + (bottom - top) * turnedY / height) / 100;
        assert.ok(turnedX < turnedBoundary, "turned paper must stay on the covered side of the crease");
        const [restoredX, restoredY] = reflect(turnedX, turnedY);
        close(restoredX, x + 50);
        close(restoredY, y);
      }
    }
  });
}

test("fold follows the existing path without stopping at intermediate poses", () => {
  const poses = [[0, 100, 100], [0.12, 85, 100], [0.4, 30, 78], [0.75, -25, 35], [1, -70, -15]];
  for (const [progress, top, bottom] of poses) {
    const position = getFoldPosition(progress);
    assert.ok(Math.abs(position.top - top) < 1e-8);
    assert.ok(Math.abs(position.bottom - bottom) < 1e-8);
  }
  const step = 0.00001;
  for (const progress of [0.12, 0.4, 0.75]) {
    const before = getFoldPosition(progress - step);
    const at = getFoldPosition(progress);
    const after = getFoldPosition(progress + step);
    for (const edge of ["top", "bottom"] as const) {
      const incoming = (at[edge] - before[edge]) / step;
      const outgoing = (after[edge] - at[edge]) / step;
      assert.ok(Math.abs(incoming - outgoing) < 0.1);
    }
    assert.ok((after.top - before.top) / (2 * step) < -50);
  }
  let previous = getFoldPosition(0);
  for (let frame = 1; frame <= 1000; frame++) {
    const current = getFoldPosition(frame / 1000);
    assert.ok(current.top <= previous.top && current.bottom <= previous.bottom);
    previous = current;
  }
});
