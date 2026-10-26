// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {sha256Text} from './binding-digest.js';

import {experimentsFromRuns, experimentsToRuns, measurementRunsFromCsv, recordingModelIdentity,
    recordingWindow, RECORDING_LIMIT, RECORDING_SAMPLE_LIMIT, RECORDING_INTERVAL_MS, RECORDING_DURATION_MS, RECORDING_TRACE_LIMIT} from './experiments.js';
export {RECORDING_LIMIT, RECORDING_SAMPLE_LIMIT, RECORDING_INTERVAL_MS, RECORDING_DURATION_MS, RECORDING_TRACE_LIMIT};

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
    armed: Boolean(state.active?.window && state.active.lastObservedTime < state.active.startTime),
    window: state.active?.window ? clone(state.active.window) : null,
    stoppedReason: state.stoppedReason,
    runs: state.runs.map(run => clone(run)),
    compatible: state.runs.length === RECORDING_LIMIT && state.runs[0].identity === state.runs[1].identity &&
        recordingModelIdentity(state.runs[0]) === recordingModelIdentity(state.runs[1]),
    sampleLimit: RECORDING_SAMPLE_LIMIT,
    sampleCount: state.active ? state.active.samples.length : 0
});

/**
 * Bounded recorder of committed measurement rows. It never advances physics,
 * reads the model, or infers time from wall-clock or React renders.
 */
export const createMeasurementRecorder = () => {
    const state = {runs: [], active: null, stoppedReason: ''};
    let selectionKey, selectionHash;
    const snapshot = () => publicState(state);
    const stop = why => {
        if (!state.active) return snapshot();
        const active = state.active;
        state.active = null;
        state.stoppedReason = why || 'stopped';
        if (active.samples.length) {
            let nextRun = 1;
            while (state.runs.some(run => run.id === `run-${nextRun}`)) nextRun++;
            state.runs.push({id: `run-${nextRun}`, origin: 'simulation', ...(active.window ? {window: active.window} : {}), modelSha256: active.modelSha256,
                ...(active.canonicalModelSha256 ? {canonicalModelSha256: active.canonicalModelSha256, rawModelSha256: active.rawModelSha256} : {}),
                identity: active.identity, definitions: active.definitions,
                samples: active.samples});
        }
        return snapshot();
    };
    return {
        snapshot,
        exportExperiments (context) {
            if (state.active) throw new Error('Stop recording before saving its history');
            return experimentsFromRuns(state.runs, context);
        },
        restore (packet, context) {
            if (state.active) throw new Error('Stop recording before restoring history');
            const runs = packet === undefined ? [] : experimentsToRuns(packet, context);
            state.runs = runs; state.stoppedReason = '';
            return snapshot();
        },
        importCsv (input, context) {
            if (state.active) throw new Error('Stop recording before importing history');
            const runs = measurementRunsFromCsv(input, context);
            if (state.runs.length + runs.length > RECORDING_LIMIT) throw new Error('Clear recordings before importing more than two runs');
            const combined = [...state.runs, ...runs];
            // Validate the complete replacement before changing any retained sample.
            const packet = experimentsFromRuns(combined, context);
            state.runs = experimentsToRuns(packet, context); state.stoppedReason = '';
            return snapshot();
        },
        selectionFor (modelKey, canonicalModelSha256) {
            if (!state.runs.length || typeof modelKey !== 'string') return [];
            if (selectionKey !== modelKey) { selectionKey = modelKey; selectionHash = sha256Text(modelKey); }
            return state.runs.find(run => recordingModelIdentity(run) === (canonicalModelSha256 || selectionHash))?.definitions.map(d => d.id) || [];
        },
        start ({session, modelKey, definitions, selected, sampleTime, canonicalModelSha256, rawModelSha256, window: requestedWindow}) {
            if (state.active || state.runs.length >= RECORDING_LIMIT || typeof modelKey !== 'string' || !modelKey || !Number.isFinite(sampleTime) || sampleTime < 0) return snapshot();
            const window = recordingWindow(requestedWindow);
            if (window && window.startTimeMs < sampleTime) throw new Error('Recording window must start at or after current simulated time');
            const defs = selectedDefinitions(definitions, selected);
            if (!defs.length) {state.stoppedReason = 'select-measurements'; return snapshot();}
            const identity = definitionIdentity(defs);
            if (canonicalModelSha256 !== undefined && !/^[a-f0-9]{64}$/.test(canonicalModelSha256)) throw new Error('Invalid canonical model SHA256');
            if (rawModelSha256 !== undefined && rawModelSha256 !== sha256Text(modelKey)) throw new Error('Raw model SHA256 does not match current model text');
            const originalRawSha = rawModelSha256 || sha256Text(modelKey);
            const modelSha256 = canonicalModelSha256 || originalRawSha;
            if (state.runs.length && state.runs.some(run => run.identity !== identity || recordingModelIdentity(run) !== (canonicalModelSha256 || modelSha256))) {
                state.stoppedReason = 'different-model-or-measurements'; return snapshot();
            }
            state.active = {session, modelKey, modelSha256, canonicalModelSha256, rawModelSha256: originalRawSha, identity,
                definitions: defs, samples: [], ...(window ? {window} : {}), startTime: window?.startTimeMs ?? sampleTime, lastObservedTime: sampleTime, lastRows: undefined};
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
            const elapsed = sampleTime - active.startTime;
            if (active.window && elapsed < 0) return snapshot();
            if (active.window && elapsed >= active.window.durationMs) return stop(active.samples.length ? 'window-complete' : 'window-missed');
            if (!Array.isArray(rows) || rows === active.lastRows) return snapshot();
            active.lastRows = rows;
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
    if (!Array.isArray(runs) || runs.length !== 2 || runs[0].identity !== runs[1].identity || recordingModelIdentity(runs[0]) !== recordingModelIdentity(runs[1])) return [];
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
    const extended = (runs || []).some(run => run.canonicalModelSha256 && run.canonicalModelSha256 !== run.modelSha256);
    if (extended) header.push('canonical_model_sha256');
    const lines = [header.map(csvCell).join(',')];
    for (const run of runs || []) {
        const definitions = new Map((run.definitions || []).map(definition => [definition.id, JSON.stringify(definition)]));
        const written = new Set();
        for (const sample of run.samples || []) for (const row of sample.readings || []) {
            // Each run/measurement declares its definition once; later rows join by ID.
            const definition = written.has(row.id) ? '' : definitions.get(row.id) || '';
            written.add(row.id);
            const cells = [run.id, run.modelSha256, row.id, row.label, row.kind, definition, row.unit, row.source,
                sample.elapsedMs, row.available, row.available ? row.value : '', row.available ? '' : row.reason];
            if (extended) cells.push(recordingModelIdentity(run));
            lines.push(cells.map(csvCell).join(','));
        }
    }
    return `${lines.join('\r\n')}\r\n`;
};

/** Bounded summary sidecar for a successful CSV export; raw observations stay in CSV. */
export const measurementRunsToReport = runs => {
    const compatible = Array.isArray(runs) && runs.length === RECORDING_LIMIT &&
        recordingModelIdentity(runs[0]) === recordingModelIdentity(runs[1]) && runs[0].identity === runs[1].identity;
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
