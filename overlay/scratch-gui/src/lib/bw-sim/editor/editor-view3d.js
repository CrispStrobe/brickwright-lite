// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab's build view (docs/SIM-LAB-PLAN.md C3/C5): the model being
// edited, a ghost of the part being placed, and the mouse. Parts only attach
// connector to connector (editor/snap.js); with nothing to attach to, a part
// lies on the floor. Every change goes through the editor's command stack
// (editor/editor-state.js), so undo/redo and the LDraw text stay exact.
//
//   palette pick  → ghost follows the mouse; green = snapped, blue = on the floor
//   R             → turn 90° (about the snap axis, or upright on the floor)
//   click         → place;  Esc → stop placing
//   click a part  → select (no part tool);  Delete → delete;  Ctrl+D → clone
//
// Frames: the model is LDraw (LDU, -y up); the scene is metres, +y up, via the
// contract's lduToWorld — a 180° turn about x, so a placed rotation R becomes
// F·R·F with F = diag(1, -1, -1).

import {
    AmbientLight, Box3, Color, DirectionalLight, GridHelper, Group, Matrix4, Mesh, MeshStandardMaterial,
    PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer
} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {LDU_M, lduToWorld} from '../contracts.js';
import {partGeometry} from '../view/part-geometry.js';
import {snapCandidates, rotateAboutSnap} from './snap.js';

/** Default LDraw colour of a newly placed part (Light Bluish Grey). */
export const DEFAULT_COLOR = 71;
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** 90° about LDraw's vertical (y) axis. */
const TURN_Y = [0, 0, 1, 0, 1, 0, -1, 0, 0];

const mul3 = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));

/** A placed pose (LDraw) as a world Matrix4. */
export const worldMatrix = (position, rotation) => {
    const f = [rotation[0], -rotation[1], -rotation[2], -rotation[3], rotation[4], rotation[5], -rotation[6], rotation[7], rotation[8]];
    const p = lduToWorld(position);
    return new Matrix4().set(f[0], f[1], f[2], p[0], f[3], f[4], f[5], p[1], f[6], f[7], f[8], p[2], 0, 0, 0, 1);
};

/** A world point (metres, y up) in LDraw units. */
export const worldToLdu = v => [v.x / LDU_M, (0 - v.y) / LDU_M, (0 - v.z) / LDU_M];

