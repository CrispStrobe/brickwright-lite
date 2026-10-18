// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Robot Lab's camera navigation (lib/bw-sim/view/camera-nav.js), shared by the
// Simulate and Build views: which keys move the camera and how, the mouse-button
// set-up of three's OrbitControls, and where a named view puts the camera. The
// camera is a real three.js camera; what is checked is geometry (distance kept,
// target kept or carried along, never under the floor), not numbers copied here.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MOUSE, PerspectiveCamera, Vector3} from 'three';
import {
    ORBIT_STEP, PAN_STEP_SHARE, VIEW_DIRECTIONS, ZOOM_STEP, applyCameraAction, cameraKeyAction, configureOrbitControls, framePosition
} from '../overlay/scratch-gui/src/lib/bw-sim/view/camera-nav.js';

/** A stand-in for OrbitControls: the fields the module reads, and update() counted. */
const rig = () => {
    const camera = new PerspectiveCamera(40, 1.5, 0.01, 50);
    camera.position.set(0.3, 0.25, 0.4);
    const controls = {target: new Vector3(0, 0.05, 0), maxPolarAngle: Math.PI / 2 - 0.02, minDistance: 0.05, maxDistance: 5, updates: 0,
        update () { this.updates++; }};
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    return {camera, controls};
};
const distance = ({camera, controls}) => camera.position.distanceTo(controls.target);

test('arrows orbit, Shift+arrows pan, + and - zoom; modified keys and other keys are not camera keys', () => {
    assert.deepEqual(cameraKeyAction({key: 'ArrowLeft'}), {orbit: [ORBIT_STEP, 0]});
    assert.deepEqual(cameraKeyAction({key: 'ArrowUp'}), {orbit: [-0, ORBIT_STEP]});
    assert.deepEqual(cameraKeyAction({key: 'ArrowRight', shiftKey: true}), {pan: [PAN_STEP_SHARE, 0]});
    assert.deepEqual(cameraKeyAction({key: '+'}), {zoom: ZOOM_STEP});
    assert.deepEqual(cameraKeyAction({key: '-'}), {zoom: 1 / ZOOM_STEP});
    assert.equal(cameraKeyAction({key: 'ArrowLeft', ctrlKey: true}), null);
    assert.equal(cameraKeyAction({key: 'ArrowLeft', metaKey: true}), null);
    assert.equal(cameraKeyAction({key: 'r'}), null);
    assert.equal(cameraKeyAction({key: 'Delete'}), null);
});

test('orbiting keeps the target and the distance, turns by the step about the vertical, never under the floor', () => {
    const r = rig();
    const before = r.camera.position.clone().sub(r.controls.target);
    const d0 = distance(r);
    assert.ok(applyCameraAction(r.camera, r.controls, cameraKeyAction({key: 'ArrowLeft'}), 600));
    const after = r.camera.position.clone().sub(r.controls.target);
    assert.ok(Math.abs(distance(r) - d0) < 1e-9, 'distance kept');
    assert.deepEqual(r.controls.target.toArray(), [0, 0.05, 0], 'target kept');
    const turned = Math.atan2(after.x, after.z) - Math.atan2(before.x, before.z);
    assert.ok(Math.abs(turned - ORBIT_STEP) < 1e-9, `turned ${turned}`);
    assert.ok(r.controls.updates > 0);
    // Many steps down: the polar angle stops at maxPolarAngle (above the floor plane through the target).
    for (let i = 0; i < 40; i++) applyCameraAction(r.camera, r.controls, cameraKeyAction({key: 'ArrowDown'}), 600);
    const polar = Math.acos((r.camera.position.y - r.controls.target.y) / distance(r));
    assert.ok(polar <= r.controls.maxPolarAngle + 1e-9, `polar ${polar}`);
});

test('panning carries camera and target together, sideways to the view; zoom changes only the distance', () => {
    const r = rig();
    const offset0 = r.camera.position.clone().sub(r.controls.target);
    const target0 = r.controls.target.clone();
    applyCameraAction(r.camera, r.controls, cameraKeyAction({key: 'ArrowRight', shiftKey: true}), 600);
    const moved = r.controls.target.clone().sub(target0);
    assert.ok(moved.length() > 0, 'the target moved');
    assert.ok(r.camera.position.clone().sub(r.controls.target).distanceTo(offset0) < 1e-9, 'the camera moved with it');
    assert.ok(Math.abs(moved.dot(offset0.clone().normalize())) < 1e-9, 'sideways: no component along the view');
    const d0 = distance(r);
    applyCameraAction(r.camera, r.controls, cameraKeyAction({key: '+'}), 600);
    assert.ok(Math.abs(distance(r) - d0 * ZOOM_STEP) < 1e-9, 'zoomed in by the step');
    for (let i = 0; i < 60; i++) applyCameraAction(r.camera, r.controls, cameraKeyAction({key: '+'}), 600);
    assert.ok(distance(r) >= r.controls.minDistance - 1e-12, 'never closer than minDistance');
});

test('OrbitControls: left and middle orbit, right pans, the wheel zooms toward the pointer', () => {
    const controls = configureOrbitControls({}, MOUSE);
    assert.deepEqual(controls.mouseButtons, {LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN});
    assert.equal(controls.zoomToCursor, true);
});

test('a named view frames a sphere whole from its side', () => {
    for (const [name, direction] of Object.entries(VIEW_DIRECTIONS)) {
        const {position, distance: d} = framePosition({centre: [1, 2, 3], radius: 0.5, direction, fovDeg: 40, aspect: 1.5});
        const offset = position.map((v, i) => v - [1, 2, 3][i]);
        assert.ok(Math.abs(Math.hypot(...offset) - d) < 1e-9, name);
        // The sphere fits: its angular radius is within half the (vertical) field of view.
        assert.ok(Math.asin(0.5 / d) <= 20 * Math.PI / 180 + 1e-9, `${name} fits`);
        const n = Math.hypot(...direction);
        assert.ok(offset.every((v, i) => Math.abs(v / d - direction[i] / n) < 1e-9), `${name} looks from its side`);
    }
});
