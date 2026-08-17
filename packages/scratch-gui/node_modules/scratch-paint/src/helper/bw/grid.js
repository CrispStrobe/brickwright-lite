import paper from '@scratch/paper';

import {getGuideLayer, setGuideItem} from '../layer';
import {ART_BOARD_BOUNDS, ART_BOARD_WIDTH, SVG_ART_BOARD_WIDTH} from '../view';

/**
 * Brickwright: the grid, and the settings that the drawing tools consult when snapping.
 *
 * WHY THE SETTINGS LIVE HERE rather than being passed as props: the tools that need them
 * (rect, oval, rounded rect, polygon, star, and the move tool) are constructed by six different
 * containers, several of them upstream files we would otherwise have no reason to own. Threading
 * redux through all of them to deliver two booleans and a number would mean owning every one of
 * those containers forever. A module-level setting that one container keeps in sync is the same
 * shape as helper/view.js's workspace bounds, which paper-level code here already reads this way.
 */

const ART_BOARD_UNITS_PER_COSTUME_UNIT = ART_BOARD_WIDTH / SVG_ART_BOARD_WIDTH;
const GRID_COLOR = '#B0BDD1';
const GRID_TAG = 'bwGrid';

let settings = {
    size: 10,
    visible: false,
    snapToGrid: false,
    smartGuides: true
};

/**
 * @param {!object} next The grid slice of the redux state, in costume units.
 */
const setGridSettings = function (next) {
    settings = next;
};

/** @return {!object} The current settings, with `size` converted to art board units. */
const getGridSettings = function () {
    return {
        size: settings.size * ART_BOARD_UNITS_PER_COSTUME_UNIT,
        visible: settings.visible,
        snapToGrid: settings.snapToGrid,
        smartGuides: settings.smartGuides
    };
};

/** Remove the drawn grid, if any. */
const clearGrid = function () {
    const layer = getGuideLayer();
    for (const child of layer.children.slice()) {
        if (child.data && child.data[GRID_TAG]) child.remove();
    }
};

/**
 * Draw (or redraw) the grid over the art board.
 *
 * Built as one CompoundPath from a path-data string rather than a Path per line: a 2-unit grid is
 * over 400 lines, and 400 paper items each with their own style is measurably slower to build and
 * to hit-test past than one item with 400 subpaths.
 */
const drawGrid = function () {
    // The costume tab can render before paper has a project, and does again for a moment while
    // switching costumes tears the layers down and rebuilds them.
    if (!paper.project) return;
    clearGrid();
    const {size, visible} = getGridSettings();
    if (!visible || size <= 0) return;

    const bounds = ART_BOARD_BOUNDS;
    let data = '';
    for (let x = bounds.left; x <= bounds.right; x += size) {
        data += `M${x} ${bounds.top}L${x} ${bounds.bottom}`;
    }
    for (let y = bounds.top; y <= bounds.bottom; y += size) {
        data += `M${bounds.left} ${y}L${bounds.right} ${y}`;
    }
    if (!data) return;

    const grid = new paper.CompoundPath({
        pathData: data,
        strokeColor: GRID_COLOR,
        // Keep the lines hairline-thin however far the user has zoomed in.
        strokeWidth: 1 / paper.view.zoom,
        opacity: 0.5,
        insert: false
    });
    grid.data[GRID_TAG] = true;
    setGuideItem(grid);
    getGuideLayer().addChild(grid);
    // Behind the selection handles and the centre crosshair, which the user needs to see.
    grid.sendToBack();
};

/**
 * Snap a single coordinate to the nearest grid line.
 * @param {!number} value Coordinate in art board units.
 * @param {!number} size Grid spacing in art board units.
 * @return {!number} The nearest grid line.
 */
const snapValueToGrid = function (value, size) {
    return Math.round(value / size) * size;
};

/**
 * Snap a point to the grid, if snapping is on.
 * @param {!paper.Point} point Point in art board units.
 * @return {!paper.Point} The snapped point, or the original if grid snapping is off.
 */
const snapPointToGrid = function (point) {
    const {size, snapToGrid} = getGridSettings();
    if (!snapToGrid || size <= 0) return point;
    return new paper.Point(snapValueToGrid(point.x, size), snapValueToGrid(point.y, size));
};

export {
    clearGrid,
    drawGrid,
    getGridSettings,
    setGridSettings,
    snapPointToGrid,
    snapValueToGrid
};
