// SPDX-License-Identifier: BSD-3-Clause
// Hidden palette aliases (arcade/palette.js HIDDEN_ALIASES): pure duplicates of a generic block are
// removed from the palette but stay registered. A project that uses one still loads, runs, round-trips
// through Code, and the MakeCode exporter/importer still handle it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {quietConsole} from './helpers/quiet-console.mjs';
import {SB3Creator, runProgram, runCreatedProgram, projectOpcodes} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

quietConsole();
const {VM} = await import('./helpers/spike-arena-vm.mjs');
const {loadExtensionClass, bundledExtensionIds} = await import('./helpers/bw-extensions.mjs');
const Arcade = loadExtensionClass(bundledExtensionIds().get('arcade'));
const palette = createRequire(import.meta.url)('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/palette.js');
const exported = creator => projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});

const makeExtension = () => {
    const rt = new EventEmitter(); rt.startHats = () => []; rt.requestRedraw = () => {}; rt.getSpriteTargetByName = () => null;
    return new Arcade(rt);
};
const shared = new Arcade(new VM().runtime);

test('the hidden aliases are registered, hidden, and offered by no section', () => {
    palette.resetForTests();
    const info = shared.getInfo();
    const listed = new Set(palette.SECTIONS.flatMap(section => [...section[3], ...section[4]]));
    for (const name of palette.HIDDEN_ALIASES) {
        const block = info.blocks.find(entry => entry && entry.opcode === name);
        assert.ok(block, `${name} stays registered`);
        assert.equal(block.hideFromPalette, true, name);
        assert.ok(!listed.has(name), `${name} is in no section`);
        assert.equal(typeof shared[name], 'function', `${name} still runs`);
    }
    assert.deepEqual([...palette.HIDDEN_ALIASES].filter(name => palette.PLUMBING.has(name)), []);
    // The generic blocks that cover the flag aliases stay visible.
    const visible = info.blocks.filter(block => block && block.opcode && !block.hideFromPalette).map(block => block.opcode);
    for (const name of ['setSpriteFlag', 'setPlayerScore', 'changePlayerScore', 'getPlayerScore', 'gameOver', 'startCountdown']) {
        assert.ok(visible.includes(name), `${name} stays visible`);
    }
});

const heroProgram = line => `DEVICE ARCADE
GLOBAL hero
SPRITE Game:
WHEN flag clicked:
  set hero to arcade spawn template "Game" kind "Player" x 80 y 60 width 16 height 16
${line}
`;
// [hidden opcode, Code line, same effect through the generic block, PXT statement]
const FLAGS = [
    ['arcade_setSpriteStayInScreen', '  arcade keep hero in screen 1', 'StayInScreen', 'hero.setStayInScreen(true)'],
    ['arcade_setSpriteAutoDestroy', '  arcade auto destroy hero outside screen 0', 'AutoDestroy', 'hero.setFlag(SpriteFlag.AutoDestroy, false)'],
    ['arcade_setSpriteBounceOnWall', '  arcade bounce hero on wall 1', 'BounceOnWall', 'hero.setBounceOnWall(true)'],
    ['arcade_setSpriteGhostThroughSprites', '  arcade ghost hero through sprites 1', 'GhostThroughSprites', 'hero.setFlag(SpriteFlag.GhostThroughSprites, true)']
];
const heroFlags = run => Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].flags;

