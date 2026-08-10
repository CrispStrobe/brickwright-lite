/**
 * Pane size vocabulary — five named sizes expressed as flex-basis shares,
 * plus arbitrary numeric shares for the draggable divider.
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
 * A column's size may ALSO be a plain number, which is that same unitless
 * share with no name attached. Dragging a divider is continuous, so it cannot
 * be expressed in the five-name vocabulary; the names stay because both
 * PRESETS and the stage-size coupling are written in them, and a preset must
 * keep meaning the same thing after someone has dragged.
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

/** Minimum width any non-collapsed column keeps, in px. Mirrors the CSS below. */
export const MIN_COLUMN_WIDTH = 120;

/*
 * There was a `nextSize` here, and a SIZE_ORDER for it to walk. Both existed
 * for the debug button that cycled the right column, and the draggable divider
 * replaced it: a drag reaches every size between the extremes directly, so
 * there is nothing left to cycle through. Removed with the button rather than
 * left exported for no caller.
 */

/** @param {string|number} size — size name or dragged fraction @returns {boolean} */
export function isCollapsed(size) {
  return size === 'xs';
}

/**
 * Is this size an exact fraction of the row, put there by dragging a divider?
 *
 * A named size is a SHARE: it competes with the other columns' shares and then
 * grows into whatever space is left over. A dragged size is a FRACTION: it is
 * where the person put the boundary, and nothing may dilute it.
 *
 * That distinction is the whole reason this predicate exists, and it was found
 * by measuring rather than by reasoning. With flex-grow 1 the right column
 * renders at its basis PLUS a share of the row's free space, so a 220px drag
 * moved the boundary 90px: the pointer and the divider came apart, more with
 * every frame. Named sizes keep the grow behaviour, because every preset and
 * the default layout were tuned against it and switching them would shrink the
 * stage column by ~270px for people who never touched a divider.
 *
 * The range is exclusive on both ends, so no stored fraction can render a
 * zero-width or full-width column.
 *
 * @param {string|number} size — size name or dragged fraction
 * @returns {boolean}
 */
export function isExplicitFraction(size) {
  return typeof size === 'number' && Number.isFinite(size) && size > 0 && size < 1;
}

/**
 * Clamp a fraction of the row to something both columns survive.
 *
 * Applied on the way in, not just at render: this value is persisted to
 * localStorage, and a single NaN stored here would render `flexBasis: NaN%` on
 * every subsequent load — an editor broken with no way back short of clearing
 * site data. Math.max does not filter NaN, so it is tested explicitly.
 *
 * @param {number} fraction — desired fraction of the row
 * @param {number} rowWidth — the row's width in px, for the pixel minimum
 * @returns {number} — a fraction safe to store
 */
export function clampFraction(fraction, rowWidth) {
  if (!Number.isFinite(fraction)) return PANE_SIZES.m / 100;
  const width = Number.isFinite(rowWidth) && rowWidth > 0 ? rowWidth : 1000;
  // Both sides keep MIN_COLUMN_WIDTH. On a window too narrow for two minimums,
  // fall back to halves rather than producing a max below the min.
  const limit = MIN_COLUMN_WIDTH / width;
  if (limit >= 0.5) return 0.5;
  return Math.min(1 - limit, Math.max(limit, fraction));
}

/**
 * Resolve a named column size to its unitless share.
 *
 * Note the `||` fallback, kept deliberately: a named `xs` resolves to 30, not
 * 0, so a collapsed column still contributes a normal column's worth to the
 * total even though it renders as a 28px strip. That is wrong on its face, but
 * it is the arithmetic every current preset was tuned against — including the
 * stage-size coupling, measured at 28.6% for the right column — and only the
 * right column's style is actually applied today, so "fixing" it would silently
 * move the stage column in three presets to no one's benefit. Frozen on purpose.
 *
 * @param {string|number} size — size name (a fraction resolves to the default)
 * @returns {number} — unitless share
 */
export function resolveShare(size) {
  return PANE_SIZES[size] || PANE_SIZES.m;
}

/**
 * Given three column sizes, compute their flex-basis values.
 *
 * Three cases per column, and they render differently on purpose:
 *   'xs'            — a fixed 28px strip that neither grows nor shrinks
 *   a number 0..1   — exactly that fraction of the row; grows into nothing
 *   a size name     — a share of the row that also grows into the free space
 *
 * @param {string|number} left — size name or dragged fraction
 * @param {string|number} middle — size name or dragged fraction
 * @param {string|number} right — size name or dragged fraction
 * @returns {{ left: object, middle: object, right: object }} — style objects
 */
export function computePaneStyles(left, middle, right) {
  const shares = {
    left: resolveShare(left),
    middle: resolveShare(middle),
    right: resolveShare(right),
  };

  const total = shares.left + shares.middle + shares.right || 1;

  function styleFor(name, share) {
    if (isCollapsed(name)) {
      return {
        flexBasis: `${XS_MIN_WIDTH}px`,
        flexGrow: 0,
        flexShrink: 0,
        minWidth: `${XS_MIN_WIDTH}px`,
        overflow: 'hidden',
        // The containing block for PaneStrip, which covers the collapsed column so the
        // 28px slice of clipped stage underneath is not what the user sees. Stated here
        // rather than relied upon: the base .stage-and-target-wrapper does not set it.
        position: 'relative',
      };
    }
    if (isExplicitFraction(name)) {
      return {
        flexBasis: `${(name * 100).toFixed(2)}%`,
        // flexGrow 0 is the point: a dragged boundary is where the person put
        // it, so this column must not also help itself to the free space.
        // flexShrink stays 1 so a narrowed window still fits rather than
        // overflowing the row.
        flexGrow: 0,
        flexShrink: 1,
        minWidth: `${MIN_COLUMN_WIDTH}px`,
        overflow: 'hidden',
      };
    }
    return {
      flexBasis: `${(share / total * 100).toFixed(1)}%`,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: `${MIN_COLUMN_WIDTH}px`,
      overflow: 'hidden',
    };
  }

  return {
    left: styleFor(left, shares.left),
    middle: styleFor(middle, shares.middle),
    right: styleFor(right, shares.right),
  };
}
