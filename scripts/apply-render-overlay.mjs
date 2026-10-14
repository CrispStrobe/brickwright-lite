// Lay Brickwright's one scratch-render change over node_modules/scratch-render
// after `npm install`, before `npm run build`. Same shape as
// apply-vm-overlay.mjs's string patches, same reasons: webpack builds
// scratch-render from src, the package is pinned, and a file: link would make
// npm skip its dependencies.
//
// THE CHANGE. The seven render fonts are a lazy chunk in lite (webpack aliases
// `scratch-render-fonts` to overlay/scratch-gui/src/lib/lazy-render-fonts.js;
// ROADMAP §2.4). SVGSkin.setSVG rasterises an SVG with its @font-face rules
// inlined, and with the fonts not yet fetched it would inline nothing and draw
// text in a fallback face. So a skin whose SVG references a font-family waits
// for the chunk first; every other SVG — the default sprite, every circuit
// symbol, most costumes — proceeds untouched and never fetches it.
//
// Idempotent. Exits 1 if an anchor is missing, because a build without this
// patch silently degrades text costumes — scripts/verify-boot-payload.mjs also
// asserts the patch's marker is in the built bundle.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const skinPath = path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'scratch-render', 'src', 'SVGSkin.js');
if (!existsSync(skinPath)) {
    console.error(`node_modules/scratch-render missing at ${skinPath} — run npm install first.`);
    process.exit(1);
}
let src = readFileSync(skinPath, 'utf8');

const requireAnchor = `const {loadSvgString, serializeSvgToString} = require('scratch-svg-renderer');\n`;
const requirePatch = requireAnchor +
`// Brickwright: the lazy render-fonts shim (see apply-render-overlay.mjs).
const getRenderFonts = require('scratch-render-fonts');
`;
const setSvgAnchor = `    setSVG (svgData, rotationCenter) {
        const svgTag = loadSvgString(svgData);`;
const setSvgPatch = `    setSVG (svgData, rotationCenter) {
        // Brickwright: the render fonts are a lazy chunk. An SVG that references
        // a font-family needs them INLINED into its data URI, so wait for them;
        // a later setSVG supersedes a pending one, and a chunk that never
        // arrives falls back to the browser's faces rather than to no costume.
        // The unpatched module (no loadFonts) is the eager upstream one, and
        // then there is nothing to wait for.
        if (typeof getRenderFonts.loadFonts === 'function' && !getRenderFonts.isLoaded() &&
            !this._bwFontsUnavailable && getRenderFonts.needsFonts(svgData)) {
            const token = this._bwFontWait = {};
            getRenderFonts.loadFonts().then(() => true, () => false).then(ok => {
                if (this._bwFontWait !== token) return;
                if (!ok) this._bwFontsUnavailable = true;
                this.setSVG(svgData, rotationCenter);
            });
            return;
        }
        this._bwFontWait = null;
        const svgTag = loadSvgString(svgData);`;

let changed = false;
if (src.includes('const getRenderFonts = require')) {
    console.log('  SVGSkin.js render-fonts require already applied');
} else if (src.includes(requireAnchor)) {
    src = src.replace(requireAnchor, requirePatch);
    changed = true;
} else {
    console.error('  ! SVGSkin.js require anchor not found');
    process.exit(1);
}
if (src.includes('this._bwFontWait = null;')) {
    console.log('  SVGSkin.js setSVG font wait already applied');
} else if (src.includes(setSvgAnchor)) {
    src = src.replace(setSvgAnchor, setSvgPatch);
    changed = true;
} else {
    console.error('  ! SVGSkin.js setSVG anchor not found');
    process.exit(1);
}
if (changed) {
    writeFileSync(skinPath, src);
    console.log('  patched scratch-render/src/SVGSkin.js (text costumes wait for the lazy render fonts)');
}
