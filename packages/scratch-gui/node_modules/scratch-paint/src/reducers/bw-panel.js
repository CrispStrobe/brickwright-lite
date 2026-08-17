/**
 * Brickwright: open/closed state of the designer's right-hand properties rail.
 */

const TOGGLE_PANEL = 'scratch-paint/bw-panel/TOGGLE_PANEL';

// Closed by default. The rail is a real column in the editor's flex row, so an open rail takes
// width away from the canvas — which is the right trade when you asked for it and the wrong one
// when you didn't. The editor must look and behave exactly as it did before until you open it.
const initialState = {visible: false};

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
