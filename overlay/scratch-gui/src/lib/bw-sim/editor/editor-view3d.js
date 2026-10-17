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
//                         the top of another part), grid-snapped; the pressed
//                         point stays under the pointer
//   gizmo arrows/planes   move along world axes (W);  rings: turn (E),
//                         90° steps, 15° while Shift is held
//   R / Shift+R           turn 90° about the vertical (about the connection's
//                         axis when the part sits on a pin or an axle)
//   T / Shift+T           tip 90° about the horizontal axis facing the camera
//   magnet                a lone part moved near a matching hole or axle shows
//                         a green ghost and snaps there on release (Alt: off)
//   overlap               a move, turn or placement that would push a solid part
//                         into another one shows red, the status line names the
//                         part, and it is refused on release (overlap.js
//                         `moveVerdict`); pins, axles and the castor ball may sit
//                         inside holes and sockets, and a magnet snap is a
//                         legitimate connection
//   aiming                the pointer ray also hits the parts' colliders, which
//                         are solid: aiming into a beam's hole aims at the beam,
//                         not at the floor below it, so a part rests on the face
//                         the pointer is on; the magnet first tries the part
//                         centred on the pointer, so it takes the hole pointed
//                         at, from the side the pointer is on
//   gizmo                 sized to the selection (transform-math.js `gizmoSize`);
//                         a press on a part next to a handle, but not on the
//                         handle's visible shape, goes to the part
//   palette               click a part, then click in the view to place it; or
//                         press on a part in the palette and drag it into the
//                         view: the same ghost (magnet, resting on top, overlap)
//                         follows the pointer and letting go places it; let go
//                         outside the view, or Esc, and nothing is placed
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
    Box3, Color, EdgesGeometry, GridHelper, Group, LineBasicMaterial, LineSegments,
    Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, MOUSE, Object3D, PerspectiveCamera, Plane, Raycaster, Scene,
    Sphere, SphereGeometry, Vector2, Vector3, WebGLRenderer
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {LDU_M, lduToWorld} from '../contracts.js';
import {partGeometry, partVisual} from '../view/part-geometry.js';
import {PART_SURFACE, addEdgeLines, addPartLights, edgeMaterials} from '../view/part-style.js';
import {snapCandidates, rotateAboutSnap} from './snap.js';
import {freeOffset, moveVerdict, rayHitParts, restingPosition, solidOverlaps} from './overlap.js';
import {
    DEFAULT_GRID, GRID_STEPS, HOLE_PITCH, IDENTITY, cleanRotation, expandToGroups, facingAxis, gizmoSize, mul3, mulVec3,
    placeCopies, rotatePoses, selectionPivot, snapDelta, translatePoses, worldAxisRotation
} from './transform-math.js';
import {portsForCopies} from './editor-state.js';
import {portItems} from '../mech/insight.js';
import {createInsightLayer, tintMaterial} from '../view/insight-layer.js';

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
/** How near (px) the pointer must be to a gizmo handle's visible shape for a press to grab it rather than a part. */
const HANDLE_PX = 8;
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
 * @param {(item: {id: string, part: string, kind: string, port: string|null}) => string} [options.portLabel]
 *        the accessible name of a motor's or sensor's port badge
 * @param {(id: string, rect: DOMRect) => void} [options.onPortLabel] a port badge was clicked
 */
