// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Observers only: no forces, drives, timesteps or checkpoint state are changed here.
import {lduToWorld} from '../contracts.js';
import {MEASUREMENT_KINDS, measurementDefinitions} from './schema.js';

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, n) => a.map(v => v * n);
const norm = a => Math.hypot(...a);
const rotate = ([x, y, z, w], v) => {
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return add(v, add(scale(t, w), [y * t[2] - z * t[1], z * t[0] - x * t[2], x * t[1] - y * t[0]]));
};
const finiteVector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const DEG = 180 / Math.PI;
export const measurementText = row => row.available ? `${row.value.toFixed(row.unit === 'g' || row.unit === 'mm' || row.unit === '°' ? 1 : 3)} ${row.unit}` : '—';

/** Bind generated joint ids to authored part memberships; a recompile must not silently retarget a reading. */
export const jointBinding = (mechanism, joint) => JSON.stringify([joint.type, ...[joint.body1, joint.body2].map(id =>
    mechanism.bodies.find(b => b.id === id)?.parts?.slice().sort() || [id])]);
export const ropeBinding = rope => JSON.stringify(rope.parts || []);

export const createMeasurementReader = session => {
    const {mechanism, core} = session;
    const bodies = new Map(mechanism.bodies.map(b => [b.id, b]));
    const parts = new Map((session.runModel || session.model).parts.map(p => [p.id, p]));
    const bodyOf = new Map();
    for (const b of mechanism.bodies) for (const id of b.parts || []) if (!bodyOf.has(id)) bodyOf.set(id, b);
    const ropes = (mechanism.couplings || []).filter(c => c.kind === 'rope');
    const onBody = (id, local = [0, 0, 0]) => {
        const p = core.bodyPose(id);
        return add(p.position, rotate(p.rotation, local));
    };
    const point = id => {
        const b = bodyOf.get(id), p = parts.get(id);
        if (!b || !p) throw new Error('missing-target');
        return onBody(b.id, sub(lduToWorld(p.position), b.position));
    };
    const read = definitions => definitions.map(m => {
        const spec = MEASUREMENT_KINDS[m.kind];
        const row = {...m, unit: spec.unit, available: false, value: null, points: [], source: '', reason: ''};
        try {
            const b = m.targets?.length ? bodyOf.get(m.targets[0]) : null;
            if (m.targets && (!b || m.targets.some(id => !parts.has(id) || !bodyOf.has(id)))) throw new Error('missing-target');
            let value;
            if (['mass', 'weight', 'speed', 'angularSpeed', 'normalLoad'].includes(m.kind)) {
                row.points = [point(m.targets[0])];
                if (m.kind === 'mass') { value = b.massKg * 1000; row.source = 'configured-mass'; }
                if (m.kind === 'weight') {
                    value = b.massKg * norm(mechanism.gravity);
                    row.source = 'configured-weight';
                    row.vector = scale(mechanism.gravity, b.massKg);
                }
                if (m.kind === 'speed') {
                    row.vector = core.bodyLinearVelocity(b.id);
                    if (!finiteVector(row.vector)) throw new Error('unavailable');
                    value = norm(row.vector); row.source = 'jolt-com-velocity';
                }
                if (m.kind === 'angularSpeed') {
                    const v = core.bodyAngularVelocity(b.id);
                    if (!finiteVector(v)) throw new Error('unavailable');
                    value = norm(v) * DEG; row.source = 'jolt-angular-velocity';
                }
                if (m.kind === 'normalLoad') {
                    const wheel = core.rollingWheel(b.id);
                    if (!wheel) throw new Error('not-a-rolling-wheel');
                    value = wheel.load; row.source = 'rolling-load-estimate';
                    const g = norm(mechanism.gravity);
                    if (g > 0) row.vector = scale(mechanism.gravity, -value / g);
                }
                row.assembly = b.parts.slice();
            } else if (m.kind === 'distance' || m.kind === 'angle') {
                row.points = m.targets.map(point);
                if (m.kind === 'distance') value = norm(sub(row.points[1], row.points[0])) * 1000;
                else {
                    const a = sub(row.points[0], row.points[1]), c = sub(row.points[2], row.points[1]);
                    const d = norm(a) * norm(c);
                    if (!(d > 1e-15)) throw new Error('coincident-points');
                    value = Math.acos(Math.min(1, Math.max(-1, a.reduce((s, v, i) => s + v * c[i], 0) / d))) * DEG;
                }
                row.source = 'part-origins';
            } else if (spec.joint) {
                const j = mechanism.joints.find(x => x.id === m.joint && x.type === spec.joint);
                if (!j || jointBinding(mechanism, j) !== m.binding) throw new Error('missing-target');
                const state = core.jointState(j.id);
                value = m.kind === 'travel' ? state.position * 1000 : (m.kind === 'jointSpeed' ? state.velocity : state.angle) * DEG;
                row.points = [onBody(j.body2)]; row.source = 'jolt-joint';
            } else if (spec.rope) {
                const index = ropes.findIndex(r => r.id === m.rope && ropeBinding(r) === m.binding);
                if (index < 0) throw new Error('missing-target');
                const state = core.ropeState()[index];
                if (!state) throw new Error('unavailable');
                value = state.tension; row.source = 'rope-constraint';
                const r = ropes[index];
                row.points = [onBody(r.hook.body, r.hook.local)];
                const end = r.points.at(-1);
                const direction = sub(onBody(end.body, end.local), row.points[0]);
                if (norm(direction) > 0) row.vector = scale(direction, value / norm(direction));
            }
            if (!Number.isFinite(value) || !row.points.every(finiteVector)) throw new Error('unavailable');
            row.value = value; row.available = true;
        } catch (e) { row.reason = ['missing-target', 'coincident-points', 'not-a-rolling-wheel'].includes(e.message) ? e.message : 'unavailable'; }
        return row;
    });
    return {read, partIds: [...bodyOf.keys()].filter(id => parts.has(id))};
};

