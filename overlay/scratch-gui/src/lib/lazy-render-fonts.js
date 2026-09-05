/* eslint-env browser */
/**
 * scratch-render-fonts, loaded on demand.
 *
 * webpack resolves `scratch-render-fonts` to THIS file (see webpack.config.js),
 * so scratch-svg-renderer's font-inliner keeps its synchronous `getFonts()`
 * call while the seven base64 font faces — 1.34 MB raw, 0.64 MB compressed,
 * and incompressible because they are already base64 — leave the first load
 * for their own chunk.
 *
 * The synchronous contract is honoured by answering `{}` until the chunk has
 * arrived. The three places that would render text wrongly on `{}` each wait
 * instead, and only when the SVG in hand has a font-family (most have none):
 *   - scratch-render's SVGSkin.setSVG (patched by scripts/apply-render-overlay.mjs)
 *     defers the skin until `loadFonts()` resolves, so a costume with text is
 *     rasterised with its @font-face inlined, as before;
 *   - lib/get-costume-url.js (thumbnails) returns the plain SVG uncached until
 *     the fonts exist, then inlines and caches;
 *   - containers/costume-tab.jsx loads them when the costumes tab opens, so the
 *     paint editor's text tool has the faces in the document.
 * A project with no text never fetches them. `fontsLoaded` (font-loader-hoc.jsx)
 * therefore no longer waits for this chunk — it never needed the bytes, only
 * the ordering, and the ordering now lives at the three consumers.
 *
 * CommonJS on purpose: font-inliner does `require('scratch-render-fonts')()`,
 * and an ES module would hand it a namespace object instead of the function.
 */
let FONTS = null;
let pending = null;

/**
 * Fetch the font chunk and inject the @font-face rules into the document.
 * Idempotent; concurrent callers share one load.
 * @returns {Promise<object>} font family -> @font-face CSS text
 */
const loadFonts = () => {
    if (FONTS) return Promise.resolve(FONTS);
    if (!pending) {
        pending = import(/* webpackChunkName: "render-fonts" */ 'scratch-render-fonts-base64')
            .then(mod => {
                const getFonts = (mod && mod.default) || mod;
                FONTS = getFonts();
                return FONTS;
            });
        pending.catch(() => {
            // Let a later caller try again rather than caching the failure forever.
            pending = null;
        });
    }
    return pending;
};

/**
 * The synchronous API scratch-svg-renderer expects. NO side effect: font-inliner
 * calls this for EVERY SVG it serialises, before it has looked for a font-family,
 * so kicking off the fetch here would pull the chunk in for the default sprite
 * at first paint — which is exactly what happened in the first version of this
 * file. The consumers that know they have text call loadFonts() themselves.
 * @returns {object} the loaded fonts, or an empty map if they have not been asked for yet
 */
const getFonts = () => FONTS || {};

getFonts.loadFonts = loadFonts;
/** @returns {boolean} whether the faces have arrived (getFonts() is then complete) */
getFonts.isLoaded = () => Boolean(FONTS);
/**
 * Does this SVG reference a font family at all? Same test scratch-gui's
 * get-costume-url uses; `font-family="none"` is what the paint editor writes
 * for shapes and does not count.
 * @param {string} svgString - SVG source
 * @returns {boolean} true if rasterising it correctly needs the faces
 */
getFonts.needsFonts = svgString => /font-family=(?!"none")/.test(String(svgString));
module.exports = getFonts;
