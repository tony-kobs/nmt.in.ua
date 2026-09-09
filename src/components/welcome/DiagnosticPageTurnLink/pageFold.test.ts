import assert from "node:assert/strict";
import test from "node:test";
import { getFoldTransform } from "./pageFold";

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
