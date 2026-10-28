#!/usr/bin/env node
// Keep PXT's text layout, paging and speech rendering in sync with our pinned runtime.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const game = bundle.bundledpkgs.game;
const sources = ['renderText.ts', 'spritesay.ts'];
const hashes = sources.map(name => `${name}: ${createHash('sha256').update(game[name]).digest('hex')}`);
const source = sources.map(name => game[name]).join('\n');
const compiled = ts.transpileModule(source, {compilerOptions: {
    target: ts.ScriptTarget.ES2018, removeComments: false
}}).outputText;
const header = `// Generated from PXT Arcade ${bundle.versions.target}, pxt-common-packages (MIT).\n` +
    `// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.\n` +
    `// ${hashes.join('\n// ')}\n// Regenerate: node scripts/generate-arcade-speech.mjs\n`;
const output = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade');
const check = process.argv.includes('--check');
const emit = (name, content) => {
    const path = resolve(output, name);
    if (check) {
        if (readFileSync(path, 'utf8') !== content) throw new Error(`${name} differs from the pinned PXT runtime`);
    } else writeFileSync(path, content);
};
emit('speech-pxt.js', header +
    `module.exports = function initializePxtSpeech(image, control, game, screen, SpriteFlag, Fx, inspect) {\n` +
    `const console = {inspect};\nconst Flag = {Destroyed: 1};\n` +
    `const Math = Object.create(globalThis.Math);\nMath.idiv = (a, b) => (a / b) | 0;\n` + compiled +
    `return sprites;\n};\n`);
const text = bundle.bundledpkgs.screen['text.ts'];
const font8 = text.match(/export const font8[\s\S]*?data: hex`([^`]+)`/)[1].replace(/\s/g, '');
const font12 = JSON.parse(bundle.bundledpkgs.screen['font12.jres'])['image.font12'].data;
emit('speech-fonts.json', JSON.stringify({
    provenance: `PXT Arcade ${bundle.versions.target}; font8: Microsoft MIT; font12: Adobe SIL OFL 1.1`,
    font8: {charWidth: 6, charHeight: 8, data: Buffer.from(font8, 'hex').toString('base64')},
    font12: {charWidth: 12, charHeight: 12, data: font12}
}) + '\n');
console.log(`${check ? 'Verified' : 'Generated'} Arcade speech renderer and pixel fonts from PXT ${bundle.versions.target}`);
