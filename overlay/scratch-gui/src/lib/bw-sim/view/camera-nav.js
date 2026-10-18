// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// One camera navigation for both Robot Lab views (Simulate: sim-view3d.js, Build:
// editor/editor-view3d.js), so the 3D view moves the same way in either mode:
//
//   left-drag on empty space, middle-drag   orbit about the target
//   right-drag, Shift+drag (Simulate)        pan (slide the view)
//   wheel                                    zoom toward the pointer
//   one finger / two fingers                 orbit / pinch-zoom and pan
//   arrow keys (3D view focused)             orbit in 15° steps
//   Shift+arrow keys                         pan by a tenth of the view
//   + / -                                    zoom in / out
//   Home / Fit / Top / Front / Side          the pane's view buttons
//
// In Build a press on a part, or on the gizmo, belongs to the part (editor-view3d.js
// decides first); Shift+drag there draws a selection box, so Build pans with the
// right button (or Shift+arrows, or two fingers). The arithmetic here has no DOM
// and no three.js (test/bw-sim-camera-nav.test.mjs); the views apply it.

import {orbitOffset, panAmounts} from '../editor/touch-gestures.js';

/** How far one arrow key turns the view (radians). */
export const ORBIT_STEP = Math.PI / 12;
/** How far one Shift+arrow slides the view: this share of the view's height. */
export const PAN_STEP_SHARE = 0.1;
/** One + or - zooms by this factor of the distance. */
export const ZOOM_STEP = 0.8;

/** Where each named view looks from (a direction from the target, y up). */
export const VIEW_DIRECTIONS = {
    home: [1, 0.8, 1.2],
    top: [0, 1, 0.0001],
    front: [0, 0.0001, 1],
    side: [1, 0.0001, 0]
};

/**
 * three's OrbitControls set up the Robot Lab way (both views): left orbits, the
 * middle button orbits too, the right button pans, the wheel zooms toward the
 * pointer. `MOUSE` is three's enum (passed in, so this module needs no three).
 */
export const configureOrbitControls = (controls, MOUSE) => {
    controls.mouseButtons = {LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN};
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    controls.enableDamping = false;
    return controls;
};

/**
 * What a key on a focused 3D view does to the camera, or null when it is not a
 * camera key. Ctrl/Cmd/Alt combinations are never camera keys.
 * @returns {{orbit: [number, number]}|{pan: [number, number]}|{zoom: number}|null}
 *   orbit: radians about the vertical and from it; pan: share of the view's height, right and up; zoom: distance factor
 */
export const cameraKeyAction = ({key, shiftKey = false, ctrlKey = false, metaKey = false, altKey = false}) => {
    if (ctrlKey || metaKey || altKey) return null;
    const arrows = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1]};
    const arrow = arrows[key];
    if (arrow) {
        // Shift slides the view the way the arrow points; plain arrows turn the model that way.
        if (shiftKey) return {pan: [arrow[0] * PAN_STEP_SHARE, arrow[1] * PAN_STEP_SHARE]};
        return {orbit: [-arrow[0] * ORBIT_STEP, arrow[1] * ORBIT_STEP]};
    }
    if (key === '+' || key === '=') return {zoom: ZOOM_STEP};
    if (key === '-' || key === '_') return {zoom: 1 / ZOOM_STEP};
    return null;
};

/**
 * Moves the camera as `action` says (cameraKeyAction's result). The camera keeps
 * looking at the controls' target; orbiting never goes under the floor.
 * @param {object} camera a three PerspectiveCamera
 * @param {object} controls three OrbitControls (its target, min/max distance and polar angle)
 * @param {object} action
 * @param {number} heightPx the view's height in CSS pixels
 * @returns {boolean} whether the camera moved
 */
export const applyCameraAction = (camera, controls, action, heightPx) => {
    if (!action) return false;
    const target = controls.target;
    const offset = [camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z];
    const distance = Math.hypot(...offset);
    if (action.orbit) {
        const maxPolar = Number.isFinite(controls.maxPolarAngle) ? controls.maxPolarAngle : Math.PI / 2;
        const next = orbitOffset(offset, action.orbit[0], -action.orbit[1], {maxPolar});
        camera.position.set(target.x + next[0], target.y + next[1], target.z + next[2]);
    } else if (action.pan) {
        const px = Math.max(1, heightPx);
        const [right, up] = panAmounts(-action.pan[0] * px, action.pan[1] * px, distance, camera.fov, px);
        camera.updateMatrix();
        const m = camera.matrix.elements; // columns 0 and 1: the camera's right and up, in world space
        const shift = [m[0] * right + m[4] * up, m[1] * right + m[5] * up, m[2] * right + m[6] * up];
        camera.position.set(camera.position.x + shift[0], camera.position.y + shift[1], camera.position.z + shift[2]);
        target.set(target.x + shift[0], target.y + shift[1], target.z + shift[2]);
    } else if (action.zoom) {
        const min = Number.isFinite(controls.minDistance) ? controls.minDistance : 0;
        const max = Number.isFinite(controls.maxDistance) ? controls.maxDistance : Infinity;
        const wanted = Math.min(max, Math.max(min, distance * action.zoom));
        const k = distance ? wanted / distance : 1;
        camera.position.set(target.x + offset[0] * k, target.y + offset[1] * k, target.z + offset[2] * k);
    } else {
        return false;
    }
    camera.lookAt(target);
    controls.update();
    return true;
};

/**
 * Where the camera stands to show a sphere (centre, radius) whole from `direction`.
 * @returns {{position: number[], distance: number}}
 */
export const framePosition = ({centre, radius, direction, fovDeg, aspect, margin = 1.15}) => {
    const vHalf = fovDeg * Math.PI / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * Math.max(1e-3, aspect));
    const distance = Math.max(0.02, radius) / Math.sin(Math.min(vHalf, hHalf)) * margin;
    const n = Math.hypot(...direction) || 1;
    return {position: centre.map((c, i) => c + direction[i] / n * distance), distance};
};
