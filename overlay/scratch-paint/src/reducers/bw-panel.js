/**
 * Brickwright: open/closed state of the designer's right-hand properties rail.
 */

const TOGGLE_PANEL = 'scratch-paint/bw-panel/TOGGLE_PANEL';

const initialState = {visible: true};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case TOGGLE_PANEL:
        return {visible: !state.visible};
    default:
        return state;
    }
};

// Action creators ==================================
const togglePanel = function () {
    return {type: TOGGLE_PANEL};
};

export {
    reducer as default,
    togglePanel
};
