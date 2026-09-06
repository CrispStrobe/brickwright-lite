/** Pure aggregation for the production-browser 8086 pump receipt. */
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const percentile = (values, fraction) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
};

/** Median and full observed range for a repeated scalar measurement. */
export function summarizeSpread(values) {
    const sorted = (values || []).filter(value => value !== null && value !== undefined)
        .map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return {median: null, min: null, max: null, range: null};
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return {median, min: sorted[0], max: sorted.at(-1), range: sorted.at(-1) - sorted[0]};
}

/** Validate and summarize the simulated time advanced by each production UI
 * pump. Invalid rows remain visible in `issues` instead of disappearing from
 * the receipt, and a large guest-time leap is reported as an overshoot rather
 * than being mistaken for emulator throughput. */
export function summarizeI8086SimulatedPump(samples, limitMs = 50) {
    const list = Array.isArray(samples) ? samples : [];
    const issues = [];
    const values = [];
    const overshoots = [];
    let previousAt = null;

    if (!list.length) issues.push('no steady pump samples');
    if (!Number.isFinite(limitMs) || limitMs <= 0) issues.push('invalid simulated-time limit');
    for (let index = 0; index < list.length; index++) {
        const sample = list[index] || {};
        const at = Number(sample.at);
        const wallMs = Number(sample.wallMs);
        const simNs = Number(sample.simNs);
        if (!Number.isFinite(at) || at < 0) issues.push(`sample ${index} has invalid timestamp`);
        else if (previousAt !== null && at < previousAt) issues.push(`sample ${index} timestamp went backwards`);
        if (Number.isFinite(at)) previousAt = at;
        if (!Number.isFinite(wallMs) || wallMs <= 0) issues.push(`sample ${index} has invalid wall time`);
        if (!Number.isFinite(simNs) || simNs <= 0) {
            issues.push(`sample ${index} has invalid simulated time`);
            continue;
        }
        const simulatedMs = simNs / 1e6;
        values.push(simulatedMs);
        if (Number.isFinite(limitMs) && limitMs > 0 && simulatedMs > limitMs) {
            overshoots.push({index, at, simulatedMs});
        }
    }

    return {
        p50: percentile(values, 0.50),
        p95: percentile(values, 0.95),
        max: values.length ? Math.max(...values) : null,
        limitMs,
        overshootCount: overshoots.length,
        overshoots,
        issues,
        valid: issues.length === 0 && overshoots.length === 0
    };
}

/** Fail-closed integrity checks for the CPU-bound hosted workload receipt. */
export function validateI8086WorkloadIntegrity(result, {
    workloadId,
    sourceSha256,
    heartbeatOffset,
    maximumSimulatedMsPerPump,
    minimumSamples
} = {}) {
    const issues = [];
    const workload = result?.workload || {};
    const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
    if (!workloadId || workload.id !== workloadId) issues.push('wrong workload id');
    if (!/^[0-9a-f]{64}$/.test(String(sourceSha256 || '')) ||
        workload.sourceSha256 !== sourceSha256) issues.push('wrong workload source hash');
    if (!Number.isInteger(heartbeatOffset) || workload.heartbeatOffset !== heartbeatOffset) {
        issues.push('wrong heartbeat offset');
    }
    if (!Number.isInteger(workload.heartbeatAddress) || workload.heartbeatAddress < 0 ||
        workload.heartbeatAddress > 0xfffff) issues.push('invalid heartbeat address');
    if (!uint32(workload.heartbeatBefore) || !uint32(workload.heartbeatAfter) ||
        !uint32(workload.heartbeatDelta)) {
        issues.push('invalid heartbeat value');
    } else {
        const expectedDelta = (workload.heartbeatAfter - workload.heartbeatBefore) >>> 0;
        if (workload.heartbeatDelta !== expectedDelta) issues.push('heartbeat delta mismatch');
        if (workload.heartbeatDelta === 0) issues.push('heartbeat made no progress');
        if (workload.heartbeatDelta >= 0x80000000) issues.push('heartbeat progress is wrap-ambiguous');
    }
    if (!Number.isFinite(workload.cyclesBefore) || !Number.isFinite(workload.cyclesAfter) ||
        !Number.isFinite(workload.cycleDelta) || workload.cycleDelta <= 0 ||
        workload.cyclesAfter - workload.cyclesBefore !== workload.cycleDelta) {
        issues.push('CPU cycles did not make consistent progress');
    }
    const simulated = result?.simulatedMsPerPump;
    if (!simulated || simulated.valid !== true || !Array.isArray(simulated.issues) ||
        !Array.isArray(simulated.overshoots) || simulated.issues.length ||
        simulated.overshootCount !== simulated.overshoots.length || simulated.overshootCount !== 0 ||
        simulated.limitMs !== maximumSimulatedMsPerPump ||
        ![simulated.p50, simulated.p95, simulated.max].every(value =>
            Number.isFinite(value) && value > 0 && value <= maximumSimulatedMsPerPump)) {
        issues.push('invalid simulated pump summary');
    }
    if (![result?.simulatedMs, result?.elapsedMs, result?.realTimeRatio].every(value =>
        Number.isFinite(value) && value > 0)) issues.push('invalid throughput measurement');
    if (!Number.isInteger(minimumSamples) || !Number.isInteger(result?.samples) ||
        result.samples < minimumSamples) issues.push('insufficient executed pump samples');
    return issues;
}

