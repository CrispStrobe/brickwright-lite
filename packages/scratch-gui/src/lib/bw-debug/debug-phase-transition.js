/**
 * Advance the debugger phase notification state.
 *
 * A missing phase denotes a detached/absent session. Clearing the remembered
 * phase is important: a replacement runner may legitimately begin in the same
 * phase as the runner it replaced, and that is a new transition for observers.
 *
 * @param {?string} previous last phase announced by the current runner
 * @param {?string} phase phase in the newest runner snapshot
 * @param {boolean} sourceChanged whether this snapshot belongs to a new runner
 * @returns {{next: ?string, dispatch: boolean}} next memory and notification decision
 */
const advanceDebugPhase = (previous, phase, sourceChanged = false) => ({
    next: phase || null,
    dispatch: Boolean(phase) && (sourceChanged || phase !== previous)
});

export {advanceDebugPhase};
