/**
 * Reaching the learner's LIVE circuit from another tab.
 *
 * The board only exists once the Circuit tab's designer has mounted and
 * published `window.__circuit` (circuit-tab.jsx's onCircuitReady). A learner who
 * went straight to the FPGA tab has never opened Circuit, so that handle is
 * absent and anything that needs the board has nothing to work with.
 *
 * Rather than reach across tabs to force a hidden designer to mount — fragile,
 * because the designer omits itself under the default debugger dock when
 * another tab is visible — we ASK the app to show the Circuit tab, which is the
 * one reliable path that mounts the designer and runs onCircuitReady, then wait
 * for the handle to appear. gui.jsx owns the tab list and listens for
 * `bw-activate-tab`; we only know the index.
 *
 * fpga-tab.jsx has its own copy of this walk, woven into the messaging for its
 * ⚙/⚛/demo-board buttons. This module is the same walk with the messaging
 * lifted out, so the challenge panel's "Check my board" can use it without
 * dragging that UI along.
 *
 * @module
 */

/** The Circuit tab's index in gui.jsx's tab list. */
export const CIRCUIT_TAB_INDEX = 4;

/** How long to wait for the designer to mount and publish the handle. */
const DEFAULT_TIMEOUT_MS = 8000;
const POLL_MS = 150;

/**
 * The live Circuit right now, or null. `addPart` is the tell that this is a
 * real designer-published circuit and not a half-initialised stand-in.
 */
export function liveCircuit () {
    if (typeof window === 'undefined') return null;
    const c = window.__circuit || window.__bwCircuit;
    return c && typeof c.addPart === 'function' ? c : null;
}

/**
 * Run `fn(circuit)` against the live circuit, showing the Circuit tab first if
 * the handle is not there yet.
 *
 * @param {function(object): void} fn
 * @param {{onWaiting?: function(): void, onProblem?: function(string): void,
 *          timeoutMs?: number}} [opts]
 *   onWaiting — called if we have to go and mount the designer (it is not
 *   instant, so the caller can say so).
 *   onProblem — called with a learner-facing message if the handle never comes.
 * @returns {boolean} true if `fn` ran synchronously (the circuit was already up)
 */
export function withLiveCircuit (fn, {onWaiting, onProblem, timeoutMs = DEFAULT_TIMEOUT_MS} = {}) {
    const now = liveCircuit();
    if (now) { fn(now); return true; }
    if (typeof window === 'undefined') {
        if (onProblem) onProblem('There is no circuit to check here.');
        return false;
    }
    if (onWaiting) onWaiting();
    window.dispatchEvent(new CustomEvent('bw-activate-tab', {detail: {index: CIRCUIT_TAB_INDEX}}));
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
        const c = liveCircuit();
        if (c) { fn(c); return; }
        if (Date.now() > deadline) {
            if (onProblem) onProblem('Open the 🔌 Circuit tab once so the circuit exists, then check again.');
            return;
        }
        setTimeout(tick, POLL_MS);
    };
    setTimeout(tick, POLL_MS);
    return false;
}