export const createEditorView3D = ({container, read, colors, catalog, editor, onSelect = () => {}, onChange = () => {}}) => {
    const renderer = new WebGLRenderer({antialias: true});
    const canvas = renderer.domElement;
    canvas.dataset.testid = 'bw-sim-lab-editor-canvas';
    canvas.tabIndex = 0;
    Object.assign(canvas.style, {width: '100%', height: '100%', display: 'block', borderRadius: '6px', touchAction: 'none', outline: 'none'});
    container.appendChild(canvas);

    const stage = new Group();
    const model = new Group();
    const ghostGroup = new Group();
    stage.add(model);
    stage.add(ghostGroup);
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
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.update();

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
    const ghostMaterial = (snapped) => [0, 1].map(() => new MeshStandardMaterial({
        color: snapped ? '#22c55e' : '#3b82f6', transparent: true, opacity: 0.55, depthWrite: false
    }));

    const meshes = new Map();
    let selected = null;
    let tool = null; // {part, turns, freeRotation}
    let candidate = null;
    let freePose = null;
    let floorY = 0;

    const highlight = () => {
        for (const [id, mesh] of meshes) {
            const on = id === selected;
            for (const m of [].concat(mesh.material)) m.emissive?.setHex(on ? 0x2563eb : 0x000000);
        }
    };

    const rebuild = () => {
        for (const mesh of meshes.values()) {
            model.remove(mesh);
            for (const m of [].concat(mesh.material)) m.dispose();
        }
        meshes.clear();
        for (const p of editor.model.parts) {
            // Each mesh gets its own material pair so a selection highlight is per part.
            const mats = materialsFor(p.color ?? DEFAULT_COLOR).map(m => m.clone());
            const mesh = new Mesh(partGeometry(p.part, read, colors), mats);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.copy(worldMatrix(p.position, p.rotation));
            mesh.name = p.id;
            model.add(mesh);
            meshes.set(p.id, mesh);
        }
        // The floor sits under the lowest part (or at y = 0 for an empty model).
        const box = new Box3().setFromObject(model);
        floorY = box.isEmpty() ? 0 : box.min.y;
        grid.position.y = floorY;
        floor.constant = -floorY;
        if (selected && !meshes.has(selected)) setSelected(null);
        highlight();
    };

    const setSelected = id => {
        selected = id;
        highlight();
        onSelect(id);
    };

    const clearGhost = () => {
        for (const c of [...ghostGroup.children]) {
            ghostGroup.remove(c);
            for (const m of [].concat(c.material)) m.dispose();
        }
    };

    const showGhost = (part, position, rotation, snapped) => {
        clearGhost();
        const mesh = new Mesh(partGeometry(part, read, colors), ghostMaterial(snapped));
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(worldMatrix(position, rotation));
        mesh.name = 'ghost';
        ghostGroup.add(mesh);
    };

    const pointer = new Vector2();
    const raycaster = new Raycaster();
    const pick = event => {
        const rect = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster;
    };

    /** Where the part would lie on the floor at a world point, upright, turned `turns` quarter turns. */
    const floorPose = (part, point, turns) => {
        let rotation = I3;
        for (let i = 0; i < turns % 4; i++) rotation = mul3(TURN_Y, rotation);
        const geom = partGeometry(part, read, colors);
        geom.computeBoundingBox();
        // Lift so the part's lowest point (in world) touches the floor.
        const probe = new Box3().copy(geom.boundingBox).applyMatrix4(worldMatrix([0, 0, 0], rotation));
        const at = new Vector3(point.x, floorY - probe.min.y, point.z);
        return {position: worldToLdu(at).map(v => Math.round(v)), rotation};
    };

    const updateGhost = event => {
        if (!tool) return;
        const ray = pick(event);
        const hits = ray.intersectObjects([...meshes.values()], false);
        const point = hits.length ? hits[0].point : ray.ray.intersectPlane(floor, new Vector3());
        if (!point) return;
        const dragged = {position: worldToLdu(point), rotation: tool.freeRotation || I3};
        const found = snapCandidates({model: editor.model, catalog, part: tool.part, pose: dragged});
        if (found.length) {
            candidate = rotateAboutSnap(found[0], tool.turns);
            freePose = null;
            showGhost(tool.part, candidate.position, candidate.rotation, true);
        } else {
            candidate = null;
            freePose = floorPose(tool.part, point, tool.turns);
            showGhost(tool.part, freePose.position, freePose.rotation, false);
        }
    };

    const place = () => {
        const pose = candidate || freePose;
        if (!tool || !pose) return;
        editor.apply({type: 'place', part: tool.part, position: pose.position, rotation: pose.rotation, color: DEFAULT_COLOR});
        const placed = editor.model.parts[editor.model.parts.length - 1];
        onChange(editor.model, {placed: placed.id, snapped: Boolean(candidate)});
    };

    const onMove = event => updateGhost(event);
    let downAt = null;
    const onDown = event => { downAt = [event.clientX, event.clientY]; };
    const onUp = event => {
        // A drag orbits the camera; only a click (moved < 4 px) acts.
        if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 4) return;
        if (tool) {
            updateGhost(event);
            place();
            return;
        }
        const hits = pick(event).intersectObjects([...meshes.values()], false);
        setSelected(hits.length ? hits[0].object.name : null);
    };
    const onKey = event => {
        if (event.key === 'Escape') { setTool(null); setSelected(null); return; }
        if (event.key === 'r' || event.key === 'R') {
            if (tool) {
                tool.turns = (tool.turns + 1) % 4;
                if (candidate) {
                    candidate = rotateAboutSnap(candidate, 1);
                    showGhost(tool.part, candidate.position, candidate.rotation, true);
                } else if (freePose) {
                    freePose = {...freePose, rotation: mul3(TURN_Y, freePose.rotation)};
                    showGhost(tool.part, freePose.position, freePose.rotation, false);
                }
            }
            return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
            editor.apply({type: 'delete', id: selected});
            onChange(editor.model, {deleted: true});
            return;
        }
        if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'D') && selected) {
            event.preventDefault();
            editor.apply({type: 'clone', id: selected});
            onChange(editor.model, {cloned: true});
            return;
        }
        if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
            event.preventDefault();
            if (event.shiftKey) { if (editor.canRedo) editor.redo(); } else if (editor.canUndo) editor.undo();
            onChange(editor.model, {});
            return;
        }
        if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || event.key === 'Y')) {
            event.preventDefault();
            if (editor.canRedo) editor.redo();
            onChange(editor.model, {});
        }
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('keydown', onKey);
    const unsubscribe = editor.subscribe(() => rebuild());

    const setTool = part => {
        tool = part ? {part, turns: 0, freeRotation: null} : null;
        candidate = null;
        freePose = null;
        clearGhost();
        if (part) canvas.focus();
    };

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
    const frameModel = () => {
        const box = new Box3().setFromObject(model);
        if (box.isEmpty()) return;
        const centre = box.getCenter(new Vector3());
        const radius = Math.max(0.05, box.getSize(new Vector3()).length() / 2);
        const dir = new Vector3(1, 0.8, 1.2).normalize();
        camera.position.copy(centre).add(dir.multiplyScalar(radius * 3.6));
        controls.target.copy(centre);
        controls.update();
    };
    const render = () => {
        resize();
        renderer.render(s, camera);
    };
    const dispose = () => {
        unsubscribe();
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('keydown', onKey);
        clearGhost();
        for (const mesh of meshes.values()) for (const m of [].concat(mesh.material)) m.dispose();
        for (const pair of materials.values()) for (const m of pair) m.dispose();
        grid.geometry.dispose();
        grid.material.dispose();
        controls.dispose();
        renderer.dispose();
        canvas.remove();
    };

    rebuild();
    resize();
    frameModel();
    return {
        canvas, render, resize, dispose, setTool, frameModel,
        get selected () { return selected; },
        select: setSelected,
        // For the browser gate: place a part as a click at a world point would.
        placeAt (part, worldPoint, turns = 0) {
            setTool(part);
            tool.turns = turns;
            const p = new Vector3(...worldPoint);
            const dragged = {position: worldToLdu(p), rotation: I3};
            const found = snapCandidates({model: editor.model, catalog, part, pose: dragged});
            candidate = found.length ? rotateAboutSnap(found[0], turns) : null;
            freePose = candidate ? null : floorPose(part, p, turns);
            const snapped = Boolean(candidate);
            place();
            setTool(null);
            return {snapped};
        }
    };
};

