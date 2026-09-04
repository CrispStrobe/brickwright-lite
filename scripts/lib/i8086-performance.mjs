/** Pure aggregation for the production-browser 8086 pump receipt. */
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const percentile = (values, fraction) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
};

export function summarizeI8086Pump(samples) {
    const totalWallMs = samples.reduce((sum, sample) => sum + finite(sample.wallMs), 0);
    const phaseSummary = {};
    for (const phase of ['runMs', 'boardMs', 'publishMs']) {
        const values = samples.map(sample => finite(sample.phases?.[phase]));
        const totalMs = values.reduce((sum, value) => sum + value, 0);
        phaseSummary[phase] = {
            totalMs,
            percentOfPump: totalWallMs > 0 ? totalMs * 100 / totalWallMs : 0,
            p50: percentile(values, 0.50),
            p95: percentile(values, 0.95),
            max: values.length ? Math.max(...values) : null
        };
    }
    return {
        totalWallMs,
        phases: phaseSummary,
        snapshots: {
            built: samples.filter(sample => sample.snapshotBuilt).length,
            suppressed: samples.filter(sample => !sample.snapshotBuilt).length,
            buildMs: samples.reduce((sum, sample) => sum + finite(sample.snapshotBuildMs), 0)
        }
    };
}

/** Aggregate React Profiler commits by the named production UI boundary. */
export function summarizeReactProfiles(samples) {
    const result = {};
    for (const sample of samples) {
        const id = String(sample.id || 'unknown');
        const bucket = result[id] || (result[id] = {
            commits: 0,
            mounts: 0,
            updates: 0,
            actual: [],
            base: []
        });
        bucket.commits++;
        if (sample.phase === 'mount') bucket.mounts++;
        else bucket.updates++;
        bucket.actual.push(finite(sample.actualDurationMs));
        bucket.base.push(finite(sample.baseDurationMs));
    }
    for (const bucket of Object.values(result)) {
        const durations = values => ({
            totalMs: values.reduce((sum, value) => sum + value, 0),
            p50: percentile(values, 0.50),
            p95: percentile(values, 0.95),
            max: values.length ? Math.max(...values) : null
        });
        bucket.actualDurationMs = durations(bucket.actual);
        bucket.baseDurationMs = durations(bucket.base);
        delete bucket.actual;
        delete bucket.base;
    }
    return result;
}

const SETUP_PHASES = [
    ['app-bootstrap', 'probe-installed', 'dom-ready'],
    ['editor-ready', 'dom-ready', 'device-ready'],
    ['target-selection', 'device-ready', 'i8086-selected'],
    ['asm-chunk-load', 'i8086-selected', 'asm-ready'],
    ['example-selection', 'asm-ready', 'example-ready'],
    ['assemble-and-attach', 'example-ready', 'runner-running'],
    ['attached-hidden-run', 'runner-running', 'circuit-open-request'],
    ['circuit-open-to-first-pump', 'circuit-open-request', 'sample-start'],
    ['steady-pump', 'sample-start', 'sample-end']
];

/**
 * Attribute long tasks and JavaScript resources to named setup/pump windows.
 * Tasks are owned by where they START; clipped overlap time separately shows
 * work crossing a boundary without counting one task in two phases.
 */
export function summarizeI8086Timeline({milestones, longTasks, resources, sampleStart, sampleEnd}) {
    const at = new Map((milestones || []).map(mark => [mark.name, finite(mark.at)]));
    at.set('sample-start', finite(sampleStart));
    at.set('sample-end', finite(sampleEnd));
    const scripts = (resources || []).filter(resource => resource.kind === 'script');
    const phases = [];
    for (const [name, from, to] of SETUP_PHASES) {
        if (!at.has(from) || !at.has(to)) continue;
        const startAt = at.get(from), endAt = at.get(to);
        if (endAt < startAt) continue;
        const started = (longTasks || []).filter(task => finite(task.at) >= startAt && finite(task.at) < endAt);
        const overlapping = (longTasks || []).filter(task => {
            const begin = finite(task.at), end = begin + finite(task.ms);
            return begin < endAt && end > startAt;
        });
        const phaseScripts = scripts.filter(resource =>
            finite(resource.at) >= startAt && finite(resource.at) < endAt);
        phases.push({
            name,
            startAt,
            endAt,
            durationMs: endAt - startAt,
            longTasksStarted: started.length,
            longTaskDurationMs: started.reduce((sum, task) => sum + finite(task.ms), 0),
            longTaskOverlapMs: overlapping.reduce((sum, task) => {
                const begin = finite(task.at), end = begin + finite(task.ms);
                return sum + Math.max(0, Math.min(endAt, end) - Math.max(startAt, begin));
            }, 0),
            scriptCount: phaseScripts.length,
            scriptLoadMs: phaseScripts.reduce((sum, resource) => sum + finite(resource.ms), 0),
            scriptTransferBytes: phaseScripts.reduce((sum, resource) => sum + finite(resource.bytes), 0)
        });
    }
    const boundaryCrossers = (longTasks || []).filter(task =>
        finite(task.at) < sampleStart && finite(task.at) + finite(task.ms) >= sampleStart);
    return {
        phases,
        boundaryCrossingLongTasks: boundaryCrossers,
        slowestScripts: [...scripts]
            .sort((a, b) => finite(b.ms) - finite(a.ms))
            .slice(0, 10)
    };
}
