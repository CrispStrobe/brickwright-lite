// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Fingers on the Robot Lab's 3D views (editor/touch-gestures.js): what a
// sequence of touch pointer events means (tap, drag, long press, long-press
// drag, pinch), and the camera arithmetic for one-finger orbit, pinch zoom and
// two-finger pan. Orbit results are checked against an independent rotation
// about the vertical, not against numbers written down here.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
    COARSE_HANDLE_PX, LONG_PRESS_MS, TOUCH_SLOP_PX, classifyTouches, createTouchTracker, orbitAngles, orbitOffset,
    panAmounts, pinchDistance
} from '../overlay/scratch-gui/src/lib/bw-sim/editor/touch-gestures.js';

const down = (x, y, t, id = 1) => ({type: 'down', id, x, y, t});
const move = (x, y, t, id = 1) => ({type: 'move', id, x, y, t});
const up = (x, y, t, id = 1) => ({type: 'up', id, x, y, t});
const near = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) <= eps);

test('thresholds are finger-sized: more slop than a mouse click, a half-second long press, a wide handle margin', () => {
    assert.ok(TOUCH_SLOP_PX > 4 && TOUCH_SLOP_PX <= 16);
    assert.ok(LONG_PRESS_MS >= 400 && LONG_PRESS_MS <= 800);
    assert.ok(COARSE_HANDLE_PX > 8);
});

test('a quick touch is a tap, even when the finger wobbles within the slop', () => {
    assert.equal(classifyTouches([down(100, 100, 0), up(100, 100, 80)]), 'tap');
    assert.equal(classifyTouches([down(100, 100, 0), move(100 + TOUCH_SLOP_PX * 0.6, 100 + TOUCH_SLOP_PX * 0.6, 40),
        up(100 + TOUCH_SLOP_PX * 0.6, 100 + TOUCH_SLOP_PX * 0.6, 90)]), 'tap');
    assert.equal(classifyTouches([down(100, 100, 0), move(100 + TOUCH_SLOP_PX, 100, 40), up(100 + TOUCH_SLOP_PX, 100, 90)]), 'tap',
        'exactly the slop is still a tap');
});

test('travelling past the slop is a drag; dragStart carries the travel since the press, drag the step since the last', () => {
    const t = createTouchTracker();
    assert.deepEqual(t.down({id: 7, x: 50, y: 50, t: 0}), {type: 'press', x: 50, y: 50});
    assert.equal(t.move({id: 7, x: 55, y: 50, t: 20}), null, 'within the slop nothing happens yet');
    assert.deepEqual(t.move({id: 7, x: 50 + TOUCH_SLOP_PX + 1, y: 53, t: 40}),
        {type: 'dragStart', x: 50 + TOUCH_SLOP_PX + 1, y: 53, dx: TOUCH_SLOP_PX + 1, dy: 3});
    assert.deepEqual(t.move({id: 7, x: 80, y: 60, t: 60}), {type: 'drag', x: 80, y: 60, dx: 80 - (51 + TOUCH_SLOP_PX), dy: 7});
    assert.equal(t.kind, 'drag');
    // Holding still after a drag does not turn it into a long press.
    assert.equal(t.tick(5000), null);
    assert.deepEqual(t.up({id: 7, x: 80, y: 60, t: 5000}), {type: 'end', was: 'drag', cancelled: false});
    assert.equal(t.kind, 'idle');
    assert.equal(classifyTouches([down(0, 0, 0), move(30, 0, 50), up(30, 0, 100)]), 'drag');
});

