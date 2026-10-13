// Extract the complete buffer algorithms from the pinned PXT core simulator.
// Formatting changes only; no hand-maintained numeric/byte-order substitute.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const source = readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/sim/pxtsim.js'), 'utf8');
const startMarker = 'class c extends e.RefObject{constructor(e){super(),this.data=e,this.isStatic=!1}';
const endMarker = '}(u=e.BufferMethods||(e.BufferMethods={}))';
const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0)
    throw new Error('Pinned PXT buffer boundaries changed');
const extracted = source.slice(start, end + endMarker.length);
const hash = createHash('sha256').update(extracted).digest('hex');
const formatted = ts.createPrinter().printFile(ts.createSourceFile('buffers.js', extracted,
    ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS));
const text = `// Generated from pxt-core13.2.1 simulator buffer algorithms (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-core.MIT.txt.
// Source: https://github.com/microsoft/pxt/tree/v13.2.1/pxtsim
// Extracted algorithm SHA256: ${hash}
// Regenerate: node scripts/generate-arcade-buffers.mjs
module.exports = function initializePxtBuffers() {
const e = {RefObject: class {}, U: {
    userError(message) {throw new Error(message);},
    fromUTF8Array(bytes) {return new TextDecoder().decode(bytes);}
}, throwFailedCastError(_value, type) {throw new TypeError('Expected ' + type);}};
const a = {typeCheck(value) {if (typeof value !== 'string') throw new TypeError('Expected string');}};
let u;
${formatted}
return {RefBuffer: e.RefBuffer, methods: e.BufferMethods};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== text) throw new Error('buffer-pxt.js differs from pinned PXT');
    console.log(`Verified PXT buffer algorithms (${hash.slice(0, 12)}).`);
} else writeFileSync(target, text);

// Hash belongs to pxt-common-packages rather than the PXT core byte shim.
// Retain its complete FNV-1 and k-bit fold functions from the consumed bundle.
const common = readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/sim/common-sim.js'), 'utf8');
const hashStartMarker = '        function fnv1(data) {';
const hashEndMarker = '        BufferMethods.hash = hash;';
const hashStart = common.indexOf(hashStartMarker), hashEnd = common.indexOf(hashEndMarker, hashStart);
if (hashStart < 0 || hashEnd < 0 || common.indexOf(hashStartMarker, hashStart + 1) >= 0)
    throw new Error('Pinned common-package Buffer hash boundaries changed');
const hashSource = common.slice(hashStart, hashEnd);
const hashText = `// Generated from pinned Arcade common-package simulator Buffer hash (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// Consumed input: packages/scratch-gui/static/makecode/arcade/sim/common-sim.js
// Extracted unadapted functions SHA256: ${createHash('sha256').update(hashSource).digest('hex')}
// Regenerate: node scripts/generate-arcade-buffers.mjs
module.exports = function initializePxtBufferHash() {
${hashSource}
return hash;
};
`;
const hashTarget = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer-hash-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(hashTarget, 'utf8') !== hashText) throw new Error('buffer-hash-pxt.js differs from pinned common-package simulator');
    console.log('Verified original common-package Buffer hash.');
} else writeFileSync(hashTarget, hashText);
