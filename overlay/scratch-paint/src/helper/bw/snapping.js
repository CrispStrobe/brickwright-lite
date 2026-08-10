import paper from '@scratch/paper';

import {getGuideLayer, setGuideItem} from '../layer';
import {getAllSelectableRootItems} from '../selection';
import {getGridSettings, snapValueToGrid} from './grid';

/**
 * Brickwright: object-to-object snapping with visible alignment guides, plus the grid fallback.
 *
 * The two kinds of snapping are resolved PER AXIS, not one-or-the-other: if a drag lines up with
 * another object horizontally but nothing vertically, the horizontal match wins on x and the grid
 * still takes y. Doing it whole-vector would mean a near-miss on one axis silently disabled
 * snapping on the other.
 */

const GUIDE_COLOR = '#FF3B7B';
const GUIDE_TAG = 'bwSmartGuide';

// Screen pixels, divided by zoom at use. Roughly a finger's width of slack at 1x — enough to
// catch an intended alignment, small enough that it never fights a deliberate placement.
const SNAP_TOLERANCE = 6;

/** Remove any alignment guides currently drawn. */
const clearSmartGuides = function () {
    const layer = getGuideLayer();
    for (const child of layer.children.slice()) {
        if (child.data && child.data[GUIDE_TAG]) child.remove();
    }
};

/**
 * Draw the alignment guides for the current snap.
 * @param {Array<object>} guides Each `{from: paper.Point, to: paper.Point}`.
 */
const drawSmartGuides = function (guides) {
    clearSmartGuides();
    if (!guides || !guides.length) return;
    const layer = getGuideLayer();
    for (const guide of guides) {
        const line = new paper.Path.Line({
            from: guide.from,
            to: guide.to,
            strokeColor: GUIDE_COLOR,
            strokeWidth: 1 / paper.view.zoom,
            dashArray: [4 / paper.view.zoom, 3 / paper.view.zoom],
            insert: false
        });
        line.data[GUIDE_TAG] = true;
        setGuideItem(line);
        layer.addChild(line);
    }
};

/**
 * The three interesting positions of a box on one axis: its two edges and its centre. Snapping
 * any of the moving three to any of a candidate's three is what produces edge-to-edge,
 * centre-to-centre and edge-to-centre alignment from one rule.
 * @param {!paper.Rectangle} bounds The box.
 * @param {!boolean} horizontal True for the x axis.
 * @return {Array<number>} The three positions.
 */
const axisPositions = function (bounds, horizontal) {
    return horizontal ?
        [bounds.left, bounds.center.x, bounds.right] :
        [bounds.top, bounds.center.y, bounds.bottom];
};

/**
 * Find the closest alignment between the dragged box and any other object on one axis.
 * @param {!paper.Rectangle} moved Where the selection would land without snapping.
 * @param {!Array<paper.Item>} candidates Items to snap against.
 * @param {!boolean} horizontal True for the x axis.
 * @return {?object} `{delta, position, item}`, or null if nothing is within tolerance.
 */
const bestAxisSnap = function (moved, candidates, horizontal) {
    const tolerance = SNAP_TOLERANCE / paper.view.zoom;
    const movingPositions = axisPositions(moved, horizontal);
    let best = null;

    for (const item of candidates) {
        for (const target of axisPositions(item.bounds, horizontal)) {
            for (const from of movingPositions) {
                const delta = target - from;
                if (Math.abs(delta) <= tolerance &&
                    (best === null || Math.abs(delta) < Math.abs(best.delta))) {
                    best = {delta: delta, position: target, item: item};
                }
            }
        }
    }
    return best;
};

/**
 * Adjust a drag so the selection snaps to other objects and/or the grid.
 *
 * @param {!paper.Rectangle} origBounds Bounds of the selection before the drag started.
 * @param {!paper.Point} dragVector The unsnapped drag.
 * @param {!Array<paper.Item>} movingItems The items being dragged, excluded from the candidates.
 * @return {!object} `{vector, guides}` — the adjusted drag and the lines to draw for it.
 */
const snapDragVector = function (origBounds, dragVector, movingItems) {
    const {size, snapToGrid, smartGuides} = getGridSettings();
    if (!snapToGrid && !smartGuides) return {vector: dragVector, guides: []};

    const moved = origBounds.clone();
    moved.center = origBounds.center.add(dragVector);

    let snapX = null;
    let snapY = null;
    if (smartGuides) {
        const moving = new Set(movingItems);
        const candidates = getAllSelectableRootItems().filter(item => !moving.has(item));
        snapX = bestAxisSnap(moved, candidates, true);
        snapY = bestAxisSnap(moved, candidates, false);
    }

    let dx = snapX ? snapX.delta : 0;
    let dy = snapY ? snapY.delta : 0;
    if (snapToGrid && size > 0) {
        // Only where an object didn't already claim the axis.
        if (!snapX) dx = snapValueToGrid(moved.left, size) - moved.left;
        if (!snapY) dy = snapValueToGrid(moved.top, size) - moved.top;
    }

    // Build the guides against the FINAL rectangle, so the line actually touches where the
    // selection ends up rather than where it was heading.
    const final = moved.clone();
    final.center = moved.center.add(new paper.Point(dx, dy));

    const guides = [];
    if (snapX) {
        const other = snapX.item.bounds;
        guides.push({
            from: new paper.Point(snapX.position, Math.min(other.top, final.top)),
            to: new paper.Point(snapX.position, Math.max(other.bottom, final.bottom))
        });
    }
    if (snapY) {
        const other = snapY.item.bounds;
        guides.push({
            from: new paper.Point(Math.min(other.left, final.left), snapY.position),
            to: new paper.Point(Math.max(other.right, final.right), snapY.position)
        });
    }

    return {vector: dragVector.add(new paper.Point(dx, dy)), guides: guides};
};

export {
    clearSmartGuides,
    drawSmartGuides,
    snapDragVector,
    SNAP_TOLERANCE
};
