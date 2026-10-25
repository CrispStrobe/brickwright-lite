/** Record one React Profiler commit in the opt-in production benchmark probe. */
const recordReactProfile = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    const probe = typeof window !== 'undefined' ? window.__BW_I8086_PERF__ : null;
    if (!probe) return;
    const profiles = probe.reactProfiles || (probe.reactProfiles = []);
    if (profiles.length >= (probe.profileLimit || 2000)) return;
    profiles.push({
        id,
        phase,
        actualDurationMs: actualDuration,
        baseDurationMs: baseDuration,
        startTime,
        commitTime
    });
};

/** Record why React was asked to update, only while the benchmark probe exists. */
const recordReactUpdateSource = (source, detail) => {
    const probe = typeof window !== 'undefined' ? window.__BW_I8086_PERF__ : null;
    if (!probe) return;
    const sources = probe.reactUpdateSources || (probe.reactUpdateSources = []);
    if (sources.length >= (probe.sourceLimit || 4000)) return;
    sources.push({
        seq: sources.length + 1,
        source,
        at: performance.now(),
        ...(detail === undefined ? {} : {detail})
    });
};

/**
 * Wrap a subtree only while the production performance probe is installed.
 * The normal application keeps the original child and element hierarchy.
 *
 * @param {object} React active React module
 * @param {string} id stable profiler boundary name
 * @param {object} child subtree root
 * @returns {object} original child or opt-in Profiler element
 */
const profileReactSubtree = (React, id, child) => {
    const enabled = typeof window !== 'undefined' && window.__BW_I8086_PERF__;
    if (!enabled || !React.Profiler) return child;
    return React.createElement(React.Profiler, {id, onRender: recordReactProfile}, child);
};

// Stable identities keep an opt-in probe from changing hook dependencies. The
// object is exposed only when the benchmark installed its global before boot;
// ordinary production renders allocate no probe object and record no marks.
let reactPerformanceProbe = null;
const getReactPerformanceProbe = () => {
    if (typeof window === 'undefined' || !window.__BW_I8086_PERF__) return null;
    if (!reactPerformanceProbe) reactPerformanceProbe = Object.freeze({
        mark: recordReactUpdateSource,
        profile: profileReactSubtree
    });
    return reactPerformanceProbe;
};

export {
    getReactPerformanceProbe,
    profileReactSubtree,
    recordReactProfile,
    recordReactUpdateSource
};
