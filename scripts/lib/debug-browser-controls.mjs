/**
 * Pause through the real control unless execution reached a paused boundary first.
 *
 * This runs inside the browser through Locator.evaluate(), so reading the phase
 * and dispatching the click are one event-loop action. The emulated program
 * cannot pause between those two operations and disable the button underneath
 * Playwright's actionability wait.
 *
 * @param {HTMLButtonElement} button the visible debugger Pause control
 * @returns {'already-paused'|'clicked'} which observable path completed
 */
export const clickPauseUnlessPaused = button => {
    const panel = button.closest('[data-debug-panel]');
    if (!panel) throw new Error('Pause control is outside the debugger panel');
    if (panel.getAttribute('data-debug-phase') === 'paused') return 'already-paused';
    if (button.disabled) throw new Error(
        `Pause control is disabled while debugger phase is ${panel.getAttribute('data-debug-phase') || 'unknown'}`
    );
    button.click();
    return 'clicked';
};
