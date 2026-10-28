#!/usr/bin/env node
// Keep the sprite extensions (darts, corgio) in sync with our pinned runtime:
// their sources from the pinned target, transpiled unchanged. Both subclass
// sprites.ExtendableSprite; the generated module receives a host whose
// ExtendableSprite is a real native sprite, plus the game, controller, scene
// and image services the extensions call.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const files = [['darts', 'darts.ts'], ['corgio', 'corgio.ts']];
const text = ([pkg, name]) => {
    const source = bundle.bundledpkgs[pkg]?.[name];
    if (typeof source !== 'string') throw new Error(`${pkg}/${name} is missing from the pinned target`);
    return source;
};
const hashes = files.map(file => `${file[0]}/${file[1]}: ${createHash('sha256').update(text(file)).digest('hex')}`);
const compiled = files.map(file => ts.transpileModule(text(file), {compilerOptions: {target: ts.ScriptTarget.ES2018, removeComments: false}}).outputText).join('\n');
const content = `// Generated from PXT Arcade ${bundle.versions.target}, darts and corgio extensions (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// ${hashes.join('\n// ')}
// Regenerate: node scripts/generate-arcade-sprite-extensions.mjs
module.exports = function initializePxtSpriteExtensions(host) {
const {sprites, game, controller, scene, screen, img, SpriteFlag, CollisionDirection, ControllerButtonEvent} = host;
const Math = Object.create(globalThis.Math);
Math.clamp = (low, high, value) => Math.min(high, Math.max(low, value));
Math.pickRandom = host.pickRandom;
${compiled}
return {darts, Dart, corgio, Corgio};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/sprite-extensions-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('sprite-extensions-pxt.js differs from the pinned PXT extensions');
    console.log(`Verified Arcade sprite extensions from PXT ${bundle.versions.target}`);
} else {
    writeFileSync(target, content);
    console.log(`Generated Arcade sprite extensions from PXT ${bundle.versions.target}`);
}
