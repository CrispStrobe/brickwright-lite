#!/usr/bin/env node
// Keep PXT's particle sources, factories and effects in sync with our pinned runtime.
// The generated module receives a small host (scene, clock, screen, images) from the
// native Arcade extension; every particle algorithm stays the original source.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {lowerFibers} from './lib/pxt-fiber-lowering.mjs';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const files = [
    ['base', 'fixed.ts'], ['game', 'mathUtil.ts'], ['game', 'effects.ts'],
    // particles.ts builds its whenUsed defaultFactory from a SprayFactory.
    ['game', 'particlefactories.ts'], ['game', 'particles.ts'], ['game', 'particleeffects.ts']
];
const text = ([pkg, name]) => {
    const source = bundle.bundledpkgs[pkg]?.[name];
    if (typeof source !== 'string') throw new Error(`${pkg}/${name} is missing from the pinned target`);
    return source;
};
const hashes = files.map(file => `${file[1]}: ${createHash('sha256').update(text(file)).digest('hex')}`);
// The host supplies Math; PXT's namespace Math extension is compiled under another
// name and merged so it cannot shadow the host object.
const transpile = code => ts.transpileModule(code, {compilerOptions: {
    target: ts.ScriptTarget.ES2018, removeComments: false
}}).outputText;
// Namespaces split across files resolve each other only when transpiled
// together; fixed.ts and the renamed Math extension stand alone.
const group = names => files.filter(file => names.includes(file[1])).map(text).join('\n');
let compiled = transpile(group(['fixed.ts'])) +
    transpile(group(['mathUtil.ts']).replace(/\bnamespace Math\b/, 'namespace PxtMath')) + 'Object.assign(Math, PxtMath);\n' +
    // ImageEffect.startScreenEffect pauses inside control.runInParallel: lowered to generators.
    transpile(lowerFibers(ts, group(['effects.ts', 'particlefactories.ts', 'particles.ts', 'particleeffects.ts']), 'effects.ts').printed);
// PXT arrays carry removeElement; plain JavaScript arrays do not.
const removals = compiled.match(/[\w.]+\.removeElement\(/g) || [];
compiled = compiled.replace(/([\w.]+)\.removeElement\(/g, '__removeElement($1, ');
if (removals.length !== 4) throw new Error(`expected 4 removeElement calls, found ${removals.length}`);
const header = `// Generated from PXT Arcade ${bundle.versions.target}, pxt-common-packages (MIT).\n` +
    `// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.\n` +
    `// ${hashes.join('\n// ')}\n// Regenerate: node scripts/generate-arcade-particles.mjs\n`;
const content = header +
    `module.exports = function initializePxtParticles(host) {\n` +
    `const {game, control, screen, img, scene, SpriteFlag, pause} = host;\n` +
    `const Math = Object.create(globalThis.Math);\n` +
    `Math.idiv = (a, b) => (a / b) | 0;\n` +
    `Math.randomRange = host.randomRange;\n` +
    `const sprites = {Flag: {Destroyed: 2, RelativeToCamera: 512}, BaseSprite: host.BaseSprite};\n` +
    `const __removeElement = (array, element) => { const index = array ? array.indexOf(element) : -1; if (index >= 0) array.splice(index, 1); return index >= 0; };\n` +
    compiled +
    `return {particles, effects, Fx, Fx8, FastRandom: Math.FastRandom};\n};\n`;
const output = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/particles-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== content) throw new Error('particles-pxt.js differs from the pinned PXT runtime');
    console.log(`Verified Arcade particles from PXT ${bundle.versions.target}`);
} else {
    writeFileSync(output, content);
    console.log(`Generated Arcade particles from PXT ${bundle.versions.target}`);
}
