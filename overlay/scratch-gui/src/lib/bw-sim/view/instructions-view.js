// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The pictures of the Robot Lab's building instructions: one WebGL renderer
// that draws a step the way a LEGO manual page does. The parts built in
// earlier steps are drawn in their colours, a little greyed; the parts new in
// this step in full colour, outlined in HIGHLIGHT orange with a faint glow of it; later parts
// are not drawn. A sub-assembly's step shows only that sub-assembly. The
// camera looks from one fixed direction (front-right, above: isometric-ish, as
// on every page of a manual) and frames the new parts with the model around
// them. The order comes from instructions/steps.js; the callouts and buttons
// are the pane's (components/tw-pseudocode/sim-lab-instructions.jsx).
//
// Where a new part goes: each one that slides on (the step's `moves`) flies in along that
// direction from EXPLODE_LDU away, a few times over, then rests in place; on the printed page
// and for a reader who asked for reduced motion it is drawn pulled out, with an orange arrow to
// where it goes. A new part hidden inside others (a pin in a hole) keeps its outline drawn
// faintly through them (X-ray), so the page shows which hole it went into.
//
// Reached only through bw-sim/sim-lab.js (the "bw-sim-lab" chunk), like every
// three.js view of the Robot Lab.

import {Box3, BufferGeometry, Color, ConeGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
    Quaternion, Scene, Vector2, Vector3, WebGLRenderer} from 'three';
import {partGeometry, partVisual} from './part-geometry.js';
import {PART_SURFACE, addEdgeLines, addPartLights, conditionalEdgeMaterial, edgeMaterials} from './part-style.js';
import {WebGLUnavailableError, webglAvailable} from './sim-view3d.js';
import {thumbnailCamera} from '../editor/palette.js';
import {lduToWorld} from '../contracts.js';
import {stepView} from '../instructions/steps.js';

/** Marks the instructions canvas (and, for scripts/verify-boot-payload.mjs, this module's chunk). */
export const INSTRUCTIONS_TESTID = 'bw-sim-instructions-canvas';
/** The colour new parts are outlined and lit in (the browser gate looks for its pixels). */
export const HIGHLIGHT = '#ff7a00';
/** The fixed direction the camera looks from (world, y up): front-right, above. */
export const VIEW_DIRECTION = Object.freeze([1, 0.9, 1.25]);
/** How far a built part's colour goes toward the page's grey, and the grey glow that pales its fixed (printed) colours. */
const GREY_MIX = 0.3;
const GREY = new Color('#d6dbe1');
const GREY_GLOW = 0.22;
/** How strongly a new part glows in HIGHLIGHT under its orange outline (enough to find it, not to repaint it). */
const FRESH_GLOW = 0.1;
/** How much of the whole model's extent the frame keeps around the new parts (0: only them, 1: everything). */
const CONTEXT = 0.5;
/** The page's background. */
const PAGE = '#f4f8fc';
/** How far a new part starts (or is drawn pulled out) from where it goes, along its way in (LDU: three studs). */
export const EXPLODE_LDU = 60;
/** One fly-in: the slide (ms), then the rest in place before the next; how many before it stays. */
const FLY_MS = 700;
const FLY_PERIOD_MS = 2000;
const FLY_TIMES = 3;
/** How strongly a hidden new part's outline shows through what covers it, and up to which size (box diagonal, m): pins and axles, not a motor. */
const XRAY_OPACITY = 0.4;
const XRAY_MAX_M = 0.035;

/** A placed pose (LDraw, -y up) as the world matrix of a mesh (metres, y up). */
const placeMesh = (mesh, placed) => {
    const r = placed.rotation;
    const p = lduToWorld(placed.position);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.set(r[0], -r[1], -r[2], p[0], -r[3], r[4], r[5], p[1], -r[6], r[7], r[8], p[2], 0, 0, 0, 1);
};

/**
 * The bounds the camera frames for a step: the new parts' box, grown toward the
 * box of everything on the page by CONTEXT, and never smaller than `min` metres a side.
 * Pure arithmetic on {min, max} arrays.
 */
