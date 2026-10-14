import paper from '@scratch/paper';

import {getSelectedRootItems} from '../selection';
import {ART_BOARD_BOUNDS} from '../view';
import {getBounds} from './transform';

/**
 * Brickwright: align and distribute the selected items.
 *
 * Everything works on the axis-aligned bounding box of each root item, which is what the user
 * sees as the object's extent, and matches how every other vector editor defines these ops.
 */

/** Which edge (or axis) of the frame the items are pulled to. */
const Alignments = {
    LEFT: 'left',
    HORIZONTAL_CENTER: 'horizontalCenter',
    RIGHT: 'right',
    TOP: 'top',
    VERTICAL_CENTER: 'verticalCenter',
    BOTTOM: 'bottom'
};

/** What the items are aligned against. */
const AlignTo = {
    /** The union of the selected items' own bounds — the usual "line these up with each other". */
    SELECTION: 'selection',
    /** The costume's art board, so a single item can be centred on the canvas. */
    CANVAS: 'canvas'
};

/** Axis along which items are spread out. */
const Axes = {
    HORIZONTAL: 'horizontal',
    VERTICAL: 'vertical'
};

/**
 * @param {!string} alignment One of Alignments.
 * @param {!paper.Rectangle} frame Rectangle to align against.
 * @param {!paper.Rectangle} bounds Bounds of the item being moved.
 * @return {!paper.Point} Translation to apply to the item.
 */
const offsetFor = function (alignment, frame, bounds) {
    switch (alignment) {
    case Alignments.LEFT:
        return new paper.Point(frame.left - bounds.left, 0);
    case Alignments.HORIZONTAL_CENTER:
        return new paper.Point(frame.center.x - bounds.center.x, 0);
    case Alignments.RIGHT:
        return new paper.Point(frame.right - bounds.right, 0);
    case Alignments.TOP:
        return new paper.Point(0, frame.top - bounds.top);
    case Alignments.VERTICAL_CENTER:
        return new paper.Point(0, frame.center.y - bounds.center.y);
    case Alignments.BOTTOM:
        return new paper.Point(0, frame.bottom - bounds.bottom);
    default:
        return new paper.Point(0, 0);
    }
};

/**
 * Align every selected root item to one edge (or axis) of a frame.
 * @param {!string} alignment One of Alignments.
 * @param {!string} relativeTo One of AlignTo.
 * @return {boolean} True if anything actually moved.
 */
const alignSelection = function (alignment, relativeTo) {
    const items = getSelectedRootItems();
    if (!items.length) return false;
    // Aligning a lone item to the union of its own bounds is a no-op by definition; against the
    // canvas it is the whole point, so only the selection-relative case needs two items.
    if (relativeTo === AlignTo.SELECTION && items.length < 2) return false;

    const frame = relativeTo === AlignTo.CANVAS ? ART_BOARD_BOUNDS : getBounds(items);
    if (!frame) return false;

    let moved = false;
    for (const item of items) {
        const delta = offsetFor(alignment, frame, item.bounds);
        if (!delta.isZero()) {
            item.translate(delta);
            moved = true;
        }
    }
    return moved;
};

/**
 * Spread the selected items along an axis so the GAPS between them are equal, holding the two
 * outermost items still. Equalising gaps rather than centres is what reads as "evenly spaced"
 * when the items are different sizes.
 * @param {!string} axis One of Axes.
 * @return {boolean} True if anything actually moved.
 */
const distributeSelection = function (axis) {
    const items = getSelectedRootItems();
    // With two items there is a single gap and nothing to equalise.
    if (items.length < 3) return false;

    const horizontal = axis === Axes.HORIZONTAL;
    const measure = bounds => (horizontal ? bounds.width : bounds.height);
    const start = bounds => (horizontal ? bounds.left : bounds.top);
    const end = bounds => (horizontal ? bounds.right : bounds.bottom);

    const sorted = items.slice().sort((a, b) => start(a.bounds) - start(b.bounds));
    const sizes = sorted.map(item => measure(item.bounds));

    const span = end(sorted[sorted.length - 1].bounds) - start(sorted[0].bounds);
    const occupied = sizes.reduce((sum, size) => sum + size, 0);
    // Negative when the items overlap — then they end up evenly overlapped, which is right.
    const gap = (span - occupied) / (sorted.length - 1);

    let moved = false;
    let cursor = start(sorted[0].bounds);
    for (let i = 0; i < sorted.length; i++) {
        const delta = cursor - start(sorted[i].bounds);
        if (delta !== 0) {
            sorted[i].translate(horizontal ? new paper.Point(delta, 0) : new paper.Point(0, delta));
            moved = true;
        }
        cursor += sizes[i] + gap;
    }
    return moved;
};

export {
    Alignments,
    AlignTo,
    Axes,
    alignSelection,
    distributeSelection
};