/** Structural presets work for imported models too: load/travel for a lift, rotation for a linkage. */
export const measurementPresets = session => {
    const m = session.mechanism, out = [];
    const authored = new Set((session.runModel || session.model).parts.map(p => p.id));
    const firstBody = new Map();
    for (const b of m.bodies) for (const id of b.parts || []) if (!firstBody.has(id)) firstBody.set(id, b);
    const representative = b => b.parts?.find(id => authored.has(id) && firstBody.get(id) === b);
    const modelBodies = m.bodies.filter(b => representative(b));
    const base = modelBodies.find(b => (m.hubs || []).some(h => h.body === b.id)) ||
        modelBodies.filter(b => b.motion === 'dynamic').reduce((a, b) => !a || b.massKg > a.massKg ? b : a, null) || modelBodies[0];
    const push = (kind, label, extra) => out.push({id: `preset-${out.length}`, kind, label, visible: true, ...extra});
    if (base) {
        const targets = [representative(base)];
        push('mass', 'mass', {targets}); push('speed', 'speed', {targets});
    }
    const joints = m.joints.filter(j => j.type === 'slider' || j.type === 'hinge').slice().sort((a, b) =>
        (b.type === 'slider' ? 2 : b.motor ? 1 : 0) - (a.type === 'slider' ? 2 : a.motor ? 1 : 0));
    for (const j of joints.slice(0, 4)) {
        push(j.type === 'slider' ? 'travel' : 'jointAngle', j.motor?.port || j.id, {joint: j.id, binding: jointBinding(m, j)});
    }
    for (const r of (m.couplings || []).filter(c => c.kind === 'rope').slice(0, 2)) push('tension', r.id, {rope: r.id, binding: ropeBinding(r)});
    const wheel = modelBodies.find(b => {
        try { return b.rollingResistance > 0 && session.core.rollingWheel(b.id); } catch { return false; }
    });
    if (wheel) push('normalLoad', 'normalLoad', {targets: [representative(wheel)]});
    return measurementDefinitions(out);
};
