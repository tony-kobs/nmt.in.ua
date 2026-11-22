export const MENU_GAP = 6;
export const MENU_PAD = 8;
const MENU_MAX = 16 * 16;

export type MenuBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

/**
 * Keep a dropdown inside the viewport: shift it left when it would pass the
 * right edge, and open upward when there is more room above the trigger.
 */
export function placeMenu(input: {
  top: number;
  left: number;
  bottom: number;
  width: number;
  viewportWidth: number;
  viewportHeight: number;
  minWidth?: number;
}): MenuBox {
  const pad = MENU_PAD;
  const gap = MENU_GAP;
  const maxWidth = Math.max(44, input.viewportWidth - pad * 2);
  const width = Math.min(Math.max(input.width, input.minWidth ?? 0), maxWidth);
  let left = input.left;
  if (left + width > input.viewportWidth - pad) left = input.viewportWidth - pad - width;
  if (left < pad) left = pad;
  const below = input.viewportHeight - input.bottom - gap - pad;
  const above = input.top - gap - pad;
  const placeBelow = below >= 136 || below >= above;
  const maxHeight = Math.min(MENU_MAX, Math.max(44, placeBelow ? below : above));
  let top = placeBelow ? input.bottom + gap : input.top - gap - maxHeight;
  if (top < pad) top = pad;
  if (top + maxHeight > input.viewportHeight - pad) {
    top = Math.max(pad, input.viewportHeight - pad - maxHeight);
  }
  return { top, left, width, maxHeight };
}
