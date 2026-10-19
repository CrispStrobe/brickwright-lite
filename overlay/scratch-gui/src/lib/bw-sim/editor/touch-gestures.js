// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Fingers on the Sim Lab's 3D views (school tablets: iPads, touch Chromebooks).
// A mouse says what it means with buttons and Shift; a finger only has where,
// how long and how many. This module turns a sequence of touch pointer events
// into what the learner meant, with no DOM and no three.js, so it is tested on
// its own (test/bw-sim-touch.test.mjs) and editor-view3d.js only acts on it:
//
//   tap                    lift before moving TOUCH_SLOP_PX or holding LONG_PRESS_MS
//   drag                   one finger travels further than TOUCH_SLOP_PX first
//   long press             one finger held still for LONG_PRESS_MS
//   long-press drag        a long press, then the finger travels
//   pinch                  a second finger comes down: distance and midpoint
//
// Plus the camera arithmetic the views use for a finger (orbit, pinch zoom,
// two-finger pan), the same as three's OrbitControls does for the mouse.

/** Finger travel (px) below which a touch is still a tap or a press: fingers wobble more than a mouse (4 px). */
export const TOUCH_SLOP_PX = 10;
/** How long (ms) a still finger must stay down to be a long press. */
export const LONG_PRESS_MS = 500;
/** How near (px) a finger must be to a gizmo handle's visible shape to grab it (a mouse: 8 px). */
export const COARSE_HANDLE_PX = 22;
/**
 * Under a finger, a press this near (px) the gizmo's centre on a part is for the
 * part: the arrows' inner ends all meet there, and a fingertip covers them all.
 */
export const COARSE_CENTRE_PX = 30;
/** The shortest a gizmo arrow is on screen under a finger (px); a mouse: 44. */
export const COARSE_GIZMO_MIN_PX = 72;

/**
 * Follows the touch points on one view. Feed it every touch pointer event with
 * its time (`event.timeStamp`); each call returns what that event means, or
 * null. `tick(t)` reports a long press while the finger is still (call it from
 * a timer); a move or a lift after the long-press time reports it too, so the
 * result never depends on when a timer happened to run.
 *
 * Events returned:
 *   {type: 'press', x, y}                    the first finger came down
 *   {type: 'dragStart', x, y, dx, dy}        it travelled past the slop (dx, dy since it came down)
 *   {type: 'drag', x, y, dx, dy}             it moved on (dx, dy since the last event)
 *   {type: 'longPress', x, y}                it stayed still for LONG_PRESS_MS (x, y where it came down)
 *   {type: 'heldDrag', x, y}                 it moves after a long press
 *   {type: 'pinchStart', was}                a second finger came down (`was`: what the first was doing)
 *   {type: 'pinch', scale, pan: [dx, dy], mid: [x, y]}
 *                                             two fingers moved: distance ratio (> 1 apart) and midpoint travel
 *   {type: 'end', was, cancelled}            the gesture is over (`was`: 'tap', 'longPress' (not reported
 *                                             before), 'held' (reported), 'drag', 'heldDrag' or 'pinch')
 * @param {{slop?: number, longPressMs?: number}} [options]
 */
export const createTouchTracker = ({slop = TOUCH_SLOP_PX, longPressMs = LONG_PRESS_MS} = {}) => {
    const points = new Map(); // pointerId → {x, y}
    let primary = null; // the first finger: {id, x0, y0, t0, x, y}
    let kind = 'idle'; // 'press' | 'drag' | 'held' | 'heldDrag' | 'pinch' | 'idle'
    let last = null; // the two fingers at the last pinch event: {distance, mid}
    const pair = () => {
        const [a, b] = [...points.values()];
        return {distance: Math.hypot(b.x - a.x, b.y - a.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2]};
    };
    const due = t => kind === 'press' && t - primary.t0 >= longPressMs;
    const holdNow = () => {
        kind = 'held';
        return {type: 'longPress', x: primary.x0, y: primary.y0};
    };
    return {
        /** What the touches are doing now ('idle' when no finger is down). */
        get kind () { return kind; },
        /** How many fingers are down. */
        get count () { return points.size; },
        down ({id, x, y, t}) {
            if (points.has(id)) return null;
            points.set(id, {x, y});
            if (points.size === 1) {
                primary = {id, x0: x, y0: y, t0: t, x, y};
                kind = 'press';
                return {type: 'press', x, y};
            }
            if (points.size === 2) {
                const was = kind;
                kind = 'pinch';
                last = pair();
                return {type: 'pinchStart', was};
            }
            return null; // a third finger changes nothing
        },
        move ({id, x, y, t}) {
            const p = points.get(id);
            if (!p) return null;
            p.x = x;
            p.y = y;
            if (kind === 'pinch') {
                if (points.size < 2) return null;
                const now = pair();
                const step = {type: 'pinch', scale: last.distance > 0 ? now.distance / last.distance : 1,
                    pan: [now.mid[0] - last.mid[0], now.mid[1] - last.mid[1]], mid: now.mid};
                last = now;
                return step;
            }
            if (!primary || id !== primary.id) return null;
            const dx = x - primary.x, dy = y - primary.y;
            primary.x = x;
            primary.y = y;
            if (due(t)) return holdNow();
            const away = Math.hypot(x - primary.x0, y - primary.y0) > slop;
            if (kind === 'press') {
                if (!away) return null;
                kind = 'drag';
                return {type: 'dragStart', x, y, dx: x - primary.x0, dy: y - primary.y0};
            }
            if (kind === 'drag') return {type: 'drag', x, y, dx, dy};
            if (kind === 'held' && away) kind = 'heldDrag';
            if (kind === 'heldDrag') return {type: 'heldDrag', x, y};
            return null;
        },
        tick (t) {
            return due(t) ? holdNow() : null;
        },
        /** A finger lifted (`cancelled`: the browser took it away, a pointercancel). */
        up ({id, t}, {cancelled = false} = {}) {
            if (!points.delete(id)) return null;
            if (kind === 'pinch') {
                if (points.size) return null; // wait for the last finger
                kind = 'idle';
                primary = null;
                return {type: 'end', was: 'pinch', cancelled};
            }
            if (!primary || id !== primary.id) return null;
            let was = kind;
            if (kind === 'press') was = due(t) ? 'longPress' : 'tap';
            kind = 'idle';
            primary = null;
            points.clear();
            return {type: 'end', was, cancelled};
        },
        /** Forget every finger (the view was closed, or Esc). */
        reset () {
            points.clear();
            primary = null;
            kind = 'idle';
            last = null;
        }
    };
};

