import paper from '@scratch/paper';

import {getSelectedRootItems} from '../selection';
import {CENTER} from '../view';
import {Axes} from './align';
import {getBounds} from './transform';

/**
 * Brickwright: mirror the selection.
 *
 * Flipping in place already exists upstream (the flip buttons in mode-tools). What is missing is
 * mirroring a COPY, which is how symmetric artwork actually gets built: draw half a face, mirror
 * it, and — if you want one object rather than two — unite the result with the boolean tools.
 */

/** What the mirror line runs through. */
const MirrorAbout = {
    /** The far edge of the selection, so the copy lands flush against the original. */
    SELECTION_EDGE: 'selectionEdge',
    /** The middle of the art board, so the copy lands on the opposite side of the costume. */
    CANVAS_CENTER: 'canvasCenter'
};

/**
 * Duplicate the selection and mirror the copy. The copies end up selected, so a following
 * boolean unite acts on them and the originals together.
 *
 * @param {!string} axis One of Axes — HORIZONTAL mirrors left/right, VERTICAL mirrors up/down.
 * @param {!string} about One of MirrorAbout.
 * @return {boolean} True if anything was duplicated.
 */
const mirrorDuplicate = function (axis, about) {
    const items = getSelectedRootItems();
    if (!items.length) return false;

    const bounds = getBounds(items);
    const horizontal = axis === Axes.HORIZONTAL;

    let pivot;
    if (about === MirrorAbout.CANVAS_CENTER) {
        pivot = CENTER;
    } else if (horizontal) {
        pivot = new paper.Point(bounds.right, bounds.center.y);
    } else {
        pivot = new paper.Point(bounds.center.x, bounds.bottom);
    }

    const clones = [];
    for (const item of items) {
        // Clone before deselecting, so the copy doesn't inherit a stale selection state.
        const clone = item.clone();
        clone.scale(horizontal ? -1 : 1, horizontal ? 1 : -1, pivot);
        // The tracked angle described the original's orientation; a mirrored copy is not that
        // shape rotated, so carrying the number over would make the rotation field lie.
        if (clone.data) delete clone.data.bwRotation;
        clones.push(clone);
    }

    for (const item of items) {
        item.selected = false;
    }
    for (const clone of clones) {
        clone.selected = true;
    }
    return true;
};

export {
    MirrorAbout,
    mirrorDuplicate
};
