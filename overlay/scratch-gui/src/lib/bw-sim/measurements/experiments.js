// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Dependency-free admission for saved/imported observations, never a physics reader.
import {measurementDefinitions, MEASUREMENT_KINDS} from './schema.js';

export const EXPERIMENT_SCHEMA = 'bw.sim-lab.experiments.v1';
export const EXPERIMENT_BYTE_LIMIT = 512 * 1024;
export const CSV_BYTE_LIMIT = 8 * 1024 * 1024;
export const RECORDING_LIMIT = 2;
export const RECORDING_SAMPLE_LIMIT = 600;
export const RECORDING_INTERVAL_MS = 100;
export const RECORDING_DURATION_MS = 60000;
export const RECORDING_TRACE_LIMIT = 4;
const HASH = /^[a-f0-9]{64}$/;
const SOURCES = Object.freeze({modelMass: 'configured-model-mass', mass: 'configured-mass', weight: 'configured-weight',
    speed: 'jolt-com-velocity', acceleration: 'sampled-jolt-com-acceleration', angularSpeed: 'jolt-angular-velocity',
    distance: 'part-origins', angle: 'part-origins', jointAngle: 'jolt-joint', jointSpeed: 'jolt-joint', travel: 'jolt-joint',
    tension: 'rope-constraint', normalLoad: 'rolling-load-estimate', pressure: 'jolt-air-network-gauge-pressure',
    motorTorque: 'jolt-motor-impulse', limitTorque: 'jolt-limit-impulse', motorPower: 'jolt-motor-power'});
