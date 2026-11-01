// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Presentation model of the FPGA tab: what the status area says and which steps
// are done, plus the shared style tokens. Pure and dependency-free so the tab's
// render test can run the REAL derivation instead of a copy of it.

/** The status the tab reports, derived only from its own state. */
export const deriveView = ({T, building, selection, localBusy, local, hdlScreen, refusals, warnings,
    synth, hdl, clockCycles}) => {
    const label = selection && selection.accepted ? selection.selected.label : '';
    const busyText = building
        ? `${T.buildingOn}${label}${T.mayTakeAMinute}`
        : (localBusy ? (local && local.code === 'not-downloaded' ? T.downloading : T.workingInBrowser) : null);
    const localFailed = Boolean(local && local.ok === false && local.code !== 'not-downloaded');
    // Blockers stop the build. A pin that cannot reach the breadboard does not (a
    // clock is not meant to), so those are notes, not an alarm over every step.
    const hasBlockers = hdlScreen.refusals.length > 0 || localFailed || Boolean(synth && !synth.ok);
    const headsUp = [
        ...hdlScreen.warnings.map(w => ({key: 'l', who: null, reason: w.reason})),
        ...warnings.map(w => ({key: 'p', who: w.port, reason: w.reason}))
    ];
    const stepDone = {
        design: Boolean(hdl.trim()),
        build: Boolean(synth && synth.ok),
        simulate: clockCycles > 0
    };
    const notesCount = headsUp.length + refusals.length;
    return {busyText, hasBlockers, localFailed, headsUp, notesCount, stepDone};
};

/** One set of tokens, so every step looks like the same tool. */
export const viewStyles = tools => ({
    secondary: {...tools.button, border: '1px solid #94a3b8', background: '#fff'},
    card: {border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff',
        padding: '0.6rem 0.75rem', marginBottom: '0.6rem', maxWidth: '64rem', boxSizing: 'border-box'},
    row: {display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap'},
    hint: {fontSize: 12, color: '#475569', margin: '0.25rem 0 0'},
    stepTitle: {fontSize: 15, margin: '0 0 0.15rem'},
    next: {...tools.primary, marginLeft: 'auto'},
    stepBadge: done => ({display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 9, fontSize: 11, fontWeight: 700, flex: '0 0 auto',
        background: done ? '#16a34a' : '#e2e8f0', color: done ? '#fff' : '#334155'})
});
