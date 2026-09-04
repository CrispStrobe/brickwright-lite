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
