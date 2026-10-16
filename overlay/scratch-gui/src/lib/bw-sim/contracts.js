// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab's three data contracts (docs/SIM-LAB-PLAN.md), in one file so
// they cannot drift apart:
//
//   PartMeta  ──┐
//               ├─► mechanism compiler (bw-sim/mech/) ─► CompiledMechanism ─► physics core (bw-sim/physics/)
//   PlacedModel ┘
//
// Each contract is plain JSON-able data plus a validator that returns a list
// of problems (empty = valid). Validators never throw on bad input and never
// mutate it; the compiler and the physics core call them at their boundary,
// so a malformed object is refused with a reason instead of half-simulated.
//
// FRAMES AND UNITS — the one place they are defined.
//
//   LDraw frame (PartMeta, PlacedModel): LDraw units (1 LDU = 0.4 mm), the
//   LDraw axes as the file format has them: -y is UP. A Technic hole pitch is
//   20 LDU (8 mm); a stud is 20 LDU apart; a brick is 24 LDU tall.
//
//   World frame (CompiledMechanism, snapshots): metres, kilograms, seconds,
//   radians, right-handed, +y is UP. The compiler alone converts:
//       world = (x, -y, -z) * LDU_M  for positions,
//   i.e. a rotation by 180° about the x axis followed by the scale. That is a
//   proper rotation (det +1), so handedness, cross products and hinge-axis
//   signs survive the conversion unchanged.

/** Metres per LDraw unit. */
export const LDU_M = 0.0004;

/** Gear pitch radius in LDU. Technic gears are module 1 (pitch diameter in mm
 *  = tooth count), so r = teeth/2 mm = teeth · 1.25 LDU: 8T → 10, 24T → 30,
 *  and 8T + 24T mesh at 40 LDU = 2 holes apart. */
export const pitchRadiusLdu = teeth => teeth * 1.25;

export const CONNECTOR_TYPES = Object.freeze(['pinhole', 'axlehole', 'axle', 'pin', 'stud', 'antistud', 'ball', 'ballsocket']);
export const GEAR_TYPES = Object.freeze(['spur', 'bevel', 'worm', 'rack']);
export const HUB_PORTS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F']);
export const SENSOR_KINDS = Object.freeze(['distance', 'color', 'force']);

/** Friction of a part with no `friction` (ABS plastic on a mat) and of the ground (a printed mat). */
export const PART_FRICTION = 0.4;
export const GROUND_FRICTION = 0.8;

/**
 * @typedef {[number, number, number]} Vec3
 * @typedef {[number, number, number, number]} Quat   x, y, z, w (unit)
 * @typedef {[number, number, number, number, number, number, number, number, number]} Mat3
 *          row-major 3×3, exactly the a b c d e f g h i of an LDraw type-1 line
 */

/**
 * A collision primitive. In PartMeta it is in the part's LDraw frame (LDU);
 * in a CompiledMechanism body it is in that body's local frame (metres).
 * A cylinder's axis is its local +y before `rotation` is applied.
 * @typedef {(
 *   {shape: 'box', halfExtents: Vec3, position?: Vec3, rotation?: Quat} |
 *   {shape: 'cylinder', radius: number, halfHeight: number, position?: Vec3, rotation?: Quat} |
 *   {shape: 'sphere', radius: number, position?: Vec3}
 * )} Collider
 */

/**
 * A connection point on a part, in the part's LDraw frame.
 * `axis` is a unit vector; for holes, pins and axles it is the bore/shaft
 * direction, for studs it points out of the stud (LDraw -y for an upward stud).
 * `length` (LDU, along `axis`, centred on `position`) is the extent of a hole,
 * pin or axle: a 1-hole-wide beam hole is 20 long, a 3L axle is 60 long.
 * A connector of the rotating output of a motor is listed in `motor.output`.
 * `ball`/`ballsocket` (a towball, the SPIKE castor ball in its socket): the
 * position is the ball centre; `axis` is the socket's opening direction and is
 * not used for matching. A ball in a socket is a free 3-axis pivot.
 * `friction: false` marks a frictionless pin (it makes a hinge, not a rigid joint).
 * @typedef {{id: string, type: string, position: Vec3, axis: Vec3, length?: number, friction?: boolean}} Connector
 */

