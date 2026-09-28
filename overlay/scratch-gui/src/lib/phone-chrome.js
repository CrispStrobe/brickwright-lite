/**
 * Give a phone back some of its vertical space.
 *
 * MEASURED FIRST. The menu bar is 48px and the tab strip 44px, so 92px of
 * chrome sits above any content. In portrait that is 39pt of a 930pt screen
 * (4.2%) and does not matter. IN LANDSCAPE IT IS 84pt OF 430 — 19.4%, a fifth
 * of the screen gone before the reader sees anything. Shrinking the two rows to
 * 36 and 34 takes it to 70px: 64pt, 14.8%. Every tab stays clickable and no tab
 * falls below the 32px touch floor.
 *
 * WHY NOT ONE ROW, WHICH WOULD BE BETTER: the menu bar has 509px of free width
 * (its items end at x=481, the next sits at 996) and the tab strip is only
 * 250px wide, so the tabs would fit beside them. Moving them there with CSS was
 * tried and DOES reclaim the whole 44px — `panelTop` goes 92 -> 48 — but the
 * relocated tabs become unclickable: lifted out of their parent's box they are
 * clipped by an ancestor's `overflow: hidden`, which is not a stacking problem
 * (z-index 492 over the menu bar's 491 changes nothing) and cannot be fixed by
 * raising it, because that same overflow is what makes the panes scroll.
 * Verified with elementsFromPoint: the tab list does not appear in the hit
 * stack at all. Doing it properly means rendering the tab list inside the menu
 * bar row in JSX, which react-tabs makes awkward — TabList must be a child of
 * Tabs, so a portal breaks it. That is a bigger change than this one and is
 * left for its own lane.
 *
 * Keyed on the same `data-bw-touch` flag as the tap-target floor, for the same
 * reason: a width media query cannot fire when the layout viewport is 1024 on
 * every phone. See touch-targets.js.
 *
 * @module
 */

const STYLE_ID = 'bw-phone-chrome';
const ATTR = 'data-bw-touch';

/** Menu bar height on a touch screen, in CSS pixels. */
export const MENU_H = 36;
/** Tab strip height on a touch screen, in CSS pixels. */
export const TABS_H = 34;
/**
 * Tab height. Stays at or above the 32px touch floor deliberately — shrinking
 * the row must not shrink the thing you tap.
 */
export const TAB_H = 32;

/**
 * The rule text. Class names are matched by SUBSTRING because CSS Modules
 * rewrites them (`menu-bar_menu-bar_x2Jqi`), and the generated name keeps the
 * source name inside it. Exported so a test can assert what it touches.
 * @returns {string}
 */
export const chromeRule = () => `
html[${ATTR}] [class*="menu-bar_menu-bar"],
html[${ATTR}] [class*="gui_menu-bar-position"] {
    height: ${MENU_H}px;
    min-height: ${MENU_H}px;
}
html[${ATTR}] [class*="gui_tab-list"] {
    height: ${TABS_H}px;
    min-height: ${TABS_H}px;
}
html[${ATTR}] [class*="gui_tab"][role="tab"] {
    height: ${TAB_H}px;
    min-height: ${TAB_H}px;
    padding-top: 0;
    padding-bottom: 0;
}
`;

/**
 * Install the rule. Idempotent. The `html` flag itself is owned by
 * touch-targets.js — this only adds rules that read it, so the two cannot
 * disagree about whether a screen is a touch screen.
 * @returns {() => void} uninstall
 */
export function installPhoneChrome () {
    if (typeof document === 'undefined') return () => {};
    let style = document.getElementById(STYLE_ID);
    if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
    }
    style.textContent = chromeRule();
    return () => {
        if (style && style.parentNode) style.parentNode.removeChild(style);
    };
}
