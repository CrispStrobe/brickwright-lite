// Derive the unified spikeprime block surface for sb3-creator's runtime registry.
//
// WHY THIS IS HERE AND NOT UPSTREAM
// ---------------------------------
// sb3-creator generates `runtimeRegistry.generated.js` from the extension
// sources it knows about, and Lite vendors the result as
// overlay/scratch-gui/src/lib/sb3-creator-runtime.js. That file is judged
// byte-for-byte against the pin by test/sb3-creator-vendor-identity.test.mjs,
// so it cannot be edited here — and it describes the five SPIKE extensions as
// they were before the merge.
//
// Left alone, that is a real regression rather than a cosmetic staleness:
// SB3Creator.runtimeOp() returns null for an opcode it has no entry for, so
// every block that the migration moves onto a new unified opcode would stop
// round-tripping through the Code tab.
//
// So the entry is derived here, from the extension that actually ships, and
// merged over the vendored one at the single door that hands out the class
// (sb3-creator-register-art.js). The vendored file stays untouched and the
// pin gate stays honest; when sb3-creator regenerates its registry against
// the unified extension, this merge becomes a no-op and can go.
import {writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadExtension} from './load-extension.mjs';
import {readSource} from './build-bundle.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

globalThis.window = globalThis;
Object.defineProperty(globalThis, 'navigator',
    {value: {language: 'en-US', userAgent: 'node'}, configurable: true, writable: true});
globalThis.document = {
    documentElement: {lang: 'en'},
    createElement: () => ({style: {}, appendChild () {}, click () {}, setAttribute () {}}),
    body: {appendChild () {}, removeChild () {}}
};
globalThis.localStorage = {getItem: () => null, setItem: () => {}};
globalThis.addEventListener = () => {};
globalThis.alert = () => {};
globalThis.setInterval = () => 0;

/** sb3-creator's three block kinds, from the extension's blockType. */
const KIND = {command: 'command', reporter: 'reporter', Boolean: 'boolean', hat: 'hat'};

export const buildOps = function (info) {
    const ops = {};
    for (const block of info.blocks || []) {
        if (!block || typeof block !== 'object' || !block.opcode) continue;
        if (block.blockType === 'label') continue;
        const kind = KIND[block.blockType];
        if (!kind) continue;
        ops[block.opcode] = {
            kind,
            method: block.func || block.opcode,
            // Argument ORDER matters: the emitter reads them positionally, so
            // it must match the order they appear in the block's text.
            args: Object.keys(block.arguments || {})
        };
    }
    return ops;
};

export const buildEntry = function () {
    const restore = (() => {
        const noop = () => {};
        const saved = {log: console.log, info: console.info, warn: console.warn, debug: console.debug};
        Object.assign(console, {log: noop, info: noop, warn: noop, debug: noop});
        return () => Object.assign(console, saved);
    })();
    let info;
    try {
        info = loadExtension(readSource('spikeprime')).getInfo();
    } finally {
        restore();
    }
    return {runtime: 'spikeprime', ops: buildOps(info)};
};

if (import.meta.url === `file://${process.argv[1]}`) {
    const entry = buildEntry();
    const dest = resolve(root, 'overlay/scratch-gui/src/lib/spike-runtime-ops.json');
    writeFileSync(dest, `${JSON.stringify(entry, null, 4)}\n`);
    process.stderr.write(`wrote ${Object.keys(entry.ops).length} ops to ${dest}\n`);
}
