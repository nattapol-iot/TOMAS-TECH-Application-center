/** Where a guide's card goes (GuideLayer.tsx), kept free of the DOM so it can be tested. */

export type GuideRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** The gap between the lit target and its outline; the outline sits this far outside the target. */
export const GUIDE_PAD = 6;
const GAP = 14, EDGE = 8, PHONE = 620;

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));

/**
 * Below the target, else above it, else beside it; centred at the bottom when there is no target. On a phone the card
 * is docked at the bottom, and moves above the target when the target sits there. Always inside the viewport.
 */
export function guideCardPosition(rect: GuideRect | null, card: { width: number; height: number }, view: { width: number; height: number }): { left: number; top: number } {
  const { width, height } = card;
  let left: number, top: number;
  if (!rect || view.width <= PHONE) {
    left = (view.width - width) / 2;
    top = view.height - height - 16;
    if (rect && rect.bottom > top - GAP && rect.top - GAP - height >= EDGE) top = rect.top - GAP - height;
  } else if (rect.bottom + GUIDE_PAD + GAP + height <= view.height - EDGE) {
    top = rect.bottom + GUIDE_PAD + GAP; left = rect.left + rect.width / 2 - width / 2;
  } else if (rect.top - GUIDE_PAD - GAP - height >= EDGE) {
    top = rect.top - GUIDE_PAD - GAP - height; left = rect.left + rect.width / 2 - width / 2;
  } else {
    top = rect.top + rect.height / 2 - height / 2;
    left = rect.right + GUIDE_PAD + GAP + width <= view.width - EDGE ? rect.right + GUIDE_PAD + GAP : rect.left - GUIDE_PAD - GAP - width;
  }
  return { left: Math.round(clamp(left, EDGE, view.width - width - EDGE)), top: Math.round(clamp(top, EDGE, view.height - height - EDGE)) };
}
