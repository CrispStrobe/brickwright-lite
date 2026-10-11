#!/usr/bin/env node
// Keep the seven segment extension (sevenseg) in sync with our pinned runtime:
// sevenseg.ts from the pinned target, transpiled unchanged. The generated module
// receives a small host (image, sprites, hex buffers) from the native Arcade
// extension; the digit drawing and counter logic stay the original source.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const source = bundle.bundledpkgs.sevenseg?.['sevenseg.ts'];
if (typeof source !== 'string') throw new Error('sevenseg/sevenseg.ts is missing from the pinned target');
const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2018, removeComments: false}}).outputText;
const content = `// Generated from PXT Arcade ${bundle.versions.target}, sevenseg extension (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// sevenseg.ts: ${createHash('sha256').update(source).digest('hex')}
// Regenerate: node scripts/generate-arcade-sevenseg.mjs
module.exports = function initializePxtSevenseg(host) {
const {image, sprites, hex, NumberFormat} = host;
const Math = Object.create(globalThis.Math);
Math.clamp = (low, high, value) => Math.min(high, Math.max(low, value));
${compiled}
return {sevenseg, SevenSegDigit, DigitCounter, SegmentStyle, DigitRadix, SegmentScale, SegmentCharacter};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/sevenseg-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('sevenseg-pxt.js differs from the pinned PXT extension');
    console.log(`Verified Arcade sevenseg from PXT ${bundle.versions.target}`);
} else {
    writeFileSync(target, content);
    console.log(`Generated Arcade sevenseg from PXT ${bundle.versions.target}`);
}
