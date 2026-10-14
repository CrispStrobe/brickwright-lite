// Whether the user has switched on the FPGA / HDL tab.
//
// The tab ships HIDDEN even in a build that carries its code (BW_ENABLE_FPGA=1):
// it is an advanced surface most users never want, so it is opt-in per browser
// rather than present for everyone. This is the RUNTIME half. The BUILD half —
// whether the code is bundled at all — stays `process.env.BW_ENABLE_FPGA`, a
// DefinePlugin substitution, so a build that does not want the surface drops it
// entirely and this preference has nothing to reveal. Visibility is
// `built && enabled`; see gui.jsx.
export const FPGA_ENABLED_KEY = 'bw-fpga-enabled';
export const FPGA_TOGGLE_EVENT = 'bw-fpga-toggle';

let sessionValue;

/** Has the user turned the FPGA tab on? Defaults OFF. */
export function getFpgaEnabled () {
    if (typeof sessionValue === 'boolean') return sessionValue;
    try { return globalThis.localStorage?.getItem(FPGA_ENABLED_KEY) === '1'; }
    catch { return false; }
}

/**
 * Turn the FPGA tab on or off. Persists to localStorage where it can, mirrors to
 * a session value where it cannot (a private window), and NOTIFIES the app so the
 * tab appears or disappears without a reload — the settings menu and the tab list
 * are different components, so a window event is how they agree.
 * @returns {boolean} whether the choice was persisted to storage
 */
export function setFpgaEnabled (enabled) {
    const on = Boolean(enabled);
    sessionValue = on;
    let persisted = false;
    try {
        if (globalThis.localStorage) {
            globalThis.localStorage.setItem(FPGA_ENABLED_KEY, on ? '1' : '0');
            persisted = true;
        }
    } catch { persisted = false; }
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(FPGA_TOGGLE_EVENT, {detail: {enabled: on}}));
        }
    } catch { /* no window (SSR/test) — the caller still gets the return */ }
    return persisted;
}
