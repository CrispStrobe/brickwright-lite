// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
export const PLOT_LIMIT = 4;
export const PLOT_SAMPLES = 128;
export const PLOT_INTERVAL_MS = 100;
export const PLOT_WINDOW_MS = 12800;
const identity = d => JSON.stringify([d.kind, d.targets, d.joint, d.rope, d.binding]);

/** Bounded observer of already sampled readings. Never advances or reads physics. */
export const createMeasurementHistory = () => {
    const traces = new Map();
    let owner, previousRows, previousTime, replay = false;
    const snapshot = () => new Map([...traces].map(([id, h]) => [id, h.points.map(p => ({...p}))]));
    return {
        update ({session, definitions, selected, rows, time, replaying = false, paused = false}) {
            const replaced = owner !== session;
            if (replaced || replaying || replay !== replaying) traces.clear();
            if (replaced) { owner = session; previousRows = undefined; previousTime = undefined; }
            const returning = replay && !replaying;
            replay = replaying;
            const allowed = definitions.filter(d => d.visible !== false && selected.includes(d.id)).slice(0, PLOT_LIMIT);
            const keys = new Set(allowed.map(d => d.id));
            for (const id of traces.keys()) if (!keys.has(id)) traces.delete(id);
            for (const d of allowed) {
                const key = identity(d);
                if (traces.get(d.id)?.key !== key) traces.set(d.id, {key, points: []});
            }
            // Rendering, toggling controls or returning from replay cannot retimestamp old rows.
            if (replaying || returning || rows === previousRows || !Number.isFinite(time) || time < 0) {
                previousRows = rows;
                return snapshot();
            }
            previousRows = rows;
            if (previousTime !== undefined && time < previousTime) for (const h of traces.values()) h.points = [];
            previousTime = time;
            for (const d of allowed) {
                const h = traces.get(d.id), row = rows.find(r => r.id === d.id);
                const value = row?.available && Number.isFinite(row.value) ? row.value : null;
                const last = h.points[h.points.length - 1];
                const point = {time, value};
                if (last && time - last.time < PLOT_INTERVAL_MS) {
                    if (time === last.time || paused) h.points[h.points.length - 1] = point;
                } else h.points.push(point);
                while (h.points.length > PLOT_SAMPLES || (h.points.length && time - h.points[0].time > PLOT_WINDOW_MS)) h.points.shift();
            }
            return snapshot();
        }
    };
};

/** Independent segments keep unavailable samples visible as gaps, including the endpoints. */
export const measurementPlotGeometry = points => {
    const finite = points.filter(p => Number.isFinite(p.time) && Number.isFinite(p.value));
    if (!finite.length) return {segments: [], min: null, max: null, start: null, end: null};
    const min = Math.min(...finite.map(p => p.value)), max = Math.max(...finite.map(p => p.value));
    const start = points[0].time, end = points[points.length - 1].time;
    // Normalize first so even extreme finite observations cannot overflow the SVG range.
    const scale = Math.max(Math.abs(min), Math.abs(max), 0.001), pad = min === max ? 0.05 : 0;
    const lo = min / scale - pad, hi = max / scale + pad, segments = [];
    const low = Number.isFinite(lo * scale) ? lo * scale : min;
    const high = Number.isFinite(hi * scale) ? hi * scale : max;
    let segment = [];
    for (const p of points) {
        if (!Number.isFinite(p.value) || !Number.isFinite(p.time)) {
            if (segment.length) segments.push(segment);
            segment = [];
        } else segment.push([32 + (p.time - start) / Math.max(100, end - start) * 246,
            76 - (p.value / scale - lo) / (hi - lo) * 64]);
    }
    if (segment.length) segments.push(segment);
    return {segments, min, max, start, end, low, high};
};
