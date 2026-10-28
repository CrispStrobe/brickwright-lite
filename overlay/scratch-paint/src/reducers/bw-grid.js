import log from '../log/log';

/**
 * Brickwright: the grid and the two kinds of snapping.
 *
 * `size` is in COSTUME (SVG) units, like every other number the designer shows.
 */

const CHANGE_GRID_SIZE = 'scratch-paint/bw-grid/CHANGE_GRID_SIZE';
const TOGGLE_GRID_VISIBLE = 'scratch-paint/bw-grid/TOGGLE_GRID_VISIBLE';
const TOGGLE_SNAP_TO_GRID = 'scratch-paint/bw-grid/TOGGLE_SNAP_TO_GRID';
const TOGGLE_SMART_GUIDES = 'scratch-paint/bw-grid/TOGGLE_SMART_GUIDES';

// Below about 2 costume units the grid is denser than the screen can show at 1x zoom, and every
// line still has to be built and drawn. Above half the art board it stops being a grid.
const MIN_GRID_SIZE = 2;
const MAX_GRID_SIZE = 240;

const initialState = {
    size: 10,
    visible: false,
    snapToGrid: false,
    // Object-to-object snapping is on by default: it only acts within a few pixels, it shows
    // exactly what it matched, and it is the one that saves the most fiddling.
    smartGuides: true
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case CHANGE_GRID_SIZE:
        if (isNaN(action.size)) {
            log.warn(`Invalid grid size: ${action.size}`);
            return state;
        }
        return Object.assign({}, state, {
            size: Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, action.size))
        });
    case TOGGLE_GRID_VISIBLE:
        return Object.assign({}, state, {visible: !state.visible});
    case TOGGLE_SNAP_TO_GRID:
        return Object.assign({}, state, {snapToGrid: !state.snapToGrid});
    case TOGGLE_SMART_GUIDES:
        return Object.assign({}, state, {smartGuides: !state.smartGuides});
    default:
        return state;
    }
};

// Action creators ==================================
const changeGridSize = function (size) {
    return {type: CHANGE_GRID_SIZE, size: size};
};
const toggleGridVisible = function () {
    return {type: TOGGLE_GRID_VISIBLE};
};
const toggleSnapToGrid = function () {
    return {type: TOGGLE_SNAP_TO_GRID};
};
const toggleSmartGuides = function () {
    return {type: TOGGLE_SMART_GUIDES};
};

export {
    reducer as default,
    changeGridSize,
    toggleGridVisible,
    toggleSmartGuides,
    toggleSnapToGrid,
    MAX_GRID_SIZE,
    MIN_GRID_SIZE
};
