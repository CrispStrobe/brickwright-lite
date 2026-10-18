// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab's 3D view: a WebGL renderer, an orbit camera and the scene graph
// from sim-scene3d.js, moved by the physics snapshot. Built like the arena's
// view (lib/spike-arena/arena-view3d.js) and reached the same way, only through
// the pane's dynamic import of bw-sim/sim-lab.js (chunk "bw-sim-lab").

import {Box3, Color, GridHelper, PerspectiveCamera, Vector2, Vector3, WebGLRenderer} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {parseLDConfig} from './ldraw-colors.js';
import {buildSimScene, applySnapshot} from './sim-scene3d.js';
import {addPartLights} from './part-style.js';
import {createInsightLayer, createPulse, tintMaterial} from './insight-layer.js';

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
 * @param {Map<string, object>} [options.catalog] the part catalog; with it a motor's drive hub turns with its output
 * @param {function} [options.onContextLost]
 * @returns {{canvas, render(snapshot), resize(), resetCamera(), dispose()}}
 */
export const createSimView3D = ({container, model, mechanism, read, catalog = null, onContextLost = null}) => {
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
    // touch-action none: one finger orbits, two pinch and pan (OrbitControls), the page does not scroll or zoom instead.
    Object.assign(canvas.style, {width: '100%', height: '100%', display: 'block', borderRadius: '6px', touchAction: 'none',
        userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none'});
    container.appendChild(canvas);

    const built = buildSimScene({model, mechanism, read, colors: parseLDConfig(config), catalog});
    // The scene builder owns the model; the view adds light only when the builder brought none.
    if (!built.scene.children.some(c => c.isLight)) addPartLights(built.scene);
    // A light sky and a 1 cm grid on the floor (10 cm major lines): without them a
    // driving robot on a plain floor shows no motion at all.
    built.scene.background = new Color(0xe8eef5);
    let grid = null;
    if (built.ground) {
        const floorY = new Box3().setFromObject(built.ground).max.y;
        grid = new GridHelper(4, 40, 0x64748b, 0xcbd5e1);
        grid.position.y = floorY + 0.001; // above the floor mesh, so depth testing shows it
        built.scene.add(grid);
    }
    const camera = new PerspectiveCamera(40, 1, 0.005, 50);
    const controls = new OrbitControls(camera, canvas);
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // never under the floor
    controls.minDistance = 0.05;
    controls.maxDistance = 5;

    const modelBox = () => {
        const box = new Box3();
        for (const mesh of [...built.partMeshes.values(), ...built.hubMeshes.values()]) box.expandByObject(mesh);
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

    // Follow: the camera and its orbit target move with the model's centre, so
    // the robot stays in view while the learner can still orbit around it.
    let followed = null;
    // ---- seeing the model (mech/insight.js data, view/insight-layer.js) -------------
    const insight = createInsightLayer({container, scene: built.scene});
    const pulse = createPulse();
    const bodyStart = new Map(mechanism.bodies.map(b => [b.id, new Vector3(...b.position)]));
    /** An anchor on a body: a world point at t = 0, carried along by the body's pose now. */
    const onBody = (bodyId, world) => {
        const group = built.bodyGroups.get(bodyId);
        if (!group || !world) return () => null;
        // Bodies start at their origin with no rotation, so the local point is an offset.
        const local = new Vector3(...world).sub(bodyStart.get(bodyId));
        return () => group.localToWorld(local.clone());
    };
    const partCentre = id => {
        const mesh = built.partMeshes.get(id);
        if (!mesh) return () => null;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const local = mesh.geometry.boundingBox.getCenter(new Vector3());
        return () => mesh.localToWorld(local.clone());
    };
    const allMeshes = () => [...built.partMeshes.values(), ...built.hubMeshes.values()];
    let tints = null;
    const paintTints = () => {
        const on = tints && insight.shown.motion;
        for (const mesh of allMeshes()) {
            const tint = on ? tints.get(mesh.parent && mesh.parent.name) : null;
            for (const m of [].concat(mesh.material)) tintMaterial(m, tint || null);
        }
    };
    /** Port badges: items {id, port, label} (motors and sensors). */
    const setPorts = items => insight.setPorts(items.map(item => ({...item, anchor: partCentre(item.id)})));
    /** Hinge axes, gear pairs and body tints from insightOf(runModel, mechanism, …). */
    const setMotion = ({joints = [], gears = [], tints: bodyTintMap = null} = {}) => {
        insight.setMotion({
            axes: joints.filter(j => j.type === 'hinge').map(j => ({motor: j.motor, from: onBody(j.body1, j.from), to: onBody(j.body1, j.to)})),
            balls: joints.filter(j => j.type === 'ball').map(j => ({at: onBody(j.body1, j.point)})),
            gears: gears.map(g => ({text: g.text, from: onBody(g.bodies[0], g.from), to: onBody(g.bodies[1], g.to)}))
        });
        tints = bodyTintMap;
        paintTints();
    };
    const setOverlay = shown => {
        insight.setVisible(shown);
        paintTints();
    };
    /** Pulse these parts for `ms` (a motor's drive hub too). */
    const highlight = (ids, ms = 3000) => {
        const want = new Set(ids);
        const meshes = allMeshes().filter(m => want.has(m.name.replace(/#hub$/, '')));
        pulse.start(meshes, ms, performance.now());
        return meshes.length;
    };

    const render = snapshot => {
        resize();
        if (snapshot) applySnapshot(built, snapshot);
        const centre = modelBox().getCenter(new Vector3());
        if (followed) {
            const delta = centre.clone().sub(followed);
            delta.y = 0;
            camera.position.add(delta);
            controls.target.add(delta);
            controls.update();
        }
        followed = centre;
        pulse.tick(performance.now());
        built.scene.updateMatrixWorld();
        camera.updateMatrixWorld();
        const size = renderer.getSize(new Vector2());
        insight.update(camera, size.x, size.y);
        renderer.render(built.scene, camera);
    };

    const dispose = () => {
        insight.dispose();
        if (grid) {
            grid.geometry.dispose();
            grid.material.dispose();
        }
        canvas.removeEventListener('webglcontextlost', onLost);
        controls.dispose();
        built.dispose();
        renderer.dispose();
        canvas.remove();
    };

    resize();
    resetCamera();
    const recentre = () => {
        followed = null;
        resetCamera();
    };
    return {canvas, render, resize, resetCamera: recentre, dispose, setPorts, setMotion, setOverlay, highlight,
        /** The camera now (for the browser gate to read what a gesture did): position, target, distance (metres). */
        get camera () {
            return {position: camera.position.toArray(), target: controls.target.toArray(), distance: camera.position.distanceTo(controls.target)};
        },
        /** What the last frame cost: three's draw calls and triangles, GPU objects, and the instancing (scale gate). */
        renderStats: () => ({calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, lines: renderer.info.render.lines,
            geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? null,
            parts: model.parts.length, instanced: built.instanced ? built.instanced.stats() : null}),
        /** What the overlay shows now, plus the parts pulsing (for the browser gate). */
        overlayStats: () => ({...insight.stats(), pulsing: pulse.count,
            tinted: allMeshes().filter(m => [].concat(m.material).some(x => x.userData.baseColor && !x.color.equals(x.userData.baseColor))).length})};
};
