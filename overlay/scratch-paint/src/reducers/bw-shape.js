import log from '../log/log';

/**
 * Brickwright: parameters for the parametric shape tools — the corner radius of the rounded
 * rectangle tool for now. Kept in one reducer so the shape panel has a single place to read
 * from as more parametric tools land.
 *
 * Stored in COSTUME (SVG) units, the same units the transform panel shows and the same ones the
 * exported costume is measured in. paper's art board is 2x that, so whoever hands these to a
 * tool multiplies — see containers/rounded-rect-mode.jsx.
 */

const CHANGE_CORNER_RADIUS = 'scratch-paint/bw-shape/CHANGE_CORNER_RADIUS';

const MAX_CORNER_RADIUS = 100;
const initialState = {cornerRadius: 8};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case CHANGE_CORNER_RADIUS:
        if (isNaN(action.cornerRadius)) {
            log.warn(`Invalid corner radius: ${action.cornerRadius}`);
            return state;
        }
        return Object.assign({}, state, {
            cornerRadius: Math.min(MAX_CORNER_RADIUS, Math.max(0, action.cornerRadius))
        });
    default:
        return state;
    }
};

// Action creators ==================================
const changeCornerRadius = function (cornerRadius) {
    return {
        type: CHANGE_CORNER_RADIUS,
        cornerRadius: cornerRadius
    };
};

export {
    reducer as default,
    changeCornerRadius,
    MAX_CORNER_RADIUS
};
