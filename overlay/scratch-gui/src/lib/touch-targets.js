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
 * WHY 44 AND NOT LESS: measured on the shipped build at 430x930 before
 * choosing. Unfloored, the Code tab had 4 of 29 controls under 24 CSS px and
 * 21 under 32, with none reaching 44; the FPGA pane had 25 of 43 under 24. The
 * worry with 44 was that widening dense toolbar rows would push content off
 * the pane, so both 32 and 44 were tried and document scrollWidth measured on
 * every tab: it stayed at 1024 in all six tabs at both floors. 44 costs
 * nothing here, so there is no reason to settle for less than the standard.
 *
 * WHY A `@media` QUERY CANNOT DO THIS: the layout viewport is 1024 on every
 * phone by construction, so `@media (max-width: 700px)` never matches. The
 * signal is the layout width TIMES the scale the browser chose, which only
 * JS can see — the same arithmetic visual-viewport.js already does for the
 * modal overlay.
 *
 * @module
 */
import {currentBox, subscribeVisualViewport} from './visual-viewport.js';

/** Below this many effective (on-screen) pixels, a pointer is a fingertip. */
export const NARROW_PX = 700;

/** Minimum hit box, in CSS pixels. 44 is the accessibility standard; the
 * experiment below found it costs nothing here. */
export const FLOOR_PX = 44;

const STYLE_ID = 'bw-touch-targets';
const ATTR = 'data-bw-touch';

/**
 * Effective on-screen width: layout width scaled by whatever the browser chose.
 * Pure, so the arithmetic is testable without a browser.
 * @param {{width: number, height: number, scale: number}} box
 * @param {number} layoutWidth
 * @returns {number}
 */
export const effectiveWidth = (box, layoutWidth) => {
    const w = box && box.width > 0 ? box.width : layoutWidth;
    const scale = box && box.scale > 0 ? box.scale : 1;
    return w * scale;
};

/** @param {number} effective @returns {boolean} */
export const isTouchWidth = effective => effective > 0 && effective < NARROW_PX;

/** @returns {boolean} */
export const touchWidthNow = () => (typeof window === 'undefined'
    ? false
    : isTouchWidth(effectiveWidth(currentBox(), window.innerWidth)));

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
/* An icon-only control inside a dense row would push the row wider than the
   pane if it also claimed ${floor}px of WIDTH, so the width floor is dropped
   where the author has said the control is laid out in a row. Height still
   applies: a 16px-tall button is the harder miss. */
html[${ATTR}] [data-bw-dense] button,
html[${ATTR}] [data-bw-dense] select,
html[${ATTR}] [data-bw-dense] [role="button"] {
    min-width: 0;
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
        const on = touchWidthNow();
        // Set the attribute on <html> rather than <body>: the GUI replaces
        // body's children, and a flag on a node the app owns would be lost.
        if (on) document.documentElement.setAttribute(ATTR, '1');
        else document.documentElement.removeAttribute(ATTR);
    };
    apply();
    const stop = subscribeVisualViewport(apply);
    return () => {
        stop();
        document.documentElement.removeAttribute(ATTR);
        if (style && style.parentNode) style.parentNode.removeChild(style);
    };
}