/**
 * Hand-authored metadata for one LDraw part (docs/SIM-LAB-PLAN.md §D4).
 * NEVER copied from BrickLink Studio or LDCad data.
 * @typedef {{
 *   part: string,                 e.g. '3713.dat'
 *   name: string,
 *   category: string,             'beam' | 'axle' | 'pin' | 'gear' | 'wheel' | 'motor' | 'hub' | 'sensor' | 'other'
 *   massGrams: number,
 *   friction?: number,            Coulomb friction coefficient of the part surface, 0..2;
 *                                 default PART_FRICTION (hard plastic). A tyred wheel is ~1.
 *   connectors: Connector[],
 *   colliders: Collider[],
 *   gear?: {type: string, teeth: number, axis: Vec3, center: Vec3},
 *        gear axis/center are in the part frame; the pitch radius is pitchRadiusLdu(teeth)
 *   motor?: {output: string[], outputColliders: number[], maxTorqueNm: number, maxSpeedDegPerSec: number},
 *        output: ids of connectors that turn with the shaft; outputColliders:
 *        indices into `colliders` of the turning part (the drive hub) — they
 *        belong to the output body, every other collider to the housing.
 *        Both bodies must end up with at least one collider.
 *   hub?: {ports: string[]}
 *   sensor?: {kind: 'distance'|'color'|'force', origin: Vec3, direction: Vec3}
 *      in the part's LDraw frame (LDU; direction unit, out of the sensing face).
 * }} PartMeta
 */

/**
 * A model as placed in the editor: what the LDraw MPD stores.
 * `position` (LDU) and `rotation` (row-major 3×3) are exactly an LDraw type-1
 * line's x y z and a..i. `port` binds a motor or sensor to a hub port
 * (stored in the MPD as a `0 !BW PORT A` meta line before the part line).
 * @typedef {{
 *   version: 1,
 *   parts: {id: string, part: string, color?: number, position: Vec3, rotation: Mat3, port?: string}[]
 * }} PlacedModel
 */

/**
 * What the compiler emits and the physics core consumes — the
 * engine-agnostic seam (§D1: Jolt today, Rapier if F3 says so).
 * Everything in world frame, SI units.
 *
 * bodies: one per rigid island. `position`/`rotation` are the body origin's
 *   world pose at t=0; colliders are relative to that origin. `com` is the
 *   centre of mass relative to the origin (informational; engines may
 *   recompute it from colliders + massKg). `parts` lists PlacedModel part ids.
 *   One static body may represent the ground; there is no implicit ground.
 * joints: `body2` may be the string 'world'. `point` and `axis` are world
 *   frame at t=0. A hinge's angle is measured about `axis` by the right-hand
 *   rule, as body2's rotation relative to body1, zero at t=0.
 *   `motor.port` binds the hinge to a hub port. A `ball` joint is a point
 *   constraint (free rotation about all axes, e.g. a castor ball): it has a
 *   `point` and no `axis`.
 * gears: `ratio` is SIGNED and engine-neutral:
 *       ω(joint2) = ratio · ω(joint1)
 *   where each ω is that hinge's relative angular velocity about its OWN
 *   `axis`. An 8T driving a 24T on parallel, same-direction axes: ratio = -1/3.
 *   rackAndPinion: v(sliderJoint) = ratio · ω(hingeJoint), m/s per rad/s.
 * diagnostics: refusals and warnings, surfaced in the UI as a list (never
 *   silently dropped): e.g. a motor with no port, an ambiguous gear mesh.
 *
 * @typedef {{
 *   version: 1,
 *   gravity: Vec3,
 *   bodies: {id: string, motion: 'static'|'dynamic', position: Vec3, rotation: Quat,
 *            massKg: number, com?: Vec3, colliders: Collider[], parts: string[],
 *            friction?: number, restitution?: number}[],
 *   joints: ({id: string, type: 'hinge', body1: string, body2: string, point: Vec3, axis: Vec3,
 *             motor?: {port: string, maxTorqueNm: number, maxSpeedRadPerSec: number}} |
 *            {id: string, type: 'slider', body1: string, body2: string, point: Vec3, axis: Vec3} |
 *            {id: string, type: 'ball', body1: string, body2: string, point: Vec3})[],
 *   gears: ({id: string, type: 'gear', joint1: string, joint2: string, ratio: number} |
 *           {id: string, type: 'rackAndPinion', hingeJoint: string, sliderJoint: string, ratio: number})[],
 *   diagnostics: {severity: 'error'|'warning', code: string, message: string, parts?: string[]}[],
 *   sensors?: {port: string, kind: 'distance'|'color'|'force', body: string, origin: Vec3, direction: Vec3}[],
 *      world frame at t=0, metres; body is the island holding the sensor part.
 * }} CompiledMechanism
 */

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isVec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(isNum);
const norm = v => Math.hypot(...v);
const UNIT_EPS = 1e-6;

