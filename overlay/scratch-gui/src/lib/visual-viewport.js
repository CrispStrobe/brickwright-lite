/**
 * Where the screen actually is, when the page is wider than the screen.
 *
 * `position: fixed` is fixed to the LAYOUT viewport, not to what the reader can
 * see. Normally those are the same box and none of this matters. They are not
 * the same box here: `playground/index.css` floors the page at 1024px wide —
 * upstream's minimum, load-bearing for the editor chrome — so on a 430pt phone
 * the layout viewport is 1024 while the VISUAL viewport stays 430. A modal
 * centred with `inset: 0` therefore centres at x=512, and its buttons sit off
 * the side of the screen until the reader pans to them.
 *
 * Measured on the shipping build at a 430pt viewport: layout 1024x2225, visual
 * 430x930. That is why the Machine Manager's import button could not be
 * reached on iOS, and why Playwright could not click it either — you cannot
 * scroll a fixed element into a visual viewport.
 *
 * The fix is not to remove the floor. That was tried and it made things worse:
 * the circuit designer collapses below it and the Circuit tab became
 * unreachable, which is what the "floor holds, scroll appears below it"
 * browser gate exists to prevent. The fix is for overlays to ask where the
 * screen is.
 *
 * @module
 */

/**
 * The visible box, in layout-viewport coordinates, from a VisualViewport-like
 * object. Pure, so a test can hand it any shape without a browser.
 *
 * @param {{offsetLeft: number, offsetTop: number, width: number, height: number}|null} vv
 * @param {{innerWidth: number, innerHeight: number}} [fallback] used when there is no
 *   VisualViewport (older engines); then the layout viewport IS the answer.
 * @returns {{left: number, top: number, width: number, height: number}}
 */
export function boxFrom (vv, fallback = {innerWidth: 0, innerHeight: 0}) {
    if (!vv || typeof vv.width !== 'number' || typeof vv.height !== 'number') {
        return {left: 0, top: 0, width: fallback.innerWidth || 0, height: fallback.innerHeight || 0};
    }
    return {
        left: vv.offsetLeft || 0,
        top: vv.offsetTop || 0,
        width: vv.width,
        height: vv.height
    };
}

/**
 * Is the visible box meaningfully narrower than the page? Only then is any of
 * this worth doing — on a desktop the two agree and the overlay should keep
 * its ordinary `inset: 0` behaviour.
 *
 * @param {{width: number}} box
 * @param {number} layoutWidth
 * @returns {boolean}
 */
export const isPanned = (box, layoutWidth) =>
    box.width > 0 && layoutWidth > 0 && layoutWidth - box.width > 8;

/** The style an overlay should carry to cover the VISIBLE screen. Pure. */
export const overlayStyleFor = (box, layoutWidth) => (isPanned(box, layoutWidth)
    ? {position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height}
    : {position: 'fixed', inset: 0});

/** Read the current box from the global, if there is one. */
export const currentBox = () => boxFrom(
    typeof window === 'undefined' ? null : window.visualViewport,
    typeof window === 'undefined' ? undefined : window);

/**
 * Call `onChange` whenever the visible box moves or resizes. Returns an
 * unsubscribe. A no-op where there is no VisualViewport.
 */
export function subscribeVisualViewport (onChange) {
    if (typeof window === 'undefined' || !window.visualViewport) return () => {};
    const vv = window.visualViewport;
    const fire = () => onChange(boxFrom(vv, window));
    vv.addEventListener('resize', fire);
    vv.addEventListener('scroll', fire);
    window.addEventListener('orientationchange', fire);
    return () => {
        vv.removeEventListener('resize', fire);
        vv.removeEventListener('scroll', fire);
        window.removeEventListener('orientationchange', fire);
    };
}
