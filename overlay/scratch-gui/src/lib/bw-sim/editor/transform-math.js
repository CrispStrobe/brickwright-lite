// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The pure arithmetic behind the Sim Lab's build tools (editor-view3d.js):
// grid snapping, exact rotations, moving and turning a selection of parts as
// one, and the selection's group expansion. No DOM, no three: everything here
// works on LDraw poses (LDU, -y up, row-major 3×3 rotations) so node --test
// can check it and the LDraw text the editor writes stays exact.
//
// Why rotations are "cleaned": a part's rotation is written into the .ldr file
// and read back by the mechanism compiler, which matches connector axes within
// 1°, and validatePlacedModel refuses det ≠ +1. Composing float rotations drifts
// (cos 90° = 6e-17, not 0), so every rotation the editor produces is pushed
// back to an orthonormal, det +1 matrix with its near-0/±1 entries made exact.

/** The grid steps (LDU) a learner can choose; 10 LDU is half a Technic hole pitch. */
export const GRID_STEPS = [1, 5, 10, 20];
/** Default grid step in LDU. */
export const DEFAULT_GRID = 10;
/** Technic hole pitch in LDU: the offset a duplicate or a paste is moved by. */
export const HOLE_PITCH = 20;

export const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

/** The LDraw ↔ world change of frame, a 180° turn about x: F = diag(1, -1, -1). */
const F = [1, -1, -1];

/** Row-major 3×3 product a·b. */
export const mul3 = (a, b) => [0, 1, 2].flatMap(r => [0, 1, 2].map(c => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));

/** Row-major 3×3 times a vector. */
export const mulVec3 = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);

/** Determinant of a row-major 3×3. */
export const det3 = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);

const EXACT_EPS = 1e-9;
const snapEntry = v => {
    for (const k of [0, 1, -1]) if (Math.abs(v - k) < EXACT_EPS) return k === 0 ? 0 : k;
    return v;
};

/**
 * Pushes a nearly-proper rotation back to an exact one: Gram-Schmidt on the
 * rows (the third row is the cross product, so det is +1 by construction),
 * then entries within 1e-9 of 0, 1 or -1 are made exactly that.
 * @param {number[]} m row-major 3×3, close to a rotation
 * @returns {number[]} a proper rotation
 */
export const cleanRotation = m => {
    const norm = v => {
        const l = Math.hypot(v[0], v[1], v[2]);
        return v.map(x => x / l);
    };
    const r0 = norm(m.slice(0, 3));
    const r1raw = m.slice(3, 6);
    const d = r1raw[0] * r0[0] + r1raw[1] * r0[1] + r1raw[2] * r0[2];
    const r1 = norm(r1raw.map((x, i) => x - d * r0[i]));
    const r2 = [r0[1] * r1[2] - r0[2] * r1[1], r0[2] * r1[0] - r0[0] * r1[2], r0[0] * r1[1] - r0[1] * r1[0]];
    return [...r0, ...r1, ...r2].map(snapEntry);
};

/** True when `m` is a rotation (orthonormal, det +1) within `eps`. */
export const isProperRotation = (m, eps = 1e-9) => {
    if (!Array.isArray(m) || m.length !== 9 || m.some(v => !Number.isFinite(v))) return false;
    if (Math.abs(det3(m) - 1) > eps) return false;
    const t = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
    const p = mul3(m, t);
    return p.every((v, i) => Math.abs(v - IDENTITY[i]) <= eps);
};

/** An angle rounded to the nearest multiple of `stepDeg` degrees, in radians. */
export const quantizeAngle = (angle, stepDeg) => {
    const step = stepDeg * Math.PI / 180;
    return Math.round(angle / step) * step;
};

/**
 * The LDraw rotation that turns the scene by `angle` about a WORLD axis
 * (metres, +y up, as the gizmo and the camera see it).
 * @param {'x'|'y'|'z'} axis world axis
 * @param {number} angle radians, right-handed about +axis
 * @returns {number[]} exact proper rotation in the LDraw frame
 */
export const worldAxisRotation = (axis, angle) => {
    const c = snapEntry(Math.cos(angle));
    const s = snapEntry(Math.sin(angle));
    let w;
    if (axis === 'x') w = [1, 0, 0, 0, c, -s, 0, s, c];
    else if (axis === 'y') w = [c, 0, s, 0, 1, 0, -s, 0, c];
    else if (axis === 'z') w = [c, -s, 0, s, c, 0, 0, 0, 1];
    else throw new Error(`bad axis '${axis}'`);
    return cleanRotation(worldToLduRotation(w));
};

/** A world-frame rotation as the same rotation in the LDraw frame (F·W·F). */
export const worldToLduRotation = w => w.map((v, i) => v * F[Math.floor(i / 3)] * F[i % 3]);

/** Snaps every component of a translation (LDU) to a multiple of `grid`. */
export const snapDelta = (delta, grid) => delta.map(v => {
    if (!(grid > 0)) return v;
    const r = Math.round(v / grid) * grid;
    return r === 0 ? 0 : r;
});

