/**
 * Decide whether runner state has a visible consumer inside CircuitDesigner.
 *
 * The full DebugPanel has its own state. When it is docked right/off, changing
 * CircuitTab state merely re-renders the large designer tree; only board or
 * halt semantics are visible there. The top/solo docks additionally expose
 * the designer's DebugStatus, whose task clock needs periodic progress.
 */
export function shouldRefreshDesignerDebugState({
    dock,
    boardChanged = false,
    haltedChanged = false,
    haltReasonChanged = false,
    tasksChanged = false,
    serialChanged = false,
    msMoved = false,
    capabilitiesChanged = false,
    floorDue = false
}) {
    if (boardChanged || haltedChanged || haltReasonChanged) return true;
    const statusVisible = dock === 'top' || dock === 'solo';
    return statusVisible && (tasksChanged || serialChanged || msMoved || capabilitiesChanged || floorDue);
}
