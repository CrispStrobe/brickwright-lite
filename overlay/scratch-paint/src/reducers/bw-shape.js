import log from '../log/log';

/**
 * Brickwright: parameters for the parametric shape tools — the rounded rectangle's corner radius,
 * the polygon's side count, and the star's point count and waist.
 *
 * The corner radius is in COSTUME (SVG) units, the same units the transform panel shows and the
 * exported costume is measured in. paper's art board is twice that, so whoever hands it to a tool
 * multiplies — see containers/rounded-rect-mode.jsx. The counts and the ratio are unitless.
 */

const CHANGE_CORNER_RADIUS = 'scratch-paint/bw-shape/CHANGE_CORNER_RADIUS';
const CHANGE_POLYGON_SIDES = 'scratch-paint/bw-shape/CHANGE_POLYGON_SIDES';
const CHANGE_STAR_POINTS = 'scratch-paint/bw-shape/CHANGE_STAR_POINTS';
const CHANGE_STAR_INNER_RATIO = 'scratch-paint/bw-shape/CHANGE_STAR_INNER_RATIO';

const MAX_CORNER_RADIUS = 100;
// Past a few dozen sides a polygon is a circle with a lot of segments to serialise into the
// costume, and the oval tool already draws circles.
const MAX_SIDES = 60;
const MIN_SIDES = 3;

const initialState = {
    cornerRadius: 8,
    polygonSides: 5,
    starPoints: 5,
    starInnerRatio: 0.4
};

const clampSides = value => Math.min(MAX_SIDES, Math.max(MIN_SIDES, Math.round(value)));

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
    case CHANGE_POLYGON_SIDES:
        if (isNaN(action.polygonSides)) {
            log.warn(`Invalid polygon sides: ${action.polygonSides}`);
            return state;
        }
        return Object.assign({}, state, {polygonSides: clampSides(action.polygonSides)});
    case CHANGE_STAR_POINTS:
        if (isNaN(action.starPoints)) {
            log.warn(`Invalid star points: ${action.starPoints}`);
            return state;
        }
        return Object.assign({}, state, {starPoints: clampSides(action.starPoints)});
    case CHANGE_STAR_INNER_RATIO:
        if (isNaN(action.starInnerRatio)) {
            log.warn(`Invalid star inner ratio: ${action.starInnerRatio}`);
            return state;
        }
        // 0 would collapse the star to a set of spokes with no area; 1 makes it a polygon.
        return Object.assign({}, state, {
            starInnerRatio: Math.min(0.95, Math.max(0.05, action.starInnerRatio))
        });
    default:
        return state;
    }
};

// Action creators ==================================
const changeCornerRadius = function (cornerRadius) {
    return {type: CHANGE_CORNER_RADIUS, cornerRadius: cornerRadius};
};
const changePolygonSides = function (polygonSides) {
    return {type: CHANGE_POLYGON_SIDES, polygonSides: polygonSides};
};
const changeStarPoints = function (starPoints) {
    return {type: CHANGE_STAR_POINTS, starPoints: starPoints};
};
const changeStarInnerRatio = function (starInnerRatio) {
    return {type: CHANGE_STAR_INNER_RATIO, starInnerRatio: starInnerRatio};
};

export {
    reducer as default,
    changeCornerRadius,
    changePolygonSides,
    changeStarInnerRatio,
    changeStarPoints,
    MAX_CORNER_RADIUS,
    MAX_SIDES,
    MIN_SIDES
};