const checkCollider = (c, where, out) => {
    if (!c || typeof c !== 'object') return out.push(`${where}: not an object`);
    if (c.position !== undefined && !isVec(c.position)) out.push(`${where}.position: not a Vec3`);
    if (c.rotation !== undefined && !(isVec(c.rotation, 4) && Math.abs(norm(c.rotation) - 1) < 1e-4)) {
        out.push(`${where}.rotation: not a unit quaternion`);
    }
    if (c.shape === 'box') {
        if (!isVec(c.halfExtents) || !c.halfExtents.every(h => h > 0)) out.push(`${where}.halfExtents: need three positive numbers`);
    } else if (c.shape === 'cylinder') {
        if (!(isNum(c.radius) && c.radius > 0)) out.push(`${where}.radius: need a positive number`);
        if (!(isNum(c.halfHeight) && c.halfHeight > 0)) out.push(`${where}.halfHeight: need a positive number`);
    } else if (c.shape === 'sphere') {
        if (!(isNum(c.radius) && c.radius > 0)) out.push(`${where}.radius: need a positive number`);
    } else {
        out.push(`${where}.shape: '${c.shape}' is not box|cylinder|sphere`);
    }
};

const checkUnit = (v, where, out) => {
    if (!isVec(v)) out.push(`${where}: not a Vec3`);
    else if (Math.abs(norm(v) - 1) > UNIT_EPS) out.push(`${where}: not a unit vector (|v| = ${norm(v)})`);
};

const uniqueIds = (items, where, out) => {
    const seen = new Set();
    for (const it of items) {
        if (typeof it?.id !== 'string' || !it.id) out.push(`${where}: an entry has no string id`);
        else if (seen.has(it.id)) out.push(`${where}: duplicate id '${it.id}'`);
        else seen.add(it.id);
    }
    return seen;
};

