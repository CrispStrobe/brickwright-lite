import paper from '@scratch/paper';

import {getSelectedRootItems} from '../selection';
import {CENTER} from '../view';

/**
 * Brickwright: precise numeric transforms for the current selection.
 *
 * paper.js bakes every transform into an item's matrix, so an item carries no angle and no
 * "unrotated size" that could be read back. Everything here is therefore derived from the
 * axis-aligned bounding box of the selection; rotation is the one exception and is tracked
 * separately in `item.data.bwRotation` (see getTransform).
 *
 * Positions are reported and accepted relative to the ART BOARD CENTRE, because that is the
 * costume's rotation centre and therefore the origin the rest of Scratch reasons in.
 */

// A selection that is degenerate on one axis (a perfectly horizontal line, say) has no
// meaningful scale factor on that axis — dividing by it yields Infinity — so it is left alone.
const MIN_DIMENSION = 1e-6;

/**
 * @param {Array<paper.Item>} [items] Items to measure; defaults to the selected root items.
 * @return {?paper.Rectangle} Union of the items' bounds, or null if there are none. Always a
 *     detached copy — paper returns a LinkedRectangle from `item.bounds`, and mutating that
 *     would move the item.
 */
const getBounds = function (items) {
    const list = items || getSelectedRootItems();
    if (!list.length) return null;
    let bounds = list[0].bounds.clone();
    for (let i = 1; i < list.length; i++) {
        bounds = bounds.unite(list[i].bounds);
    }
    return bounds;
};

/**
 * Read the current transform of the selection, for display in the transform panel.
 * @return {?object} `{x, y, width, height, rotation}` or null if nothing is selected.
 *     x/y are the centre of the selection relative to the art board centre. `rotation` is
 *     non-null only for a single selected item, and only reflects rotations this panel
 *     applied — a shape the user rotated by dragging the handle reports null, because the
 *     angle is unrecoverable from the matrix alone.
 */
const getTransform = function () {
    const items = getSelectedRootItems();
    const bounds = getBounds(items);
    if (!bounds) return null;
    return {
        x: bounds.center.x - CENTER.x,
        y: bounds.center.y - CENTER.y,
        width: bounds.width,
        height: bounds.height,
        rotation: items.length === 1 ? normalizeAngle(items[0].data.bwRotation || 0) : null
    };
};

/** @param {number} deg Any angle. @return {number} The same angle in [0, 360). */
const normalizeAngle = function (deg) {
    const mod = deg % 360;
    return mod < 0 ? mod + 360 : mod;
};

/**
 * Move the selection so its bounding-box centre lands on the given art-board-relative point.
 * @param {?number} x New centre x, or null to leave the x axis alone.
 * @param {?number} y New centre y, or null to leave the y axis alone.
 * @return {boolean} True if anything actually moved.
 */
const setPosition = function (x, y) {
    const items = getSelectedRootItems();
    const bounds = getBounds(items);
    if (!bounds) return false;

    const delta = new paper.Point(
        x === null || typeof x === 'undefined' ? 0 : (x + CENTER.x) - bounds.center.x,
        y === null || typeof y === 'undefined' ? 0 : (y + CENTER.y) - bounds.center.y
    );
    if (delta.isZero()) return false;

    for (const item of items) {
        item.translate(delta);
    }
    return true;
};

/**
 * Scale strokes along with the shape, so a resized outline doesn't keep its old thickness.
 * paper only does this for uniform scales via Item#scale, and not at all for children.
 * @param {!paper.Item} item Item (and descendants) to restroke.
 * @param {!number} factor Multiplier to apply to stroke widths.
 */
const scaleStrokes = function (item, factor) {
    // A PointText's outline thickness rides on its own transform matrix, so it is already scaled.
    if (!(item instanceof paper.PointText) && item.strokeWidth) {
        item.strokeWidth = item.strokeWidth * factor;
    }
    if (item.children) {
        for (const child of item.children) {
            scaleStrokes(child, factor);
        }
    }
};

/**
 * Resize the selection to the given bounding-box size, scaling about its centre so the
 * position reported by getTransform stays put.
 * @param {?number} width New width, or null to leave the x axis alone.
 * @param {?number} height New height, or null to leave the y axis alone.
 * @return {boolean} True if anything actually changed.
 */
const setSize = function (width, height) {
    const items = getSelectedRootItems();
    const bounds = getBounds(items);
    if (!bounds) return false;

    const wantX = typeof width === 'number' && width > 0 && bounds.width > MIN_DIMENSION;
    const wantY = typeof height === 'number' && height > 0 && bounds.height > MIN_DIMENSION;
    const sx = wantX ? width / bounds.width : 1;
    const sy = wantY ? height / bounds.height : 1;
    if (sx === 1 && sy === 1) return false;

    // Strokes have a single width, so a non-uniform scale has no exact answer. The geometric
    // mean is the standard compromise and is exact whenever the scale is uniform.
    const strokeFactor = Math.sqrt(Math.abs(sx * sy));
    const pivot = bounds.center;
    for (const item of items) {
        scaleStrokes(item, strokeFactor);
        item.scale(sx, sy, pivot);
    }
    return true;
};

/**
 * Rotate the selection about its bounding-box centre by a relative amount.
 * @param {!number} degrees Clockwise degrees to turn by.
 * @return {boolean} True if anything actually rotated.
 */
const rotateBy = function (degrees) {
    const items = getSelectedRootItems();
    const bounds = getBounds(items);
    if (!bounds || degrees % 360 === 0) return false;

    const pivot = bounds.center;
    for (const item of items) {
        item.rotate(degrees, pivot);
        item.data.bwRotation = normalizeAngle((item.data.bwRotation || 0) + degrees);
    }
    return true;
};

/**
 * Rotate the selection to an absolute angle. Only meaningful for a single item whose angle we
 * have been tracking — see getTransform.
 * @param {!number} degrees Absolute clockwise angle.
 * @return {boolean} True if anything actually rotated.
 */
const setRotation = function (degrees) {
    const items = getSelectedRootItems();
    if (items.length !== 1) return false;
    return rotateBy(normalizeAngle(degrees) - normalizeAngle(items[0].data.bwRotation || 0));
};

export {
    getBounds,
    getTransform,
    normalizeAngle,
    rotateBy,
    scaleStrokes,
    setPosition,
    setRotation,
    setSize
};
