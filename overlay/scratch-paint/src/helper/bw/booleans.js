import paper from '@scratch/paper';

import {getSelectedRootItems} from '../selection';
import {sortItemsByZIndex} from '../math';

/**
 * Brickwright: boolean path operations on the selection.
 *
 * paper.js implements all five natively on PathItem; the work here is everything around them —
 * deciding which selected object is the base, keeping the result's place in the z-order, and
 * not destroying the artwork when an operation yields nothing.
 */

const BooleanOps = {
    UNITE: 'unite',
    SUBTRACT: 'subtract',
    INTERSECT: 'intersect',
    EXCLUDE: 'exclude',
    DIVIDE: 'divide'
};

/**
 * @param {!paper.Item} item Any item.
 * @return {boolean} True if it can take part in a boolean operation.
 */
const isOperand = function (item) {
    // A Shape (the bitmap-mode rectangle/ellipse primitives) has the geometry but not the
    // methods; it converts. A Group, Raster or PointText has no single outline to combine.
    return item instanceof paper.PathItem || item instanceof paper.Shape;
};

/**
 * @param {!paper.Item} item An item that passed isOperand.
 * @return {paper.PathItem} The item itself, or an uninserted path with the same geometry.
 */
const asPathItem = function (item) {
    return item instanceof paper.PathItem ? item : item.toPath(false /* insert */);
};

/** @return {Array<paper.Item>} The selected root items a boolean op could be applied to. */
const getOperands = function () {
    return getSelectedRootItems().filter(isOperand);
};

/**
 * Boolean ops return either a single path or — for divide, and only when the cut produces more
 * than one region — a Group wrapping the pieces. Unwrap so the caller has a flat list either way.
 * @param {?paper.Item} result Whatever the operation returned.
 * @return {Array<paper.PathItem>} The resulting paths, with any wrapper group discarded.
 */
const flattenResult = function (result) {
    if (!result) return [];
    if (result instanceof paper.Group) {
        const children = result.removeChildren();
        result.remove();
        return children;
    }
    return [result];
};

/** @param {!paper.PathItem} item A result path. @return {boolean} True if it has any geometry. */
const hasGeometry = function (item) {
    return typeof item.isEmpty === 'function' ? !item.isEmpty() : true;
};

/**
 * Combine the selected paths with a boolean operation.
 *
 * The BOTTOM-most selected object is the base: it supplies the style, it keeps its place in the
 * z-order, and for subtract it is the thing everything else is cut out of (Illustrator calls
 * that "minus front"). Applying the op one operand at a time — rather than all at once — is what
 * makes divide work for more than two objects, since each round can multiply the pieces.
 *
 * @param {!string} op One of BooleanOps.
 * @return {boolean} True if the artwork changed.
 */
const applyBoolean = function (op) {
    const originals = getOperands();
    if (originals.length < 2) return false;

    const sorted = originals.slice().sort(sortItemsByZIndex); // bottom first
    const parent = sorted[0].parent;
    const insertIndex = sorted[0].index;
    const operands = sorted.map(asPathItem);

    let pieces = [operands[0]];
    for (let i = 1; i < operands.length; i++) {
        const next = [];
        for (const piece of pieces) {
            next.push(...flattenResult(piece[op](operands[i], {insert: false})));
        }
        pieces = next.filter(hasGeometry);
        if (!pieces.length) break;
    }

    // Intersecting shapes that don't overlap, or subtracting a shape from itself, legitimately
    // produces nothing. Deleting the user's artwork is the wrong way to report that.
    if (!pieces.length) return false;

    for (const item of originals) {
        item.remove();
    }
    let index = Math.min(insertIndex, parent.children.length);
    for (const piece of pieces) {
        parent.insertChild(index++, piece);
        piece.selected = true;
    }
    return true;
};

export {
    BooleanOps,
    applyBoolean,
    getOperands,
    isOperand
};
