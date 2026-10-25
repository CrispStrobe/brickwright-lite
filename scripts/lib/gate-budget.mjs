/**
 * A browser gate's time comes from the STEP that runs it, not from a literal.
 *
 * 2026-09-07: verify-i8086-export typed its program with `fill(text, {timeout: 8000})`,
 * a number written on a quiet runner. Twice that night, with the fleet eight deep, the
 * lazy CodeMirror chunk had not mounted 8 s after the tab opened and the gate went red
 * on main — while every other gate in the same job stayed green. The step's own budget
 * was 3 minutes.
 *
 * build.yml sets BW_STEP_BUDGET_MIN on the step's run line beside its timeout-minutes;
 * test/browser-gate-timeouts.test.mjs asserts the two agree. A gate asks for a share of
 * that budget; without the variable (a local run) it falls back to the generous default
 * it names, never to the old literal.
 */
export const stepBudgetMs = () => {
    const m = Number(process.env.BW_STEP_BUDGET_MIN);
    return Number.isFinite(m) && m > 0 ? m * 60_000 : null;
};

/** `fraction` of the step's budget, or `fallbackMs` when no step budget is set. */
export const shareOfBudget = (fraction, fallbackMs) => {
    const b = stepBudgetMs();
    return b ? Math.round(b * fraction) : fallbackMs;
};
