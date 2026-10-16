// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab's 3D view: a WebGL renderer, an orbit camera and the scene graph
// from sim-scene3d.js, moved by the physics snapshot. Built like the arena's
// view (lib/spike-arena/arena-view3d.js) and reached the same way, only through
// the pane's dynamic import of bw-sim/sim-lab.js (chunk "bw-sim-lab").

import {AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Vector2, Vector3, WebGLRenderer} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {parseLDConfig} from './ldraw-colors.js';
import {buildSimScene, applySnapshot} from './sim-scene3d.js';

export class WebGLUnavailableError extends Error {
    constructor (reason) {
        super(`WebGL is not available: ${reason}`);
        this.name = 'WebGLUnavailableError';
        this.code = 'no-webgl';
    }
}

/** WebGL 2 or nothing (three.js dropped WebGL 1 in r163). window.__bwSimLabForceNoWebGL forces the fallback. */
export const webglAvailable = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (window.__bwSimLabForceNoWebGL) return false;
    try {
        return Boolean(document.createElement('canvas').getContext('webgl2'));
    } catch {
        return false;
    }
};

/** Camera framing: look at the model's centre from the front-right, above, at a distance that fits it. */
export const frameModel = (box, aspect, fovDeg = 40) => {
    const centre = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const radius = Math.max(0.05, size.length() / 2);
    const distance = radius / Math.sin((fovDeg * Math.PI / 180) / 2) * (aspect < 1 ? 1.4 : 1.1);
    const direction = new Vector3(1, 0.8, 1.2).normalize();
    return {position: centre.clone().add(direction.multiplyScalar(distance)), target: centre};
};

/**
 * @param {object} options
 * @param {HTMLElement} options.container
 * @param {object} options.model the PlacedModel
 * @param {object} options.mechanism its CompiledMechanism
 * @param {(path: string) => string|undefined} options.read LDraw files (fetchLDrawClosure with withConfig)
 * @param {function} [options.onContextLost]
 * @returns {{canvas, render(snapshot), resize(), resetCamera(), dispose()}}
 */
export const createSimView3D = ({container, model, mechanism, read, onContextLost = null}) => {
    if (!webglAvailable()) throw new WebGLUnavailableError('this browser gives a canvas no WebGL 2 context');
    const config = read('ldconfig.ldr');
    if (!config) throw new Error('LDConfig.ldr (the LDraw colour table) is missing');
    let renderer;
    try {
        renderer = new WebGLRenderer({antialias: true});
    } catch (error) {
        throw new WebGLUnavailableError(error.message);
    }
    const canvas = renderer.domElement;
    canvas.dataset.testid = 'bw-sim-lab-3d-canvas';
    canvas.setAttribute('role', 'img');
    Object.assign(canvas.style, {width: '100%', height: '100%', display: 'block', borderRadius: '6px', touchAction: 'none'});
    container.appendChild(canvas);

    const built = buildSimScene({model, mechanism, read, colors: parseLDConfig(config)});
    // The scene builder owns the model; the view adds light only when the builder brought none.
    if (!built.scene.children.some(c => c.isLight)) {
        built.scene.add(new AmbientLight(0xffffff, 0.6));
        const sun = new DirectionalLight(0xffffff, 1.2);
        sun.position.set(0.5, 1, 0.8);
        built.scene.add(sun);
    }
    const camera = new PerspectiveCamera(40, 1, 0.005, 50);
    const controls = new OrbitControls(camera, canvas);
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // never under the floor
    controls.minDistance = 0.05;
    controls.maxDistance = 5;

    const modelBox = () => {
        const box = new Box3();
        for (const mesh of built.partMeshes.values()) box.expandByObject(mesh);
        return box;
    };
    const resetCamera = () => {
        const size = renderer.getSize(new Vector2());
        const {position, target} = frameModel(modelBox(), size.x / Math.max(1, size.y));
        camera.position.copy(position);
        controls.target.copy(target);
        controls.update();
    };

    const onLost = event => {
        event.preventDefault();
        if (onContextLost) onContextLost();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    const resize = () => {
        const width = Math.max(1, container.clientWidth || 0);
        const height = Math.max(1, container.clientHeight || Math.round(width * 0.6));
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const size = renderer.getSize(new Vector2());
        if (size.x !== width || size.y !== height) {
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        }
    };

    const render = snapshot => {
        resize();
        if (snapshot) applySnapshot(built, snapshot);
        renderer.render(built.scene, camera);
    };

    const dispose = () => {
        canvas.removeEventListener('webglcontextlost', onLost);
        controls.dispose();
        built.dispose();
        renderer.dispose();
        canvas.remove();
    };

    resize();
    resetCamera();
    return {canvas, render, resize, resetCamera, dispose};
};
