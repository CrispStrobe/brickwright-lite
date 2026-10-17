// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab's build view (docs/SIM-LAB-PLAN.md C3/C5): a small CAD editor
// for children, modelled on Tinkercad and BrickLink Studio. The first version
// only had "pick from the palette, click to place": a placed part could land
// inside the robot, the placing tool stayed armed so a click on a part placed
// another one instead of selecting it, and a placed part could not be moved.
// This version is the interaction core of a real editor:
//
//   click a part          select it (a grouped part selects its whole group)
//   Shift+click           add / remove a part;   click on empty space: clear
//   Shift+drag on empty   box-select
//   drag a part           slide it on the surface under the pointer (floor or
//                         the top of another part), grid-snapped
//   gizmo arrows/planes   move along world axes (W);  rings: turn (E),
//                         90° steps, 15° while Shift is held
//   R / Shift+R           turn 90° about the vertical (about the connection's
//                         axis when the part sits on a pin or an axle)
//   T / Shift+T           tip 90° about the horizontal axis facing the camera
//   magnet                a lone part moved near a matching hole or axle shows
//                         a green ghost and snaps there on release (Alt: off)
//   Delete, Ctrl+D, Ctrl+C/V, Ctrl+A, Esc, Ctrl+Z / Ctrl+Y (Shift+Ctrl+Z), F
//   camera                left-drag on empty space or right-drag: orbit;
//                         middle-drag or Shift+right-drag: pan; wheel: zoom
//                         toward the pointer
//
// Every change goes through the editor's command stack (editor-state.js); a
// change to several parts is one `moveMany` / `batch` command, so one Ctrl+Z
// undoes it. The arithmetic (grid, exact rotations, pivots, groups) is pure and
// tested in transform-math.js; this module is the mouse, the keys and three.js.
//
// Frames: the model is LDraw (LDU, -y up); the scene is metres, +y up, via the
// contract's lduToWorld — a 180° turn about x, so a placed rotation R becomes
// F·R·F with F = diag(1, -1, -1).

