// The archived SPIKE drivers are visible only during hardware diagnosis.
// Existing project files still migrate to the unified extension on load.
const KEY = 'bw-spike-legacy-debug';
export const LEGACY_SPIKE_CHANGE_EVENT = 'bw-spike-legacy-change';

export const getLegacySpikeVisible = () => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
};

export const setLegacySpikeVisible = enabled => {
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent(LEGACY_SPIKE_CHANGE_EVENT));
};
