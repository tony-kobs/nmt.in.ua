import assert from "node:assert/strict";
import test from "node:test";

import { nextRoleSwitchMotion, type RoleSwitchMotion } from "./roleSwitchMotion";

function play(steps: number[], mobile = true): RoleSwitchMotion {
  let state: RoleSwitchMotion = { hidden: false, anchorY: 0 };
  for (const scrollY of steps) {
    state = nextRoleSwitchMotion({ mobile, scrollY, ...state });
  }
  return state;
}

test("the role bar stays visible near the top and on a wide screen", () => {
  assert.equal(play([0, 24, 48]).hidden, false);
  assert.equal(play([0, 80, 400], false).hidden, false);
});

test("small scroll steps downward still hide the bar", () => {
  const steps = Array.from({ length: 40 }, (_, index) => index * 5);
  assert.equal(play(steps).hidden, true);
});

test("scrolling up shows the bar again", () => {
  const hidden = play([0, 40, 80, 200]);
  assert.equal(hidden.hidden, true);
  const shown = nextRoleSwitchMotion({
    mobile: true,
    scrollY: hidden.anchorY - 8,
    hidden: hidden.hidden,
    anchorY: hidden.anchorY,
  });
  assert.equal(shown.hidden, false);
});

test("a tiny move keeps the current visibility", () => {
  const hidden = play([0, 100]);
  assert.equal(hidden.hidden, true);
  assert.equal(
    nextRoleSwitchMotion({
      mobile: true,
      scrollY: hidden.anchorY + 4,
      hidden: true,
      anchorY: hidden.anchorY,
    }).hidden,
    true,
  );
});
