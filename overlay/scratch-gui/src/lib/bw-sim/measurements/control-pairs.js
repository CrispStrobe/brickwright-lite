// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Explicit comparisons of two separately admitted model histories. No physics or I/O.
// experiments.js calls this module only at admission time; imported bindings below
// are also used only in functions, so the schema dispatch cycle has no eager reads.
import {EXPERIMENT_SCHEMA, EXPERIMENT_BYTE_LIMIT, RECORDING_TRACE_LIMIT,
    measurementExperiments, experimentsFromRuns, experimentsToRuns} from './experiments.js';

export const CONTROL_PAIR_SCHEMA = 'bw.sim-lab.experiments.v2';
const HASH = /^[a-f0-9]{64}$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const fail = message => { throw new Error(`simLab.controlPair ${message}`); };
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const ROLES = ['baseline', 'control'];
const checkBudget = value => {
    if (bytes(value) > EXPERIMENT_BYTE_LIMIT) fail('exceeds the aggregate history byte limit');
};
const nestedPacket = value => {
    // Refuse nesting before entering the general experiments dispatcher.
    if (!object(value) || value.schema !== EXPERIMENT_SCHEMA) fail('each role requires a v1 history packet');
    const packet = measurementExperiments(value);
    if (packet.runs.length !== 1) fail('each role must retain exactly one run');
    return packet;
};
const mappingsOf = (value, baseline, control) => {
    if (!Array.isArray(value) || !value.length || value.length > RECORDING_TRACE_LIMIT) fail('needs 1-4 explicit channel mappings');
    const usedBaseline = new Set(), usedControl = new Set();
    const definitions = [baseline, control].map(run => new Map(run.definitions.map(d => [d.id, d])));
    return value.map(mapping => {
        if (!object(mapping) || !text(mapping.baselineId, 128) || !text(mapping.controlId, 128) ||
            usedBaseline.has(mapping.baselineId) || usedControl.has(mapping.controlId)) fail('mappings must have unique valid endpoints');
        usedBaseline.add(mapping.baselineId); usedControl.add(mapping.controlId);
        const a = definitions[0].get(mapping.baselineId), b = definitions[1].get(mapping.controlId);
        if (!a || !b) fail('mapping references an unknown recorded measurement');
        if (a.kind !== b.kind) fail('mapped measurement kinds differ');
        const readings = [baseline, control].map((run, index) => run.samples.map(sample =>
            sample.readings.find(row => row.id === (index === 0 ? mapping.baselineId : mapping.controlId))));
        const units = readings.map(rows => new Set(rows.map(row => row.unit)));
        if (units.some(set => set.size !== 1) || [...units[0]][0] !== [...units[1]][0]) fail('mapped measurement units differ');
        // A source-less unavailable gap is preserved. It does not invent a source.
        const sources = new Set(readings.flat().map(row => row.source).filter(Boolean));
        if (sources.size > 1) fail('mapped measurement sources differ');
        return {baselineId: mapping.baselineId, controlId: mapping.controlId};
    });
};

/** Structural admission for a saved pair. This does not authenticate imported observations. */
export const admitControlPair = value => {
    if (!object(value) || value.schema !== CONTROL_PAIR_SCHEMA || !HASH.test(value.modelSha256) ||
        value.alignment !== 'elapsed-exact') fail('has an invalid pair schema or alignment');
    checkBudget(value);
    if (value.label !== undefined && !text(value.label, 80)) fail('has an invalid pair label');
    const baseline = nestedPacket(value.baseline), control = nestedPacket(value.control);
    if (baseline.modelSha256 === control.modelSha256) fail('requires two distinct canonical model identities');
    if (![baseline.modelSha256, control.modelSha256].includes(value.modelSha256)) fail('anchor is not one of the paired models');
    const runs = [baseline, control].map(packet => experimentsToRuns(packet, {modelSha256: packet.modelSha256})[0]);
    const mappings = mappingsOf(value.mappings, runs[0], runs[1]);
    const result = {schema: CONTROL_PAIR_SCHEMA, modelSha256: value.modelSha256, alignment: 'elapsed-exact',
        ...(value.label === undefined ? {} : {label: value.label}), baseline, control, mappings};
    checkBudget(result);
    return result;
};

