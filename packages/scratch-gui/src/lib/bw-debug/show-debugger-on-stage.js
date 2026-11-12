// SPDX-License-Identifier: BSD-3-Clause
// Make the Debug pane visible beside the Code tab before a caller hands it
// an image to run. The Circuit tab renders the debugger outside its own tab
// only through the stage portal ('right' or 'solo'), and that portal exists
// only while the circuit is shown on the stage. A dock of 'top' (or a
// device dock) keeps the panel inside the Circuit tab, where a caller on
// the Code tab never sees it and the queued image is never picked up.
export const showDebuggerOnStage = ({storage, dispatch}) => {
    let dock = null;
    try { dock = storage.getItem('bw-debug-dock'); } catch { /* private mode */ }
    const next = dock === 'solo' ? 'solo' : 'right';
    const set = (key, value) => {
        try { storage.setItem(key, value); } catch { /* private mode */ }
        dispatch(key, value);
    };
    set('bw-right-pane-hidden', '0');
    set('bw-stage-circuit', '1');
    set('bw-debug-dock', next);
    return next;
};