/** Cross-run summary. Every detailed run remains in report.results and in its
 * raw receipt; this compact view makes comparisons statistical and reviewable. */
export function summarizeI8086Repetitions(runs) {
    const list = runs || [];
    const metric = getter => summarizeSpread(list.map(getter));
    const setupNames = [...new Set(list.flatMap(run =>
        (run.setupTimeline?.phases || []).map(phase => phase.name)))];
    const setupPhases = Object.fromEntries(setupNames.map(name => {
        const phases = list.map(run => run.setupTimeline?.phases?.find(phase => phase.name === name));
        const field = key => summarizeSpread(phases.map(phase => phase?.[key]));
        return [name, {
            durationMs: field('durationMs'),
            longTasksStarted: field('longTasksStarted'),
            longTaskOverlapMs: field('longTaskOverlapMs'),
            scriptTransferBytes: field('scriptTransferBytes'),
            scriptEncodedBodyBytes: field('scriptEncodedBodyBytes'),
            scriptDecodedBodyBytes: field('scriptDecodedBodyBytes')
        }];
    }));
    const reactIds = [...new Set(list.flatMap(run =>
        Object.keys(run.reactProfiles?.startup || {})))];
    const startupReact = Object.fromEntries(reactIds.map(id => [id, {
        commits: metric(run => run.reactProfiles?.startup?.[id]?.commits),
        actualDurationMs: metric(run => run.reactProfiles?.startup?.[id]?.actualDurationMs?.totalMs)
    }]));
    const attributionWindows = Object.fromEntries(['startup', 'circuitOpen'].map(windowName => {
        const boundaryIds = [...new Set(list.flatMap(run => Object.keys(
            run.reactAttribution?.[windowName]?.boundaries || {})))];
        const boundaries = Object.fromEntries(boundaryIds.map(id => {
            const sourceNames = [...new Set(list.flatMap(run => Object.keys(
                run.reactAttribution?.[windowName]?.boundaries?.[id]?.sources || {})))];
            return [id, {
                commits: metric(run => run.reactAttribution?.[windowName]?.boundaries?.[id]?.commits),
                attributedCommits: metric(run =>
                    run.reactAttribution?.[windowName]?.boundaries?.[id]?.attributedCommits),
                unattributedCommits: metric(run =>
                    run.reactAttribution?.[windowName]?.boundaries?.[id]?.unattributedCommits),
                sources: Object.fromEntries(sourceNames.map(source => [source, {
                    marks: metric(run => run.reactAttribution?.[windowName]
                        ?.boundaries?.[id]?.sources?.[source]?.marks),
                    commits: metric(run => run.reactAttribution?.[windowName]
                        ?.boundaries?.[id]?.sources?.[source]?.commits),
                    actualDurationMs: metric(run => run.reactAttribution?.[windowName]
                        ?.boundaries?.[id]?.sources?.[source]?.actualDurationMs)
                }]))
            }];
        }));
        return [windowName, {boundaries}];
    }));
    const pumpPhase = name => ({
        totalMs: metric(run => run.pumpBreakdown?.phases?.[name]?.totalMs),
        percentOfPump: metric(run => run.pumpBreakdown?.phases?.[name]?.percentOfPump)
    });
    return {
        repetitions: list.length,
        realTimeRatio: metric(run => run.realTimeRatio),
        elapsedMs: metric(run => run.elapsedMs),
        pumpMs: {
            p50: metric(run => run.pumpMs?.p50),
            p95: metric(run => run.pumpMs?.p95),
            max: metric(run => run.pumpMs?.max)
        },
        workload: {
            heartbeatDelta: metric(run => run.workload?.heartbeatDelta),
            cycleDelta: metric(run => run.workload?.cycleDelta)
        },
        simulatedMsPerPump: {
            p50: metric(run => run.simulatedMsPerPump?.p50),
            p95: metric(run => run.simulatedMsPerPump?.p95),
            max: metric(run => run.simulatedMsPerPump?.max),
            overshootCount: metric(run => run.simulatedMsPerPump?.overshootCount)
        },
        pumpBreakdown: {
            totalWallMs: metric(run => run.pumpBreakdown?.totalWallMs),
            phases: Object.fromEntries(['runMs', 'boardMs', 'publishMs'].map(name =>
                [name, pumpPhase(name)]))
        },
        longTasks: {
            runtime: metric(run => run.longTasks?.length),
            steady: metric(run => run.steadyLongTasks?.length),
            startup: metric(run => run.startupLongTaskCount)
        },
        setupPhases,
        startupReact,
        reactAttribution: attributionWindows
    };
}

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