const selectedPacket = side => {
    if (!object(side) || !object(side.context)) fail('creation requires independently admitted context for each role');
    if (!object(side.packet) || side.packet.schema !== EXPERIMENT_SCHEMA) fail('creation requires v1 source histories');
    const source = measurementExperiments(side.packet);
    const runs = experimentsToRuns(source, side.context);
    if (side.runId === undefined && runs.length !== 1) fail('select a run explicitly from a multi-run history');
    if (side.runId !== undefined && !text(side.runId, 128)) fail('has an invalid selected run id');
    const selected = side.runId === undefined ? runs[0] : runs.find(run => run.id === side.runId);
    if (!selected) fail('selected run is missing');
    return experimentsFromRuns([selected], {...side.context, selection: source.selection});
};

/** Select one admitted run per model; duplicate run IDs across roles remain untouched. */
export const createControlPair = ({baseline, control, mappings, modelSha256, label} = {}) => admitControlPair({
    schema: CONTROL_PAIR_SCHEMA, modelSha256, alignment: 'elapsed-exact', ...(label === undefined ? {} : {label}),
    baseline: selectedPacket(baseline), control: selectedPacket(control), mappings
});

/** Current anchor is independently checked. Optional per-role contexts strengthen binding checks.
 * A foreign saved role is historical data, not a claim that its model is currently loaded.
 */
export const restoreControlPair = (value, currentContext, roleContexts = {}) => {
    const packet = admitControlPair(value);
    if (!object(currentContext) || !HASH.test(currentContext.modelSha256) || currentContext.modelSha256 !== packet.modelSha256) fail('current model does not match the saved anchor');
    if (!object(roleContexts)) fail('has invalid role contexts');
    const restored = {};
    for (const role of ROLES) {
        const nested = packet[role];
        const context = roleContexts[role] || {modelSha256: nested.modelSha256};
        restored[role] = experimentsToRuns(nested, context)[0];
        if (nested.modelSha256 === packet.modelSha256) restored[role] = experimentsToRuns(nested, currentContext)[0];
    }
    return {packet, baseline: restored.baseline, control: restored.control, mappings: packet.mappings};
};

const roleDescription = (packet, role, run, definition) => ({
    role, canonicalModelSha256: packet[role].modelSha256, modelSha256: run.modelSha256,
    ...(run.rawModelSha256 === undefined ? {} : {rawModelSha256: run.rawModelSha256}),
    origin: run.origin || 'unknown', runId: run.id, definition
});
const range = rows => {
    const values = rows.filter(row => row.available).map(row => row.value);
    return values.length ? {min: Math.min(...values), max: Math.max(...values)} : {min: null, max: null};
};

/** Exact shared elapsed times, explicit mappings, no binding rewriting or unit/sign conversion. */
export const compareControlPair = (value, currentContext, roleContexts) => {
    const {packet, baseline, control, mappings} = restoreControlPair(value, currentContext, roleContexts);
    const times = [baseline, control].map(run => new Map(run.samples.map(sample => [sample.elapsedMs, sample])));
    const common = [...times[0].keys()].filter(time => times[1].has(time)).sort((a, b) => a - b);
    return mappings.map((mapping, index) => {
        const definitions = [baseline.definitions.find(d => d.id === mapping.baselineId), control.definitions.find(d => d.id === mapping.controlId)];
        const rows = [baseline, control].map((run, side) => run.samples.map(sample => sample.readings.find(row => row.id === definitions[side].id)));
        const source = rows.flat().find(row => row.source)?.source || null;
        const pairs = common.map(elapsedMs => {
            const [a, b] = times.map((byTime, side) => byTime.get(elapsedMs).readings.find(row => row.id === definitions[side].id));
            const difference = a.available && b.available ? b.value - a.value : null;
            const available = a.available && b.available && Number.isFinite(difference);
            return {elapsedMs, a: a.available ? a.value : null, b: b.available ? b.value : null,
                delta: available ? difference : null, available,
                reason: !a.available ? a.reason : !b.available ? b.reason : !available ? 'nonfinite-delta' : '',
                baselineReason: a.available ? '' : a.reason, controlReason: b.available ? '' : b.reason};
        });
        return {id: `control-pair-${index}`, label: `${definitions[0].label} → ${definitions[1].label}`, kind: definitions[0].kind,
            unit: rows[0][0].unit, source, baseline: roleDescription(packet, 'baseline', baseline, definitions[0]),
            control: roleDescription(packet, 'control', control, definitions[1]), range: rows.map(range), pairs};
    });
};