test('a still finger held LONG_PRESS_MS is a long press, from the timer or, if it never ran, from the lift', () => {
    const t = createTouchTracker();
    t.down({id: 1, x: 10, y: 10, t: 1000});
    assert.equal(t.tick(1000 + LONG_PRESS_MS - 1), null, 'one millisecond short');
    assert.deepEqual(t.tick(1000 + LONG_PRESS_MS), {type: 'longPress', x: 10, y: 10});
    assert.equal(t.tick(1000 + LONG_PRESS_MS * 3), null, 'reported once');
    assert.deepEqual(t.up({id: 1, x: 10, y: 10, t: 2000}), {type: 'end', was: 'held', cancelled: false});

    assert.equal(classifyTouches([down(0, 0, 0), {type: 'tick', t: LONG_PRESS_MS}, up(0, 0, LONG_PRESS_MS + 50)]), 'longPress');
    // No timer: the lift itself is late enough.
    const late = createTouchTracker();
    late.down({id: 2, x: 0, y: 0, t: 0});
    assert.deepEqual(late.up({id: 2, x: 0, y: 0, t: LONG_PRESS_MS + 1}), {type: 'end', was: 'longPress', cancelled: false});
    assert.equal(classifyTouches([down(0, 0, 0), up(0, 0, LONG_PRESS_MS - 1)]), 'tap');
    // A wobble inside the slop does not spoil it; a move that arrives late reports it.
    const wobble = createTouchTracker();
    wobble.down({id: 3, x: 0, y: 0, t: 0});
    assert.equal(wobble.move({id: 3, x: 3, y: 2, t: 200}), null);
    assert.deepEqual(wobble.move({id: 3, x: 4, y: 2, t: LONG_PRESS_MS + 10}), {type: 'longPress', x: 0, y: 0});
});

test('a long press and then moving is a long-press drag (box select on empty space)', () => {
    const t = createTouchTracker();
    t.down({id: 1, x: 100, y: 100, t: 0});
    t.tick(LONG_PRESS_MS);
    assert.equal(t.move({id: 1, x: 104, y: 100, t: LONG_PRESS_MS + 20}), null, 'within the slop: still just held');
    assert.deepEqual(t.move({id: 1, x: 160, y: 140, t: LONG_PRESS_MS + 40}), {type: 'heldDrag', x: 160, y: 140});
    assert.deepEqual(t.move({id: 1, x: 170, y: 150, t: LONG_PRESS_MS + 60}), {type: 'heldDrag', x: 170, y: 150});
    assert.deepEqual(t.up({id: 1, x: 170, y: 150, t: LONG_PRESS_MS + 80}), {type: 'end', was: 'heldDrag', cancelled: false});
    assert.equal(classifyTouches([down(0, 0, 0), {type: 'tick', t: LONG_PRESS_MS}, move(40, 40, LONG_PRESS_MS + 30),
        up(40, 40, LONG_PRESS_MS + 60)]), 'longPressDrag');
    // Moving first and holding later is a drag, never a box.
    assert.equal(classifyTouches([down(0, 0, 0), move(40, 0, 30), {type: 'tick', t: LONG_PRESS_MS}, move(40, 40, LONG_PRESS_MS + 30),
        up(40, 40, LONG_PRESS_MS + 60)]), 'drag');
});

test('a second finger makes it a pinch: distance ratio and midpoint travel, whatever the first finger was doing', () => {
    const t = createTouchTracker();
    t.down({id: 1, x: 100, y: 100, t: 0});
    t.move({id: 1, x: 140, y: 100, t: 10}); // the first finger was already dragging
    assert.deepEqual(t.down({id: 2, x: 240, y: 100, t: 20}), {type: 'pinchStart', was: 'drag'});
    // Spread: 100 px apart → 200 px apart, the midpoint stays at x 190.
    const spread = t.move({id: 2, x: 290, y: 100, t: 30});
    assert.equal(spread.type, 'pinch');
    assert.ok(Math.abs(spread.scale - 150 / 100) < 1e-12, `scale ${spread.scale}`);
    assert.deepEqual(spread.pan, [25, 0]);
    const spread2 = t.move({id: 1, x: 90, y: 100, t: 40});
    assert.ok(Math.abs(spread2.scale - 200 / 150) < 1e-12);
    // Both fingers slide down 30 px together: no zoom, pan of the midpoint only.
    t.move({id: 1, x: 90, y: 130, t: 50});
    const slide = t.move({id: 2, x: 290, y: 130, t: 60});
    assert.ok(Math.abs(slide.pan[1] - 15) < 1e-12, 'the second half of the slide moves the midpoint the other 15 px');
    // A third finger changes nothing; lifting one finger waits for the last; the rest never becomes a drag.
    assert.equal(t.down({id: 3, x: 0, y: 0, t: 70}), null);
    assert.equal(t.up({id: 3, x: 0, y: 0, t: 75}), null);
    assert.equal(t.up({id: 1, x: 90, y: 130, t: 80}), null);
    assert.equal(t.move({id: 2, x: 400, y: 130, t: 90}), null, 'one finger left after a pinch: no orbit, no drag');
    assert.deepEqual(t.up({id: 2, x: 400, y: 130, t: 100}), {type: 'end', was: 'pinch', cancelled: false});
    assert.equal(t.count, 0);
    assert.equal(classifyTouches([down(0, 0, 0), down(50, 0, 5, 2), move(80, 0, 20, 2), up(0, 0, 40), up(80, 0, 50, 2)]), 'pinch');
});