/** @returns {string[]} problems; empty when `meta` is a valid PartMeta. */
export const validatePartMeta = meta => {
    const out = [];
    if (!meta || typeof meta !== 'object') return ['part meta: not an object'];
    const p = typeof meta.part === 'string' ? meta.part : '?';
    if (!/^[\w.-]+\.dat$/i.test(meta.part || '')) out.push(`${p}.part: need an LDraw file name like '3713.dat'`);
    if (typeof meta.name !== 'string' || !meta.name) out.push(`${p}.name: missing`);
    if (typeof meta.category !== 'string' || !meta.category) out.push(`${p}.category: missing`);
    if (!(isNum(meta.massGrams) && meta.massGrams > 0)) out.push(`${p}.massGrams: need a positive number`);
    if (meta.friction !== undefined && !(isNum(meta.friction) && meta.friction >= 0 && meta.friction <= 2)) {
        out.push(`${p}.friction: need a number in 0..2`);
    }
    if (!Array.isArray(meta.connectors)) out.push(`${p}.connectors: not an array`);
    else {
        const ids = uniqueIds(meta.connectors, `${p}.connectors`, out);
        meta.connectors.forEach((c, i) => {
            const w = `${p}.connectors[${c?.id ?? i}]`;
            if (!CONNECTOR_TYPES.includes(c?.type)) out.push(`${w}.type: '${c?.type}' is not one of ${CONNECTOR_TYPES.join('|')}`);
            if (!isVec(c?.position)) out.push(`${w}.position: not a Vec3`);
            checkUnit(c?.axis, `${w}.axis`, out);
            if (c?.length !== undefined && !(isNum(c.length) && c.length > 0)) out.push(`${w}.length: need a positive number`);
            if (c?.friction !== undefined && typeof c.friction !== 'boolean') out.push(`${w}.friction: need a boolean`);
        });
        if (meta.motor) {
            for (const o of meta.motor.output || []) if (!ids.has(o)) out.push(`${p}.motor.output: unknown connector '${o}'`);
            if (!Array.isArray(meta.motor.output) || meta.motor.output.length === 0) out.push(`${p}.motor.output: need at least one connector id`);
            const oc = meta.motor.outputColliders;
            const nCol = Array.isArray(meta.colliders) ? meta.colliders.length : 0;
            if (!Array.isArray(oc) || oc.length === 0 || !oc.every(i => Number.isInteger(i) && i >= 0 && i < nCol)) {
                out.push(`${p}.motor.outputColliders: need at least one index into colliders`);
            } else if (oc.length >= nCol) {
                out.push(`${p}.motor.outputColliders: the housing needs at least one collider of its own`);
            }
            if (!(isNum(meta.motor.maxTorqueNm) && meta.motor.maxTorqueNm > 0)) out.push(`${p}.motor.maxTorqueNm: need a positive number`);
            if (!(isNum(meta.motor.maxSpeedDegPerSec) && meta.motor.maxSpeedDegPerSec > 0)) out.push(`${p}.motor.maxSpeedDegPerSec: need a positive number`);
        }
    }
    if (!Array.isArray(meta.colliders) || meta.colliders.length === 0) out.push(`${p}.colliders: need at least one collider`);
    else meta.colliders.forEach((c, i) => checkCollider(c, `${p}.colliders[${i}]`, out));
    if (meta.gear) {
        if (!GEAR_TYPES.includes(meta.gear.type)) out.push(`${p}.gear.type: '${meta.gear.type}' is not one of ${GEAR_TYPES.join('|')}`);
        if (!(Number.isInteger(meta.gear.teeth) && meta.gear.teeth > 0)) out.push(`${p}.gear.teeth: need a positive integer`);
        checkUnit(meta.gear.axis, `${p}.gear.axis`, out);
        if (!isVec(meta.gear.center)) out.push(`${p}.gear.center: not a Vec3`);
    }
    if (meta.hub && !(Array.isArray(meta.hub.ports) && meta.hub.ports.every(x => HUB_PORTS.includes(x)))) {
        out.push(`${p}.hub.ports: need a list of ${HUB_PORTS.join('|')}`);
    }
    if (meta.sensor !== undefined) {
        if (!meta.sensor || typeof meta.sensor !== 'object') out.push(`${p}.sensor: not an object`);
        else {
            if (!SENSOR_KINDS.includes(meta.sensor.kind)) out.push(`${p}.sensor.kind: '${meta.sensor.kind}' is not one of ${SENSOR_KINDS.join('|')}`);
            if (!isVec(meta.sensor.origin)) out.push(`${p}.sensor.origin: not a Vec3`);
            checkUnit(meta.sensor.direction, `${p}.sensor.direction`, out);
        }
    }
    return out;
};

/** Determinant of a row-major 3×3. */
export const det3 = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);