/**
 * Attribute benchmark-only update-source marks to React commits. Attribution
 * is per Profiler boundary: nested BoardCanvas and outer CircuitDesigner may
 * legitimately receive the same mark, but their commit totals are never added.
 */
export function attributeReactCommits(samples, marks, {from = -Infinity, to = Infinity} = {}) {
    const profiles = (samples || []).filter(sample =>
        Number.isFinite(Number(sample.commitTime))).sort((a, b) =>
        finite(a.commitTime) - finite(b.commitTime));
    const sourceMarks = (marks || []).filter(mark =>
        Number.isFinite(Number(mark.at)) && finite(mark.at) >= from && finite(mark.at) < to)
        .sort((a, b) => finite(a.at) - finite(b.at) || finite(a.seq) - finite(b.seq));
    const ids = [...new Set(profiles.map(sample => String(sample.id || 'unknown')))];
    const boundaries = {};

    for (const id of ids) {
        const allBoundaryCommits = profiles.filter(sample => String(sample.id || 'unknown') === id);
        const commits = allBoundaryCommits.filter(sample =>
            finite(sample.commitTime) >= from && finite(sample.commitTime) < to);
        if (!commits.length) continue;
        const attachedMarkKeys = new Set();
        const rows = commits.map(commit => {
            const index = allBoundaryCommits.indexOf(commit);
            const previousCommitTime = index > 0 ? finite(allBoundaryCommits[index - 1].commitTime) : -Infinity;
            const attached = sourceMarks.filter(mark =>
                finite(mark.at) > previousCommitTime && finite(mark.at) <= finite(commit.commitTime));
            for (const mark of attached) attachedMarkKeys.add(`${mark.seq ?? ''}:${mark.at}:${mark.source}`);
            const sources = [...new Set([
                ...(commit.phase === 'mount' ? ['react:mount'] : []),
                ...attached.map(mark => String(mark.source || 'unknown'))
            ])];
            return {
                phase: commit.phase,
                startTime: finite(commit.startTime),
                commitTime: finite(commit.commitTime),
                actualDurationMs: finite(commit.actualDurationMs),
                sources,
                marks: attached.map(mark => ({...mark, ageMs: finite(commit.commitTime) - finite(mark.at)}))
            };
        });
        const sourceSummary = {};
        for (const row of rows) {
            for (const source of row.sources) {
                const bucket = sourceSummary[source] || (sourceSummary[source] = {
                    marks: 0, commits: 0, actualDurationMs: 0
                });
                bucket.commits++;
                bucket.actualDurationMs += row.actualDurationMs;
                bucket.marks += source === 'react:mount' ? 1 :
                    row.marks.filter(mark => String(mark.source || 'unknown') === source).length;
            }
        }
        const attributedCommits = rows.filter(row => row.sources.length).length;
        boundaries[id] = {
            commits: rows.length,
            attributedCommits,
            unattributedCommits: rows.length - attributedCommits,
            multiSourceCommits: rows.filter(row => row.sources.length > 1).length,
            sources: sourceSummary,
            commitRows: rows,
            uncommittedMarks: sourceMarks.filter(mark =>
                !attachedMarkKeys.has(`${mark.seq ?? ''}:${mark.at}:${mark.source}`))
        };
    }
    return {from, to, boundaries};
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
            scriptTransferBytes: phaseScripts.reduce((sum, resource) => sum + finite(resource.transferSize), 0),
            scriptEncodedBodyBytes: phaseScripts.reduce((sum, resource) => sum + finite(resource.encodedBodySize), 0),
            scriptDecodedBodyBytes: phaseScripts.reduce((sum, resource) => sum + finite(resource.decodedBodySize), 0)
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