test('a pointercancel ends the gesture as cancelled; events for unknown fingers are ignored', () => {
    assert.equal(classifyTouches([down(0, 0, 0), move(40, 0, 20), {type: 'cancel', id: 1, x: 40, y: 0, t: 30}]), 'cancel');
    const t = createTouchTracker();
    assert.equal(t.move({id: 9, x: 1, y: 1, t: 0}), null);
    assert.equal(t.up({id: 9, x: 1, y: 1, t: 0}), null);
    t.down({id: 1, x: 0, y: 0, t: 0});
    assert.equal(t.down({id: 1, x: 0, y: 0, t: 1}), null, 'the same finger twice is not a pinch');
    t.reset();
    assert.equal(t.count, 0);
    assert.equal(t.kind, 'idle');
});

test('one-finger orbit: a drag across the view height is a full turn about the vertical, the distance is kept', () => {
    const h = 600;
    const a = orbitAngles(h / 4, 0, h);
    assert.ok(Math.abs(Math.abs(a.theta) - Math.PI / 2) < 1e-12 && a.phi === 0);
    // Independent oracle: rotate the offset about +y by theta with a rotation matrix.
    const offset = [0.3, 0.25, 0.4];
    const turned = orbitOffset(offset, a.theta, 0);
    const c = Math.cos(a.theta), s = Math.sin(a.theta);
    const expected = [c * offset[0] + s * offset[2], offset[1], -s * offset[0] + c * offset[2]];
    assert.ok(near(turned, expected, 1e-12), `${turned} vs ${expected}`);
    assert.ok(Math.abs(Math.hypot(...turned) - Math.hypot(...offset)) < 1e-12);
    // Opposite drags undo each other.
    const back = orbitOffset(turned, orbitAngles(-h / 4, 0, h).theta, 0);
    assert.ok(near(back, offset, 1e-12));
});

test('orbit up and down stays above the floor and off the pole', () => {
    const offset = [0, 0.3, 0.4];
    const down = orbitOffset(offset, 0, 10, {maxPolar: Math.PI / 2});
    assert.ok(Math.abs(down[1]) < 1e-12, 'dragged far down: level with the target, never under the floor');
    assert.ok(Math.abs(Math.hypot(...down) - 0.5) < 1e-12);
    const top = orbitOffset(offset, 0, -10, {minPolar: 1e-3});
    assert.ok(top[1] < 0.5 && top[1] > 0.5 * Math.cos(2e-3), 'dragged far up: just off the pole');
    // A finger dragging down (dy > 0) raises the camera's view from above, as OrbitControls does.
    assert.ok(orbitAngles(0, 50, 500).phi < 0);
});

test('pinch zoom and two-finger pan', () => {
    assert.equal(pinchDistance(1, 2), 0.5, 'fingers twice as far apart: twice as close');
    assert.equal(pinchDistance(1, 0.5), 2);
    assert.equal(pinchDistance(1, 100, {min: 0.05}), 0.05);
    assert.equal(pinchDistance(1, 0.01, {max: 5}), 5);
    assert.equal(pinchDistance(1, 0), 1, 'a degenerate pinch changes nothing');
    // Moving the midpoint across the whole view height moves the scene by the height the view
    // shows at the target's distance (2 d tan(fov/2)): what is under the fingers stays there.
    const d = 0.8, fov = 40, h = 700;
    const [right, upAmount] = panAmounts(0, h, d, fov, h);
    assert.equal(right === 0 ? 0 : right, 0);
    assert.ok(Math.abs(upAmount - 2 * d * Math.tan(fov * Math.PI / 360)) < 1e-12);
    const [r2] = panAmounts(100, 0, d, fov, h);
    assert.ok(r2 < 0, 'fingers moving right: the camera moves left, the scene follows the fingers');
});
