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
 * arrived: an SVG whose text needs a face it cannot find is rendered without
 * the @font-face and measures wrong. That is the failure the GUI already
 * guards against, which is why the guard is kept rather than replaced:
 * `font-loader-hoc.jsx` calls `loadFonts()` on mount and only dispatches
 * `fontsLoaded` once the faces are in the document, and `vm-manager-hoc.jsx`
 * does not load a project until `fontsLoaded` is true. So no costume is
 * rendered before its fonts exist — the same ordering as before, minus the
 * bytes in the boot chunk.
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
 * The synchronous API scratch-svg-renderer expects.
 * @returns {object} the loaded fonts, or an empty map if they are still in flight
 */
const getFonts = () => {
    if (FONTS) return FONTS;
    loadFonts();
    return {};
};

getFonts.loadFonts = loadFonts;
module.exports = getFonts;
