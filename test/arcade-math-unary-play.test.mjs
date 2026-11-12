// SPDX-License-Identifier: BSD-3-Clause
// The merged `math [OP] of (x)` (truncate | sign) and `play [PLAYABLE] [MODE]` blocks. The four play blocks and the two
// number reporters they replace stay registered as hidden aliases. The new blocks must run exactly like the old ones,
// match the original PXT runtime, and export to the same MakeCode calls.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {quietConsole} from './helpers/quiet-console.mjs';
import {SB3Creator, runProgram, runCreatedProgram, clearStrayTimers, projectOpcodes} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

quietConsole();
const {loadExtensionClass, stubRuntime} = await import('./helpers/bw-extensions.mjs');
const Arcade = loadExtensionClass('arcade');
const palette = createRequire(import.meta.url)('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/palette.js');
const exported = creator => projectToArcade(creator.project, {costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data});
const variables = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name.replace(/^(?:Game_)+/, ''), v.value]));
const notes = log => log.map(entry => entry.bytes);

test('math-unary and play are visible in their sections; the six blocks they replace are hidden aliases', () => {
    palette.resetForTests();
    const info = new Arcade(stubRuntime()).getInfo();
    const visible = new Set(info.blocks.filter(block => block && block.opcode && !block.hideFromPalette).map(block => block.opcode));
    for (const name of ['mathUnary', 'play']) assert.ok(visible.has(name), name);
    const section = name => palette.SECTIONS.find(entry => entry[0] === name);
    assert.ok(section('advanced')[3].includes('mathUnary') && section('music')[3].includes('play'));
    for (const name of ['truncateNumber', 'signNumber', 'playMusic', 'playMelody', 'playSoundEffect', 'playSound']) {
        assert.ok(palette.HIDDEN_ALIASES.has(name), name);
        assert.equal(info.blocks.find(block => block && block.opcode === name).hideFromPalette, true, name);
    }
});

test('mathUnary runs exactly like truncateNumber and signNumber, including -0, NaN and infinities', () => {
    const ext = new Arcade(stubRuntime());
    const inputs = [0, -0, 1.5, -1.5, 2.999, -2.999, 4294967296.75, -3.75, NaN, Infinity, -Infinity, '7.9', '-7.9', '', 'abc', null, true];
    for (const NUM of inputs) {
        assert.ok(Object.is(ext.mathUnary({OP: 'truncate', NUM}), ext.truncateNumber({NUM})), `truncate ${String(NUM)}`);
        assert.ok(Object.is(ext.mathUnary({OP: 'sign', NUM}), ext.signNumber({NUM})), `sign ${String(NUM)}`);
    }
    assert.throws(() => ext.mathUnary({OP: 'cbrt', NUM: 8}), /not implemented/);
});

const MATH = `let a = Math.trunc(-2.75)
let b = Math.sign(-3.75)
let c = Math.trunc(7.9)
let d = Math.sign(0)
let e = Math.trunc(-1 / Infinity)
let f = 1 / Math.sign(-1 / Infinity)
let g = Math.sign(NaN)
let ready = true`;
const MATH_NAMES = ['a', 'b', 'c', 'd', 'f', 'g'];

