// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Big models (thousands of parts) drawn in a few dozen draw calls instead of
// several per part: every placement of the same part geometry (part file and,
// for a motor, the housing or drive-hub piece) is ONE THREE.InstancedMesh for
// its own-colour faces, one for its fixed-colour faces, and instanced line
// segments for its edges and conditional edges. The geometry is the cached
// partVisual (view/part-geometry.js): one BufferGeometry per part, shared by
// all instances and all colours; the placed colour is a per-instance colour.
//
// THE PARTS STAY OBJECTS. Each placed part keeps its own invisible Mesh — a
// "proxy" — where it always was: in its physics body's group (Simulate) or in
// the editor's model group (Build), with its own materials. Everything that
// works per part keeps working unchanged: picking (the editor raycasts the
// proxies, which three does whether or not they are visible, so a hit's
// object is still the part's mesh and its name the part id), port badges and
// bounds (a proxy's geometry and matrixWorld), "show how it moves" tints and
// highlight pulses (a proxy's material colour and emissive). sync() mirrors
// the proxies into the instances once per frame, after three has updated the
// world matrices and before it draws (Scene.onBeforeRender): instance matrix =
// proxy.matrixWorld, instance colour = the proxy material's colour plus its
// emissive glow. partAt(object, instanceId) maps an instance back to its part
// id for code that raycasts the instanced meshes themselves.
//
// A proxy's `userData.hidden` (the build view's "hide") draws its instance at
// zero scale, and `userData.dim` (the rest of the model while a group is being
// edited) blends its colour most of the way to DIM_COLOR: instances share one
// opaque material, so they step back by colour, not by transparency.

import {
    BufferGeometry, Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedBufferGeometry,
    InstancedMesh, LineSegments, Matrix4, MeshStandardMaterial, ShaderMaterial
} from 'three';
import {PART_SURFACE} from './part-style.js';

/** The colour a dimmed instance fades towards (the build view's background) and how far. */
export const DIM_COLOR = new Color(0xe8eef5);
const DIM_AMOUNT = 0.75;

/** Models with at least this many parts are drawn instanced (smaller ones: one mesh per part, as before). */
export const INSTANCE_FROM = 200;

/**
 * The page's override: `window.__bwSimLabInstancing = true|false` forces instancing on or off in
 * both views (scripts/measure-sim-lab-scale.mjs measures the same model both ways); else 'auto'.
 */
const pageOverride = () => (typeof window !== 'undefined' && typeof window.__bwSimLabInstancing === 'boolean' ?
    window.__bwSimLabInstancing : 'auto');

/** Whether a model of `count` parts is drawn instanced, for an `instancing` option of true, false or 'auto'. */
export const useInstancing = (count, instancing = pageOverride()) => (instancing === 'auto' ? count >= INSTANCE_FROM : Boolean(instancing));

const LINE_VERTEX = /* glsl */`
    attribute mat4 iClipFromInstance;
    attribute vec3 iTint;
    attribute vec3 color;
    varying vec3 vColor;
    void main () {
        vColor = color * iTint;
        gl_Position = iClipFromInstance * vec4(position, 1.0);
    }`;
const LINE_FRAGMENT = /* glsl */`
    varying vec3 vColor;
    void main () {
        gl_FragColor = vec4(vColor, 1.0);
        #include <colorspace_fragment>
    }`;
// part-style.js's conditional-line rule, per instance.
const CONDITIONAL_VERTEX = /* glsl */`
    attribute mat4 iClipFromInstance;
    attribute vec3 iTint;
    attribute vec3 control0;
    attribute vec3 control1;
    attribute vec3 direction;
    attribute vec3 color;
    varying float vDiscard;
    varying vec3 vColor;
    void main () {
        vColor = color * iTint;
        mat4 mvp = iClipFromInstance;
        vec4 c0 = mvp * vec4(control0, 1.0);
        vec4 c1 = mvp * vec4(control1, 1.0);
        vec4 p0 = mvp * vec4(position, 1.0);
        vec4 p1 = mvp * vec4(position + direction, 1.0);
        vec2 a = p0.xy / p0.w;
        vec2 b = p1.xy / p1.w;
        vec2 normal = vec2(a.y - b.y, b.x - a.x);
        float d0 = dot(normal, c0.xy / c0.w - a);
        float d1 = dot(normal, c1.xy / c1.w - a);
        vDiscard = d0 * d1 < 0.0 ? 1.0 : 0.0;
        gl_Position = p0;
    }`;
const CONDITIONAL_FRAGMENT = /* glsl */`
    varying float vDiscard;
    varying vec3 vColor;
    void main () {
        if (vDiscard > 0.5) discard;
        gl_FragColor = vec4(vColor, 1.0);
        #include <colorspace_fragment>
    }`;

// Clip transforms are prepared in the scene callback, before Three uploads geometry
// attributes. A material callback is later than that upload boundary.
const lineShaderMaterial = (vertexShader, fragmentShader) => new ShaderMaterial({vertexShader, fragmentShader});

const groupRange = (geometry, index) => geometry.groups.find(g => g.materialIndex === index) || null;

