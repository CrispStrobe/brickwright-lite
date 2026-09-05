/**
 * Whether CircuitTab needs the broad board/designer graph for this render.
 *
 * The right and solo Code-tab layouts paint DebugPanel directly into the stage
 * host. Loading CircuitDesigner there cannot affect the pixels the user sees;
 * it only turns a debugger-only cold start into a board/catalog/solver fetch.
 * The dedicated Circuit tab and the Code-tab top/off layouts still paint the
 * designer and must retain their eager-on-visibility behavior.
 */
export const shouldLoadCircuitDesigner = ({
    explicit = false,
    isVisible = false,
    portalOn = false,
    debugDock = 'right'
} = {}) => explicit || isVisible || (portalOn && debugDock !== 'right' && debugDock !== 'solo');

export default shouldLoadCircuitDesigner;