/**
 * What a whole sequence of touch events was, for tests and logs: 'tap',
 * 'drag', 'longPress', 'longPressDrag', 'pinch' or 'cancel'. Each event is
 * {type: 'down'|'move'|'up'|'cancel'|'tick', id, x, y, t}.
 */
export const classifyTouches = (events, options) => {
    const tracker = createTouchTracker(options);
    const seen = new Set();
    let end = null;
    for (const e of events) {
        let out;
        if (e.type === 'down') out = tracker.down(e);
        else if (e.type === 'move') out = tracker.move(e);
        else if (e.type === 'tick') out = tracker.tick(e.t);
        else out = tracker.up(e, {cancelled: e.type === 'cancel'});
        if (!out) continue;
        seen.add(out.type);
        if (out.type === 'end') end = out;
    }
    if (end && end.cancelled) return 'cancel';
    if (seen.has('pinchStart')) return 'pinch';
    if (seen.has('heldDrag')) return 'longPressDrag';
    if (seen.has('longPress') || (end && end.was === 'longPress')) return 'longPress';
    if (seen.has('dragStart')) return 'drag';
    return 'tap';
};

/**
 * One finger orbiting: the angles to turn the camera by, as OrbitControls turns
 * them for a mouse drag (a drag across the whole view height is a full turn).
 * @returns {{theta: number, phi: number}} radians to add to the spherical angles
 */
export const orbitAngles = (dx, dy, heightPx) => {
    const h = Math.max(1, heightPx);
    return {theta: -2 * Math.PI * dx / h, phi: -2 * Math.PI * dy / h};
};

/**
 * The camera's offset from its target (y up) turned by spherical angles: theta
 * about the vertical, phi from the vertical, kept between `minPolar` and
 * `maxPolar` (never under the floor). The distance does not change.
 * @param {number[]} offset [x, y, z]
 */
export const orbitOffset = (offset, theta, phi, {minPolar = 1e-3, maxPolar = Math.PI / 2} = {}) => {
    const [x, y, z] = offset;
    const r = Math.hypot(x, y, z);
    if (!r) return offset.slice();
    const t = Math.atan2(x, z) + theta;
    const p = Math.min(maxPolar, Math.max(minPolar, Math.acos(Math.max(-1, Math.min(1, y / r))) + phi));
    return [r * Math.sin(p) * Math.sin(t), r * Math.cos(p), r * Math.sin(p) * Math.cos(t)];
};

/**
 * Pinch zoom: the camera's distance to its target after the fingers' distance
 * changed by `scale` (> 1: apart, closer in), kept between min and max.
 */
export const pinchDistance = (distance, scale, {min = 0, max = Infinity} = {}) =>
    Math.min(max, Math.max(min, distance / (scale > 0 ? scale : 1)));

/**
 * Two-finger pan: how far (world units) to move the camera and its target
 * along the camera's right and up axes so the scene follows the fingers'
 * midpoint (as OrbitControls pans a perspective camera).
 * @returns {[number, number]} [along right, along up]
 */
export const panAmounts = (dxPx, dyPx, distance, fovDeg, heightPx) => {
    const perPx = 2 * distance * Math.tan(fovDeg * Math.PI / 360) / Math.max(1, heightPx);
    return [-dxPx * perPx, dyPx * perPx];
};
