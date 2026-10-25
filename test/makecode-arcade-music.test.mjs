import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, clearStrayTimers, projectOpcodes} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade = loadExtensionClass('arcade');

const variables = run => run.vm.runtime.targets.flatMap(target => Object.values(target.variables));
const valueOf = (run, name) => variables(run).find(variable => variable.name === name)?.value;
const notes = log => log.map(entry => entry.bytes);

test('generated music runtime matches the pinned PXT sources', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-music.mjs', '--check'], {stdio: 'pipe'});
});

// Melody, tone, sound effect, volume and string melody, all until done.
const SEQUENCE = `let done = false
music.play(music.melodyPlayable(music.baDing), music.PlaybackMode.UntilDone)
music.playTone(Note.C, music.beat(BeatFraction.Half))
music.playSoundEffect(music.createSoundEffect(WaveShape.Square, 400, 600, 255, 0, 500, SoundExpressionEffect.Vibrato, InterpolationCurve.Linear), SoundExpressionPlayMode.UntilDone)
music.setVolume(100)
music.play(music.stringPlayable("C D E F", 240), music.PlaybackMode.UntilDone)
done = true
done = true`;

test('queued play instructions equal the original mixer byte for byte', async () => {
    const original = await runPxtArcade(SEQUENCE, {waitForGlobals: {done: true}, recordSound: true});
    assert.equal(original.$sound.length, 8);
    const imported = arcadeToPseudocode(SEQUENCE);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 120, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.equal(String(valueOf(run, 'done')), 'true');
        const log = run.vm.runtime.bwArcadeMusicLog;
        assert.deepEqual(notes(log), notes(original.$sound));
        // The string melody's notes start 248 ms apart in both; native start
        // times follow 30 fps frames, so a start may differ by one frame.
        const starts = entries => entries.slice(4).map(entry => entry.time + entry.delay);
        const gaps = entries => starts(entries).slice(1).map((start, i) => start - starts(entries)[i]);
        for (const [mine, theirs] of gaps(log).map((gap, i) => [gap, gaps(original.$sound)[i]]))
            assert.ok(Math.abs(mine - theirs) <= 1000 / 30 + 1, `${mine} vs ${theirs}`);
    } finally { clearStrayTimers(); }
});

test('until-done calls block their script and background calls do not', async () => {
    const source = `let afterTone = 0
let afterBackground = 0
music.play(music.tonePlayable(262, 900), music.PlaybackMode.InBackground)
afterBackground = 1
music.playTone(330, 600)
afterTone = 1`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 6, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.equal(Number(valueOf(run, 'afterBackground')), 1);
        assert.equal(Number(valueOf(run, 'afterTone')), 0, 'the 600 ms tone has not finished after 6 frames');
        await stepFrames(run.vm, 24);
        assert.equal(Number(valueOf(run, 'afterTone')), 1);
        const log = run.vm.runtime.bwArcadeMusicLog;
        assert.deepEqual(log.map(entry => entry.bytes[2] | (entry.bytes[3] << 8)), [262, 330]);
    } finally { clearStrayTimers(); }
});

