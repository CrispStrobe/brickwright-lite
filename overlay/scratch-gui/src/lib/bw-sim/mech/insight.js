// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// What a compiled model is made of, as data a view can draw (docs/SIM-LAB.md,
// "Seeing the model"): which parts move together (one pastel tint per rigid
// body), where the hinges are (axis segments in world metres, motor hinges
// marked), which gears couple (centre to centre, with the tooth ratio), which
// motors and sensors sit on which hub port, and which problems stop a run
// from doing anything. Pure data in, pure data out: no three.js, no DOM, so
// the same numbers are checked headless (test/bw-sim-model-insight.test.mjs)
// and drawn by the Build and Simulate views (view/insight-layer.js).

import {compile} from './compile.js';
import {lduToWorld} from '../contracts.js';
import {mat3MulVec3, vecAdd} from './vec.js';

/** Pastel tints, one per rigid body, in body order; more bodies than these get golden-angle hues. */
export const BODY_PASTELS = Object.freeze([
    '#f9a8d4', '#93c5fd', '#86efac', '#fde68a', '#c4b5fd', '#fdba74',
    '#67e8f9', '#f0abfc', '#bef264', '#fca5a5', '#a5b4fc', '#5eead4'
]);

/** Half the drawn length of a hinge axis, metres (the segment is 2× this, centred on the hinge). */
export const AXIS_HALF_LENGTH_M = 0.024;