export const stepBounds = (fresh, all, {context = CONTEXT, min = 0.06} = {}) => {
    const lo = fresh.min.map((v, i) => v + (all.min[i] - v) * context);
    const hi = fresh.max.map((v, i) => v + (all.max[i] - v) * context);
    for (let i = 0; i < 3; i++) {
        const grow = Math.max(0, min - (hi[i] - lo[i])) / 2;
        lo[i] -= grow;
        hi[i] += grow;
    }
    return {min: lo, max: hi};
};

/**
 * @param {object} options
 * @param {HTMLElement} options.container
 * @param {object} options.model PlacedModel
 * @param {{steps: object[], groups: object[]}} options.plan from instructions/steps.js buildSteps
 * @param {(path: string) => string|undefined} options.read LDraw files (fetchLDrawClosure with withConfig)
 * @param {Map} options.colors LDraw colours (parseLDConfig)
 * @returns {{canvas: HTMLCanvasElement, show: (n: number) => void, image: (n: number, width: number, height: number) => string,
 *            stats: () => object, resize: () => void, dispose: () => void}}
 */
export const createInstructionsView = ({container, model, plan, read, colors, reducedMotion = null}) => {
    if (!webglAvailable()) throw new WebGLUnavailableError('this browser gives a canvas no WebGL 2 context');
    let renderer;
    try {
        renderer = new WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
    } catch (error) {
        throw new WebGLUnavailableError(error.message);
    }
    const canvas = renderer.domElement;
    canvas.dataset.testid = INSTRUCTIONS_TESTID;
    canvas.setAttribute('role', 'img');
    Object.assign(canvas.style, {width: '100%', height: '100%', display: 'block', borderRadius: '6px'});
    container.appendChild(canvas);

    const scene = new Scene();
    scene.background = new Color(PAGE);
    addPartLights(scene);
    const camera = new PerspectiveCamera(30, 1, 0.001, 20);
    const highlightEdges = {
        edges: [new LineBasicMaterial({color: HIGHLIGHT}), new LineBasicMaterial({color: HIGHLIGHT})],
        conditional: [conditionalEdgeMaterial(HIGHLIGHT), conditionalEdgeMaterial(HIGHLIGHT)]
    };
    // A new part's outline through what covers it: drawn last, over everything, faint.
    const xrayMaterial = new LineBasicMaterial({color: HIGHLIGHT, depthTest: false, depthWrite: false, transparent: true, opacity: XRAY_OPACITY});
    const xrayOf = entry => {
        if (!entry.xray) {
            const edges = entry.mesh.children.find(c => c.userData.edgeLines === 'edges');
            if (!edges) return null;
            entry.xray = edges.clone();
            entry.xray.userData = {xray: true};
            entry.xray.material = xrayMaterial;
            entry.xray.renderOrder = 10;
            entry.mesh.add(entry.xray);
        }
        return entry.xray;
    };
    // The arrows of a pulled-out page: a line from the part to where it goes and a cone at that end.
    const arrows = new Group();
    scene.add(arrows);
    const arrowLine = new LineBasicMaterial({color: HIGHLIGHT});
    const arrowHead = new MeshBasicMaterial({color: HIGHLIGHT});
    const clearArrows = () => {
        for (const child of [...arrows.children]) {
            arrows.remove(child);
            child.geometry.dispose();
        }
    };
    const prefersReducedMotion = () => (reducedMotion !== null ? reducedMotion :
        typeof window !== 'undefined' && Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
    const lineSets = new Map();
    const linesFor = code => {
        if (!lineSets.has(code)) lineSets.set(code, edgeMaterials(code, colors));
        return lineSets.get(code);
    };
    /** id → {mesh, faces, base: Color, lines: {edges, conditional}} */
    const parts = new Map();
    for (const placed of model.parts) {
        let geometry;
        try {
            geometry = partGeometry(placed.part, read, colors);
        } catch {
            continue; // a part whose files are missing is left out of the pictures, not out of the steps
        }
        const code = placed.color ?? 16;
        const info = colors.get(code) || colors.get(16);
        const base = new Color(info ? info.value : '#cccccc');
        const faces = [
            new MeshStandardMaterial({color: base.clone(), ...PART_SURFACE}),
            new MeshStandardMaterial({color: '#ffffff', ...PART_SURFACE, vertexColors: true})
        ];
        const mesh = new Mesh(geometry, faces);
        mesh.name = placed.id;
        placeMesh(mesh, placed);
        const lines = linesFor(code);
        addEdgeLines(mesh, partVisual(placed.part, read, colors), lines);
        mesh.visible = false;
        scene.add(mesh);
        geometry.computeBoundingBox();
        parts.set(placed.id, {mesh, faces, base, lines, placed, xray: null, size: geometry.boundingBox.getSize(new Vector3()).length()});
    }
    scene.updateMatrixWorld(true);

    let current = -1;
    let shown = {built: 0, fresh: 0, moved: 0, exploded: false};
    /** The new parts that slide in on the page: [{entry, offset (world metres)}]. */
    let flying = [];
    let flight = null;
    /** Draws the flying parts `k` of the way home (0: pulled out, 1: in place). */
    const flyTo = k => {
        for (const {entry, offset} of flying) {
            placeMesh(entry.mesh, entry.placed);
            entry.mesh.matrix.elements[12] += offset[0] * (1 - k);
            entry.mesh.matrix.elements[13] += offset[1] * (1 - k);
            entry.mesh.matrix.elements[14] += offset[2] * (1 - k);
            entry.mesh.matrixWorldNeedsUpdate = true;
        }
    };
    const stopFlight = () => {
        if (flight !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(flight);
        flight = null;
    };
    /** The fly-in: FLY_TIMES slides (ease out), each followed by a rest in place; then the page stays put. */
    const fly = () => {
        stopFlight();
        if (!flying.length || typeof requestAnimationFrame !== 'function') return;
        const start = performance.now();
        const frame = now => {
            const t = now - start;
            const done = t >= FLY_PERIOD_MS * FLY_TIMES;
            const phase = done ? FLY_MS : t % FLY_PERIOD_MS;
            const k = Math.min(1, phase / FLY_MS);
            flyTo(1 - (1 - k) ** 3);
            renderer.render(scene, camera);
            flight = done ? null : requestAnimationFrame(frame);
        };
        flight = requestAnimationFrame(frame);
    };
    const boxOf = ids => {
        const box = new Box3();
        for (const id of ids) {
            const entry = parts.get(id);
            if (entry) box.expandByObject(entry.mesh);
        }
        return box;
    };

    /**
     * Puts step `n` on the page: built greyed, new highlighted, the rest hidden; frames the camera.
     * `exploded`: the new parts drawn pulled out with arrows (the printed page, reduced motion); else they fly in.
     */
    const show = (n, {exploded = prefersReducedMotion(), animate = true} = {}) => {
        stopFlight();
        const {built, fresh} = stepView(plan, n);
        const moves = (plan.steps[n] && plan.steps[n].moves) || {};
        const builtSet = new Set(built);
        const freshSet = new Set(fresh);
        for (const [id, entry] of parts) {
            const isFresh = freshSet.has(id);
            entry.mesh.visible = isFresh || builtSet.has(id);
            entry.faces[0].color.copy(entry.base);
            if (!isFresh) entry.faces[0].color.lerp(GREY, GREY_MIX);
            for (const m of entry.faces) {
                m.emissive.set(isFresh ? HIGHLIGHT : GREY);
                m.emissiveIntensity = isFresh ? FRESH_GLOW : GREY_GLOW;
            }
            for (const child of entry.mesh.children) {
                const kind = child.userData.edgeLines;
                if (kind) child.material = (isFresh ? highlightEdges : entry.lines)[kind];
            }
            placeMesh(entry.mesh, entry.placed);
            const small = isFresh && entry.size < XRAY_MAX_M;
            const xray = small ? xrayOf(entry) : entry.xray;
            if (xray) xray.visible = small;
        }
        // The new parts' way in (LDU frame → world: x, −y, −z), EXPLODE_LDU long.
        flying = fresh.filter(id => parts.has(id) && moves[id]).map(id => ({
            entry: parts.get(id), offset: lduToWorld(moves[id].map(v => v * EXPLODE_LDU))
        }));
        scene.updateMatrixWorld(true);
        const freshBox = boxOf(fresh);
        // The frame holds the new parts where they go and where they start.
        if (flying.length) {
            flyTo(0);
            scene.updateMatrixWorld(true);
            freshBox.union(boxOf(flying.map(f => f.entry.mesh.name)));
        }
        const allBox = boxOf([...built, ...fresh]).union(freshBox);
        if (!freshBox.isEmpty()) {
            const size = renderer.getSize(new Vector2());
            const aspect = size.x / Math.max(1, size.y);
            // The step's corner (instructions/steps.js stepCorner, LDU frame [sx, sz]) as a world direction: x, up, −z.
            const corner = (plan.steps[n] && plan.steps[n].view) || [1, -1];
            const direction = [VIEW_DIRECTION[0] * corner[0], VIEW_DIRECTION[1], -VIEW_DIRECTION[2] * corner[1]];
            const view = thumbnailCamera(stepBounds({min: freshBox.min.toArray(), max: freshBox.max.toArray()},
                {min: allBox.min.toArray(), max: allBox.max.toArray()}), {fov: camera.fov, aspect, direction, margin: 1.15});
            camera.position.fromArray(view.position);
            camera.up.fromArray(view.up);
            camera.lookAt(...view.target);
            camera.near = view.near;
            camera.far = view.far;
            camera.aspect = aspect;
            camera.updateProjectionMatrix();
        }
        current = n;
        shown = {built: built.filter(id => parts.has(id)).length, fresh: fresh.filter(id => parts.has(id)).length,
            moved: flying.length, exploded: Boolean(exploded && flying.length)};
        clearArrows();
        if (exploded) {
            // Pulled out, each with its arrow home: from the face of its box that leads the way to where that face goes.
            flyTo(0);
            scene.updateMatrixWorld(true);
            for (const {entry, offset} of flying) {
                const box = new Box3().setFromObject(entry.mesh);
                const way = new Vector3(...offset).negate();
                const half = box.getSize(new Vector3()).multiplyScalar(0.5);
                const lead = way.clone().normalize();
                const from = box.getCenter(new Vector3()).addScaledVector(lead,
                    Math.abs(lead.x) * half.x + Math.abs(lead.y) * half.y + Math.abs(lead.z) * half.z);
                const to = from.clone().add(way);
                const length = way.length();
                const tip = Math.min(0.006, length * 0.3);
                const dir = way.clone().normalize();
                const end = to.clone().addScaledVector(dir, -tip);
                arrows.add(new Line(new BufferGeometry().setFromPoints([from, end]), arrowLine));
                const head = new Mesh(new ConeGeometry(tip * 0.45, tip, 12), arrowHead);
                head.position.copy(end).addScaledVector(dir, tip / 2);
                head.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
                arrows.add(head);
            }
        } else {
            flyTo(1);
        }
        scene.updateMatrixWorld(true);
        renderer.render(scene, camera);
        if (!exploded && animate) fly();
    };

    const resize = () => {
        const width = Math.max(1, container.clientWidth || 0);
        const height = Math.max(1, container.clientHeight || Math.round(width * 0.7));
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const size = renderer.getSize(new Vector2());
        if (size.x !== width || size.y !== height) {
            renderer.setSize(width, height, false);
            if (current >= 0) show(current, {animate: false});
        }
    };

    /** Step `n` drawn at width × height pixels, as a PNG data URL (for the print page); the page on show stays. */
    const image = (n, width, height) => {
        const before = current;
        const size = renderer.getSize(new Vector2());
        const ratio = renderer.getPixelRatio();
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        show(n, {exploded: true, animate: false});
        const url = canvas.toDataURL('image/png');
        renderer.setPixelRatio(ratio);
        renderer.setSize(size.x, size.y, false);
        if (before >= 0) show(before, {animate: false});
        return url;
    };

    const dispose = () => {
        stopFlight();
        clearArrows();
        for (const m of [xrayMaterial, arrowLine, arrowHead]) m.dispose();
        for (const entry of parts.values()) for (const m of entry.faces) m.dispose();
        for (const set of [highlightEdges, ...lineSets.values()]) for (const m of [...set.edges, ...set.conditional]) m.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
    };

    resize();
    return {canvas, show, image, resize, dispose,
        /** What the page shows (for the browser gate): the step and how many parts are built and new. */
        stats: () => ({step: current, ...shown, camera: camera.position.toArray(), target: new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).toArray()})};
};