import {
    AmbientLight, Box3, Color, DirectionalLight, EdgesGeometry, GridHelper, Group, LineBasicMaterial, LineSegments,
    Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, MOUSE, Object3D, PerspectiveCamera, Plane, Raycaster, Scene,
    Sphere, SphereGeometry, Vector2, Vector3, WebGLRenderer
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {LDU_M, lduToWorld} from '../contracts.js';
import {partGeometry} from '../view/part-geometry.js';
import {snapCandidates, rotateAboutSnap} from './snap.js';
import {
    DEFAULT_GRID, GRID_STEPS, HOLE_PITCH, IDENTITY, cleanRotation, expandToGroups, facingAxis, mul3, mulVec3,
    placeCopies, rotatePoses, selectionPivot, snapDelta, translatePoses, worldAxisRotation
} from './transform-math.js';

/** Default LDraw colour of a newly placed part (Light Bluish Grey). */
export const DEFAULT_COLOR = 71;
/**
 * How close (LDU) a moved part's connector must come to a matching one for the
 * magnet to pull it in: a bit over a hole pitch, so a pin slid onto a beam's top
 * (its centre 30 LDU above the hole's) still finds the hole under it.
 */
export const MAGNET_RADIUS = 32;
/** Pointer travel (px) below which a press is a click, not a drag. */
const CLICK_PX = 4;
const QUARTER = Math.PI / 2;

/** A placed pose (LDraw) as a world Matrix4. */
export const worldMatrix = (position, rotation) => {
    const f = [rotation[0], -rotation[1], -rotation[2], -rotation[3], rotation[4], rotation[5], -rotation[6], rotation[7], rotation[8]];
    const p = lduToWorld(position);
    return new Matrix4().set(f[0], f[1], f[2], p[0], f[3], f[4], f[5], p[1], f[6], f[7], f[8], p[2], 0, 0, 0, 1);
};

/** A world point (metres, y up) in LDraw units. */
export const worldToLdu = v => [v.x / LDU_M, (0 - v.y) / LDU_M, (0 - v.z) / LDU_M];
/** A world displacement (metres) in LDraw units. */
const worldDeltaToLdu = worldToLdu;
const tidy = v => (Object.is(v, -0) ? 0 : v);

/** Copied parts survive switching modes (module scope, like a real clipboard). */
let clipboard = [];

/**
 * @param {object} options
 * @param {HTMLElement} options.container
 * @param {Function} options.read LDraw file reader
 * @param {Map} options.colors LDraw colours
 * @param {Map} options.catalog part metadata
 * @param {object} options.editor editor-state.js editor
 * @param {(ids: string[]) => void} [options.onSelect] selection changed
 * @param {(model: object, info: object) => void} [options.onChange] model changed
 * @param {(status: {kind: string}) => void} [options.onStatus] what is happening / will happen
 * @param {(part: string|null) => void} [options.onTool] the placing tool started or ended
 * @param {(mode: 'move'|'rotate') => void} [options.onMode] gizmo mode changed
 */
export const createEditorView3D = ({container, read, colors, catalog, editor,
    onSelect = () => {}, onChange = () => {}, onStatus = () => {}, onTool = () => {}, onMode = () => {}}) => {
    const renderer = new WebGLRenderer({antialias: true});
    const canvas = renderer.domElement;
    canvas.dataset.testid = 'bw-sim-lab-editor-canvas';
    canvas.tabIndex = 0;
    Object.assign(canvas.style, {width: '100%', height: '100%', display: 'block', borderRadius: '6px', touchAction: 'none', outline: 'none'});
    container.appendChild(canvas);
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));

    const stage = new Group();
    const modelGroup = new Group();
    const outlineGroup = new Group();
    const ghostGroup = new Group();
    stage.add(modelGroup, outlineGroup, ghostGroup);
    const s = new Scene();
    s.background = new Color(0xe8eef5);
    s.add(stage);
    s.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(0.5, 1, 0.8);
    s.add(sun);
    const grid = new GridHelper(2, 50, 0x64748b, 0xcbd5e1);
    s.add(grid);
    const floor = new Plane(new Vector3(0, 1, 0), 0);

    const camera = new PerspectiveCamera(40, 1, 0.005, 50);
    camera.position.set(0.35, 0.3, 0.45);

    // ---- state ---------------------------------------------------------------
    const meshes = new Map(); // id → Mesh
    let selection = []; // ids
    let hovered = null;
    let mode = 'move';
    let gridStep = DEFAULT_GRID;
    let tool = null; // {part, turns}
    let candidate = null; // palette ghost: magnet candidate
    let freePose = null; // palette ghost: pose on a surface
    let floorY = null;
    let gesture = null; // what the pressed pointer is doing
    let preview = null; // {moves, candidate} while a selection is being moved
    let modifiers = {alt: false, shift: false};
    let cameraTouched = false;

    const partsById = () => new Map(editor.model.parts.map(p => [p.id, p]));
    const selectedParts = () => {
        const byId = partsById();
        return selection.map(id => byId.get(id)).filter(Boolean);
    };
    const status = info => onStatus(info);

    // ---- pointer, raycasts ---------------------------------------------------
    const pointer = new Vector2();
    const raycaster = new Raycaster();
    const ndc = event => {
        const rect = canvas.getBoundingClientRect();
        return {x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1};
    };
    const pick = event => {
        const p = ndc(event);
        pointer.set(p.x, p.y);
        // The camera may have moved since the last frame (a view button, a fit).
        camera.updateMatrixWorld();
        raycaster.setFromCamera(pointer, camera);
        return raycaster;
    };
    const partUnder = event => {
        const hits = pick(event).intersectObjects([...meshes.values()], false);
        return hits.length ? hits[0] : null;
    };
    /**
     * The surface under the pointer that a part would rest on: the top face of
     * a part (not one of `exclude`) or the floor.
     * @returns {{point: Vector3, part: string|null}|null}
     */
    const surfaceUnder = (event, exclude = []) => {
        const ray = pick(event);
        const skip = new Set(exclude);
        const hits = ray.intersectObjects([...meshes.values()].filter(m => !skip.has(m.name)), false);
        const n = new Vector3();
        for (const h of hits) {
            if (!h.face) continue;
            n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
            if (n.y > 0.7 && h.point.y >= floorY - 1e-6) return {point: h.point.clone(), part: h.object.name};
        }
        const p = ray.ray.intersectPlane(floor, new Vector3());
        return p ? {point: p, part: null} : null;
    };

    // ---- the model's meshes and highlights -------------------------------------
    const materials = new Map();
    const materialsFor = color => {
        if (!materials.has(color)) {
            const info = colors.get(color) || colors.get(16);
            materials.set(color, [
                new MeshStandardMaterial({color: info ? info.value : '#cccccc', roughness: 0.6, metalness: 0.1}),
                new MeshStandardMaterial({color: '#ffffff', roughness: 0.6, metalness: 0.1, vertexColors: true})
            ]);
        }
        return materials.get(color);
    };
    const ghostMaterial = tone => [0, 1].map(() => new MeshStandardMaterial({
        color: tone === 'snap' ? '#22c55e' : '#3b82f6', transparent: true, opacity: 0.55, depthWrite: false
    }));
    const edges = new Map();
    const edgesFor = part => {
        if (!edges.has(part)) edges.set(part, new EdgesGeometry(partGeometry(part, read, colors), 35));
        return edges.get(part);
    };
    // Selected: crisp amber edges, plus a faint copy drawn over everything so a part
    // hidden inside the robot still shows where it is (a solid always-on-top copy
    // turns a beam's hole edges into a tangle).
    const selectedLine = new LineBasicMaterial({color: 0xf59e0b});
    const selectedHidden = new LineBasicMaterial({color: 0xf59e0b, depthTest: false, transparent: true, opacity: 0.22});
    const hoverLine = new LineBasicMaterial({color: 0x38bdf8});

    const posesOverride = () => (preview ? new Map(preview.moves.map(m => [m.id, m])) : new Map());
    const placeMeshes = () => {
        const over = posesOverride();
        for (const p of editor.model.parts) {
            const mesh = meshes.get(p.id);
            if (!mesh) continue;
            const pose = over.get(p.id) || p;
            mesh.matrix.copy(worldMatrix(pose.position, pose.rotation));
        }
        drawOutlines();
    };
    const drawOutlines = () => {
        outlineGroup.clear();
        const add = (id, material) => {
            const mesh = meshes.get(id);
            if (!mesh) return;
            const line = new LineSegments(edgesFor(mesh.userData.part), material);
            line.matrixAutoUpdate = false;
            line.matrix.copy(mesh.matrix);
            line.renderOrder = material === selectedLine ? 10 : 5;
            outlineGroup.add(line);
            if (material === selectedLine) {
                const ghost = new LineSegments(line.geometry, selectedHidden);
                ghost.matrixAutoUpdate = false;
                ghost.matrix.copy(mesh.matrix);
                ghost.renderOrder = 11;
                outlineGroup.add(ghost);
            }
        };
        if (hovered && !selection.includes(hovered)) add(hovered, hoverLine);
        for (const id of selection) add(id, selectedLine);
        for (const [id, mesh] of meshes) {
            const on = selection.includes(id);
            for (const m of [].concat(mesh.material)) m.emissive?.setHex(on ? 0x1e3a8a : (id === hovered ? 0x0c4a6e : 0x000000));
        }
    };

    const rebuild = () => {
        for (const mesh of meshes.values()) {
            modelGroup.remove(mesh);
            for (const m of [].concat(mesh.material)) m.dispose();
        }
        meshes.clear();
        const model = editor.model;
        for (const p of model.parts) {
            // Each mesh gets its own material pair so a highlight is per part.
            const mats = materialsFor(p.color ?? DEFAULT_COLOR).map(m => m.clone());
            const mesh = new Mesh(partGeometry(p.part, read, colors), mats);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.copy(worldMatrix(p.position, p.rotation));
            mesh.name = p.id;
            mesh.userData.part = p.part;
            modelGroup.add(mesh);
            meshes.set(p.id, mesh);
        }
        // The floor is fixed where the model stood when the editor opened, so lifting
        // the lowest part does not move the floor away under it; it only ever goes down.
        modelGroup.updateMatrixWorld(true);
        const box = new Box3().setFromObject(modelGroup);
        const lowest = box.isEmpty() ? 0 : box.min.y;
        floorY = floorY === null ? lowest : Math.min(floorY, lowest);
        grid.position.y = floorY;
        floor.constant = -floorY;
        const kept = selection.filter(id => meshes.has(id));
        if (kept.length !== selection.length) setSelection(kept);
        if (hovered && !meshes.has(hovered)) hovered = null;
        placeMeshes();
        updateGizmo();
    };

    // ---- selection -----------------------------------------------------------
    const setSelection = ids => {
        selection = expandToGroups(editor.model, ids);
        drawOutlines();
        updateGizmo();
        onSelect(selection.slice());
    };

    // ---- gizmo ---------------------------------------------------------------
    const pivotObject = new Object3D();
    s.add(pivotObject);
    // Registered before OrbitControls and TransformControls: this listener decides
    // first what a press means (gizmo, part drag, box select or camera).
    canvas.addEventListener('pointerdown', event => onDown(event));
    const transform = new TransformControls(camera, canvas);
    transform.setSpace('world');
    transform.setSize(1.25);
    // Only axis-aligned turns: free trackball and view-axis rings would make rotations
    // that are not quarter (or 15°) turns about a world axis.
    transform.showE = false;
    transform.showXYZE = false;
    transform.setRotationSnap(QUARTER);
    // No free "move in the screen plane" handle: it sits on top of the part, so a
    // child pressing on the part to slide it would grab it instead and move the
    // part toward or away from the camera. Pressing the part itself slides it.
    for (const set of [transform._gizmo?.gizmo?.translate, transform._gizmo?.picker?.translate]) {
        for (const handle of set ? set.children.filter(c => c.name === 'XYZ') : []) set.remove(handle);
    }
    s.add(transform.getHelper());
    const controls = new OrbitControls(camera, canvas);
    controls.mouseButtons = {LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE};
    controls.zoomToCursor = true;
    controls.maxPolarAngle = Math.PI / 2;
    controls.addEventListener('start', () => { cameraTouched = true; });
    controls.update();

    const pivotLdu = () => selectionPivot(selectedParts(), gridStep);
    const updateGizmo = () => {
        if (!selection.length || tool) {
            transform.detach();
            return;
        }
        if (gesture && gesture.kind === 'gizmo') return;
        pivotObject.position.fromArray(lduToWorld(pivotLdu()));
        pivotObject.quaternion.identity();
        pivotObject.updateMatrixWorld(true);
        transform.attach(pivotObject);
        transform.setMode(mode === 'rotate' ? 'rotate' : 'translate');
    };

    transform.addEventListener('mouseDown', () => {
        controls.enabled = false;
        const parts = selectedParts();
        gesture = {kind: 'gizmo', start: parts, pivotWorld: pivotObject.position.clone(), pivot: pivotLdu()};
        preview = {moves: translatePoses(parts, [0, 0, 0]), candidate: null};
    });
    transform.addEventListener('objectChange', () => {
        if (!gesture || gesture.kind !== 'gizmo') return;
        if (transform.mode === 'translate') {
            const raw = worldDeltaToLdu(pivotObject.position.clone().sub(gesture.pivotWorld));
            const delta = snapDelta(raw, gridStep);
            // Show the gizmo where the parts will be: on the grid.
            pivotObject.position.copy(gesture.pivotWorld).add(new Vector3(...lduToWorld(delta)));
            showMove(gesture.start, translatePoses(gesture.start, delta), delta);
        } else {
            const a = transform.rotationAxis;
            const axes = ['x', 'y', 'z'];
            const k = [Math.abs(a.x), Math.abs(a.y), Math.abs(a.z)].reduce((best, v, i, all) => (v > all[best] ? i : best), 0);
            const angle = transform.rotationAngle * Math.sign(a.getComponent(k) || 1);
            const r = worldAxisRotation(axes[k], angle);
            preview = {moves: rotatePoses(gesture.start, r, gesture.pivot), candidate: null};
            placeMeshes();
            status({kind: 'turning', degrees: Math.round(angle * 180 / Math.PI)});
        }
    });
    transform.addEventListener('mouseUp', () => {
        const done = gesture && gesture.kind === 'gizmo';
        gesture = null;
        controls.enabled = true;
        if (done) commitPreview();
        updateGizmo();
    });

    /** Preview a moved selection; a lone part is offered to the magnet. */
    const showMove = (start, moves, delta) => {
        let found = null;
        if (moves.length === 1 && !modifiers.alt) found = magnetFor(moves[0], start[0]);
        preview = {moves: found ? [{id: moves[0].id, position: found.position, rotation: found.rotation}] : moves, candidate: found};
        placeMeshes();
        showMagnet(found, start[0]);
        if (found) status(snapStatus(found));
        else status({kind: 'moving', delta: delta.map(tidy)});
    };

    /** The model without some parts (what a moving part may attach to). */
    const modelWithout = ids => {
        const model = editor.model;
        const skip = new Set(ids);
        return {...model, parts: model.parts.filter(p => !skip.has(p.id))};
    };
    const samePose = (a, b) => a.position.every((v, i) => Math.abs(v - b.position[i]) < 0.5) &&
        a.rotation.every((v, i) => Math.abs(v - b.rotation[i]) < 1e-6);
    /**
     * The magnet's pick for a part moved to `pose`. The spot it started from is
     * not offered: a pin sitting in a hole would otherwise be pulled straight
     * back whenever it is moved less than the magnet's reach.
     */
    const magnetFor = (pose, placed) => {
        if (samePose(pose, placed)) return null;
        const found = snapCandidates({model: modelWithout([placed.id]), catalog: catalogMap, part: placed.part,
            pose: {position: pose.position, rotation: pose.rotation}, radius: MAGNET_RADIUS})
            .filter(c => !samePose(c, placed));
        if (!found.length) return null;
        return {...found[0], rotation: cleanRotation(found[0].rotation)};
    };

    // ---- ghosts and magnet markers -------------------------------------------
    const clearGhost = () => {
        for (const c of [...ghostGroup.children]) {
            ghostGroup.remove(c);
            if (c.userData.owned) for (const m of [].concat(c.material)) m.dispose();
        }
    };
    const markerGeometry = new SphereGeometry(4 * LDU_M, 12, 8);
    const markerMaterials = {
        fixed: new MeshBasicMaterial({color: 0xf59e0b, depthTest: false}),
        moving: new MeshBasicMaterial({color: 0x16a34a, depthTest: false})
    };
    const marker = (lduPoint, which) => {
        const m = new Mesh(markerGeometry, markerMaterials[which]);
        m.position.fromArray(lduToWorld(lduPoint));
        m.renderOrder = 20;
        ghostGroup.add(m);
    };
    const connectorWorld = (pose, connectorId, part) => {
        const meta = catalogMap.get(part);
        const c = meta && meta.connectors.find(x => x.id === connectorId);
        return c ? mulVec3(pose.rotation, c.position).map((v, i) => v + pose.position[i]) : null;
    };
    /** The green ghost at a magnet pose and the connector pairs it joins. */
    const showMagnet = (found, placed, part = placed && placed.part) => {
        clearGhost();
        if (!found) return;
        const mesh = new Mesh(partGeometry(part, read, colors), ghostMaterial('snap'));
        mesh.userData.owned = true;
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(worldMatrix(found.position, found.rotation));
        mesh.name = 'ghost';
        ghostGroup.add(mesh);
        const byId = partsById();
        for (const pair of found.pairs) {
            const fixed = byId.get(pair.fixed.part);
            const a = fixed && connectorWorld(fixed, pair.fixed.connector, fixed.part);
            const b = connectorWorld(found, pair.moving, part);
            if (a) marker(a, 'fixed');
            if (b) marker(b, 'moving');
        }
    };
    const showGhost = (part, position, rotation, tone) => {
        clearGhost();
        const mesh = new Mesh(partGeometry(part, read, colors), ghostMaterial(tone));
        mesh.userData.owned = true;
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(worldMatrix(position, rotation));
        mesh.name = 'ghost';
        ghostGroup.add(mesh);
    };
    const snapStatus = found => {
        const pair = found.pairs[0];
        const target = pair && partsById().get(pair.fixed.part);
        return {kind: 'snap', target: target ? target.part : null, connector: pair ? pair.fixed.connector : null};
    };

    // ---- committing ------------------------------------------------------------
    /** Applies a command; a refused one is reported, never thrown at the learner. */
    const run = (cmd, info = {}) => {
        try {
            editor.apply(cmd);
        } catch (error) {
            status({kind: 'refused', reason: 'invalid', detail: error.message});
            return false;
        }
        onChange(editor.model, info);
        return true;
    };
    const commitPreview = () => {
        const p = preview;
        preview = null;
        clearGhost();
        if (!p) return;
        const byId = partsById();
        const changed = p.moves.filter(m => {
            const was = byId.get(m.id);
            return was && (m.position.some((v, i) => v !== was.position[i]) || m.rotation.some((v, i) => v !== was.rotation[i]));
        });
        if (!changed.length) {
            placeMeshes();
            return;
        }
        if (run({type: 'moveMany', moves: changed}, {moved: changed.length, snapped: Boolean(p.candidate)})) {
            status(p.candidate ? {...snapStatus(p.candidate), kind: 'snapped'} : {kind: 'moved', count: changed.length});
        } else {
            placeMeshes();
        }
    };

    // ---- the placing tool (palette) ---------------------------------------------
    /** Where a part rests on a surface at a world point: upright, turned, its footprint centred on the point. */
    const restingPose = (part, point, turns) => {
        const rotation = worldAxisRotation('y', (((turns % 4) + 4) % 4) * QUARTER);
        const geom = partGeometry(part, read, colors);
        geom.computeBoundingBox();
        const probe = new Box3().copy(geom.boundingBox).applyMatrix4(worldMatrix([0, 0, 0], rotation));
        const centre = probe.getCenter(new Vector3());
        // Origin such that the footprint's centre is under the pointer and the lowest point touches the surface.
        const origin = new Vector3(point.x - centre.x, point.y - probe.min.y, point.z - centre.z);
        const ldu = worldToLdu(origin);
        return {position: [Math.round(ldu[0] / gridStep) * gridStep, Math.round(ldu[1]), Math.round(ldu[2] / gridStep) * gridStep].map(tidy), rotation};
    };

    const updateGhost = event => {
        if (!tool) return;
        const hit = partUnder(event);
        let found = [];
        if (hit && !modifiers.alt) {
            found = snapCandidates({model: editor.model, catalog: catalogMap, part: tool.part,
                pose: {position: worldToLdu(hit.point), rotation: IDENTITY}});
        }
        if (found.length) {
            candidate = rotateAboutSnap(found[0], tool.turns);
            candidate = {...candidate, rotation: cleanRotation(candidate.rotation)};
            freePose = null;
            showMagnet(candidate, null, tool.part);
            status(snapStatus(candidate));
            return;
        }
        candidate = null;
        const surface = surfaceUnder(event);
        if (!surface) return;
        freePose = restingPose(tool.part, surface.point, tool.turns);
        showGhost(tool.part, freePose.position, freePose.rotation, 'free');
        const on = surface.part && partsById().get(surface.part);
        status(on ? {kind: 'onTop', target: on.part} : {kind: 'floor'});
    };

    const place = ({keepTool = false} = {}) => {
        const pose = candidate || freePose;
        if (!tool || !pose) return null;
        const snapped = Boolean(candidate);
        const part = tool.part;
        if (!run({type: 'place', part, position: pose.position, rotation: pose.rotation, color: DEFAULT_COLOR})) return null;
        const placed = editor.model.parts[editor.model.parts.length - 1];
        status(snapped ? {...snapStatus(candidate), kind: 'snapped'} : {kind: 'placed', part});
        if (!keepTool) {
            // Tinkercad: the new part is selected, ready to be moved or turned.
            setTool(null);
            setSelection([placed.id]);
        }
        return {id: placed.id, snapped};
    };

    const setTool = part => {
        tool = part ? {part, turns: 0} : null;
        candidate = null;
        freePose = null;
        clearGhost();
        if (part) {
            setSelection([]);
            canvas.focus();
            status({kind: 'placing', part});
        }
        updateGizmo();
        onTool(part || null);
    };

    // ---- selection actions -----------------------------------------------------------
    const needSelection = () => {
        if (selection.length) return true;
        status({kind: 'refused', reason: 'nothingSelected'});
        return false;
    };
    const attachmentOf = placed => {
        const found = snapCandidates({model: modelWithout([placed.id]), catalog: catalogMap, part: placed.part,
            pose: {position: placed.position, rotation: placed.rotation}, radius: HOLE_PITCH});
        return found.find(c => samePose(c, placed)) || null;
    };
    /**
     * Turns the selection a quarter turn. `axis` 'up' is the vertical, 'facing'
     * the horizontal world axis nearest the view direction. A lone part sitting
     * on a pin or an axle turns about that connection instead (R only).
     */
    const turnSelection = (axis, direction) => {
        if (tool) {
            tool.turns = (tool.turns + direction + 4) % 4;
            if (candidate) {
                candidate = {...rotateAboutSnap(candidate, direction)};
                candidate.rotation = cleanRotation(candidate.rotation);
                showMagnet(candidate, null, tool.part);
            } else if (freePose) {
                freePose = {...freePose, rotation: cleanRotation(mul3(worldAxisRotation('y', direction * QUARTER), freePose.rotation))};
                showGhost(tool.part, freePose.position, freePose.rotation, 'free');
            }
            return;
        }
        if (!needSelection()) return;
        const parts = selectedParts();
        if (axis === 'up' && parts.length === 1) {
            const on = attachmentOf(parts[0]);
            if (on) {
                const turned = rotateAboutSnap(on, direction);
                const move = {id: parts[0].id, position: turned.position.map(v => tidy(Math.round(v * 1e6) / 1e6)), rotation: cleanRotation(turned.rotation)};
                if (run({type: 'moveMany', moves: [move]}, {turned: 1})) status({...snapStatus(on), kind: 'turnedAbout'});
                return;
            }
        }
        let worldAxis = 'y';
        if (axis === 'facing') worldAxis = facingAxis(camera.getWorldDirection(new Vector3()));
        const moves = rotatePoses(parts, worldAxisRotation(worldAxis, direction * QUARTER), selectionPivot(parts, gridStep));
        if (run({type: 'moveMany', moves}, {turned: moves.length})) status({kind: 'turned', count: moves.length});
    };
    const deleteSelection = () => {
        if (!needSelection()) return;
        const ids = selection.slice();
        if (run({type: 'batch', commands: ids.map(id => ({type: 'delete', id}))}, {deleted: ids.length})) {
            setSelection([]);
            status({kind: 'deleted', count: ids.length});
        }
    };
    const pasteParts = (parts, offset) => {
        const before = editor.model.parts.length;
        if (!run({type: 'batch', commands: placeCopies(parts, offset)}, {pasted: parts.length})) return;
        setSelection(editor.model.parts.slice(before).map(p => p.id));
        status({kind: 'pasted', count: parts.length});
    };
    /** Ctrl+G: the selection becomes one group (editor-state.js `group`): clicking any member then selects all of it. */
    const groupSelection = () => {
        if (selection.length < 2) { status({kind: 'refused', reason: 'groupNeedsTwo'}); return; }
        const ids = selection.slice();
        if (run({type: 'group', ids}, {grouped: ids.length})) status({kind: 'grouped', count: ids.length});
    };
    /** Ctrl+Shift+G: every group the selection touches is taken apart (one undo step). */
    const ungroupSelection = () => {
        const groups = (editor.model.groups || []).filter(g => g.parts.some(id => selection.includes(id)));
        if (!groups.length) { status({kind: 'refused', reason: 'notGrouped'}); return; }
        if (run({type: 'batch', commands: groups.map(g => ({type: 'ungroup', id: g.id}))}, {ungrouped: groups.length})) {
            status({kind: 'ungrouped', count: groups.length});
        }
    };
    const duplicate = () => {
        if (needSelection()) pasteParts(selectedParts(), [HOLE_PITCH, 0, 0]);
    };
    const copy = () => {
        if (!needSelection()) return;
        clipboard = selectedParts().map(p => ({...p, position: p.position.slice(), rotation: p.rotation.slice()}));
        clipboard.pasted = 0;
        status({kind: 'copied', count: clipboard.length});
    };
    const paste = () => {
        if (!clipboard.length) {
            status({kind: 'refused', reason: 'clipboardEmpty'});
            return;
        }
        clipboard.pasted = (clipboard.pasted || 0) + 1;
        pasteParts(clipboard, [HOLE_PITCH * clipboard.pasted, 0, 0]);
    };
    const undo = () => {
        if (!editor.canUndo) { status({kind: 'refused', reason: 'nothingToUndo'}); return; }
        editor.undo();
        onChange(editor.model, {undo: true});
        status({kind: 'undone'});
    };
    const redo = () => {
        if (!editor.canRedo) { status({kind: 'refused', reason: 'nothingToRedo'}); return; }
        editor.redo();
        onChange(editor.model, {redo: true});
        status({kind: 'redone'});
    };
    const setMode = next => {
        mode = next === 'rotate' ? 'rotate' : 'move';
        updateGizmo();
        onMode(mode);
    };

    // ---- camera ---------------------------------------------------------------------
    const fitBox = (box, direction) => {
        const b = box.isEmpty() ? new Box3(new Vector3(-0.05, floorY ?? 0, -0.05), new Vector3(0.05, (floorY ?? 0) + 0.05, 0.05)) : box;
        const sphere = b.getBoundingSphere(new Sphere());
        const radius = Math.max(0.02, sphere.radius);
        const vHalf = camera.fov * Math.PI / 360;
        const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
        const distance = radius / Math.sin(Math.min(vHalf, hHalf)) * 1.15;
        const dir = (direction || camera.position.clone().sub(controls.target)).clone().normalize();
        camera.position.copy(sphere.center).addScaledVector(dir, distance);
        camera.near = Math.max(0.001, distance / 200);
        camera.far = distance * 100;
        camera.updateProjectionMatrix();
        controls.target.copy(sphere.center);
        controls.update();
    };
    const modelBox = ids => {
        const box = new Box3();
        for (const [id, mesh] of meshes) if (!ids || ids.includes(id)) box.expandByObject(mesh);
        return box;
    };
    const VIEWS = {home: new Vector3(1, 0.8, 1.2), top: new Vector3(0, 1, 0.0001), front: new Vector3(0, 0.0001, 1), side: new Vector3(1, 0.0001, 0)};
    const view = name => {
        modelGroup.updateMatrixWorld(true);
        fitBox(modelBox(), VIEWS[name] || VIEWS.home);
        cameraTouched = true;
    };
    const fitSelection = () => {
        modelGroup.updateMatrixWorld(true);
        fitBox(modelBox(selection.length ? selection : null));
        cameraTouched = true;
    };
    const frameModel = () => {
        modelGroup.updateMatrixWorld(true);
        fitBox(modelBox(), VIEWS.home);
    };

    // ---- pointer handling -----------------------------------------------------------
    const boxDiv = document.createElement('div');
    boxDiv.dataset.testid = 'bw-sim-lab-box-select';
    Object.assign(boxDiv.style, {position: 'absolute', display: 'none', border: '1.5px dashed #2563eb', background: 'rgba(37,99,235,0.08)', pointerEvents: 'none'});
    container.appendChild(boxDiv);

    const readModifiers = event => {
        modifiers = {alt: event.altKey, shift: event.shiftKey};
        transform.setRotationSnap(event.shiftKey ? Math.PI / 12 : QUARTER);
    };
    const travelled = (event, g) => Math.hypot(event.clientX - g.x, event.clientY - g.y);

    function onDown (event) {
        readModifiers(event);
        canvas.focus();
        if (event.button !== 0) { gesture = null; return; }
        // The gizmo gets the press when the pointer is on one of its handles.
        if (transform.object) {
            transform.pointerHover(ndc(event));
            if (transform.axis !== null) { controls.enabled = false; return; }
        }
        const base = {x: event.clientX, y: event.clientY, pointerId: event.pointerId};
        if (tool) { gesture = {...base, kind: 'tool'}; return; }
        const hit = partUnder(event);
        if (event.shiftKey) {
            // Shift: click toggles a part, drag on anything draws a selection box.
            controls.enabled = false;
            gesture = {...base, kind: 'box', hit: hit ? hit.object.name : null};
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (hit) {
            const id = hit.object.name;
            if (!selection.includes(id)) setSelection([id]);
            controls.enabled = false;
            transform.enabled = false;
            const surface0 = surfaceUnder(event, selection);
            gesture = {...base, kind: 'part', start: selectedParts(), surface0, started: false};
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        gesture = {...base, kind: 'empty'};
    }

    const onMove = event => {
        readModifiers(event);
        if (tool && (!gesture || travelled(event, gesture) <= CLICK_PX)) { updateGhost(event); return; }
        if (!gesture) {
            if (transform.dragging) return;
            if (transform.object && transform.axis) {
                // The gizmo's own pointermove listener ran first and lit the handle up.
                if (hovered !== `gizmo:${transform.axis}`) {
                    hovered = null;
                    drawOutlines();
                    hovered = `gizmo:${transform.axis}`;
                    status({kind: 'gizmo', axis: transform.axis, mode});
                }
                return;
            }
            const hit = partUnder(event);
            const id = hit ? hit.object.name : null;
            if (id !== hovered) {
                hovered = id;
                drawOutlines();
                const p = id && partsById().get(id);
                if (p) status({kind: 'hover', part: p.part, selected: selection.includes(id)});
                else status({kind: 'idle'});
            }
            return;
        }
        if (gesture.kind === 'part') {
            if (!gesture.started && travelled(event, gesture) <= CLICK_PX) return;
            gesture.started = true;
            const surface = surfaceUnder(event, selection);
            if (!surface || !gesture.surface0) return;
            const d = worldDeltaToLdu(surface.point.clone().sub(gesture.surface0.point));
            const delta = [Math.round(d[0] / gridStep) * gridStep, Math.round(d[1]), Math.round(d[2] / gridStep) * gridStep].map(tidy);
            showMove(gesture.start, translatePoses(gesture.start, delta), delta);
            if (!preview.candidate) {
                const on = surface.part && partsById().get(surface.part);
                status(on ? {kind: 'onTop', target: on.part, delta} : {kind: 'floor', delta});
            }
        } else if (gesture.kind === 'box') {
            const crect = container.getBoundingClientRect();
            const x0 = Math.min(gesture.x, event.clientX), y0 = Math.min(gesture.y, event.clientY);
            Object.assign(boxDiv.style, {display: travelled(event, gesture) > CLICK_PX ? 'block' : 'none',
                left: `${x0 - crect.left}px`, top: `${y0 - crect.top}px`,
                width: `${Math.abs(event.clientX - gesture.x)}px`, height: `${Math.abs(event.clientY - gesture.y)}px`});
        }
    };

    const boxSelect = (g, event) => {
        const rect = canvas.getBoundingClientRect();
        const [x0, x1] = [Math.min(g.x, event.clientX), Math.max(g.x, event.clientX)];
        const [y0, y1] = [Math.min(g.y, event.clientY), Math.max(g.y, event.clientY)];
        const inside = [];
        for (const [id, mesh] of meshes) {
            const c = new Box3().setFromObject(mesh).getCenter(new Vector3()).project(camera);
            const sx = rect.left + (c.x + 1) / 2 * rect.width;
            const sy = rect.top + (1 - c.y) / 2 * rect.height;
            if (c.z < 1 && sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) inside.push(id);
        }
        return inside;
    };

    const onUp = event => {
        const g = gesture;
        gesture = null;
        controls.enabled = true;
        transform.enabled = true;
        boxDiv.style.display = 'none';
        if (!g) return;
        try { canvas.releasePointerCapture(event.pointerId); } catch { /* not captured */ }
        const click = travelled(event, g) <= CLICK_PX;
        if (g.kind === 'tool') {
            if (!click) return; // a drag orbited the camera
            updateGhost(event);
            place({keepTool: event.shiftKey});
        } else if (g.kind === 'part') {
            if (g.started) commitPreview();
            else {
                // A plain click on a part: just that part (and its group).
                setSelection([partUnder(event)?.object.name].filter(Boolean));
                status({kind: 'selected', count: selection.length});
            }
            updateGizmo();
        } else if (g.kind === 'box') {
            if (click) {
                if (!g.hit) return;
                const group = expandToGroups(editor.model, [g.hit]);
                const on = selection.includes(g.hit);
                setSelection(on ? selection.filter(id => !group.includes(id)) : [...selection, ...group]);
            } else {
                const inside = boxSelect(g, event);
                setSelection([...new Set([...selection, ...inside])]);
            }
            status({kind: 'selected', count: selection.length});
        } else if (g.kind === 'empty' && click) {
            setSelection([]);
            status({kind: 'idle'});
        }
    };

    const onKey = event => {
        readModifiers(event);
        const ctrl = event.ctrlKey || event.metaKey;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (key === 'Escape') {
            if (gesture && gesture.kind === 'part') { preview = null; gesture = null; clearGhost(); placeMeshes(); return; }
            if (tool) setTool(null);
            else { setSelection([]); status({kind: 'idle'}); }
            return;
        }
        if (ctrl) {
            const actions = {z: () => (event.shiftKey ? redo() : undo()), y: redo, d: duplicate, c: copy, v: paste,
                g: () => (event.shiftKey ? ungroupSelection() : groupSelection()),
                a: () => { setSelection(editor.model.parts.map(p => p.id)); status({kind: 'selected', count: selection.length}); }};
            if (actions[key]) { event.preventDefault(); actions[key](); }
            return;
        }
        if (event.altKey) return;
        const plain = {
            w: () => setMode('move'), e: () => setMode('rotate'),
            r: () => turnSelection('up', event.shiftKey ? -1 : 1),
            t: () => turnSelection('facing', event.shiftKey ? -1 : 1),
            f: fitSelection,
            Delete: deleteSelection, Backspace: deleteSelection
        };
        if (plain[key]) { event.preventDefault(); plain[key](); }
    };
    const onKeyUp = event => readModifiers(event);
    const onLeave = () => {
        if (hovered && !gesture) { hovered = null; drawOutlines(); }
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('keyup', onKeyUp);
    const unsubscribe = editor.subscribe(() => rebuild());

    // ---- frame loop hooks -----------------------------------------------------------
    const resize = () => {
        const width = Math.max(1, container.clientWidth || 0);
        const height = Math.max(1, container.clientHeight || Math.round(width * 0.6));
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const size = renderer.getSize(new Vector2());
        if (size.x !== width || size.y !== height) {
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            // Until the learner moves the camera, keep the whole model in view as the pane settles.
            if (!cameraTouched) frameModel();
        }
    };
    const render = () => {
        resize();
        renderer.render(s, camera);
    };
    const dispose = () => {
        unsubscribe();
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('keydown', onKey);
        canvas.removeEventListener('keyup', onKeyUp);
        clearGhost();
        for (const mesh of meshes.values()) for (const m of [].concat(mesh.material)) m.dispose();
        for (const pair of materials.values()) for (const m of pair) m.dispose();
        for (const g of edges.values()) g.dispose();
        selectedLine.dispose();
        selectedHidden.dispose();
        hoverLine.dispose();
        markerGeometry.dispose();
        markerMaterials.fixed.dispose();
        markerMaterials.moving.dispose();
        grid.geometry.dispose();
        grid.material.dispose();
        transform.detach();
        transform.dispose();
        controls.dispose();
        renderer.dispose();
        boxDiv.remove();
        canvas.remove();
    };

    rebuild();
    resize();
    frameModel();
    status({kind: 'idle'});
    return {
        canvas, render, resize, dispose, setTool, frameModel,
        get selected () { return selection[0] || null; },
        get selection () { return selection.slice(); },
        get mode () { return mode; },
        get grid () { return gridStep; },
        /** The gizmo handle under the pointer ('X', 'Y', 'XY', …) or null: what a press would grab. */
        get gizmoAxis () { return transform.object ? transform.axis : null; },
        setGrid (step) { if (GRID_STEPS.includes(step)) gridStep = step; },
        setMode,
        select: ids => setSelection([].concat(ids || [])),
        selectAll: () => setSelection(editor.model.parts.map(p => p.id)),
        deleteSelection, duplicate, copy, paste, undo, redo, view, fitSelection, groupSelection, ungroupSelection,
        turn: (axis, direction = 1) => turnSelection(axis, direction),
        /** World position (metres) of a point on a part (LDU, part frame) or of the gizmo, for the browser gate to aim at. */
        debugPoint: (id, local = [0, 0, 0]) => {
            if (id === 'gizmo') return transform.object ? pivotObject.position.toArray() : null;
            const p = partsById().get(id);
            return p ? lduToWorld(mulVec3(p.rotation, local).map((v, i) => v + p.position[i])) : null;
        },
        /** Projects a world point to client pixels (for the browser gate). */
        toScreen: worldPoint => {
            const rect = canvas.getBoundingClientRect();
            camera.updateMatrixWorld();
            const v = new Vector3(...worldPoint).project(camera);
            return [rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - v.y) / 2 * rect.height];
        },
        // For the browser gate: place a part as a click at a world point would.
        placeAt (part, worldPoint, turns = 0) {
            setTool(part);
            tool.turns = turns;
            const p = new Vector3(...worldPoint);
            const found = snapCandidates({model: editor.model, catalog: catalogMap, part, pose: {position: worldToLdu(p), rotation: IDENTITY}});
            candidate = found.length ? {...rotateAboutSnap(found[0], turns)} : null;
            if (candidate) candidate.rotation = cleanRotation(candidate.rotation);
            freePose = candidate ? null : restingPose(part, new Vector3(p.x, floorY, p.z), turns);
            const done = place();
            return {snapped: Boolean(done && done.snapped)};
        }
    };
};
