// Wrap a bundled extension's readable source into the `makeExt("…")` form
// scratch-vm's adapter loads.
//
// WHY THE INDIRECTION EXISTS AT ALL
// ---------------------------------
// The CrispStrobe extensions arrived as TurboWarp-unsandboxed modules, which
// self-register against a `Scratch` global rather than exporting a class. The
// adapter (overlay/scratch-vm/src/extensions/crispstrobe/adapter.js) runs their
// text through `new Function` with that global supplied, so every bundle holds
// its extension as one long JSON string.
//
// That is fine for a vendored file nobody edits. It is not fine for one we
// maintain: a 7 000-line JSON string cannot be linted, diffed or reviewed. So
// the source lives beside the bundle as ordinary JavaScript and this script
// produces the bundle from it. test/spike-bundle-sync.test.mjs fails if the
// two ever drift, which is the only thing that makes the readable file the
// real one rather than a stale copy of it.
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

/** Extensions that are built from a readable source rather than vendored whole. */
export const BUILT_FROM_SOURCE = ['spikeprime'];

export const bundlePath = id =>
    resolve(root, `overlay/scratch-vm/src/extensions/crispstrobe/${id}/index.js`);
export const sourcePath = id =>
    resolve(root, `overlay/scratch-vm/src/extensions/crispstrobe/${id}/source.js`);

/** The exact bytes `index.js` must hold for a given source. */
export const renderBundle = function (source) {
    return `const makeExt = require('../adapter');\nmodule.exports = makeExt(${JSON.stringify(source)});\n`;
};

export const readSource = id => readFileSync(sourcePath(id), 'utf8');

if (import.meta.url === `file://${process.argv[1]}`) {
    for (const id of BUILT_FROM_SOURCE) {
        const bundle = renderBundle(readSource(id));
        writeFileSync(bundlePath(id), bundle);
        process.stderr.write(`${id}: wrote ${bundle.length} bytes\n`);
    }
}
