// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// A failed live collection must not become a stale successful save after the
// pane unmounts or the page reloads. The notice is not project content.
const KEY = 'bw-sim-lab-unsaved-v1';
let pending = null;
export const simLabSaveFailure = () => {
    if (pending) return pending;
    try {
        const stored = localStorage.getItem(KEY);
        return typeof stored === 'string' && stored ? stored.slice(0, 512) : null;
    } catch { return pending; }
};
export const refuseSimLabSave = message => {
    pending = String(message).slice(0, 512);
    try { localStorage.setItem(KEY, pending); } catch { return pending; }
    return pending;
};
export const clearSimLabSaveFailure = () => {
    pending = null;
    try { localStorage.removeItem(KEY); } catch { return false; }
    return true;
};