const REASONS = new Set(['unavailable', 'missing-target', 'coincident-points', 'not-a-rolling-wheel']);
const fail = message => { throw new Error(`simLab.experiments ${message}`); };
const size = value => new TextEncoder().encode(value).byteLength;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const finiteTime = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
// Plot choices are bounded presentation hints, separate from captured quantity identity.
const selectionOf = (value, definitions) => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length > RECORDING_TRACE_LIMIT ||
        value.some(id => !text(id, 128)) || new Set(value).size !== value.length) fail('has invalid plot selection');
    if (definitions !== undefined) {
        const current = new Set(measurementDefinitions(definitions).map(d => d.id));
        if (value.some(id => !current.has(id))) fail('plot selection references an unknown current measurement');
    }
    return value.slice();
};
export const canonicalRecordingDefinition = definition => {
    const d = measurementDefinitions([definition])[0];
    return {id: d.id, kind: d.kind, label: d.label, targets: d.targets || [], joint: d.joint || '', rope: d.rope || '', binding: d.binding || ''};
};
export const recordingDefinitionIdentity = definitions => JSON.stringify(definitions.map(({label, ...identity}) => identity));
export const recordingModelIdentity = run => run.canonicalModelSha256 || run.modelSha256;
const definitionsOf = definitions => {
    if (!Array.isArray(definitions) || !definitions.length || definitions.length > RECORDING_TRACE_LIMIT) fail('needs 1-4 definitions');
    const result = measurementDefinitions(definitions).map(canonicalRecordingDefinition);
    return result;
};
const contextOf = context => {
    if (!object(context) || !HASH.test(context.modelSha256)) fail('needs an independently admitted model SHA256');
    if (context.rawModelSha256 !== undefined && !HASH.test(context.rawModelSha256)) fail('has an invalid raw model alias');
    return context;
};
const admitModel = (run, context) => {
    if (!object(run) || !HASH.test(run.modelSha256)) fail('has an invalid original model SHA256');
    if (run.canonicalModelSha256 !== undefined && run.canonicalModelSha256 !== context.modelSha256) fail('canonical model mismatch');
    if (run.modelSha256 !== context.modelSha256 && run.modelSha256 !== context.rawModelSha256 &&
        run.canonicalModelSha256 !== context.modelSha256) fail('model mismatch');
};
const readingOf = (row, definition) => {
    if (!object(row) || row.id !== definition.id || row.kind !== definition.kind || row.label !== definition.label ||
        row.unit !== MEASUREMENT_KINDS[definition.kind].unit || typeof row.available !== 'boolean') fail('has an inconsistent reading');
    const source = SOURCES[definition.kind];
    if (!source || (row.source !== source && !(row.available === false && row.source === ''))) fail('has an invalid source');
    if (row.available) {
        if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.reason !== '') fail('has an invalid available value');
    } else if (row.value !== null || !REASONS.has(row.reason)) fail('has an invalid unavailable gap');
    return {id: definition.id, label: definition.label, kind: definition.kind, unit: row.unit, source: row.source,
        available: row.available, value: row.value, reason: row.reason};
};
const runOf = (run, context) => {
    admitModel(run, context);
    if (!text(run.id, 128)) fail('has an invalid run id');
    if (run.origin !== undefined && !['simulation', 'csv'].includes(run.origin)) fail('has an invalid run origin');
    if (run.rawModelSha256 !== undefined && !HASH.test(run.rawModelSha256)) fail('has an invalid raw capture SHA256');
    const definitions = definitionsOf(run.definitions);
    const identity = recordingDefinitionIdentity(definitions);
    if (context.definitions !== undefined) {
        const current = new Map(measurementDefinitions(context.definitions).map(d => [d.id, canonicalRecordingDefinition(d)]));
        if (definitions.some(d => !current.has(d.id) || recordingDefinitionIdentity([d]) !== recordingDefinitionIdentity([current.get(d.id)]))) fail('measurement binding mismatch');
    }
    if (!Array.isArray(run.samples) || !run.samples.length || run.samples.length > RECORDING_SAMPLE_LIMIT) fail('needs 1-600 sample sets');
    let previous = -1, absoluteOrigin;
    const samples = run.samples.map(sample => {
        if (!object(sample) || !finiteTime(sample.elapsedMs) || sample.elapsedMs >= RECORDING_DURATION_MS || sample.elapsedMs <= previous) fail('has invalid or duplicate elapsed time');
        previous = sample.elapsedMs;
        if (sample.timeMs !== undefined && sample.timeMs !== null) {
            if (!finiteTime(sample.timeMs) || sample.timeMs < sample.elapsedMs) fail('has invalid absolute time');
            const origin = sample.timeMs - sample.elapsedMs;
            if (absoluteOrigin === undefined) absoluteOrigin = origin;
            // Floating-point subtraction of actual observed timestamps need not be bit exact.
            if (Math.abs(origin - absoluteOrigin) > 1e-7 * Math.max(1, origin, absoluteOrigin)) fail('has inconsistent absolute time');
        }
        if (!Array.isArray(sample.readings) || sample.readings.length !== definitions.length) fail('has an incomplete sample set');
        const rows = new Map(sample.readings.map(row => [row?.id, row]));
        if (rows.size !== definitions.length) fail('has duplicate measurement rows');
        return {elapsedMs: sample.elapsedMs, ...(sample.timeMs === undefined || sample.timeMs === null ? {} : {timeMs: sample.timeMs}),
            readings: definitions.map(d => readingOf(rows.get(d.id), d))};
    });
    return {id: run.id, ...(run.origin === undefined ? {} : {origin: run.origin}), modelSha256: run.modelSha256, canonicalModelSha256: context.modelSha256,
        ...(run.rawModelSha256 === undefined ? {} : {rawModelSha256: run.rawModelSha256}), identity, definitions, samples};
};
export const admitMeasurementRuns = (runs, context) => {
    context = contextOf(context);
    if (!Array.isArray(runs) || runs.length > RECORDING_LIMIT) fail('allows at most two runs');
    const result = runs.map(run => runOf(run, context));
    if (new Set(result.map(run => run.id)).size !== result.length) fail('has duplicate run ids');
    if (result.length === 2 && result[0].identity !== result[1].identity) fail('has incompatible measurement definitions');
    return result;
};

/** Persist compact tuples; display metadata is held only once per definition. */
export const experimentsFromRuns = (runs, context) => {
    const admitted = admitMeasurementRuns(runs, context);
    const selection = selectionOf(context.selection, context.definitions);
    const packet = {schema: EXPERIMENT_SCHEMA, modelSha256: context.modelSha256,
        ...(selection === undefined ? {} : {selection}), runs: admitted.map(run => ({
        id: run.id, ...(run.origin === undefined ? {} : {origin: run.origin}), modelSha256: run.modelSha256, ...(run.rawModelSha256 === undefined ? {} : {rawModelSha256: run.rawModelSha256}), definitions: run.definitions,
        samples: run.samples.map(sample => [sample.elapsedMs, sample.timeMs ?? null,
            sample.readings.map(row => [row.value, row.source, row.reason])])
    }))};
    if (size(JSON.stringify(packet)) > EXPERIMENT_BYTE_LIMIT) fail('exceeds the saved history byte limit');
    return packet;
};

