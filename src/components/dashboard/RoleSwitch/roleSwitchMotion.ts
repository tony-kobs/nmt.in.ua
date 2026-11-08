/** How far from the top the role bar stays visible, in CSS pixels. */
export const ROLE_SWITCH_TOP_PX = 48;

/** Ignore smaller scroll noise so the bar does not flicker. */
export const ROLE_SWITCH_DELTA_PX = 8;

export type RoleSwitchMotion = {
  hidden: boolean;
  /** Scroll position where the last show/hide decision was made. */
  anchorY: number;
};

/**
 * Hide after the page moves down by a few pixels, even when the browser
 * reports that move as many small scroll events. Show again on the way up
 * or while the reader is still near the top.
 */
export function nextRoleSwitchMotion(input: {
  mobile: boolean;
  scrollY: number;
  hidden: boolean;
  anchorY: number;
}): RoleSwitchMotion {
  if (!input.mobile) return { hidden: false, anchorY: input.scrollY };
  if (input.scrollY <= ROLE_SWITCH_TOP_PX) {
    return { hidden: false, anchorY: input.scrollY };
  }
  if (input.scrollY >= input.anchorY + ROLE_SWITCH_DELTA_PX) {
    return { hidden: true, anchorY: input.scrollY };
  }
  if (input.scrollY <= input.anchorY - ROLE_SWITCH_DELTA_PX) {
    return { hidden: false, anchorY: input.scrollY };
  }
  return { hidden: input.hidden, anchorY: input.anchorY };
}