test('Math.trunc and Math.sign import as the merged block, match the PXT oracle, export the same calls and re-import exactly', async () => {
    const original = await runPxtArcade(MATH, {fakeClock: true});
    const imported = arcadeToPseudocode(MATH);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade math truncate of \(/);
    assert.match(imported.code, /arcade math sign of \(/);
    assert.doesNotMatch(imported.code, /arcade truncate |arcade sign of /);
    const run = await runProgram(imported.code, {frames: 4, storage: true, uploads: imported.costumes});
    assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
    assert.ok(projectOpcodes(run.creator.project).has('arcade_mathUnary'));
    assert.ok(!projectOpcodes(run.creator.project).has('arcade_truncateNumber') && !projectOpcodes(run.creator.project).has('arcade_signNumber'));
    const seen = variables(run);
    for (const name of MATH_NAMES) assert.ok(Object.is(Number(seen[name]), original[name]) || (Number.isNaN(original[name]) && Number.isNaN(Number(seen[name]))), `${name}: ${seen[name]} vs ${original[name]}`);
    // Code -> Blocks -> Code is stable.
    const again = new SB3Creator(); again.parse(run.creator.decompile());
    assert.deepEqual(again.warnings, []);
    assert.deepEqual(projectOpcodes(again.project), projectOpcodes(run.creator.project));
    // Export: the MakeCode calls, compiled, executed, and read back as the same blocks.
    const out = exported(run.creator);
    assert.deepEqual(out.unsupported, []);
    assert.equal((out.ts.match(/Math\.trunc\(/g) || []).length, 3);
    assert.equal((out.ts.match(/Math\.sign\(/g) || []).length, 4);
    const compiled = await compile('arcade', out.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const exportedOracle = await runPxtArcade(out.files, {fakeClock: true});
    for (const name of MATH_NAMES) assert.ok(Object.is(exportedOracle[name], original[name]) || (Number.isNaN(original[name]) && Number.isNaN(exportedOracle[name])), name);
    const reimported = arcadeToPseudocode(out.ts);
    assert.deepEqual(reimported.unsupported, []);
    const rerun = await runProgram(reimported.code, {frames: 4, storage: true, uploads: reimported.costumes});
    assert.ok(projectOpcodes(rerun.creator.project).has('arcade_mathUnary'));
    assert.deepEqual(MATH_NAMES.map(name => String(variables(rerun)[name])), MATH_NAMES.map(name => String(seen[name])));
});

// Saved projects keep the old opcodes; only the opcode name differs from a project of the new block.
const renamed = (source, from, to, fix) => {
    const creator = new SB3Creator();
    creator.parse(source);
    for (const target of creator.project.targets) for (const block of Object.values(target.blocks || {})) if (block.opcode === from) { block.opcode = to; fix?.(block); }
    return creator;
};
test('a saved project with truncateNumber and signNumber loads, runs and exports unchanged', async () => {
    const source = 'DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  set a to arcade math truncate of (-2.75)\n  set b to arcade math sign of (-3.75)\n';
    const fresh = new SB3Creator(); fresh.parse(source);
    const ops = [];
    for (const target of fresh.project.targets) for (const block of Object.values(target.blocks || {})) if (block.opcode === 'arcade_mathUnary') ops.push(block.fields?.OP?.[0] ?? block.fields?.OP);
    assert.deepEqual(ops.sort(), ['sign', 'truncate']);
    const creator = new SB3Creator(); creator.parse(source);
    for (const target of creator.project.targets) for (const block of Object.values(target.blocks || {})) if (block.opcode === 'arcade_mathUnary') {
        const op = block.fields?.OP?.[0] ?? block.fields?.OP;
        block.opcode = op === 'truncate' ? 'arcade_truncateNumber' : 'arcade_signNumber';
        delete block.fields.OP;
    }
    const run = await runCreatedProgram(creator, {frames: 4});
    assert.deepEqual(run.errors, []);
    assert.equal(Number(variables(run).a), -2); assert.equal(Number(variables(run).b), -1);
    const out = exported(creator);
    assert.deepEqual(out.unsupported, []);
    assert.ok(out.ts.includes('Math.trunc(-2.75)') && out.ts.includes('Math.sign(-3.75)'));
});

// ---- play ----
const TONE = 'arcade tone playable 262 Hz for 400 ms';
const MELODY = 'arcade melody playable (arcade melody baDing)';
const STRING = 'arcade string playable "C D E F" at 240 bpm';
const EFFECT = 'arcade sound effect wave Square from 400 Hz to 600 Hz volume 255 to 0 for 300 ms effect Vibrato curve Linear';
const playProgram = line => `DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  ${line}\n  set after to 1\n`;
const musicLog = async (line, frames) => {
    const run = await runProgram(playProgram(line), {frames, storage: true});
    try {
        assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
        return {opcodes: projectOpcodes(run.creator.project), notes: notes(run.vm.runtime.bwArcadeMusicLog || []), after: Number(variables(run).after)};
    } finally { clearStrayTimers(); }
};
for (const [name, playable] of [['tone', TONE], ['melody', MELODY], ['string melody', STRING], ['sound effect', EFFECT]]) {
    for (const mode of ['UntilDone', 'InBackground', 'LoopingInBackground']) {
        test(`play ${name} ${mode} behaves exactly like play music`, async () => {
            const merged = await musicLog(`arcade play playable (${playable}) mode ${mode}`, 40);
            const old = await musicLog(`arcade play music (${playable}) mode ${mode}`, 40);
            assert.ok(merged.opcodes.has('arcade_play') && !merged.opcodes.has('arcade_playMusic'));
            assert.ok(old.opcodes.has('arcade_playMusic'));
            assert.ok(merged.notes.length > 0, 'something was played');
            assert.deepEqual(merged.notes, old.notes);
            assert.equal(merged.after, old.after, 'the script continues at the same time');
        });
    }
}
for (const mode of ['UntilDone', 'InBackground']) {
    test(`play sound effect ${mode}: the merged block equals the playSoundEffect alias`, async () => {
        const merged = await musicLog(`arcade play playable (${EFFECT}) mode ${mode}`, 40);
        const old = await musicLog(`arcade play sound effect (${EFFECT}) mode ${mode}`, 40);
        assert.ok(old.opcodes.has('arcade_playSoundEffect'));
        assert.ok(merged.notes.length > 0);
        assert.deepEqual(merged.notes, old.notes);
        assert.equal(merged.after, old.after);
    });
}

const PLAY = `let done = false
music.play(music.melodyPlayable(music.baDing), music.PlaybackMode.UntilDone)
music.play(music.stringPlayable("C D E F", 240), music.PlaybackMode.UntilDone)
music.play(music.createSoundEffect(WaveShape.Square, 400, 600, 255, 0, 300, SoundExpressionEffect.Vibrato, InterpolationCurve.Linear), music.PlaybackMode.UntilDone)
music.play(music.tonePlayable(262, 300), music.PlaybackMode.InBackground)
done = true
done = true`;
test('music.play imports as the merged block, plays the original mixer bytes, exports music.play and re-imports exactly', async () => {
    const original = await runPxtArcade(PLAY, {waitForGlobals: {done: true}, recordSound: true});
    const imported = arcadeToPseudocode(PLAY);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade play playable /);
    assert.doesNotMatch(imported.code, /arcade play music /);
    const run = await runProgram(imported.code, {frames: 160, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
        const used = projectOpcodes(run.creator.project);
        assert.ok(used.has('arcade_play') && !used.has('arcade_playMusic'));
        assert.equal(String(variables(run).done), 'true');
        assert.deepEqual(notes(run.vm.runtime.bwArcadeMusicLog), notes(original.$sound));
        const again = new SB3Creator(); again.parse(run.creator.decompile());
        assert.deepEqual(again.warnings, []);
        assert.deepEqual(projectOpcodes(again.project), used);
        const out = exported(run.creator);
        assert.deepEqual(out.unsupported, []);
        for (const call of ['music.play(music.melodyPlayable(music.baDing), music.PlaybackMode.UntilDone)',
            'music.play(music.tonePlayable(262, 300), music.PlaybackMode.InBackground)',
            'music.play(music.stringPlayable("C D E F", 240), music.PlaybackMode.UntilDone)'])
            assert.ok(out.ts.includes(call), call);
        assert.ok(!/playSoundEffect/.test(out.ts), 'music.play of an effect stays music.play');
        const fromExport = await runPxtArcade(out.files, {waitForGlobals: {done: true}, recordSound: true});
        assert.deepEqual(notes(fromExport.$sound), notes(original.$sound), 'the export plays what the source plays');
        const reimported = arcadeToPseudocode(out.ts);
        assert.deepEqual(reimported.unsupported, []);
        const playLines = code => code.split('\n').filter(line => /arcade play /.test(line));
        assert.equal(playLines(imported.code).length, 4);
        assert.deepEqual(playLines(reimported.code), playLines(imported.code), 'import -> export -> import is exact');
    } finally { clearStrayTimers(); }
});

test('the other MakeCode play calls still import as their own blocks and export unchanged', async () => {
    const source = `let done = false
music.playSoundEffect(music.createSoundEffect(WaveShape.Square, 400, 600, 255, 0, 200, SoundExpressionEffect.Vibrato, InterpolationCurve.Linear), SoundExpressionPlayMode.UntilDone)
music.bigCrash.playUntilDone()
music.playSound(music.sounds(Sounds.JumpUp))
music.stopAllSounds()
done = true
done = true`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 90, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        const used = projectOpcodes(run.creator.project);
        for (const op of ['arcade_playSoundEffect', 'arcade_playMelody', 'arcade_playSound']) assert.ok(used.has(op), op);
        assert.ok(!used.has('arcade_play'));
        const out = exported(run.creator);
        for (const call of ['music.playSoundEffect(', 'music.bigCrash.playUntilDone()', 'music.playSound(music.sounds(Sounds.JumpUp))']) assert.ok(out.ts.includes(call), call);
        const original = await runPxtArcade(source, {waitForGlobals: {done: true}, recordSound: true});
        const fromExport = await runPxtArcade(out.files, {waitForGlobals: {done: true}, recordSound: true});
        assert.deepEqual(notes(fromExport.$sound), notes(original.$sound));
    } finally { clearStrayTimers(); }
});

test('a saved project with playMusic loads, plays and exports music.play unchanged', async () => {
    const creator = renamed(playProgram(`arcade play playable (${TONE}) mode InBackground`), 'arcade_play', 'arcade_playMusic');
    assert.ok(projectOpcodes(creator.project).has('arcade_playMusic'));
    const run = await runCreatedProgram(creator, {frames: 12});
    try {
        assert.deepEqual(run.errors, []);
        assert.equal(notes(run.vm.runtime.bwArcadeMusicLog).length, 1);
        assert.ok(exported(creator).ts.includes('music.play(music.tonePlayable(262, 400), music.PlaybackMode.InBackground)'));
    } finally { clearStrayTimers(); }
});
