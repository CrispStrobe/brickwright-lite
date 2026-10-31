import test from 'node:test';
import assert from 'node:assert/strict';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {classifyNormalization, scaffoldHideCount, structuralOutcome, NORMALIZED} from '../scripts/lib/roundtrip-status.mjs';

function arcadeExport (main) {
    const files = {'main.ts': main, 'pxt.json': JSON.stringify({name: 'rt', dependencies: {device: '*'}, files: ['main.ts']})};
    const imported = importProjectFiles(files, {target: 'arcade', name: 'rt'});
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const costume of imported.costumes || []) {
        if (costume.mode === 'add') creator.addCustomSVGCostume(costume.sprite, costume.svg, costume.name);
        else creator.applyCustomSVG(costume.sprite, costume.svg);
    }
    return {creator, exported: projectJsonToArcade(JSON.stringify(creator.project), {name: 'roundtrip',
        costumeSvg: (sprite, costume) => {
            const asset = creator.assets.get(costume.assetId);
            return asset?.type === 'svg' ? asset.data : null;
        }})};
}

test('a projectile whose artwork is missing is still typed Sprite on export', () => {
    const {exported} = arcadeExport('forever(function () {\n    let shot = sprites.createProjectileFromSide(assets.image`Missing`, -90, 0)\n    shot.y = randint(0, 10)\n})\n');
    const ts = exported.files['main.ts'];
    assert.match(ts, /let shot: Sprite = null/);
    assert.doesNotMatch(ts, /let shot: number/);
    assert.doesNotMatch(ts, /shot = 0\b/);
});

test('a number index read from a nested array stays a plain indexer (the cast is only for variables typed any)', () => {
    const {exported} = arcadeExport([
        'let board: number[][] = []',
        'let list: Image[] = [img`1`, img`2`]',
        'let cell = 0',
        'let canvas = image.create(8, 8)',
        'board[0] = []',
        'board[0][0] = 1',
        'game.onUpdate(function () {',
        '    cell = board[0][0]',
        '    canvas.drawTransparentImage(list[cell], 0, 0)',
        '})',
        ''].join('\n'));
    assert.match(exported.files['main.ts'], /list\[cell\]/);
});

test('micro:bit: a second array creation is the author\'s statement and is exported', () => {
    const files = {'main.ts': 'let items: number[] = []\nitems.push(1)\nitems = []\nbasic.showNumber(items.length)\n',
        'pxt.json': JSON.stringify({name: 'rt', dependencies: {core: '*'}, files: ['main.ts']})};
    const creator = new SB3Creator();
    creator.parse(importProjectFiles(files, {target: 'microbit', name: 'rt'}).code);
    const ts = exportToMakeCode(creator.project, {name: 'roundtrip'}).files['main.ts'];
    assert.equal((ts.match(/items = \[\]/g) || []).length, 1, ts);
    assert.match(ts, /let items: number\[\] = \[\]/);
});

const hat = (id, next) => ({opcode: 'event_whenflagclicked', topLevel: true, parent: null, next});
const project = hides => ({targets: [{name: 'Game', blocks: {
    h: hat('h', hides ? 'x' : null),
    ...(hides ? {x: {opcode: 'looks_hide', topLevel: false, parent: 'h', next: null}} : {})
}}]});

test('importer scaffolding hide is a normalization, not a lost opcode', () => {
    assert.equal(scaffoldHideCount(project(true)), 1);
    const split = classifyNormalization({lostOpcodes: [{name: 'looks_hide', before: 1, after: 0}], missingArtwork: [], missingTargets: []},
        {before: project(true), after: project(false)});
    assert.deepEqual(split.differences.lostOpcodes, []);
    assert.equal(split.normalization[0].kind, 'importer scaffolding hide');
    assert.equal(structuralOutcome({differences: split.differences, normalization: split.normalization}), NORMALIZED);
});