/** Structural admission also runs during bundle parsing; restore must supply independent context. */
export const measurementExperiments = value => {
    if (!object(value) || value.schema !== EXPERIMENT_SCHEMA || !HASH.test(value.modelSha256) ||
        !Array.isArray(value.runs) || value.runs.length > RECORDING_LIMIT) fail('has an invalid saved schema');
    if (size(JSON.stringify(value)) > EXPERIMENT_BYTE_LIMIT) fail('exceeds the saved history byte limit');
    const runs = value.runs.map(run => {
        if (!object(run)) fail('has an invalid saved run');
        const definitions = definitionsOf(run.definitions);
        if (!Array.isArray(run.samples) || run.samples.length > RECORDING_SAMPLE_LIMIT) fail('has invalid saved samples');
        return {...run, canonicalModelSha256: value.modelSha256, definitions, samples: run.samples.map(tuple => {
            if (!Array.isArray(tuple) || tuple.length !== 3 || !Array.isArray(tuple[2]) || tuple[2].length !== definitions.length) fail('has an invalid saved sample tuple');
            return {elapsedMs: tuple[0], timeMs: tuple[1], readings: tuple[2].map((reading, i) => {
                if (!Array.isArray(reading) || reading.length !== 3) fail('has an invalid saved reading tuple');
                const d = definitions[i];
                return {id: d.id, label: d.label, kind: d.kind, unit: MEASUREMENT_KINDS[d.kind].unit,
                    available: reading[0] !== null, value: reading[0], source: reading[1], reason: reading[2]};
            })};
        })};
    });
    return experimentsFromRuns(runs, {modelSha256: value.modelSha256, selection: value.selection});
};
export const experimentsToRuns = (value, context) => {
    contextOf(context);
    const packet = measurementExperiments(value);
    if (packet.modelSha256 !== context.modelSha256) fail('saved model mismatch');
    selectionOf(packet.selection, context.definitions);
    // Provenance was bound to this canonical model at capture/import. Preserve the original SHA.
    return admitMeasurementRuns(packet.runs.map(run => ({...run, canonicalModelSha256: packet.modelSha256,
        samples: run.samples.map(([elapsedMs, timeMs, readings]) => ({elapsedMs, ...(timeMs === null ? {} : {timeMs}),
            readings: readings.map(([value, source, reason], i) => ({...run.definitions[i], unit: MEASUREMENT_KINDS[run.definitions[i].kind].unit,
                available: value !== null, value, source, reason}))}))})), context);
};

const HEADER = ['run_id', 'model_sha256', 'measurement_id', 'label', 'kind', 'definition_json', 'unit', 'source', 'elapsed_ms', 'available', 'value', 'reason'];
// Decode only the exporter's text protection; definition JSON is authoritative.
const exportedText = text => /^[\u0000-\u0020]*[=+\-@]/u.test(text) ? `'${text}` : text;
const numberCell = cell => {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(cell)) fail('has an invalid numeric CSV cell');
    const number = Number(cell);
    if (!Number.isFinite(number)) fail('has a nonfinite CSV number');
    return number;
};
/** Strict RFC4180 parser with bounds checked before decoded cells accumulate. */
const parseCsv = input => {
    if (typeof input !== 'string' || size(input) > CSV_BYTE_LIMIT) fail('CSV exceeds its byte limit');
    const rows = []; let row = [], cell = '', quoted = false, closed = false, started = false;
    const field = () => {
        row.push(cell); cell = ''; closed = false; started = false;
        if (row.length > HEADER.length + 1) fail('CSV has too many columns');
    };
    const line = () => {field(); rows.push(row); row = []; if (rows.length > 1 + RECORDING_LIMIT * RECORDING_SAMPLE_LIMIT * RECORDING_TRACE_LIMIT) fail('CSV has too many rows');};
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (quoted) {
            if (c === '"') {if (input[i + 1] === '"') {cell += '"'; i++;} else {quoted = false; closed = true;}}
            else cell += c;
        } else if (c === '"') {
            if (started || closed || cell) fail('CSV has a misplaced quote');
            quoted = true; started = true;
        } else if (c === ',') field();
        else if (c === '\r' || c === '\n') {
            if (c === '\r' && input[i + 1] !== '\n') fail('CSV has a bare carriage return');
            if (c === '\r') i++;
            line();
        } else {
            if (closed) fail('CSV has text after a closing quote');
            started = true; cell += c;
        }
        if (cell.length > 32768) fail('CSV has an oversized field');
    }
    if (quoted) fail('CSV has an unterminated quote');
    if (row.length || cell || started || closed) line();
    const header = rows.shift();
    const extended = JSON.stringify(header) === JSON.stringify([...HEADER, 'canonical_model_sha256']);
    if (!extended && JSON.stringify(header) !== JSON.stringify(HEADER)) fail('CSV has an unexpected header');
    if (!rows.length) fail('CSV contains no observations');
    return {rows, extended};
};