/**
 * @param {PlacedModel} model
 * @param {Map<string, PartMeta>|Record<string, PartMeta>} [catalog] when given, every part must be in it
 * @returns {string[]} problems
 */
export const validatePlacedModel = (model, catalog) => {
    const out = [];
    if (!model || typeof model !== 'object') return ['model: not an object'];
    if (model.version !== 1) out.push(`model.version: expected 1, got ${model.version}`);
    if (!Array.isArray(model.parts)) return [...out, 'model.parts: not an array'];
    uniqueIds(model.parts, 'model.parts', out);
    const has = catalog instanceof Map ? k => catalog.has(k) : k => catalog && Object.hasOwn(catalog, k);
    for (const pl of model.parts) {
        const w = `model.parts[${pl?.id}]`;
        if (typeof pl?.part !== 'string') out.push(`${w}.part: missing`);
        else if (catalog && !has(pl.part)) out.push(`${w}.part: '${pl.part}' is not in the part catalog`);
        if (!isVec(pl?.position)) out.push(`${w}.position: not a Vec3`);
        if (!isVec(pl?.rotation, 9)) out.push(`${w}.rotation: need 9 numbers (row-major 3×3)`);
        // Parts are rigid: the editor only ever produces rotations (no mirror, no scale).
        else if (Math.abs(det3(pl.rotation) - 1) > 1e-3) out.push(`${w}.rotation: not a proper rotation (det = ${det3(pl.rotation).toFixed(4)})`);
        if (pl?.port !== undefined && !HUB_PORTS.includes(pl.port)) out.push(`${w}.port: '${pl.port}' is not ${HUB_PORTS.join('|')}`);
    }
    return out;
};