test('a hide that is not importer scaffolding stays a loss', () => {
    const user = {targets: [{name: 'S', blocks: {
        h: {opcode: 'event_whenkeypressed', topLevel: true, parent: null, next: 'x'},
        x: {opcode: 'looks_hide', topLevel: false, parent: 'h', next: null}}}]};
    const split = classifyNormalization({lostOpcodes: [{name: 'looks_hide', before: 1, after: 0}], missingArtwork: [], missingTargets: []},
        {before: user, after: project(false)});
    assert.equal(split.differences.lostOpcodes.length, 1);
    assert.equal(structuralOutcome({differences: split.differences, normalization: split.normalization}), 'loss');
});

const frameBlock = (key, template = 'tpl', start = '0', count = '1') => ({opcode: 'arcade_frameImage', inputs: {
    KEY: [1, [10, key]], TEMPLATE: [1, [10, template]], START: [1, [4, start]], COUNT: [1, [4, count]]}});
const projectOf = (...blocks) => ({targets: [{name: 'Game', blocks: Object.fromEntries(blocks.map((b, i) => [`b${i}`, b]))}]});
const lostFrames = (before, after) => ({missingTargets: [], missingAssets: [], missingArtwork: [],
    lostOpcodes: [{name: 'arcade_frameImage', before, after}]});

test('identical frame image uses that share one bank are a normalization', () => {
    const before = projectOf(frameBlock('a'), frameBlock('a'), frameBlock('b'));
    const split = classifyNormalization(lostFrames(3, 2), {before, after: projectOf(frameBlock('a'), frameBlock('b'))});
    assert.deepEqual(split.differences.lostOpcodes, []);
    assert.equal(split.normalization.find(n => n.name === 'arcade_frameImage').count, 1);
});

test('frame image uses with different ranges stay a loss', () => {
    const before = projectOf(frameBlock('a', 'tpl', '0', '1'), frameBlock('a', 'tpl', '0', '2'));
    const split = classifyNormalization(lostFrames(2, 1), {before, after: projectOf(frameBlock('a'))});
    assert.equal(split.differences.lostOpcodes.length, 1);
});

test('a missing sprite whose Sprite-suffixed handle carrier came back is a normalization; otherwise a loss', () => {
    const before = {targets: [{name: 'Game', blocks: {}}, {name: 'frog', blocks: {}}]};
    const diff = {missingTargets: ['frog'], lostOpcodes: [], missingAssets: [], missingArtwork: []};
    const kept = classifyNormalization(diff, {before, after: {targets: [{name: 'Game'}, {name: 'frogSprite'}]}});
    assert.deepEqual(kept.differences.missingTargets, []);
    const gone = classifyNormalization(diff, {before, after: {targets: [{name: 'Game'}]}});
    assert.deepEqual(gone.differences.missingTargets, ['frog']);
});

test('a Scratch-model opcode counts as normalized only when its native counterpart appeared', () => {
    const op = opcode => ({opcode, inputs: {}});
    const before = projectOf(op('control_forever'), op('motion_gotoxy'));
    const diff = {missingTargets: [], missingAssets: [], missingArtwork: [], lostOpcodes: [
        {name: 'control_forever', before: 1, after: 0}, {name: 'motion_gotoxy', before: 1, after: 0}]};
    const split = classifyNormalization(diff, {before, after: projectOf(op('arcade_sourceWhile'))});
    assert.deepEqual(split.differences.lostOpcodes.map(x => x.name), ['motion_gotoxy']);
    assert.equal(split.normalization.filter(n => n.name === 'control_forever').length, 1);
});

test('a named sprite kind that no code defines is exported as a declared member, not as a placeholder', () => {
    const {exported} = arcadeExport('sprites.onOverlap(SpriteKind.Player, SpriteKind.Pickup, function (sprite, other) {\n    other.destroy()\n})\n');
    const ts = exported.files['main.ts'];
    assert.match(ts, /namespace SpriteKind \{\s*export let Pickup: number/);
    assert.match(ts, /sprites\.onOverlap\(SpriteKind\.Player, SpriteKind\.Pickup,/);
});