test('stopping the project ends paused music calls', async () => {
    // PXT plays tones over 2000 ms in the background, so this rest blocks for 1.5 s.
    const imported = arcadeToPseudocode('let after = 0\nmusic.rest(1500)\nafter = 1');
    const run = await runProgram(imported.code, {frames: 4, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        run.vm.stopAll();
        await stepFrames(run.vm, 2);
        assert.equal(Number(valueOf(run, 'after')), 0);
        run.vm.greenFlag();
        await stepFrames(run.vm, 4);
        assert.deepEqual(run.errors, []);
    } finally { clearStrayTimers(); }
});

const EDITED = `let done = false
music.play(music.melodyPlayable(music.baDing), music.PlaybackMode.UntilDone)
music.playSound(music.sounds(Sounds.JumpUp))
music.bigCrash.playUntilDone()
music.playTone(Note.A, music.beat(BeatFraction.Quarter))
music.ringTone(440)
music.rest(100)
music.setTempo(music.tempo() + 10)
music.changeTempoBy(-5)
music.setVolume(music.volume())
music.play(music.tonePlayable(330, 200), music.PlaybackMode.InBackground)
music.stopAllSounds()
done = true
done = true`;

test('music is editable through Code and Blocks, saved SB3 and original MakeCode export', async () => {
    const imported = arcadeToPseudocode(EDITED);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 4, storage: true, uploads: imported.costumes});
    try {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        const opcodes = projectOpcodes(run.creator.project);
        for (const op of ['arcade_playMusic', 'arcade_melodyPlayable', 'arcade_namedMelody', 'arcade_playSound', 'arcade_soundMelody',
            'arcade_playMelody', 'arcade_playTone', 'arcade_beat', 'arcade_ringTone', 'arcade_rest', 'arcade_setTempo', 'arcade_musicTempo',
            'arcade_changeTempo', 'arcade_setMusicVolume', 'arcade_musicVolume', 'arcade_tonePlayable', 'arcade_stopAllSounds'])
            assert.ok(opcodes.has(op), op);
        const again = await runProgram(run.creator.decompile(), {frames: 4, storage: true, uploads: imported.costumes});
        assert.deepEqual(again.errors, []);
        assert.deepEqual(again.creator.warnings, []);
        const exported = projectToArcade(run.creator.project, {costumeSvg: (target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        for (const call of ['music.play(music.melodyPlayable(music.baDing), music.PlaybackMode.UntilDone)',
            'music.playSound(music.sounds(Sounds.JumpUp))', 'music.bigCrash.playUntilDone()', 'music.playTone(440, music.beat(BeatFraction.Quarter))',
            'music.ringTone(440)', 'music.rest(100)', 'music.changeTempoBy(', 'music.setVolume(music.volume())',
            'music.play(music.tonePlayable(330, 200), music.PlaybackMode.InBackground)', 'music.stopAllSounds()'])
            assert.ok(exported.ts.includes(call), call);
        assert.deepEqual(arcadeToPseudocode(exported.files).unsupported, []);
        const fromExport = await runPxtArcade(exported.files, {waitForGlobals: {done: true}, recordSound: true});
        const fromSource = await runPxtArcade(EDITED, {waitForGlobals: {done: true}, recordSound: true});
        assert.deepEqual(notes(fromExport.$sound), notes(fromSource.$sound), 'the export plays what the source plays');
        await run.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        run.vm.greenFlag();
        await stepFrames(run.vm, 4);
        assert.deepEqual(run.errors, []);
    } finally { clearStrayTimers(); }
});

test('music diagnostics stay explicit', () => {
    for (const source of ['let m = music.PlaybackMode.UntilDone\nmusic.play(music.tonePlayable(1, 2), m)',
        'let w = WaveShape.Sine\nlet e = music.createSoundEffect(w, 1, 2, 3, 4, 5, SoundExpressionEffect.None, InterpolationCurve.Linear)',
        'music.playTone(440)', 'let s = music.createSong(hex`00`)'])
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
    const runtime = new EventEmitter(), errors = [];
    runtime.startHats = () => [];
    runtime.on('BLOCKS_ERROR', message => errors.push(message));
    const native = new Arcade(runtime);
    native.playMusic({PLAYABLE: native.namedMelody({NAME: 'baDing'}), MODE: 'UntilDone'});
    native.playMelody({MELODY: 'not music', MODE: 'play'});
    native.soundEffect({WAVE: 'Organ', START_FREQUENCY: 1, END_FREQUENCY: 2, START_VOLUME: 3, END_VOLUME: 4, DURATION: 5, EFFECT: 'None', CURVE: 'Linear'});
    assert.deepEqual(errors, ['Arcade expected a playable sound.', 'Arcade expected a melody.', 'Arcade has no music option "Organ".']);
});
