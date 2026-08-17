import {getSelectedRootItems} from '../selection';

/**
 * Brickwright: per-object transparency.
 *
 * Scratch's paint editor can only make a COLOUR translucent, through the alpha channel of the
 * fill or stroke picker. That cannot fade a whole object — a shape with both a fill and a stroke
 * needs two edits, a group needs one per child, and a raster cannot be faded at all.
 *
 * paper carries an `opacity` on every Item, and paper's SVG export writes it as the standard
 * `opacity` attribute (the costume art already uses it — the robot's drop shadow is an ellipse at
 * opacity 0.12), so it round-trips through the costume without any special handling.
 *
 * Written against paper's own API; no other editor's implementation was consulted, so this stays
 * clean-room under our permissive licence.
 */

/** Opacity is stored 0..1; the panel talks in whole percent, which is what people mean by it. */
const toPercent = opacity => Math.round(opacity * 100);
const fromPercent = percent => Math.min(1, Math.max(0, percent / 100));

/**
 * @param {!paper.Item} item Any item.
 * @return {!number} Its opacity, defaulting to fully opaque.
 */
const opacityOf = function (item) {
    return typeof item.opacity === 'number' ? item.opacity : 1;
};

/**
 * The selection's opacity as a percentage.
 * @return {?number} The shared value, or null if nothing is selected OR the selected objects
 *     disagree — in which case the field shows empty rather than picking one arbitrarily and
 *     making the others look like they match.
 */
const getOpacityPercent = function () {
    const items = getSelectedRootItems();
    if (!items.length) return null;
    const first = opacityOf(items[0]);
    for (const item of items) {
        if (Math.abs(opacityOf(item) - first) > 1e-6) return null;
    }
    return toPercent(first);
};

/**
 * Set the opacity of every selected object.
 * @param {!number} percent Opacity in whole percent.
 * @return {boolean} True if anything changed.
 */
const setOpacityPercent = function (percent) {
    const items = getSelectedRootItems();
    if (!items.length || isNaN(percent)) return false;
    const opacity = fromPercent(percent);
    let changed = false;
    for (const item of items) {
        if (Math.abs(opacityOf(item) - opacity) > 1e-6) {
            item.opacity = opacity;
            changed = true;
        }
    }
    return changed;
};

export {
    getOpacityPercent,
    opacityOf,
    setOpacityPercent
};
