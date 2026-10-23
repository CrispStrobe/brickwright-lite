// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Small, dependency-free schema: also used by the first-load project bundle validator.
export const MEASUREMENT_LIMIT = 64;
export const MEASUREMENT_KINDS = Object.freeze({
    mass: {targets: 1, unit: 'g'}, weight: {targets: 1, unit: 'N'},
    speed: {targets: 1, unit: 'm/s'}, angularSpeed: {targets: 1, unit: '°/s'},
    distance: {targets: 2, unit: 'mm'}, angle: {targets: 3, unit: '°'},
    jointAngle: {joint: 'hinge', unit: '°'}, jointSpeed: {joint: 'hinge', unit: '°/s'},
    travel: {joint: 'slider', unit: 'mm'}, tension: {rope: true, unit: 'N'},
    normalLoad: {targets: 1, unit: 'N'}
});
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Refuse malformed known data; copy every array so callers cannot mutate the saved record. */
export const measurementDefinitions = value => {
    if (!Array.isArray(value) || value.length > MEASUREMENT_LIMIT) throw new Error('simLab.measurements must contain at most 64 measurements');
    const ids = new Set();
    return value.map(m => {
        if (!m || typeof m !== 'object' || Array.isArray(m) || !text(m.id, 128) || ids.has(m.id) ||
            !own(MEASUREMENT_KINDS, m.kind) || !text(m.label, 80)) throw new Error('simLab.measurements has an invalid id, kind or label');
        ids.add(m.id);
        const spec = MEASUREMENT_KINDS[m.kind];
        const out = {id: m.id, kind: m.kind, label: m.label};
        if (spec.targets) {
            if (!Array.isArray(m.targets) || m.targets.length !== spec.targets || !m.targets.every(v => text(v, 128))) {
                throw new Error('simLab.measurements has invalid part targets');
            }
            out.targets = m.targets.slice();
        }
        if (spec.joint) {
            if (!text(m.joint, 128)) throw new Error('simLab.measurements needs a joint');
            out.joint = m.joint;
            // Bind joint identity to its bodies' member parts as well as its generated id.
            if (!text(m.binding, 4096)) throw new Error('simLab.measurements needs a joint binding');
            out.binding = m.binding;
        }
        if (spec.rope) {
            if (!text(m.rope, 128) || !text(m.binding, 4096)) throw new Error('simLab.measurements needs a rope binding');
            out.rope = m.rope; out.binding = m.binding;
        }
        if (m.visible !== undefined && typeof m.visible !== 'boolean') throw new Error('simLab.measurements.visible must be boolean');
        out.visible = m.visible !== false;
        return out;
    });
};
