#!/usr/bin/env node
// Keep PXT's game-over dialog and configuration in sync with our pinned runtime:
// game/textDialogs.ts (BaseDialog, GameOverDialog, frames, cursor and trophy
// images) and the GameOverConfig class of game/game.ts, transpiled unchanged.
// The native extension supplies images, fonts, the screen size, scores and the
// effect and music values; it runs game over itself the way game.ts does.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const game = bundle.bundledpkgs.game;
const dialogs = game['textDialogs.ts'], gameTs = game['game.ts'];
if (typeof dialogs !== 'string' || typeof gameTs !== 'string') throw new Error('game/textDialogs.ts or game/game.ts is missing');
// GameOverConfig and the ScoringType enum it uses, cut from game.ts by braces.
const block = (text, marker) => {
    const start = text.indexOf(marker);
    if (start < 0 || text.indexOf(marker, start + 1) >= 0) throw new Error(`expected one ${marker}`);
    let depth = 0;
    for (let end = text.indexOf('{', start); end < text.length; end++) {
        if (text[end] === '{') depth++;
        if (text[end] === '}' && !--depth) return text.slice(start, end + 1);
    }
    throw new Error(`unclosed ${marker}`);
};
const config = `namespace game {\n${block(gameTs, 'export enum ScoringType')}\n${block(gameTs, 'export class GameOverConfig')}\n}`;
const compile = code => ts.transpileModule(code, {compilerOptions: {target: ts.ScriptTarget.ES2018, removeComments: false}}).outputText;
// PXT strings have replaceAll; String.prototype.replaceAll matches it for plain text.
const compiled = compile(`${dialogs}\n${config}`);
const hashes = [`textDialogs.ts: ${createHash('sha256').update(dialogs).digest('hex')}`,
    `game.ts GameOverConfig and ScoringType: ${createHash('sha256').update(config).digest('hex')}`];
const content = `// Generated from PXT Arcade ${bundle.versions.target}, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// ${hashes.join('\n// ')}
// Regenerate: node scripts/generate-arcade-gameover.mjs
module.exports = function initializePxtGameOver(host) {
const {image, img, screen, info, effects, music, control, controller, scene} = host;
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
${compiled}
return {game};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/gameover-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('gameover-pxt.js differs from the pinned PXT runtime');
    console.log(`Verified Arcade game over from PXT ${bundle.versions.target}`);
} else {
    writeFileSync(target, content);
    console.log(`Generated Arcade game over from PXT ${bundle.versions.target}`);
}
