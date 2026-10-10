#!/usr/bin/env node
// Keep PXT's Arcade music (mixer/music.ts, melody.ts, playable.ts, legacy.ts,
// soundEffect.ts) in sync with our pinned runtime.
//
// PXT runs these on fibers: pause() suspends the caller and
// control.runInParallel starts another fiber. The native runtime has no fibers,
// so generation lowers exactly that: a function that pauses, or calls such a
// function, becomes a generator and those calls become yield*; a callback given
// to control.runInParallel becomes a generator function. Every other line is the
// original source. A pausing call anywhere else fails generation.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {lowerFibers} from './lib/pxt-fiber-lowering.mjs';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const files = ['music.ts', 'melody.ts', 'playable.ts', 'legacy.ts', 'soundEffect.ts'];
const mixer = bundle.bundledpkgs.mixer;
for (const file of files) if (typeof mixer[file] !== 'string') throw new Error(`mixer/${file} is missing from the pinned target`);
// createSong needs the native sequencer (music::_createSequencer); it is not lowered.
const joined = files.map(file => mixer[file]).join('\n')
    .replace(/export function createSong\(song: Buffer\): Playable \{\s*return new sequencer\.Song\(song\);\s*\}/,
        'export function createSong(song: Buffer): Playable { throw new Error("Arcade songs are not available"); }');
if (!joined.includes('throw new Error("Arcade songs are not available")')) throw new Error('createSong changed in the pinned target');
// Functions marked `//% shim=music::name` are native in PXT: their bodies call the host.
const shims = new Set();
const source = joined.replace(/(\/\/% shim=music::(\w+)\n\s*(?:export )?function \w+\(([^)]*)\)[^{]*)\{[^}]*\}/g,
    (match, head, name, params) => {
        shims.add(name);
        const args = params.split(',').map(param => param.split(':')[0].trim()).filter(Boolean);
        return `${head}{ return __shim(${JSON.stringify(name)}, [${args.join(', ')}]); }`;
    });
const SHIMS = ['enableAmp', 'forceOutput', 'queuePlayInstructions', 'stopPlaying'];
if ([...shims].sort().join() !== SHIMS.join()) throw new Error(`unexpected music shims: ${[...shims].sort().join(', ')}`);
const {printed, asyncKeys} = lowerFibers(ts, source, 'mixer.ts');
const compiled = ts.transpileModule(printed, {compilerOptions: {target: ts.ScriptTarget.ES2018, removeComments: false}}).outputText;
const removals = compiled.match(/[\w.]+\.removeElement\(/g) || [];
const output = compiled.replace(/([\w.]+)\.removeElement\(/g, '__removeElement($1, ');
if (removals.length !== 2) throw new Error(`expected 2 removeElement calls, found ${removals.length}`);
const hashes = files.map(file => `${file}: ${createHash('sha256').update(mixer[file]).digest('hex')}`);
const content = `// Generated from PXT Arcade ${bundle.versions.target}, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// ${hashes.join('\n// ')}
// Pausing functions lowered to generators: ${asyncKeys.join(', ')}
// Regenerate: node scripts/generate-arcade-music.mjs
module.exports = function initializePxtMusic(host) {
const {control, hex, NumberFormat, DAL} = host;
const pause = host.pause;
const __shim = (name, args) => host.shims[name](...args);
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
Math.clamp = (low, high, value) => Math.min(high, Math.max(low, value));
const sequencer = {_stopAllSongs() {}};
const __removeElement = (array, element) => { const index = array ? array.indexOf(element) : -1; if (index >= 0) array.splice(index, 1); return index >= 0; };
${output}
return {music, Note, BeatFraction, Sounds, WaveShape, InterpolationCurve, SoundExpressionEffect, SoundExpressionPlayMode};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/music-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('music-pxt.js differs from the pinned PXT runtime');
    console.log(`Verified Arcade music from PXT ${bundle.versions.target}`);
} else {
    writeFileSync(target, content);
    console.log(`Generated Arcade music from PXT ${bundle.versions.target} (lowered: ${asyncKeys.join(', ')})`);
}
