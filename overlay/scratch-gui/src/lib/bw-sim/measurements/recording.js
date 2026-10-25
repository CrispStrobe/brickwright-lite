// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {sha256Text} from './binding-digest.js';

export const RECORDING_LIMIT = 2;
export const RECORDING_SAMPLE_LIMIT = 600;
export const RECORDING_INTERVAL_MS = 100;
export const RECORDING_DURATION_MS = RECORDING_SAMPLE_LIMIT * RECORDING_INTERVAL_MS;
export const RECORDING_TRACE_LIMIT = 4;

const text = value => typeof value === 'string' ? value : '';
const canonicalDefinition = d => ({
    id: text(d.id), kind: text(d.kind), label: text(d.label),
    targets: Array.isArray(d.targets) ? d.targets.map(text) : [],
    joint: text(d.joint), rope: text(d.rope), binding: text(d.binding)
});
const selectedDefinitions = (definitions, selected) => {
    const ids = [...new Set(selected)].slice(0, RECORDING_TRACE_LIMIT);
    const byId = new Map(definitions.map(d => [d.id, d]));
    return ids.map(id => byId.get(id)).filter(d => d && d.visible !== false).map(canonicalDefinition);
};
const definitionIdentity = definitions => JSON.stringify(definitions.map(({label, ...identity}) => identity));
const clone = value => JSON.parse(JSON.stringify(value));
const sampleValue = row => row?.available === true && Number.isFinite(row.value) ? row.value : null;
const reason = row => sampleValue(row) !== null ? '' : text(row?.reason) || 'unavailable';

const publicState = state => ({
    active: Boolean(state.active),
    stoppedReason: state.stoppedReason,
    runs: state.runs.map(run => clone(run)),
    compatible: state.runs.length === RECORDING_LIMIT && state.runs[0].identity === state.runs[1].identity &&
        state.runs[0].modelSha256 === state.runs[1].modelSha256,
    sampleLimit: RECORDING_SAMPLE_LIMIT,
    sampleCount: state.active ? state.active.samples.length : 0
});

/**
 * Bounded recorder of committed measurement rows. It never advances physics,
 * reads the model, or infers time from wall-clock or React renders.
 */
export const createMeasurementRecorder = () => {
    const state = {runs: [], active: null, stoppedReason: ''};
    const snapshot = () => publicState(state);
    const stop = why => {
        if (!state.active) return snapshot();
        const active = state.active;
        state.active = null;
        state.stoppedReason = why || 'stopped';
        if (active.samples.length) {
            state.runs.push({id: `run-${state.runs.length + 1}`, modelSha256: active.modelSha256,
                identity: active.identity, definitions: active.definitions,
                samples: active.samples});
        }
        return snapshot();
    };
    return {
        snapshot,
        start ({session, modelKey, definitions, selected, sampleTime}) {
            if (state.active || state.runs.length >= RECORDING_LIMIT || typeof modelKey !== 'string' || !modelKey || !Number.isFinite(sampleTime) || sampleTime < 0) return snapshot();
            const defs = selectedDefinitions(definitions, selected);
            if (!defs.length) {state.stoppedReason = 'select-measurements'; return snapshot();}
            const identity = definitionIdentity(defs);
            const modelSha256 = sha256Text(modelKey);
            if (state.runs.length && state.runs.some(run => run.identity !== identity || run.modelSha256 !== modelSha256)) {
                state.stoppedReason = 'different-model-or-measurements'; return snapshot();
            }
            state.active = {session, modelKey, modelSha256, identity,
                definitions: defs, samples: [], startTime: sampleTime, lastObservedTime: sampleTime, lastRows: undefined};
            state.stoppedReason = '';
            return snapshot();
        },
        stop,
        clear () {
            state.active = null; state.runs = []; state.stoppedReason = '';
            return snapshot();
        },
        update ({session, modelKey, definitions, selected, rows, sampleTime, replaying = false, paused = false}) {
            const active = state.active;
            if (!active) return snapshot();
            const defs = selectedDefinitions(definitions, selected);
            const identity = definitionIdentity(defs);
            if (session !== active.session) return stop('session-reset');
            if (typeof modelKey !== 'string' || modelKey !== active.modelKey) return stop('model-changed');
            if (identity !== active.identity) return stop('definitions-changed');
            if (replaying) return stop('pose-replay');
            if (!Number.isFinite(sampleTime) || sampleTime < active.lastObservedTime) return stop('time-reset');
            active.lastObservedTime = sampleTime;
            if (!Array.isArray(rows) || rows === active.lastRows) return snapshot();
            active.lastRows = rows;
            const elapsed = sampleTime - active.startTime;
            if (elapsed < 0) return stop('time-reset');
            if (elapsed >= RECORDING_DURATION_MS) return stop('time-limit');
            const last = active.samples[active.samples.length - 1];
            if (last && elapsed - last.elapsedMs < RECORDING_INTERVAL_MS) {
                if (elapsed === last.elapsedMs || paused) {
                    last.timeMs = sampleTime;
                    last.elapsedMs = elapsed;
                    last.readings = readingsFor(active.definitions, rows);
                }
                return snapshot();
            }
            if (active.samples.length >= RECORDING_SAMPLE_LIMIT) return stop('sample-limit');
            active.samples.push({elapsedMs: elapsed, timeMs: sampleTime, readings: readingsFor(active.definitions, rows)});
            if (active.samples.length >= RECORDING_SAMPLE_LIMIT) return stop('sample-limit');
            return snapshot();
        }
    };
};

