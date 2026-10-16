#!/usr/bin/env node
// Keep PXT's head-up display (score, lives, countdown and the multiplayer
// boxes) in sync with our pinned runtime: classes and drawing functions cut by
// braces from game/info.ts and transpiled unchanged. The native extension owns
// the player state objects (they become PXT's playerStates), the HUD renderable
// and the life-zero and countdown-end events; PXT's own code draws the HUD.
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'packages/scratch-gui/package.json'));
const ts = require('typescript');
const bundle = JSON.parse(readFileSync(resolve(root, 'packages/scratch-gui/static/makecode/arcade/target.json')));
const info = bundle.bundledpkgs.game['info.ts'];
if (typeof info !== 'string') throw new Error('game/info.ts is missing');
const block = marker => {
    const start = info.indexOf(marker);
    if (start < 0 || info.indexOf(marker, start + 1) >= 0) throw new Error(`expected one ${marker}`);
    let depth = 0;
    for (let end = info.indexOf('{', start); end < info.length; end++) {
        if (info[end] === '{') depth++;
        if (info[end] === '}' && !--depth) return info.slice(start, end + 1);
    }
    throw new Error(`unclosed ${marker}`);
};
const pieces = ['export enum Visibility', 'class ScoreReachedHandler', 'export class PlayerState', 'class InfoState',
    'function initMultiHUD', 'function defaultHeartImage', 'function defaultMultiplayerHeartImage', 'function drawTimer',
    'export class PlayerInfoImpl', 'export class PlayerInfo ', 'function formatDecimal',
    'export function showScore', 'export function showLife', 'export function showCountdown', 'function updateFlag'].map(block);
const source = `namespace info {
    let infoState: InfoState = undefined;
    let players: PlayerInfo[];
    // Host glue (ours): the native extension creates the HUD renderable itself.
    function initHUD() {}
    export function _setInfoState(state: InfoState) { infoState = state; }
    export function _newInfoState() { return new InfoState(); }
    export function _initMultiHUD() { initMultiHUD(); }
    export function _drawTimer(millis: number) { drawTimer(millis); }
${pieces.join('\n')}
}`;
const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2018, removeComments: false}}).outputText;
const content = `// Generated from PXT Arcade ${bundle.versions.target}, pxt-common-packages (MIT).
// Copyright (c) Microsoft Corporation. See static/licenses/pxt-common-packages.MIT.txt.
// info.ts: ${createHash('sha256').update(info).digest('hex')}
// Regenerate: node scripts/generate-arcade-hud.mjs
module.exports = function initializePxtHud(host) {
const {image, img, screen} = host;
const Math = Object.create(globalThis.Math);
Math.idiv = (a, b) => (a / b) | 0;
${compiled}
return {info};
};
`;
const target = resolve(root, 'overlay/scratch-vm/src/extensions/crispstrobe/arcade/hud-pxt.js');
if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== content) throw new Error('hud-pxt.js differs from the pinned PXT runtime');
    console.log(`Verified Arcade HUD from PXT ${bundle.versions.target}`);
} else {
    writeFileSync(target, content);
    console.log(`Generated Arcade HUD from PXT ${bundle.versions.target}`);
}
