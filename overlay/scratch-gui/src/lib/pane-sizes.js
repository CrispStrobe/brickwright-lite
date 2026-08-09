/**
 * Pane size vocabulary — five sizes expressed as flex-basis shares.
 *
 * From gui-layout.md: "Five sizes — xs · s · m · l · xl — but they are
 * shares of the row, not pixel widths. One control per column, cycling
 * through them. Enlarging one column shrinks the others."
 *
 * xs = collapsed strip (~28px, vertical title only)
 * s  = compact
 * m  = normal (default)
 * l  = comfortable
 * xl = dominant (the other two shrink to xs/s)
 *
 * The numbers are unitless flex-grow shares. Three columns always
 * sum to 100% with no gap.
 */

export const PANE_SIZES = {
  xs: 0,    // collapsed to a strip; min-width set in CSS
  s:  15,
  m:  30,
  l:  45,
  xl: 60,
};

/** Minimum width for the xs (collapsed strip) state */
export const XS_MIN_WIDTH = 28;

/** The five size names in order */
export const SIZE_ORDER = ['xs', 's', 'm', 'l', 'xl'];

/**
 * Cycle to the next size.
 * @param {string} current — current size name
 * @returns {string} — next size name (wraps around)
 */
export function nextSize(current) {
  const idx = SIZE_ORDER.indexOf(current);
  return SIZE_ORDER[(idx + 1) % SIZE_ORDER.length];
}

/**
 * Given three column sizes, compute their flex-basis values.
 * If any column is xs, it gets a fixed min-width instead of a share.
 *
 * @param {string} left — size name
 * @param {string} middle — size name
 * @param {string} right — size name
 * @returns {{ left: object, middle: object, right: object }} — style objects
 */
export function computePaneStyles(left, middle, right) {
  const shares = {
    left: PANE_SIZES[left] || PANE_SIZES.m,
    middle: PANE_SIZES[middle] || PANE_SIZES.m,
    right: PANE_SIZES[right] || PANE_SIZES.m,
  };

  const total = shares.left + shares.middle + shares.right || 1;

  function styleFor(name, share) {
    if (name === 'xs') {
      return {
        flexBasis: `${XS_MIN_WIDTH}px`,
        flexGrow: 0,
        flexShrink: 0,
        minWidth: `${XS_MIN_WIDTH}px`,
        overflow: 'hidden',
      };
    }
    return {
      flexBasis: `${(share / total * 100).toFixed(1)}%`,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: '120px',
      overflow: 'hidden',
    };
  }

  return {
    left: styleFor(left, shares.left),
    middle: styleFor(middle, shares.middle),
    right: styleFor(right, shares.right),
  };
}
