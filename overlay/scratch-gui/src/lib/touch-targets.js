/**
 * Floor the tap size of controls on a small screen.
 *
 * WHY THIS IS A RULE AND NOT 40 INLINE EDITS: the panes concerned style every
 * button and select inline, with no shared style object and no className. But
 * NONE of them sets min-height or min-width, so a stylesheet rule that sets
 * only those two properties wins uncontested — no inline style to fight, no
 * padding or font-size touched, and nothing to keep in sync as those panes
 * change.
 *
 * WHY THE FLOOR IS IN CSS PIXELS: the app declares a 1024px layout, so on a
 * 430pt phone the browser renders it at scale ~0.42. A control 44 CSS px tall
 * therefore SHOWS as 18.5pt, and reaching 44pt ON SCREEN would need 105 CSS
 * px — which is not a button, it is a banner. So a 44pt on-screen target is
 * not a goal this code can meet, and claiming it would be a lie. The reachable
 * goal is that a control be comfortable once the reader has pinched in (the
 * viewport meta allows up to 5x), which is what a CSS-pixel floor gives.
 *
 * WHY 32 AND NOT THE STANDARD 44: because 44 was measured and it breaks
 * something. Unfloored, the Code tab had 4 of 29 controls under 24 CSS px and
 * 21 under 32, with none reaching 44; the FPGA pane had 25 of 43 under 24. So a
 * floor is wanted. But a min-width can also push a control UNDER a neighbour,
 * which costs no page width and leaves it impossible to tap — worse than the
 * small target it replaced.
 *
 * Both candidates were A/B'd on all six tabs, switching this rule off and on in
 * one live page and counting controls whose own centre is covered by something
 * else:
 *
 *   floor 32 — covered counts unchanged on every tab (0/0, 1/1, 1/1, 6/6,
 *              17/17, 0/0). Nothing new is hidden.
 *   floor 44 — the Circuit tab goes 17 -> 18: a control labelled "Analog"
 *              ends up under an svg and cannot be tapped at its centre.
 *
 * An unreachable 44px control is a worse outcome than a reachable 32px one, so
 * the floor is 32. It still clears the 24px hard limit for every control on
 * every tab, which is what scripts/verify-tap-targets.mjs asserts.
 *
 * Note that an earlier version of this comment claimed "44 costs nothing here"
 * on the strength of document scrollWidth staying at 1024. That measurement was
 * true and the conclusion drawn from it was too narrow: width is not the only
 * cost, and the overlap A/B is what found the one that mattered.
 *
 * WHY THE SIGNAL IS `(pointer: coarse)` AND NOT A WIDTH: because the question
 * is "is this a fingertip", and width answers a different one. Measured:
 *
 *   phone portrait    coarse  effective 430
 *   phone LANDSCAPE   coarse  effective 930
 *   tablet            coarse  effective 834
 *   desktop           fine    effective 1440
 *   desktop, narrow    fine    effective 600
 *
 * A width threshold of 700 gets two of those wrong. It misses a phone in
 * LANDSCAPE, whose controls are still touched with a finger and still render at
 * ~18pt; and it would floor a narrow desktop WINDOW, where the pointer is a
 * mouse and needs no help. So the floor keys on the pointer.
 *
 * Note this is the opposite conclusion from the LAYOUT question next door: side
 * panels collapse on a NARROW screen (a width question, answered by layout width
 * x scale, because a 190px rail costs the same fraction of the screen whatever
 * is pointing at it). Two questions, two signals; conflating them was the first
 * version of this file.
 *
 * A plain `@media (pointer: coarse)` rule in a stylesheet would in fact work
 * here — unlike a width query, which cannot, since the layout viewport is 1024
 * on every phone by construction. It stays in JS only because this app's CSS
 * lives in the vendored upstream tree and adopting a file of it for one rule
 * costs more than it saves.
 *
 * @module
 */
import {subscribeVisualViewport} from './visual-viewport.js';

/** The media query that decides. Exported so a test can assert which one. */
export const COARSE_QUERY = '(pointer: coarse)';

/** Minimum hit box, in CSS pixels. Not 44 — see WHY 32 below. */
export const FLOOR_PX = 32;

const STYLE_ID = 'bw-touch-targets';
const ATTR = 'data-bw-touch';

/**
 * Does this reader point with a finger? Pure in its input so a test can pass a
 * stand-in for `matchMedia` rather than needing a browser.
 * @param {(q: string) => {matches: boolean}} [match]
 * @returns {boolean}
 */
export const wantsTouchTargets = match => {
    const mm = match || (typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia.bind(window)
        : null);
    if (!mm) return false;
    try {
        return !!mm(COARSE_QUERY).matches;
    } catch {
        // A browser too old for this query is also too old to be a phone we
        // ship to; treat it as a mouse rather than restyling every control.
        return false;
    }
};

/**
 * The rule text. Exported so a test can assert what it targets without a
 * browser — in particular that it sets ONLY min-height/min-width, the two
 * properties the panes leave unset.
 * @param {number} floor
 * @returns {string}
 */
export const ruleFor = floor => `
html[${ATTR}] button,
html[${ATTR}] select,
html[${ATTR}] [role="button"],
html[${ATTR}] [role="tab"],
html[${ATTR}] input[type="checkbox"],
html[${ATTR}] input[type="radio"] {
    min-height: ${floor}px;
    min-width: ${floor}px;
}
`;

/**
 * Install the rule and keep the `html` flag in step with the viewport.
 * Idempotent: calling it twice installs one stylesheet and one subscription.
 * @param {{floor?: number}} [opts]
 * @returns {() => void} uninstall
 */
export function installTouchTargets (opts = {}) {
    if (typeof document === 'undefined') return () => {};
    const floor = typeof opts.floor === 'number' ? opts.floor : FLOOR_PX;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = ruleFor(floor);

    const apply = () => {
        const on = wantsTouchTargets();
        // Set the attribute on <html> rather than <body>: the GUI replaces
        // body's children, and a flag on a node the app owns would be lost.
        if (on) document.documentElement.setAttribute(ATTR, '1');
        else document.documentElement.removeAttribute(ATTR);
    };
    apply();
    // The pointer can change under us — a tablet gaining a trackpad, a desktop
    // browser's device emulation being toggled — so listen to the query itself
    // rather than reading it once at boot.
    const mq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia(COARSE_QUERY)
        : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', apply);
    const stop = subscribeVisualViewport(apply);
    return () => {
        if (mq && mq.removeEventListener) mq.removeEventListener('change', apply);
        stop();
        document.documentElement.removeAttribute(ATTR);
        if (style && style.parentNode) style.parentNode.removeChild(style);
    };
}
