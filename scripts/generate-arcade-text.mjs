#!/usr/bin/env node
// Keep PXT's image text printing and pixel fonts in sync with our pinned runtime:
// screen/text.ts (fonts font5/font8 and helpers.imagePrint) transpiled, with the
// simulator's drawIcon and its image-buffer helpers taken from common-sim.js.
// font12 has empty data in text.ts; its glyphs come from screen/font12.jres.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const text = bundle.bundledpkgs.screen['text.ts'];
const font12 = JSON.parse(bundle.bundledpkgs.screen['font12.jres'])['image.font12'];
const sim = readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/sim/common-sim.js'), 'utf8');
const slice = name => {
    const start = sim.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`Missing pinned PXT simulator function ${name}`);
    let depth = 1, end = sim.indexOf('{', start) + 1;
    while (depth && end < sim.length) { if (sim[end] === '{') depth++; if (sim[end] === '}') depth--; end++; }
    if (depth) throw new Error(`Unclosed pinned PXT simulator function ${name}`);
    return sim.slice(start, end);
};
const simFunctions = ['byteHeight', 'bufW', 'bufH', 'isValidImage', 'drawIcon'].map(slice).join('\n')
    .replace(/pxsim\.image\./g, '');
if (!font12 || font12.mimeType !== 'font/x-mkcd-b26' || !font12.data) throw new Error('Missing pinned PXT font12');
const compiled = ts.transpileModule(text, {compilerOptions: {target: ts.ScriptTarget.ES2018, removeComments: false}}).outputText;
const hashes = [
    `text.ts: ${createHash('sha256').update(text).digest('hex')}`,
    `font12.jres: ${createHash('sha256').update(bundle.bundledpkgs.screen['font12.jres']).digest('hex')}`,
    `common-sim.js drawIcon and helpers: ${createHash('sha256').update(simFunctions).digest('hex')}`
];
const content = `// Generated from PXT Arcade ${bundle.versions.target}, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// font12 glyphs: Adobe, SIL Open Font License 1.1 (see the same notices).
// ${hashes.join('\n// ')}
// Regenerate: node scripts/generate-arcade-text.mjs
module.exports = function initializePxtText(host) {
const {control, hex, NumberFormat, base64} = host;
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
${simFunctions}
${compiled}
image.font12.data = base64(${JSON.stringify(font12.data)});
return {image, helpers, drawIcon};
};
`;
const output = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/text-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== content) throw new Error('text-pxt.js differs from the pinned PXT runtime');
    console.log(`Verified Arcade image text from PXT ${bundle.versions.target}`);
} else {
    writeFileSync(output, content);
    console.log(`Generated Arcade image text from PXT ${bundle.versions.target}`);
}