/** @returns {string[]} problems; empty when `m` is a valid CompiledMechanism. */
export const validateCompiledMechanism = m => {
    const out = [];
    if (!m || typeof m !== 'object') return ['mechanism: not an object'];
    if (m.version !== 1) out.push(`mechanism.version: expected 1, got ${m.version}`);
    if (!isVec(m.gravity)) out.push('mechanism.gravity: not a Vec3');
    for (const k of ['bodies', 'joints', 'gears', 'diagnostics']) {
        if (!Array.isArray(m[k])) out.push(`mechanism.${k}: not an array`);
    }
    if (out.length) return out;
    const bodies = uniqueIds(m.bodies, 'bodies', out);
    m.bodies.forEach(b => {
        const w = `bodies[${b?.id}]`;
        if (b?.motion !== 'static' && b?.motion !== 'dynamic') out.push(`${w}.motion: need 'static' or 'dynamic'`);
        if (!isVec(b?.position)) out.push(`${w}.position: not a Vec3`);
        if (!(isVec(b?.rotation, 4) && Math.abs(norm(b.rotation) - 1) < 1e-4)) out.push(`${w}.rotation: not a unit quaternion`);
        if (b?.motion === 'dynamic' && !(isNum(b?.massKg) && b.massKg > 0)) out.push(`${w}.massKg: a dynamic body needs a positive mass`);
        if (!Array.isArray(b?.colliders) || b.colliders.length === 0) out.push(`${w}.colliders: need at least one collider`);
        else b.colliders.forEach((c, i) => checkCollider(c, `${w}.colliders[${i}]`, out));
        if (!Array.isArray(b?.parts)) out.push(`${w}.parts: not an array`);
    });
    const joints = new Map();
    uniqueIds(m.joints, 'joints', out);
    m.joints.forEach(j => {
        const w = `joints[${j?.id}]`;
        joints.set(j?.id, j);
        if (!['hinge', 'slider', 'ball'].includes(j?.type)) out.push(`${w}.type: need 'hinge', 'slider' or 'ball'`);
        if (!bodies.has(j?.body1)) out.push(`${w}.body1: unknown body '${j?.body1}'`);
        if (j?.body2 !== 'world' && !bodies.has(j?.body2)) out.push(`${w}.body2: unknown body '${j?.body2}'`);
        if (j?.body1 === j?.body2) out.push(`${w}: joins a body to itself`);
        if (!isVec(j?.point)) out.push(`${w}.point: not a Vec3`);
        if (j?.type !== 'ball') checkUnit(j?.axis, `${w}.axis`, out);
        if (j?.motor) {
            if (j.type !== 'hinge') out.push(`${w}.motor: only hinges are motorised in v1`);
            if (!HUB_PORTS.includes(j.motor.port)) out.push(`${w}.motor.port: '${j.motor.port}' is not ${HUB_PORTS.join('|')}`);
            if (!(isNum(j.motor.maxTorqueNm) && j.motor.maxTorqueNm > 0)) out.push(`${w}.motor.maxTorqueNm: need a positive number`);
            if (!(isNum(j.motor.maxSpeedRadPerSec) && j.motor.maxSpeedRadPerSec > 0)) out.push(`${w}.motor.maxSpeedRadPerSec: need a positive number`);
        }
    });
    uniqueIds(m.gears, 'gears', out);
    const jointOfType = (id, type, w) => {
        const j = joints.get(id);
        if (!j) out.push(`${w}: unknown joint '${id}'`);
        else if (j.type !== type) out.push(`${w}: joint '${id}' is a ${j.type}, need a ${type}`);
    };
    m.gears.forEach(g => {
        const w = `gears[${g?.id}]`;
        if (!(isNum(g?.ratio) && g.ratio !== 0)) out.push(`${w}.ratio: need a non-zero number`);
        if (g?.type === 'gear') {
            jointOfType(g.joint1, 'hinge', `${w}.joint1`);
            jointOfType(g.joint2, 'hinge', `${w}.joint2`);
            if (g.joint1 === g.joint2) out.push(`${w}: gears a joint to itself`);
        } else if (g?.type === 'rackAndPinion') {
            jointOfType(g.hingeJoint, 'hinge', `${w}.hingeJoint`);
            jointOfType(g.sliderJoint, 'slider', `${w}.sliderJoint`);
        } else {
            out.push(`${w}.type: need 'gear' or 'rackAndPinion'`);
        }
    });
    if (m.sensors !== undefined) {
        if (!Array.isArray(m.sensors)) out.push('mechanism.sensors: not an array');
        else {
            for (let i = 0; i < m.sensors.length; i++) {
                const s = m.sensors[i];
                const w = `sensors[${i}]`;
                if (!HUB_PORTS.includes(s?.port)) out.push(`${w}.port: '${s?.port}' is not ${HUB_PORTS.join('|')}`);
                if (!SENSOR_KINDS.includes(s?.kind)) out.push(`${w}.kind: '${s?.kind}' is not one of ${SENSOR_KINDS.join('|')}`);
                if (!bodies.has(s?.body)) out.push(`${w}.body: unknown body '${s?.body}'`);
                if (!isVec(s?.origin)) out.push(`${w}.origin: not a Vec3`);
                if (!isVec(s?.direction)) out.push(`${w}.direction: not a Vec3`);
                else checkUnit(s.direction, `${w}.direction`, out);
            }
        }
    }
    m.diagnostics.forEach((d, i) => {
        if (d?.severity !== 'error' && d?.severity !== 'warning') out.push(`diagnostics[${i}].severity: need 'error' or 'warning'`);
        if (typeof d?.code !== 'string' || typeof d?.message !== 'string') out.push(`diagnostics[${i}]: need string code and message`);
    });
    return out;
};

/**
 * LDraw frame (LDU, -y up) → world frame (m, +y up): 180° about x, then scale.
 * @param {Vec3} p
 * @returns {Vec3}
 */
// (0 - v) rather than -v: no -0 in emitted JSON or deepEqual comparisons.
export const lduToWorld = p => [p[0] * LDU_M, (0 - p[1]) * LDU_M, (0 - p[2]) * LDU_M];

/** Direction (unit vector) from LDraw frame to world frame: the same rotation, no scale. */
export const dirToWorld = d => [d[0], 0 - d[1], 0 - d[2]];