/** Rounds away float noise from a position (LDraw writes six decimals at most). */
const tidy = v => {
    const r = Math.round(v * 1e6) / 1e6;
    return r === 0 ? 0 : r;
};

/**
 * Every part of a selection moved by one translation.
 * @param {{id: string, position: number[], rotation: number[]}[]} parts
 * @param {number[]} delta LDU
 * @returns {{id: string, position: number[], rotation: number[]}[]} the moves (for the `moveMany` command)
 */
export const translatePoses = (parts, delta) => parts.map(p => ({
    id: p.id,
    position: p.position.map((v, i) => tidy(v + delta[i])),
    rotation: p.rotation.slice()
}));

/**
 * Every part of a selection turned as one rigid group by `rotation` about `pivot`.
 * @param {{id: string, position: number[], rotation: number[]}[]} parts
 * @param {number[]} rotation LDraw-frame rotation (proper)
 * @param {number[]} pivot LDU
 * @returns {{id: string, position: number[], rotation: number[]}[]} the moves
 */
export const rotatePoses = (parts, rotation, pivot) => parts.map(p => {
    const rel = p.position.map((v, i) => v - pivot[i]);
    const turned = mulVec3(rotation, rel);
    return {
        id: p.id,
        position: turned.map((v, i) => tidy(v + pivot[i])),
        rotation: cleanRotation(mul3(rotation, p.rotation))
    };
});

/**
 * The point a selection turns about: a lone part turns about its own origin
 * (LDraw part origins sit on a hole or the part's centre), a group about the
 * mean of its origins rounded to the grid, so a group laid out on the Technic
 * lattice lands on the lattice again after a quarter turn.
 * @param {{position: number[]}[]} parts
 * @param {number} [grid]
 * @returns {number[]} LDU
 */
export const selectionPivot = (parts, grid = DEFAULT_GRID) => {
    if (!parts.length) return [0, 0, 0];
    if (parts.length === 1) return parts[0].position.slice();
    const mean = [0, 1, 2].map(i => parts.reduce((s, p) => s + p.position[i], 0) / parts.length);
    return mean.map(v => Math.round(v / grid) * grid);
};

/**
 * The parts that share a group with `id`, including `id`.
 *
 * GROUP HOOK: groups belong to another lane (editor-state.js `group`/`ungroup`,
 * persisted as LDraw meta lines). This reads whatever `model.groups` holds and
 * tolerates its absence: an array (or Map values) of `{id, parts|members|ids}`
 * records, or a plain object of id → member list. When the group format is
 * settled, this is the one place to adapt.
 * @param {object} model PlacedModel, maybe with `groups`
 * @param {string} id
 * @returns {string[]}
 */
export const groupMembers = (model, id) => {
    const groups = model && model.groups;
    if (!groups) return [id];
    const records = groups instanceof Map ? [...groups.values()] :
        Array.isArray(groups) ? groups : Object.values(groups);
    for (const g of records) {
        const members = Array.isArray(g) ? g : (g && (g.parts || g.members || g.ids));
        if (Array.isArray(members) && members.includes(id)) return [...new Set([id, ...members])];
    }
    return [id];
};

/**
 * A selection expanded so that a grouped part brings its whole group, keeping
 * only ids the model still has.
 * @param {object} model
 * @param {Iterable<string>} ids
 * @returns {string[]}
 */
export const expandToGroups = (model, ids) => {
    const present = new Set(model.parts.map(p => p.id));
    const out = new Set();
    for (const id of ids) for (const m of groupMembers(model, id)) if (present.has(m)) out.add(m);
    return [...out];
};

/**
 * The world axis (x or z) a "tip towards me" turn uses: the horizontal axis
 * closest to where the camera looks, so T turns the part in the plane of the
 * screen, the way a child would turn it in their hand.
 * @param {{x: number, z: number}} viewDir camera's looking direction (world)
 * @returns {'x'|'z'}
 */
export const facingAxis = viewDir => (Math.abs(viewDir.x) > Math.abs(viewDir.z) ? 'x' : 'z');

/**
 * Copies of parts for pasting or duplicating, offset by `offset` LDU, as
 * `place` commands (new ids are given by the editor).
 * @param {{part: string, position: number[], rotation: number[], color?: number, port?: string}[]} parts
 * @param {number[]} offset
 * @returns {object[]} place commands
 */
export const placeCopies = (parts, offset, ports) => parts.map((p, i) => {
    const cmd = {type: 'place', part: p.part, position: p.position.map((v, j) => tidy(v + offset[j])), rotation: p.rotation.slice()};
    if (p.color !== undefined) cmd.color = p.color;
    if (ports && ports[i]) cmd.port = ports[i];
    return cmd;
});

/** A connector id as a learner reads it: `h2` → hole 3; other ids give null. */
export const connectorNumber = connectorId => {
    const m = /^[a-z](\d+)$/.exec(connectorId || '');
    return m ? Number(m[1]) + 1 : null;
};
