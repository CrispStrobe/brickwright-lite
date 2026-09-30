// SPDX-License-Identifier: BSD-3-Clause
// The SPIKE arena's 3D view: a WebGL renderer, three cameras and the scene
// graph from arena-scene3d.js, drawing the SAME snapshot as the 2D canvas.
//
// Reached only through the pane's dynamic import (webpackChunkName
// "bw-arena-3d"), so three.js is downloaded when a learner first opens the 3D
// view and never before (scripts/verify-boot-payload.mjs holds that).
// Without WebGL it throws WebGLUnavailableError before touching the page, and
// the pane stays on the 2D view with a message (docs/SPIKE-ARENA.md, "The 3D
// view").

import {Vector2, WebGLRenderer} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {drawMat} from './arena-render.js';
import {CAMERA_MODES, buildArenaScene, followPose, orbitStart, perspectiveCamera, topDownCamera} from './arena-scene3d.js';

export {CAMERA_MODES};

export class WebGLUnavailableError extends Error {
    constructor (reason) {
        super(`WebGL is not available: ${reason}`);
        this.name = 'WebGLUnavailableError';
        this.code = 'no-webgl';
    }
}

/**
 * Whether this browser can give a canvas a WebGL 2 context (three.js dropped
 * WebGL 1 in r163, so a WebGL 1 browser falls back too). A page may set
 * window.__bwArenaForceNoWebGL to take the fallback path on purpose (the
 * browser gate does, so both paths are asserted on every run).
 */
export const webglAvailable = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (window.__bwArenaForceNoWebGL) return false;
    try {
        const probe = document.createElement('canvas');
        return Boolean(probe.getContext('webgl2'));
    } catch {
        return false;
    }
};

/** The mat, drawn by the 2D view's own drawMat, as a texture source. */
const matCanvas = world => {
    const canvas = document.createElement('canvas');
    const scale = Math.max(2, Math.min(10, 2048 / Math.max(world.mat.width, world.mat.height)));
    canvas.width = Math.round(world.mat.width * scale);
    canvas.height = Math.round(world.mat.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.save();
    drawMat(ctx, world, scale);
    ctx.restore();
    return canvas;
};

/**
 * @param {object} options
 * @param {HTMLElement} options.container the element the canvas goes into
 * @param {object} options.world the challenge
 * @param {object} options.robot the driving base (bridge.robot)
 * @param {string} [options.mode] 'orbit', 'follow' or 'top'
 * @param {function} [options.onContextLost] called if the GPU drops the context
 * @returns {{canvas, render(snapshot), setMode(mode), resize(), dispose()}}
 */
export const createArenaView3D = ({container, world, robot, mode = 'orbit', onContextLost = null}) => {
    if (!webglAvailable()) throw new WebGLUnavailableError('this browser gives a canvas no WebGL 2 context');
    let renderer;
    try {
        renderer = new WebGLRenderer({antialias: true});
    } catch (error) {
        throw new WebGLUnavailableError(error.message);
    }
    const canvas = renderer.domElement;
    canvas.dataset.testid = 'bw-spike-arena-3d-canvas';
    canvas.setAttribute('role', 'img');
    Object.assign(canvas.style, {width: '100%', display: 'block', borderRadius: '6px', touchAction: 'none'});
    container.appendChild(canvas);

    const built = buildArenaScene(world, robot, {matCanvas: matCanvas(world)});
    const aspect = world.mat.width / world.mat.height;
    const perspective = perspectiveCamera(aspect);
    const start = orbitStart(world);
    perspective.position.copy(start.position);
    const controls = new OrbitControls(perspective, canvas);
    controls.target.copy(start.target);
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // never under the mat
    controls.minDistance = 0.15;
    controls.maxDistance = 8;
    controls.update();
    const top = topDownCamera(world, aspect);
    let current = CAMERA_MODES.includes(mode) ? mode : 'orbit';
    let lastSnapshot = null;

    const onLost = event => {
        event.preventDefault();
        if (onContextLost) onContextLost();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const resize = () => {
        const width = Math.max(1, container.clientWidth || 0);
        // The mat's own aspect, as the 2D canvas: the pane does not jump when the view toggles.
        const height = Math.round(width / aspect);
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const size = renderer.getSize(new Vector2());
        if (size.x !== width || size.y !== height) {
            renderer.setSize(width, height, false);
            canvas.style.height = `${height}px`;
        }
    };

    const setMode = next => {
        if (!CAMERA_MODES.includes(next)) return;
        if (next === 'orbit' && current !== 'orbit') {
            perspective.position.copy(start.position);
            controls.target.copy(start.target);
            controls.update();
        }
        current = next;
        controls.enabled = current === 'orbit';
        if (lastSnapshot) render(lastSnapshot);
    };

    function render (snapshot) {
        lastSnapshot = snapshot;
        resize();
        built.update(snapshot);
        let camera = perspective;
        if (current === 'top') camera = top;
        else if (current === 'follow') {
            const pose = followPose(snapshot);
            perspective.position.copy(pose.position);
            perspective.lookAt(pose.target);
        }
        renderer.render(built.scene, camera);
    }

    const dispose = () => {
        canvas.removeEventListener('webglcontextlost', onLost);
        controls.dispose();
        built.dispose();
        renderer.dispose();
        canvas.remove();
    };

    controls.enabled = current === 'orbit';
    resize();
    return {canvas, render, setMode, resize, dispose, get mode () { return current; }};
};