export const createEditorView3D = ({container, read, colors, catalog, editor,
    onSelect = () => {}, onChange = () => {}, onStatus = () => {}, onTool = () => {}, onMode = () => {},
    portLabel = () => '', onPortLabel = null}) => {
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
    addPartLights(s);
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
    let paletteDrag = null; // a part pressed in the palette: {part, x, y, pointerId, dragging, onEnd}
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
    let lastStatus = {kind: 'idle'};
    const status = info => { lastStatus = info; onStatus(info); };

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
    /**
     * The ray against the parts' colliders (overlap.js), nearest first, with world
     * points and distances. Colliders are solid where the mesh has holes: aiming
     * into a hole hits the part around it.
     */
    const colliderHits = (ray, exclude = []) => {
        const {origin, direction} = ray.ray;
        return rayHitParts(editor.model, catalogMap, worldToLdu(origin), [direction.x, -direction.y, -direction.z], {exclude})
            .filter(h => meshes.has(h.part))
            .map(h => ({...h, world: new Vector3(...lduToWorld(h.point)), distance: h.t * LDU_M}));
    };
    /** The part under the pointer: its mesh or its collider, whichever the ray meets first. */
    const partUnder = event => {
        const ray = pick(event);
        const hits = ray.intersectObjects([...meshes.values()], false);
        const mesh = hits.length ? hits[0] : null;
        const solid = colliderHits(ray)[0];
        if (solid && (!mesh || solid.distance < mesh.distance)) {
            return {object: meshes.get(solid.part), point: solid.world, distance: solid.distance};
        }
        return mesh;
    };
    /**
     * The surface under the pointer that a part would rest on: the top face of
     * a part (not one of `exclude`) — of its mesh or its collider, whichever is
     * nearer, so a hole counts as the face around it — or the floor.
     * @returns {{point: Vector3, part: string|null}|null}
     */
    const surfaceUnder = (event, exclude = []) => {
        const ray = pick(event);
        const skip = new Set(exclude);
        const hits = ray.intersectObjects([...meshes.values()].filter(m => !skip.has(m.name)), false);
        const n = new Vector3();
        let best = null;
        for (const h of hits) {
            if (!h.face) continue;
            n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
            if (n.y > 0.7 && h.point.y >= floorY - 1e-6) {
                best = {point: h.point.clone(), part: h.object.name, distance: h.distance};
                break;
            }
        }
        // LDraw is -y up: an upward face has a normal with negative y.
        const top = colliderHits(ray, exclude).find(h => h.normal[1] < -0.7 && h.world.y >= floorY - 1e-6);
        if (top && (!best || top.distance < best.distance)) best = {point: top.world, part: top.part};
        if (best) return {point: best.point, part: best.part};
        const p = ray.ray.intersectPlane(floor, new Vector3());
        return p ? {point: p, part: null} : null;
    };

    // ---- the model's meshes and highlights -------------------------------------
    const materials = new Map();
    const materialsFor = color => {
        if (!materials.has(color)) {
            const info = colors.get(color) || colors.get(16);
            materials.set(color, [
                new MeshStandardMaterial({color: info ? info.value : '#cccccc', ...PART_SURFACE}),
                new MeshStandardMaterial({color: '#ffffff', ...PART_SURFACE, vertexColors: true})
            ]);
        }
        return materials.get(color);
    };
    // The parts' own LDraw edge lines, one shared material set per colour.
    const lineMaterials = new Map();
    const linesFor = color => {
        if (!lineMaterials.has(color)) lineMaterials.set(color, edgeMaterials(color, colors));
        return lineMaterials.get(color);
    };
    const ghostMaterial = tone => [0, 1].map(() => new MeshStandardMaterial({
        color: {snap: '#22c55e', blocked: '#ef4444'}[tone] || '#3b82f6', transparent: true, opacity: 0.55, depthWrite: false
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
    // A move that would push a part into another: red, like the status line.
    const blockedLine = new LineBasicMaterial({color: 0xdc2626});

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
        const red = preview && preview.blocked ? new Set(preview.moves.map(m => m.id)) : new Set();
        const add = (id, material) => {
            const mesh = meshes.get(id);
            if (!mesh) return;
            const line = new LineSegments(edgesFor(mesh.userData.part), red.has(id) ? blockedLine : material);
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
            const glow = red.has(id) ? 0x7f1d1d : (on ? 0x1e3a8a : (id === hovered ? 0x0c4a6e : 0x000000));
            for (const m of [].concat(mesh.material)) {
                m.emissive?.setHex(glow);
                // Blocked: the part itself turns red (a tint over its own colour is too faint on grey).
                // "Show how it moves": its body's pastel.
                const tint = partTints && insight.shown.motion ? partTints.get(id) : null;
                tintMaterial(m, red.has(id) ? 0xef4444 : (tint || null));
            }
        }
    };

    // ---- seeing the model: port badges, hinge axes, gear pairs, body tints ---------------
    // (view/insight-layer.js). Port badges come straight from the model, so they change with
    // a port at once; the motion overlay comes from the pane's debounced compile (setMotion).
    const insight = createInsightLayer({container, scene: s, onPortClick: onPortLabel});
    let partTints = null;
    const partCentre = id => {
        const local = new Vector3();
        let geometry = null;
        return () => {
            const mesh = meshes.get(id);
            if (!mesh) return null;
            if (mesh.geometry !== geometry) {
                geometry = mesh.geometry;
                if (!geometry.boundingBox) geometry.computeBoundingBox();
                geometry.boundingBox.getCenter(local);
            }
            return local.clone().applyMatrix4(mesh.matrixWorld);
        };
    };
    const refreshPorts = () => insight.setPorts(portItems(editor.model, catalogMap)
        .map(item => ({...item, label: portLabel(item), anchor: partCentre(item.id)})));
    const fixed = p => (p ? () => new Vector3(...p) : () => null);
    const setMotion = ({joints = [], gears = [], tints = null} = {}) => {
        insight.setMotion({
            axes: joints.filter(j => j.type === 'hinge').map(j => ({motor: j.motor, from: fixed(j.from), to: fixed(j.to)})),
            balls: joints.filter(j => j.type === 'ball').map(j => ({at: fixed(j.point)})),
            gears: gears.map(g => ({text: g.text, from: fixed(g.from), to: fixed(g.to)}))
        });
        partTints = tints;
        drawOutlines();
    };
    const setOverlay = shown => {
        insight.setVisible(shown);
        drawOutlines();
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
            addEdgeLines(mesh, partVisual(p.part, read, colors), linesFor(p.color ?? DEFAULT_COLOR));
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
        refreshPorts();
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
    let selectionRadius = 0;
    /** Sizes the gizmo to the selection as seen now (every frame: the camera moves). */
    const fitGizmo = () => {
        if (!transform.object || !selectionRadius) return;
        const size = gizmoSize({radius: selectionRadius, distance: camera.position.distanceTo(pivotObject.position),
            fov: camera.fov, viewHeightPx: canvas.clientHeight});
        if (Math.abs(size - transform.size) > 0.01) transform.setSize(size);
    };
    const updateGizmo = () => {
        if (!selection.length || tool) {
            transform.detach();
            return;
        }
        if (gesture && gesture.kind === 'gizmo') return;
        modelGroup.updateMatrixWorld(true);
        selectionRadius = modelBox(selection).getBoundingSphere(new Sphere()).radius;
        pivotObject.position.fromArray(lduToWorld(pivotLdu()));
        pivotObject.quaternion.identity();
        pivotObject.updateMatrixWorld(true);
        transform.attach(pivotObject);
        transform.setMode(mode === 'rotate' ? 'rotate' : 'translate');
        fitGizmo();
    };

    // Where the pointer is on screen (px in the canvas) and the 2D distance to a triangle.
    const segmentDistance = (p, a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
        return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    const triangleDistance = (p, a, b, c) => {
        const side = (u, v) => (v[0] - u[0]) * (p[1] - u[1]) - (v[1] - u[1]) * (p[0] - u[0]);
        const s1 = side(a, b), s2 = side(b, c), s3 = side(c, a);
        if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return 0;
        return Math.min(segmentDistance(p, a, b), segmentDistance(p, b, c), segmentDistance(p, c, a));
    };
    /**
     * Whether the pointer is on the VISIBLE shape of the gizmo handle the picker
     * found (within HANDLE_PX). TransformControls picks with fat invisible shapes
     * that reach over neighbouring parts; a press there on a part is meant for
     * the part.
     */
    const onHandleShape = event => {
        const gizmo = transform._gizmo && transform._gizmo.gizmo && transform._gizmo.gizmo[transform.mode];
        if (!gizmo) return true; // three's internals changed: trust the picker
        const rect = canvas.getBoundingClientRect();
        const p = [event.clientX - rect.left, event.clientY - rect.top];
        const v = new Vector3();
        for (const handle of gizmo.children) {
            if (handle.name !== transform.axis || !handle.visible || !handle.geometry) continue;
            const pos = handle.geometry.attributes.position;
            const screen = [];
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(handle.matrixWorld).project(camera);
                screen.push([(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]);
            }
            const index = handle.geometry.index;
            const n = index ? index.count : pos.count;
            for (let i = 0; i + 2 < n; i += 3) {
                const [a, b, c] = [0, 1, 2].map(k => screen[index ? index.getX(i + k) : i + k]);
                if (triangleDistance(p, a, b, c) <= HANDLE_PX) return true;
            }
        }
        return false;
    };
    /** The gizmo handle a press here would grab: the picker's, unless a part is under the pointer off the handle's shape. */
    const gizmoGrab = event => {
        if (!transform.object) return null;
        // The handles as they are now (size and pose change between frames), not as last drawn.
        transform.getHelper().updateMatrixWorld(true);
        transform.pointerHover(ndc(event));
        if (transform.axis === null) return null;
        if (onHandleShape(event) || !partUnder(event)) return transform.axis;
        transform.axis = null; // the handle does not light up either
        return null;
    };
    let gizmoHover = null;

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
            const moves = rotatePoses(gesture.start, r, gesture.pivot);
            preview = {moves, candidate: null, blocked: blockedBy(moves)};
            placeMeshes();
            if (preview.blocked) status({kind: 'blocked', target: preview.blocked.target});
            else status({kind: 'turning', degrees: Math.round(angle * 180 / Math.PI)});
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
    /**
     * `aimed`: for a drag with the pointer on a part, the lone part's pose with
     * its origin AT the pointer (resting on that face). The magnet tries it
     * first, so the hole the pointer is on wins, from the side the pointer is
     * on — as when placing from the palette.
     */
    const showMove = (start, moves, delta, aimed = null) => {
        let found = null;
        if (moves.length === 1 && !modifiers.alt) found = (aimed && magnetFor(aimed, start[0])) || magnetFor(moves[0], start[0]);
        const shown = found ? [{id: moves[0].id, position: found.position, rotation: found.rotation}] : moves;
        // A magnet snap is a connection: the parts it joins may touch the moved one.
        const blocked = blockedBy(shown, found ? found.pairs.map(pair => pair.fixed.part) : []);
        preview = {moves: shown, candidate: found, blocked};
        placeMeshes();
        showMagnet(found, start[0]);
        if (blocked) status({kind: 'blocked', target: blocked.target});
        else if (found) status(snapStatus(found));
        else status({kind: 'moving', delta: delta.map(tidy)});
    };

    /**
     * What a move would push a solid part into (overlap.js `moveVerdict`), or
     * null when it may go there. `target` is the part's type, for the status line.
     */
    const blockedBy = (moves, connected = []) => {
        const verdict = moveVerdict({model: editor.model, catalog: catalogMap, moves, connected});
        if (verdict.ok) return null;
        const into = partsById().get(verdict.into);
        return {part: verdict.part, into: verdict.into, target: into ? into.part : null};
    };
    /** The same for a new part placed at `pose`. */
    const placeBlockedBy = (part, pose) => {
        const placed = {id: '__placing__', part, position: pose.position, rotation: pose.rotation};
        const hit = solidOverlaps({...editor.model, parts: [...editor.model.parts, placed]}, catalogMap, placed)[0];
        const into = hit && partsById().get(hit.part);
        return hit ? {part: placed.id, into: hit.part, target: into ? into.part : null} : null;
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
        if (p.blocked) {
            // Refused, never silently: the parts go back and the status says why.
            placeMeshes();
            status({kind: 'refused', reason: 'overlapMove', target: p.blocked.target});
            return;
        }
        if (run({type: 'moveMany', moves: changed}, {moved: changed.length, snapped: Boolean(p.candidate)})) {
            status(p.candidate ? {...snapStatus(p.candidate), kind: 'snapped'} : {kind: 'moved', count: changed.length});
        } else {
            placeMeshes();
        }
    };

    // ---- the placing tool (palette) ---------------------------------------------
    /**
     * Where a part rests on a surface at a world point: upright, turned, its
     * footprint centred on the point, its colliders' bottom ON the surface
     * (overlap.js `restingPosition`), x/z on the grid.
     */
    const restingPose = (part, point, turns) => {
        const rotation = worldAxisRotation('y', (((turns % 4) + 4) % 4) * QUARTER);
        const meta = catalogMap.get(part);
        if (meta && meta.colliders && meta.colliders.length) {
            return {position: restingPosition({meta, rotation, point: worldToLdu(point), grid: gridStep}), rotation};
        }
        const geom = partGeometry(part, read, colors);
        geom.computeBoundingBox();
        const probe = new Box3().copy(geom.boundingBox).applyMatrix4(worldMatrix([0, 0, 0], rotation));
        const centre = probe.getCenter(new Vector3());
        // Origin such that the footprint's centre is under the pointer and the lowest point touches the surface.
        const origin = new Vector3(point.x - centre.x, point.y - probe.min.y, point.z - centre.z);
        const ldu = worldToLdu(origin);
        return {position: [Math.round(ldu[0] / gridStep) * gridStep, Math.round(ldu[1]), Math.round(ldu[2] / gridStep) * gridStep].map(tidy), rotation};
    };

    /** The palette ghost's free pose, and what it would push into. */
    const setFreePose = pose => {
        freePose = pose ? {...pose, blocked: placeBlockedBy(tool.part, pose)} : null;
        if (freePose) showGhost(tool.part, freePose.position, freePose.rotation, freePose.blocked ? 'blocked' : 'free');
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
        setFreePose(restingPose(tool.part, surface.point, tool.turns));
        const on = surface.part && partsById().get(surface.part);
        if (freePose.blocked) status({kind: 'blocked', target: freePose.blocked.target});
        else status(on ? {kind: 'onTop', target: on.part} : {kind: 'floor'});
    };

    const place = ({keepTool = false} = {}) => {
        const pose = candidate || freePose;
        if (!tool || !pose) return null;
        if (!candidate && freePose.blocked) {
            status({kind: 'refused', reason: 'overlapPlace', target: freePose.blocked.target});
            return null;
        }
        const snapped = Boolean(candidate);
        const part = tool.part;
        if (!run({type: 'place', part, position: pose.position, rotation: pose.rotation, color: DEFAULT_COLOR}, {placed: part})) return null;
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
        // Esc, the palette or Build closing: a drag of another part (or any) is over.
        if (paletteDrag && (!part || part !== paletteDrag.part)) {
            const d = detachPaletteDrag();
            d.onEnd({dragged: d.dragging, placed: null});
        }
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

    // ---- dragging a part out of the palette -------------------------------------------
    // The press is on the palette (a DOM element outside the canvas), so the drag is
    // followed on the window. Once the pointer has travelled CLICK_PX it is a drag: the
    // placing tool starts, and over the canvas the ghost follows the pointer through the
    // same updateGhost (magnet, resting on top, overlap) as a click-armed tool's. A
    // press that never travels is a click: the palette arms the tool itself.
    const insideCanvas = event => {
        const rect = canvas.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    };
    const onPaletteMove = event => {
        const d = paletteDrag;
        if (!d || event.pointerId !== d.pointerId) return;
        if (!d.dragging) {
            if (travelled(event, d) <= CLICK_PX) return;
            d.dragging = true;
            setTool(d.part);
        }
        readModifiers(event);
        if (insideCanvas(event)) {
            updateGhost(event);
        } else {
            candidate = null;
            freePose = null;
            clearGhost();
            status({kind: 'dragging', part: d.part});
        }
    };
    const onPaletteUp = event => {
        const d = paletteDrag;
        if (!d || event.pointerId !== d.pointerId) return;
        detachPaletteDrag();
        let placed = null;
        if (d.dragging) {
            if (insideCanvas(event) && event.type === 'pointerup') {
                readModifiers(event);
                updateGhost(event);
                placed = place(); // null: refused (overlap, said in the status) or nothing under the pointer
            }
            if (tool) {
                // Not placed: the tool ends with the drag (a click arms it; a drag only carries it).
                const refused = lastStatus.kind === 'refused';
                setTool(null);
                if (!refused) status({kind: 'idle'});
            }
        }
        d.onEnd({dragged: d.dragging, placed});
    };
    const onPaletteKey = event => {
        if (event.key !== 'Escape' || !paletteDrag) return;
        event.preventDefault();
        const d = detachPaletteDrag();
        if (d.dragging) {
            setTool(null);
            status({kind: 'idle'});
        }
        d.onEnd({dragged: d.dragging, placed: null});
    };
    function detachPaletteDrag () {
        const d = paletteDrag;
        paletteDrag = null;
        window.removeEventListener('pointermove', onPaletteMove, true);
        window.removeEventListener('pointerup', onPaletteUp, true);
        window.removeEventListener('pointercancel', onPaletteUp, true);
        window.removeEventListener('keydown', onPaletteKey, true);
        return d;
    }
    /**
     * A press on a palette part. Returns at once; `onEnd({dragged, placed})` reports how
     * it ended: `dragged` false for a click (the palette then arms the tool), `placed`
     * the new part's {id, snapped} when a drag dropped it in the view.
     */
    const pressPalettePart = (part, event, onEnd = () => {}) => {
        if (paletteDrag) detachPaletteDrag();
        paletteDrag = {part, x: event.clientX, y: event.clientY, pointerId: event.pointerId, dragging: false, onEnd};
        window.addEventListener('pointermove', onPaletteMove, true);
        window.addEventListener('pointerup', onPaletteUp, true);
        window.addEventListener('pointercancel', onPaletteUp, true);
        window.addEventListener('keydown', onPaletteKey, true);
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
                setFreePose({position: freePose.position, rotation: cleanRotation(mul3(worldAxisRotation('y', direction * QUARTER), freePose.rotation))});
                if (freePose.blocked) status({kind: 'blocked', target: freePose.blocked.target});
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
                const blocked = blockedBy([move], on.pairs.map(pair => pair.fixed.part));
                if (blocked) { status({kind: 'refused', reason: 'overlapTurn', target: blocked.target}); return; }
                if (run({type: 'moveMany', moves: [move]}, {turned: 1})) status({...snapStatus(on), kind: 'turnedAbout'});
                return;
            }
        }
        let worldAxis = 'y';
        if (axis === 'facing') worldAxis = facingAxis(camera.getWorldDirection(new Vector3()));
        const moves = rotatePoses(parts, worldAxisRotation(worldAxis, direction * QUARTER), selectionPivot(parts, gridStep));
        const blocked = blockedBy(moves);
        if (blocked) { status({kind: 'refused', reason: 'overlapTurn', target: blocked.target}); return; }
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
    const PASTE_OFFSETS = [
        [20, 0, 0], [-20, 0, 0], [0, 0, 20], [0, 0, -20],
        [40, 0, 0], [-40, 0, 0], [0, 0, 40], [0, 0, -40],
        [0, -24, 0]
    ];
    const pasteParts = parts => {
        const offset = freeOffset({model: editor.model, catalog: catalogMap, parts, offsets: PASTE_OFFSETS});
        if (!offset) {
            status({kind: 'refused', reason: 'noRoom'});
            return;
        }
        const before = editor.model.parts.length;
        const ports = portsForCopies(editor.model, catalog, parts);
        if (!run({type: 'batch', commands: placeCopies(parts, offset, ports)}, {pasted: parts.length})) return;
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
        if (needSelection()) pasteParts(selectedParts());
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
        pasteParts(clipboard);
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
        // The gizmo gets the press when the pointer is on one of its handles (on a
        // part, only on the handle's visible shape: the picker reaches further).
        if (gizmoGrab(event)) { controls.enabled = false; return; }
        const base = {x: event.clientX, y: event.clientY, pointerId: event.pointerId};
        if (tool) { gesture = {...base, kind: 'tool'}; return; }
        const hit = partUnder(event);
        if (event.shiftKey) {
            // Shift: click toggles a part, drag on anything draws a selection box.
            controls.enabled = false;
            transform.enabled = false; // even when the gizmo's picker reaches over the part
            gesture = {...base, kind: 'box', hit: hit ? hit.object.name : null};
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        if (hit) {
            const id = hit.object.name;
            if (!selection.includes(id)) setSelection([id]);
            controls.enabled = false;
            transform.enabled = false;
            // The pressed point on the part, and how high above the part's own bottom it is:
            // while dragging, that point stays under the pointer and the bottom rests on
            // the surface under it.
            modelGroup.updateMatrixWorld(true);
            const bottom = modelBox(selection).min.y;
            gesture = {...base, kind: 'part', start: selectedParts(), grab: hit.point.clone(), bottom, started: false};
            canvas.setPointerCapture(event.pointerId);
            return;
        }
        gesture = {...base, kind: 'empty'};
    }

    const onMove = event => {
        readModifiers(event);
        if (paletteDrag && paletteDrag.dragging) return; // onPaletteMove follows it
        if (tool && (!gesture || travelled(event, gesture) <= CLICK_PX)) { updateGhost(event); return; }
        if (!gesture) {
            if (transform.dragging) return;
            gizmoHover = gizmoGrab(event);
            if (gizmoHover) {
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
            if (!surface) return;
            // Where the pressed point would be: on the pointer's ray, as high above the
            // surface as it was above the part's bottom.
            const ray = raycaster.ray;
            const height = surface.point.y + (gesture.grab.y - gesture.bottom);
            const t = Math.abs(ray.direction.y) > 1e-6 ? (height - ray.origin.y) / ray.direction.y : -1;
            const at = t > 0 ? ray.at(t, new Vector3()) : surface.point.clone();
            const d = worldDeltaToLdu(new Vector3(at.x - gesture.grab.x, surface.point.y - gesture.bottom, at.z - gesture.grab.z));
            const delta = [Math.round(d[0] / gridStep) * gridStep, Math.round(d[1]), Math.round(d[2] / gridStep) * gridStep].map(tidy);
            let aimed = null;
            if (surface.part && gesture.start.length === 1) {
                const p = worldToLdu(surface.point);
                const s0 = gesture.start[0];
                aimed = {id: s0.id, position: [p[0], s0.position[1] + delta[1], p[2]], rotation: s0.rotation};
            }
            showMove(gesture.start, translatePoses(gesture.start, delta), delta, aimed);
            if (!preview.candidate && !preview.blocked) {
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
        fitGizmo();
        s.updateMatrixWorld();
        camera.updateMatrixWorld();
        const size = renderer.getSize(new Vector2());
        insight.update(camera, size.x, size.y);
        renderer.render(s, camera);
    };
    const dispose = () => {
        unsubscribe();
        if (paletteDrag) detachPaletteDrag();
        insight.dispose();
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('keydown', onKey);
        canvas.removeEventListener('keyup', onKeyUp);
        clearGhost();
        for (const mesh of meshes.values()) for (const m of [].concat(mesh.material)) m.dispose();
        for (const pair of materials.values()) for (const m of pair) m.dispose();
        for (const set of lineMaterials.values()) for (const m of [...set.edges, ...set.conditional]) m.dispose();
        for (const g of edges.values()) g.dispose();
        selectedLine.dispose();
        selectedHidden.dispose();
        hoverLine.dispose();
        blockedLine.dispose();
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
        canvas, render, resize, dispose, setTool, frameModel, pressPalettePart,
        /** Whether a part from the palette is being dragged right now. */
        get draggingFromPalette () { return Boolean(paletteDrag && paletteDrag.dragging); },
        get selected () { return selection[0] || null; },
        get selection () { return selection.slice(); },
        get mode () { return mode; },
        get grid () { return gridStep; },
        /** The gizmo handle under the pointer ('X', 'Y', 'XY', …) or null: what a press would grab. */
        get gizmoAxis () { return transform.object ? gizmoHover : null; },
        /** While a move is previewed: the part it would push into (shown red), else null. */
        get blockedInto () { return preview && preview.blocked ? preview.blocked.into : null; },
        setGrid (step) { if (GRID_STEPS.includes(step)) gridStep = step; },
        setMode,
        select: ids => setSelection([].concat(ids || [])),
        selectAll: () => setSelection(editor.model.parts.map(p => p.id)),
        deleteSelection, duplicate, copy, paste, undo, redo, view, fitSelection, groupSelection, ungroupSelection,
        setMotion, setOverlay,
        /** What the overlay shows now (for the browser gate). */
        overlayStats: () => ({...insight.stats(),
            tinted: [...meshes.values()].filter(m => [].concat(m.material).some(x => x.userData.baseColor && !x.color.equals(x.userData.baseColor))).length}),
        turn: (axis, direction = 1) => turnSelection(axis, direction),
        /** World position (metres) of a point on a part (LDU, part frame) or of the gizmo, for the browser gate to aim at. */
        debugPoint: (id, local = [0, 0, 0]) => {
            if (id === 'gizmo') return transform.object ? pivotObject.position.toArray() : null;
            const p = partsById().get(id);
            return p ? lduToWorld(mulVec3(p.rotation, local).map((v, i) => v + p.position[i])) : null;
        },
        /** The floor point (LDU) under a client pixel, or null (for the browser gate to read where a drop aimed). */
        floorPointAt: (clientX, clientY) => {
            const ray = pick({clientX, clientY});
            const p = ray.ray.intersectPlane(floor, new Vector3());
            return p ? worldToLdu(p).map(tidy) : null;
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
            setFreePose(candidate ? null : restingPose(part, new Vector3(p.x, floorY, p.z), turns));
            const done = place();
            return {snapped: Boolean(done && done.snapped)};
        }
    };
};