const readingsFor = (defs, rows) => defs.map(definition => {
    const row = rows.find(r => r.id === definition.id);
    const value = sampleValue(row);
    return {id: definition.id, label: definition.label, kind: definition.kind,
        unit: text(row?.unit), source: text(row?.source), available: value !== null,
        value, reason: reason(row)};
});

/** Exact timestamp intersection only. No interpolation or unavailable-as-zero. */
export const compareMeasurementRuns = runs => {
    if (!Array.isArray(runs) || runs.length !== 2 || runs[0].identity !== runs[1].identity || runs[0].modelSha256 !== runs[1].modelSha256) return [];
    const byTime = runs.map(run => new Map(run.samples.map(sample => [sample.elapsedMs, sample])));
    const commonTimes = [...byTime[0].keys()].filter(time => byTime[1].has(time)).sort((a, b) => a - b);
    const definitions = runs[0].definitions;
    return definitions.map(definition => {
        const pairs = commonTimes.map(time => {
            const get = (index) => byTime[index].get(time)?.readings.find(row => row.id === definition.id);
            const a = get(0), b = get(1);
            return {elapsedMs: time, a: a?.available ? a.value : null, b: b?.available ? b.value : null,
                delta: a?.available && b?.available ? b.value - a.value : null,
                available: Boolean(a?.available && b?.available), reason: !a?.available ? a?.reason || 'unavailable' : !b?.available ? b?.reason || 'unavailable' : ''};
        });
        const values = runIndex => runs[runIndex].samples.flatMap(sample => {
            const row = sample.readings.find(r => r.id === definition.id);
            return row?.available ? [row.value] : [];
        });
        const range = [0, 1].map(runIndex => {
            const rows = values(runIndex);
            return rows.length ? {min: Math.min(...rows), max: Math.max(...rows)} : {min: null, max: null};
        });
        return {id: definition.id, label: definition.label, kind: definition.kind,
            unit: runs[0].samples.flatMap(s => s.readings).find(r => r.id === definition.id)?.unit || '',
            range, pairs};
    });
};

const csvCell = value => {
    let cell = value === null || value === undefined ? '' : String(value);
    if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/u.test(cell)) cell = `'${cell}`;
    return `"${cell.replaceAll('"', '""')}"`;
};

/** Stable long-form CSV. Text cells are quoted and formula-like cells neutralized. */
export const measurementRunsToCsv = runs => {
    const header = ['run_id', 'model_sha256', 'measurement_id', 'label', 'kind', 'definition_json', 'unit', 'source', 'elapsed_ms', 'available', 'value', 'reason'];
    const lines = [header.map(csvCell).join(',')];
    for (const run of runs || []) {
        const definitions = new Map((run.definitions || []).map(definition => [definition.id, JSON.stringify(definition)]));
        for (const sample of run.samples || []) for (const row of sample.readings || []) {
            lines.push([run.id, run.modelSha256, row.id, row.label, row.kind, definitions.get(row.id) || '', row.unit, row.source,
            sample.elapsedMs, row.available, row.available ? row.value : '', row.available ? '' : row.reason].map(csvCell).join(','));
        }
    }
    return `${lines.join('\r\n')}\r\n`;
};

/** Bounded summary sidecar for a successful CSV export; raw observations stay in CSV. */
export const measurementRunsToReport = runs => {
    const compatible = Array.isArray(runs) && runs.length === RECORDING_LIMIT &&
        runs[0].modelSha256 === runs[1].modelSha256 && runs[0].identity === runs[1].identity;
    const report = {
        schema: 'bw.sim-lab.measurement-runs.v1',
        modelSha256: runs?.[0]?.modelSha256 || null,
        compatible,
        limits: {runs: RECORDING_LIMIT, sampleSetsPerRun: RECORDING_SAMPLE_LIMIT, sampleIntervalMs: RECORDING_INTERVAL_MS,
            durationMs: RECORDING_DURATION_MS, selectedMeasurements: RECORDING_TRACE_LIMIT},
        runs: (runs || []).map(run => ({
            id: run.id, modelSha256: run.modelSha256, definitions: run.definitions,
            sampleSets: run.samples.length,
            startTimeMs: run.samples[0]?.timeMs ?? null,
            endTimeMs: run.samples.at(-1)?.timeMs ?? null,
            simulatedDurationMs: run.samples.at(-1)?.elapsedMs ?? 0,
            measurements: run.definitions.map(definition => {
                const values = run.samples.flatMap(sample => {
                    const row = sample.readings.find(reading => reading.id === definition.id);
                    return row?.available ? [row.value] : [];
                });
                return {id: definition.id, unit: run.samples.flatMap(sample => sample.readings)
                    .find(row => row.id === definition.id)?.unit || '', availableSamples: values.length,
                min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null};
            })
        })),
        comparison: compatible ? compareMeasurementRuns(runs).map(result => ({
            id: result.id, unit: result.unit, sharedSampleTimes: result.pairs.length,
            availableSharedSampleTimes: result.pairs.filter(pair => pair.available).length,
            minimumDelta: result.pairs.filter(pair => pair.available).reduce((min, pair) => Math.min(min, pair.delta), Infinity),
            maximumDelta: result.pairs.filter(pair => pair.available).reduce((max, pair) => Math.max(max, pair.delta), -Infinity)
        })).map(summary => ({...summary,
            minimumDelta: Number.isFinite(summary.minimumDelta) ? summary.minimumDelta : null,
            maximumDelta: Number.isFinite(summary.maximumDelta) ? summary.maximumDelta : null
        })) : []
    };
    return `${JSON.stringify(report, null, 2)}\n`;
};
