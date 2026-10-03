/** Compare boot latency after media delivery, not unequal network transfers. */
export function compareLinuxBootTimings(snapshot, cold) {
    const elapsed = (sample, name) => {
        const {fetchedSeconds, promptSeconds} = sample || {};
        if (!Number.isFinite(fetchedSeconds) || !Number.isFinite(promptSeconds) ||
            fetchedSeconds < 0 || promptSeconds <= fetchedSeconds) {
            throw new Error(`${name}: invalid media-ready-to-prompt timing`);
        }
        return promptSeconds - fetchedSeconds;
    };
    const snapshotSeconds = elapsed(snapshot, 'snapshot');
    const coldSeconds = elapsed(cold, 'cold');
    return {
        basis: 'media-ready-to-prompt', snapshotSeconds, coldSeconds,
        thresholdRatio: 0.5, ratio: snapshotSeconds / coldSeconds,
        passes: snapshotSeconds < coldSeconds / 2
    };
}