/** A geometry drawing one group of `source`, sharing its attribute buffers (uploaded once). */
const subGeometry = (source, range, instanced) => {
    const geo = instanced ? new InstancedBufferGeometry() : new BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geo.setAttribute(name, attribute);
    geo.setDrawRange(range.start, range.count);
    if (source.boundingSphere) geo.boundingSphere = source.boundingSphere.clone();
    if (source.boundingBox) geo.boundingBox = source.boundingBox.clone();
    return geo;
};

/**
 * @param {{colors: Map<number, {value: string, edge: string, alpha: number}>}} options LDConfig colours
 * @returns {{object: Group, add: Function, build: Function, sync: Function, partAt: Function, stats: Function, dispose: Function}}
 */
export const createInstancedParts = ({colors}) => {
    const object = new Group();
    object.name = 'instanced-parts';
    const pending = []; // {proxy, visual, code}
    const batches = []; // {entries, matrices, meshes: [{mesh, kind}], ...}
    const created = {geometries: new Set(), materials: new Set()};
    const fallback = colors.get(16) || {value: '#cccccc', edge: '#333333', alpha: 1};
    const info = code => colors.get(code) || fallback;

    const materialsByKey = new Map();
    const shared = (key, make) => {
        if (!materialsByKey.has(key)) {
            const m = make();
            created.materials.add(m);
            materialsByKey.set(key, m);
        }
        return materialsByKey.get(key);
    };
    const ownMaterial = alpha => shared(`own:${alpha}`, () => new MeshStandardMaterial({color: '#ffffff', ...PART_SURFACE,
        transparent: alpha < 1, opacity: alpha, depthWrite: alpha >= 1}));
    const fixedMaterial = () => shared('fixed', () => new MeshStandardMaterial({color: '#ffffff', ...PART_SURFACE, vertexColors: true}));
    const lineMaterial = () => shared('lines', () => lineShaderMaterial(LINE_VERTEX, LINE_FRAGMENT));
    const conditionalMaterial = () => shared('conditional', () => lineShaderMaterial(CONDITIONAL_VERTEX, CONDITIONAL_FRAGMENT));

    /**
     * Register a placed part.
     * @param {Mesh} proxy its per-part mesh (made invisible here)
     * @param {{faces: BufferGeometry, edges: BufferGeometry, conditional: BufferGeometry}} visual from partVisual
     * @param {number} code its LDraw colour
     */
    const add = (proxy, visual, code) => {
        proxy.visible = false;
        pending.push({proxy, visual, code});
    };

    /** Make the instanced meshes for everything added (call once, after the proxies are placed). */
    const build = () => {
        const groups = new Map(); // visual → alpha → entries
        for (const entry of pending) {
            const alpha = info(entry.code).alpha;
            if (!groups.has(entry.visual)) groups.set(entry.visual, new Map());
            const byAlpha = groups.get(entry.visual);
            if (!byAlpha.has(alpha)) byAlpha.set(alpha, []);
            byAlpha.get(alpha).push(entry);
        }
        pending.length = 0;
        for (const [visual, byAlpha] of groups) {
            for (const [alpha, entries] of byAlpha) {
                const n = entries.length;
                const matrices = new InstancedBufferAttribute(new Float32Array(n * 16), 16);
                matrices.setUsage(DynamicDrawUsage);
                const batch = {entries, matrices, meshes: [], colours: []};
                const addMesh = (mesh, kind) => {
                    mesh.frustumCulled = false; // instances move with their bodies: no static bounds
                    mesh.name = `instanced:${kind}`;
                    mesh.userData.batch = batch;
                    object.add(mesh);
                    batch.meshes.push({mesh, kind});
                };
                const ownFaces = groupRange(visual.faces, 0);
                const fixedFaces = groupRange(visual.faces, 1);
                for (const [range, kind, material] of [[ownFaces, 'own', ownMaterial(alpha)], [fixedFaces, 'fixed', fixedMaterial()]]) {
                    if (!range || !range.count) continue;
                    const geo = subGeometry(visual.faces, range, false);
                    created.geometries.add(geo);
                    const mesh = new InstancedMesh(geo, material, n);
                    mesh.instanceMatrix = matrices;
                    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
                    mesh.instanceColor.setUsage(DynamicDrawUsage);
                    batch.colours.push({kind, attribute: mesh.instanceColor});
                    addMesh(mesh, kind);
                }
                for (const [source, kind, material] of [[visual.edges, 'edges', lineMaterial()], [visual.conditional, 'conditional', conditionalMaterial()]]) {
                    for (const [index, side] of [[0, 'own'], [1, 'fixed']]) {
                        const range = groupRange(source, index);
                        if (!range || !range.count) continue;
                        const geo = subGeometry(source, range, true);
                        geo.instanceCount = n;
                        geo.setAttribute('iMatrix', matrices);
                        // World matrices remain shared with faces. Clip data belongs to
                        // this line object: siblings may have different world transforms.
                        const clipMatrices = new InstancedBufferAttribute(new Float32Array(n * 16), 16);
                        clipMatrices.setUsage(DynamicDrawUsage);
                        geo.setAttribute('iClipFromInstance', clipMatrices);
                        // Own-colour lines are drawn in the placed colour's EDGE; fixed ones in their own colours.
                        const tint = new Float32Array(n * 3).fill(1);
                        if (side === 'own') {
                            const c = new Color();
                            entries.forEach((e, i) => c.set(info(e.code).edge).toArray(tint, i * 3));
                        }
                        geo.setAttribute('iTint', new InstancedBufferAttribute(tint, 3));
                        created.geometries.add(geo);
                        const lines = new LineSegments(geo, material);
                        lines.raycast = () => {};
                        addMesh(lines, `${kind}-${side}`);
                    }
                }
                batches.push(batch);
            }
        }
        sync(true);
    };

    const scratch = new Color();
    const glow = new Color();
    const ZERO = new Array(16).fill(0);
    const viewProjection = new Matrix4();
    const objectClip = new Matrix4();
    const effectiveInstance = new Matrix4();
    const instanceClip = new Matrix4();
    /**
     * Copy proxy world matrices and colors, requesting uploads only for changed Float32 values.
     * With the actual render camera, prepare each line object's clip data before attribute upload.
     * @param {boolean} [force] upload even if nothing changed
     * @param {Camera} [camera] actual render camera, supplied by Scene.onBeforeRender
     */
    const sync = (force = false, camera = null) => {
        // Scene and camera world matrices are current here; per-object
        // modelViewMatrix is not refreshed until the later draw callback.
        if (camera) viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        for (const batch of batches) {
            const m = batch.matrices.array;
            let moved = force;
            batch.entries.forEach(({proxy}, i) => {
                const e = proxy.userData.hidden ? ZERO : proxy.matrixWorld.elements;
                const o = i * 16;
                for (let k = 0; k < 16; k++) {
                    if (m[o + k] !== Math.fround(e[k])) {
                        m[o + k] = e[k];
                        moved = true;
                    }
                }
            });
            if (moved) batch.matrices.needsUpdate = true;
            for (const {kind, attribute} of batch.colours) {
                const a = attribute.array;
                let changed = force;
                batch.entries.forEach(({proxy}, i) => {
                    const material = [].concat(proxy.material)[kind === 'own' ? 0 : 1] || [].concat(proxy.material)[0];
                    // Own faces: the placed (or tinted) colour. Fixed faces keep their vertex colours (white) unless tinted.
                    if (kind === 'own' || !material.vertexColors) scratch.copy(material.color);
                    else scratch.setRGB(1, 1, 1);
                    if (material.emissive) scratch.add(glow.copy(material.emissive));
                    if (proxy.userData.dim) scratch.lerp(DIM_COLOR, DIM_AMOUNT);
                    const o = i * 3;
                    if (a[o] !== Math.fround(scratch.r) || a[o + 1] !== Math.fround(scratch.g) || a[o + 2] !== Math.fround(scratch.b)) {
                        a[o] = scratch.r;
                        a[o + 1] = scratch.g;
                        a[o + 2] = scratch.b;
                        changed = true;
                    }
                });
                if (changed) attribute.needsUpdate = true;
            }
            if (camera) {
                for (const {mesh, kind} of batch.meshes) {
                    if (!kind.startsWith('edges-') && !kind.startsWith('conditional-')) continue;
                    const attribute = mesh.geometry.getAttribute('iClipFromInstance');
                    const clip = attribute.array;
                    objectClip.multiplyMatrices(viewProjection, mesh.matrixWorld);
                    let changed = force;
                    for (let i = 0; i < batch.entries.length; i++) {
                        // Derive from the effective Float32 instance actually used
                        // by the GPU, including the zero matrix for a hidden proxy.
                        effectiveInstance.fromArray(m, i * 16);
                        instanceClip.multiplyMatrices(objectClip, effectiveInstance);
                        for (let k = 0; k < 16; k++) {
                            const value = Math.fround(instanceClip.elements[k]);
                            if (clip[i * 16 + k] !== value) {
                                clip[i * 16 + k] = value;
                                changed = true;
                            }
                        }
                    }
                    if (changed) attribute.needsUpdate = true;
                }
            }
        }
    };

    /** The part id an instance draws: (an instanced mesh or line set, instanceId) → its proxy's name. */
    const partAt = (mesh, instanceId) => mesh?.userData?.batch?.entries[instanceId]?.proxy.name ?? null;

    /** Draw calls and instances, for the scale measurements and the browser gate. */
    const stats = () => ({
        batches: batches.length,
        drawObjects: batches.reduce((n, b) => n + b.meshes.length, 0),
        instances: batches.reduce((n, b) => n + b.entries.length, 0)
    });

    const dispose = () => {
        for (const g of created.geometries) g.dispose();
        for (const m of created.materials) m.dispose();
        for (const batch of batches) for (const {mesh} of batch.meshes) mesh.dispose?.();
        object.clear();
        batches.length = 0;
        pending.length = 0;
    };

    return {object, add, build, sync, partAt, stats, dispose};
};