const hex = (r, g, b) => `#${[r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
/** A pastel (light, soft) colour at hue h degrees. */
const pastelAt = h => {
    const s = 0.7; const l = 0.8;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return hex(f(0), f(8), f(4));
};
const tintAt = i => (i < BODY_PASTELS.length ? BODY_PASTELS[i] : pastelAt((i * 137.508) % 360));

const catalogGet = (catalog, part) => (catalog instanceof Map ? catalog.get(part) : catalog && catalog[part]);

/** Bodies made of model parts (not the ground, not obstacles). */
const partBodiesOf = mechanism => mechanism.bodies.filter(b => b.id !== 'ground' && !b.id.startsWith('obstacle:'));

/**
 * The body each placed part is drawn in. A motor is two bodies (housing and
 * output, joined by its own hinge with body1 = housing): it belongs to the
 * housing, as the Simulate view draws it (its drive hub rides in the output).
 * @returns {Map<string, string>} part id → body id
 */
export const partBodyMap = mechanism => {
    const bodiesOf = new Map();
    for (const b of partBodiesOf(mechanism)) {
        for (const pid of b.parts) bodiesOf.set(pid, [...(bodiesOf.get(pid) || []), b.id]);
    }
    const out = new Map();
    for (const [pid, ids] of bodiesOf) {
        if (ids.length === 1) { out.set(pid, ids[0]); continue; }
        const own = (mechanism.joints || []).find(j => j.type === 'hinge' && ids.includes(j.body1) && ids.includes(j.body2));
        out.set(pid, own ? own.body1 : ids[0]);
    }
    return out;
};

/**
 * One distinct pastel per rigid body; every part takes its body's tint.
 * @returns {{bodies: Map<string, string>, parts: Map<string, string>}} body id → '#rrggbb', part id → '#rrggbb'
 */
export const bodyTints = mechanism => {
    const bodies = new Map();
    partBodiesOf(mechanism).forEach((b, i) => bodies.set(b.id, tintAt(i)));
    const parts = new Map();
    for (const [pid, bid] of partBodyMap(mechanism)) parts.set(pid, bodies.get(bid));
    return {bodies, parts};
};

/**
 * The hinges and ball joints to draw. A hinge is a segment along its axis,
 * centred on the hinge point, in world metres; it is anchored to body1 (the
 * part the axle turns in), so a view that moves bodies moves it along.
 * @returns {{id: string, type: string, body1: string, body2: string, motor: boolean, port: string|null,
 *            point: number[], from: number[]|null, to: number[]|null}[]}
 */
export const jointOverlay = (mechanism, halfLength = AXIS_HALF_LENGTH_M) => (mechanism.joints || []).map(j => {
    const along = s => j.point.map((v, i) => v + s * halfLength * j.axis[i]);
    return {
        id: j.id, type: j.type, body1: j.body1, body2: j.body2,
        motor: Boolean(j.motor), port: j.motor ? j.motor.port : null,
        point: j.point.slice(),
        from: j.type === 'hinge' ? along(-1) : null,
        to: j.type === 'hinge' ? along(1) : null
    };
});

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * The gear couplings to draw: centre of one gear to centre of the other (world
 * metres), each anchored to its gear's body, with the tooth ratio "8:24" reduced
 * ("1:3"): the first gear is the one on the coupling's joint1.
 * @returns {{id: string, parts: string[], bodies: string[], from: number[], to: number[], text: string, ratio: number}[]}
 */
export const gearOverlay = (mechanism, model, catalog) => {
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const bodyOf = partBodyMap(mechanism);
    const centre = id => {
        const pl = byId.get(id);
        const meta = pl && catalogGet(catalog, pl.part);
        if (!meta || !meta.gear) return null;
        return lduToWorld(vecAdd(mat3MulVec3(pl.rotation, meta.gear.center), pl.position));
    };
    const out = [];
    for (const g of mechanism.gears || []) {
        if (!Array.isArray(g.parts) || g.parts.length !== 2) continue;
        const [a, b] = g.parts;
        const ca = centre(a); const cb = centre(b);
        if (!ca || !cb) continue;
        const ta = catalogGet(catalog, byId.get(a).part).gear.teeth;
        const tb = catalogGet(catalog, byId.get(b).part).gear.teeth;
        const d = gcd(ta, tb);
        out.push({id: g.id, parts: [a, b], bodies: [bodyOf.get(a), bodyOf.get(b)], from: ca, to: cb,
            text: `${ta / d}:${tb / d}`, ratio: g.ratio});
    }
    return out;
};

/**
 * Every motor and sensor with its hub port (null: not plugged in).
 * @returns {{id: string, part: string, kind: 'motor'|'sensor', port: string|null}[]}
 */
export const portItems = (model, catalog) => model.parts
    .map(p => ({p, meta: catalogGet(catalog, p.part)}))
    .filter(({meta}) => meta && (meta.motor || meta.sensor))
    .map(({p, meta}) => ({id: p.id, part: p.part, kind: meta.motor ? 'motor' : 'sensor', port: p.port || null}));

/**
 * The issues a compiled mechanism adds to the model's own refusals: its
 * diagnostics, and `no-motor` when no motor turns on a hub port (it names the
 * motors that could, once plugged in).
 */
export const mechanismIssues = mechanism => {
    const issues = [...mechanism.diagnostics];
    if (!mechanism.joints.some(j => j.motor)) {
        const unplugged = mechanism.diagnostics.filter(d => d.code === 'motor-without-port').flatMap(d => d.parts || []);
        issues.push({severity: 'warning', code: 'no-motor', message: 'No motor is connected to a hub port, so nothing will move on its own.',
            parts: [...new Set(unplugged)]});
    }
    return issues;
};

/**
 * Problems that stop a run from doing what a child expects, said before Run:
 * nothing is plugged in (no-motor), there is no hub to run a program, there is
 * nothing to simulate, or the model falls apart (two or more loose groups, or
 * loose parts that are a quarter of the model or more).
 * @returns {{code: string, parts: string[]}[]}
 */
export const runBlockers = (issues, model, catalog) => {
    const out = [];
    if (issues.some(i => i.code === 'empty-model')) return [{code: 'empty-model', parts: []}];
    const parts = model.parts.filter(p => catalogGet(catalog, p.part));
    if (parts.length && !parts.some(p => catalogGet(catalog, p.part).hub)) out.push({code: 'no-hub', parts: []});
    const noMotor = issues.find(i => i.code === 'no-motor');
    if (noMotor) out.push({code: 'no-motor', parts: noMotor.parts || []});
    const loose = issues.filter(i => i.code === 'loose-part');
    const looseParts = loose.flatMap(i => i.parts || []);
    if (loose.length >= 2 || (looseParts.length && looseParts.length * 4 >= parts.length)) {
        out.push({code: 'falls-apart', parts: looseParts});
    }
    return out;
};

/**
 * Everything the views show about a compiled model.
 * @param {object} model the PlacedModel the mechanism was compiled from
 * @param {object} mechanism its CompiledMechanism
 * @param {Map} catalog
 * @param {object[]} issues what the pane lists (refusals + mechanismIssues)
 */
export const insightOf = (model, mechanism, catalog, issues) => {
    const tints = bodyTints(mechanism);
    return {
        tints,
        joints: jointOverlay(mechanism),
        gears: gearOverlay(mechanism, model, catalog),
        ports: portItems(model, catalog),
        blockers: runBlockers(issues, model, catalog)
    };
};

/**
 * Compile the model being built and say what it is made of (Build mode; the
 * pane calls it debounced after edits). `ms` is how long the compile and the
 * insight took, for the record.
 * @returns {{mechanism: object|null, issues: object[], tints, joints, gears, ports, blockers, ms: number}}
 */
export const modelInsight = (model, catalog) => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    if (!model.parts.length) {
        const issues = [{severity: 'error', code: 'empty-model', message: 'The model has no parts the Sim Lab knows.', parts: []}];
        return {mechanism: null, issues, tints: {bodies: new Map(), parts: new Map()}, joints: [], gears: [],
            ports: [], blockers: runBlockers(issues, model, catalog), ms: now()};
    }
    let mechanism;
    try {
        mechanism = compile(model, catalog, {ground: false});
    } catch (error) {
        const issues = [{severity: 'error', code: 'invalid-model', message: error.message, parts: []}];
        return {mechanism: null, issues, tints: {bodies: new Map(), parts: new Map()}, joints: [], gears: [],
            ports: portItems(model, catalog), blockers: runBlockers(issues, model, catalog), ms: now()};
    }
    const issues = mechanismIssues(mechanism);
    return {mechanism, issues, ...insightOf(model, mechanism, catalog, issues), ms: now()};
};