/** Context supplies an independently computed physical-model SHA and optional exact raw-text alias.
 * The additive canonical column preserves historical provenance across save/reopen.
 * Imported observations do not establish source authenticity or physical accuracy. */
export const measurementRunsFromCsv = (input, context) => {
    contextOf(context);
    const grouped = new Map();
    const {rows, extended} = parseCsv(input);
    for (const cells of rows) {
        if (cells.length !== HEADER.length + (extended ? 1 : 0)) fail('CSV has an incomplete row');
        const [runId, modelSha256, idCell, label, kind, declaration, unit, source, elapsedCell, availableCell, valueCell, reason, canonicalModelSha256] = cells;
        if (extended && canonicalModelSha256 !== context.modelSha256) fail('CSV canonical model mismatch');
        if (!text(runId, 129)) fail('CSV has an invalid run id');
        let run = grouped.get(runId);
        if (!run) {
            if (grouped.size >= RECORDING_LIMIT) fail('CSV has too many runs');
            run = {id: runId, modelSha256, ...(extended ? {canonicalModelSha256} : {}), definitions: [], samples: [], byId: new Map(), byTime: new Map()};
            grouped.set(runId, run);
        }
        if (run.modelSha256 !== modelSha256) fail('CSV changes model identity within a run');
        let definition = run.byId.get(idCell);
        if (!definition) {
            if (!declaration || run.definitions.length >= RECORDING_TRACE_LIMIT) fail('CSV lacks a first-row definition');
            let parsed; try {parsed = JSON.parse(declaration);} catch {fail('CSV has invalid definition JSON');}
            definition = canonicalRecordingDefinition(parsed);
            if (idCell !== exportedText(definition.id)) fail('CSV definition id mismatch');
            run.byId.set(idCell, definition); run.definitions.push(definition);
        } else if (declaration !== '') fail('CSV repeats a definition declaration');
        if (label !== exportedText(definition.label) || kind !== definition.kind) fail('CSV definition metadata mismatch');
        const elapsedMs = numberCell(elapsedCell);
        let sample = run.byTime.get(elapsedMs);
        if (!sample) {
            if (run.samples.length >= RECORDING_SAMPLE_LIMIT) fail('CSV has too many samples');
            if (run.samples.length && elapsedMs <= run.samples.at(-1).elapsedMs) fail('CSV timestamps are out of order');
            sample = {elapsedMs, readings: []}; run.samples.push(sample); run.byTime.set(elapsedMs, sample);
        } else if (sample !== run.samples.at(-1)) fail('CSV revisits a completed sample');
        if (sample.readings.some(row => row.id === definition.id)) fail('CSV has a duplicate reading');
        if (availableCell !== 'true' && availableCell !== 'false') fail('CSV has invalid availability');
        const available = availableCell === 'true';
        if (available ? reason !== '' : valueCell !== '') fail('CSV has contradictory gap metadata');
        sample.readings.push({id: definition.id, label: definition.label, kind: definition.kind, unit, source, available,
            value: available ? numberCell(valueCell) : null, reason});
    }
    const runs = [...grouped.values()].map(run => {
        // Exported run IDs are generated ordinary IDs; imported formula-like IDs are text.
        if (run.id.startsWith("'") && /^[\u0000-\u0020]*[=+\-@]/u.test(run.id.slice(1))) run.id = run.id.slice(1);
        return run;
    });
    const admitted = admitMeasurementRuns(runs, context).map(run => ({...run, origin: 'csv'}));
    // CSV import must also fit the saved-history envelope before it can mutate a recorder.
    experimentsFromRuns(admitted, context);
    return admitted;
};