for (const [opcode, line, flag, pxt] of FLAGS) {
    test(`${opcode} loads, runs like setSpriteFlag ${flag}, and matches the PXT oracle`, async () => {
        const run = await runProgram(heroProgram(line), {frames: 4});
        assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
        assert.ok(projectOpcodes(run.creator.project).has(opcode));
        const viaGeneric = await runProgram(heroProgram(`  arcade set flag ${flag} of hero to ${line.endsWith(' 0') ? 0 : 1}`), {frames: 4});
        assert.deepEqual(viaGeneric.errors, []);
        assert.ok(projectOpcodes(viaGeneric.creator.project).has('arcade_setSpriteFlag'));
        assert.equal(heroFlags(run), heroFlags(viaGeneric), 'same flags as the generic block');
        const before = await runPxtArcade('let hero=sprites.create(img`1`,SpriteKind.Player);let flags=hero.flags', {fakeClock: true});
        const after = await runPxtArcade(`let hero=sprites.create(img\`1\`,SpriteKind.Player);${pxt};let flags=hero.flags`, {fakeClock: true});
        const fresh = await runProgram(heroProgram('  arcade log "x"'), {frames: 2});
        const changed = heroFlags(run) ^ heroFlags(fresh);
        assert.equal(changed, before.flags ^ after.flags, 'the flag bits changed match PXT');
    });
    test(`${opcode} survives MakeCode import, Code, export and re-import`, async () => {
        const source = `let hero = sprites.create(img\`1\`, SpriteKind.Player)\n${pxt}\n`;
        const imported = arcadeToPseudocode(source);
        assert.deepEqual(imported.unsupported, []);
        const run = await runProgram(imported.code, {frames: 4, uploads: imported.costumes, storage: true});
        assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
        const used = projectOpcodes(run.creator.project);
        assert.ok(used.has(opcode), `importer emits ${opcode}`);
        const second = new SB3Creator();
        second.parse(run.creator.decompile());
        assert.deepEqual(second.warnings, []);
        assert.deepEqual(projectOpcodes(second.project), used);
        const out = exported(run.creator);
        assert.deepEqual(out.unsupported, []);
        const again = arcadeToPseudocode(out.ts);
        assert.deepEqual(again.unsupported, []);
        const rerun = await runProgram(again.code, {frames: 4, uploads: again.costumes, storage: true});
        assert.deepEqual(rerun.errors, []);
        const flagsOf = result => Object.values(result.vm.runtime.bwArcadeDeviceState.sprites).map(item => item.flags);
        assert.deepEqual(flagsOf(rerun), flagsOf(run));
        const original = await runPxtArcade(`${source}let flags = hero.flags`, {fakeClock: true});
        assert.equal(flagsOf(run)[0], original.flags);
    });
}

const scoreProgram = `DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  arcade set score to 5
  arcade change score by 2
  set seen to arcade score
`;
test('setscore, changescore and getscore run like the player-1 score blocks and match info.score', async () => {
    const run = await runProgram(scoreProgram, {frames: 4});
    assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
    for (const opcode of ['arcade_setscore', 'arcade_changescore', 'arcade_getscore']) assert.ok(projectOpcodes(run.creator.project).has(opcode), opcode);
    const ext = makeExtension();
    ext.setscore({N: 5}); ext.changescore({N: 2});
    const generic = makeExtension();
    generic.setPlayerScore({PLAYER: 1, VALUE: 5}); generic.changePlayerScore({PLAYER: 1, VALUE: 2});
    assert.equal(Number(ext.getscore()), Number(generic.getPlayerScore({PLAYER: 1})));
    const oracle = await runPxtArcade('info.setScore(5);info.changeScoreBy(2);let score=info.score()', {fakeClock: true});
    assert.equal(Number(ext.getscore()), oracle.score);
    const out = exported(run.creator);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /info\.setScore\(5\)/); assert.match(out.ts, /info\.changeScoreBy\(2\)/); assert.match(out.ts, /info\.score\(\)/);
    const again = arcadeToPseudocode(out.ts);
    assert.deepEqual(again.unsupported, []);
    assert.deepEqual((await runProgram(again.code, {frames: 4, storage: true})).errors, []);
    const second = new SB3Creator(); second.parse(run.creator.decompile());
    assert.deepEqual(second.warnings, []);
    assert.deepEqual(projectOpcodes(second.project), projectOpcodes(run.creator.project));
});

// gameover and countdown have no Code-tab words (they exist only in saved projects), so the program is
// built from a neighbouring block and its opcode is renamed, exactly as a saved project carries it.
const renamed = (source, from, to) => {
    const creator = new SB3Creator();
    creator.parse(source);
    for (const target of creator.project.targets) for (const block of Object.values(target.blocks || {})) if (block.opcode === from) block.opcode = to;
    return creator;
};
test('a saved project using gameover loads, runs, and exports game.over(false)', async () => {
    const creator = renamed('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  arcade stop countdown\n', 'arcade_stopCountdown', 'arcade_gameover');
    assert.ok(projectOpcodes(creator.project).has('arcade_gameover'));
    const run = await runCreatedProgram(creator, {frames: 4});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState.gameOver, true);
    const out = exported(creator);
    assert.deepEqual(out.unsupported, []);
    assert.match(out.ts, /game\.over\(false\)/);
});
test('a saved project using countdown loads and runs; the exporter reports it as before', async () => {
    const creator = renamed('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  arcade start countdown 1\n', 'arcade_startCountdown', 'arcade_countdown');
    assert.ok(projectOpcodes(creator.project).has('arcade_countdown'));
    const run = await runCreatedProgram(creator, {frames: 4});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState.countdown, 1);
    assert.ok(exported(creator).unsupported.length > 0, 'countdown never had a MakeCode form');
});
