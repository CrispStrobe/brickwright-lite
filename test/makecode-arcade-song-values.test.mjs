import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers, projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Authored version-zero song: one instrument, a two-note chord, then a note.
const u16 = n => [n & 255, n >> 8 & 255];
const instrument = [1, ...u16(10), ...u16(20), ...u16(512), ...u16(80), ...u16(1024),
    ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0), 0, ...u16(0), 0, ...u16(0), 4];
const events = [0, 0, 4, 0, 2, 24, 28, 8, 0, 12, 0, 1, 31];
const HEX = Buffer.from([0, ...u16(120), 4, 8, 1, 1, 0, 0, ...u16(instrument.length), ...instrument,
    ...u16(events.length), ...events]).toString('hex');
const source = `let done = false\nmusic.play(music.createSong(hex\`${HEX}\`), music.PlaybackMode.UntilDone)\ndone = true`;
const active = log => log.map(({bytes}) => {
    let end = 0;
    while (end < bytes.length && bytes[end]) {assert.ok(end + 12 <= bytes.length); end += 12;}
    assert.ok(bytes.slice(end).every(byte => byte === 0));
    return bytes.slice(0, end);
});
const value = (run, name) => run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .find(variable => variable.name === name)?.value;
const exportProject = run => projectToArcade(run.creator.project,
    {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});

test('song literals import into an ordinary reporter and play through the real VM', async () => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.ok(imported.code.includes(`arcade song playable hex "${HEX}"`));
    const run = await runProgram(imported.code, {frames: 4, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.creator.warnings, []);
        assert.deepEqual(run.errors, []);
        assert.ok(projectOpcodes(run.creator.project).has('arcade_songPlayable'));
        assert.equal(String(value(run, 'done')), 'false', 'until-done suspends the script');
        await stepFrames(run.vm, 80);
        assert.equal(String(value(run, 'done')), 'true');
        assert.equal(run.vm.runtime.bwArcadeMusicLog.length, 3);
    } finally {clearStrayTimers();}
});

test('literal export preserves exact bytes and runs in original MakeCode', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 84, storage: true});
    try {
        const exported = exportProject(run);
        assert.deepEqual(exported.unsupported, []);
        assert.ok(exported.ts.includes(`music.createSong(hex\`${HEX}\`)`));
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        const original = await runPxtArcade(exported.files, {waitForGlobals: {done: true}, recordSongSound: true, fakeClock: true});
        assert.equal(original.$sound.length, 3);
        assert.deepEqual(active(run.vm.runtime.bwArcadeMusicLog), active(original.$sound));
    } finally {clearStrayTimers();}
});

test('dynamic hex strings survive code/blocks conversion, export and actual SB3 save/reopen', async () => {
    const text = `let bytes = "${HEX}"\nlet done = false\nmusic.play(music.createSong(Buffer.fromHex(bytes)), music.PlaybackMode.UntilDone)\ndone = true`;
    const imported = arcadeToPseudocode(text);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 84, storage: true});
    try {
        assert.deepEqual(run.creator.warnings, []);
        assert.deepEqual(run.errors, []);
        const exported = exportProject(run);
        assert.deepEqual(exported.unsupported, []);
        assert.match(exported.ts, /music\.createSong\(Buffer\.fromHex\(bytes\)\)/);
        const original = await runPxtArcade(exported.files, {waitForGlobals: {done: true}, recordSongSound: true, fakeClock: true});
        assert.deepEqual(active(original.$sound), active(run.vm.runtime.bwArcadeMusicLog));
        const reimported = arcadeToPseudocode(exported.files);
        assert.deepEqual(reimported.unsupported, []);
        const second = await runProgram(reimported.code, {frames: 84, storage: true});
        assert.deepEqual(second.errors, []);
        assert.deepEqual(active(second.vm.runtime.bwArcadeMusicLog), active(run.vm.runtime.bwArcadeMusicLog));
        const archive = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        // A fresh prepared VM gets only the archive, not the original imported text.
        const fresh = await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n', {frames: 0, storage: true});
        await fresh.vm.loadProject(archive);
        fresh.vm.greenFlag();
        await stepFrames(fresh.vm, 84);
        assert.deepEqual(fresh.errors, []);
        assert.equal(String(value(fresh, 'done')), 'true');
        assert.equal(value(fresh, 'bytes'), HEX);
        assert.deepEqual(active(fresh.vm.runtime.bwArcadeMusicLog), active(run.vm.runtime.bwArcadeMusicLog));
    } finally {clearStrayTimers();}
});

test('malformed/unsupported song forms retain import and native runtime diagnostics', () => {
    for (const expression of ['music.createSong()', 'music.createSong(hex`00`)', 'music.createSong(hex`zz00780004080100`)',
        'music.createSong(hex`01780004080100`)', 'music.createSong(1)', 'music.createSong(Buffer.fromHex())'])
        assert.ok(arcadeToPseudocode(`let sound = ${expression}`).unsupported.length, expression);
    const Arcade = loadExtensionClass('arcade');
    const runtime = new EventEmitter(), errors = [];
    runtime.startHats = () => [];
    runtime.on('BLOCKS_ERROR', message => errors.push(message));
    const native = new Arcade(runtime);
    assert.ok(native.getInfo().blocks.some(block => block.opcode === 'songPlayable'));
    assert.equal(native.songPlayable({HEX: 'not-hex'}), '');
    assert.equal(native.songPlayable({HEX: '00000004080100'}), '');
    assert.equal(errors.length, 2);
    assert.ok(errors.every(message => /Invalid Arcade song/.test(message)));
});

test('editing a literal reporter changes bytes exported to MakeCode; malformed edits are refused', async () => {
    const imported = arcadeToPseudocode(source);
    const run = await runProgram(imported.code, {frames: 0, storage: true});
    try {
        const blocks = run.creator.project.targets.flatMap(target => Object.values(target.blocks));
        const reporter = blocks.find(block => block.opcode === 'arcade_songPlayable');
        assert.ok(reporter);
        const edited = HEX.slice(0, 2) + 'f000' + HEX.slice(6);
        reporter.inputs.HEX = [1, [10, edited]];
        const exported = exportProject(run);
        assert.deepEqual(exported.unsupported, []);
        assert.ok(exported.ts.includes(`hex\`${edited}\``));
        reporter.inputs.HEX = [1, [10, '00`);bad();']];
        assert.ok(exportProject(run).unsupported.length);
    } finally {clearStrayTimers();}
});
