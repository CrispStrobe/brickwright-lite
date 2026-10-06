import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes, runProgram} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';

test('a pinned speech sequence keeps each persistent sayText bubble', () => {
    const source = readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-say-text.ts'), 'utf8');
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    for (const message of ['My name and grade', 'Fact #1', 'Fact #2', 'Fact #3', 'Goodbye!']) {
        assert.ok(translated.code.includes(`text "${message}"`));
    }
    const creator = new SB3Creator();
    creator.parse(translated.code);
    assert.deepEqual(creator.warnings, []);
    assert.ok(projectOpcodes(creator.project).has('arcade_spriteSay'));
    assert.ok(projectOpcodes(creator.project).has('arcade_setBackgroundColor'));
});

test('timed sayText uses a nonblocking Arcade speech command', async () => {
    const result = arcadeToPseudocode('let hero = sprites.create(img`1`, SpriteKind.Player)\nhero.sayText("Hi", 500)');
    assert.deepEqual(result.unsupported, []);
    assert.match(result.code, /arcade say hero text "Hi" for 500 ms/);
    const run = await runProgram(result.code, {frames: 2, uploads: result.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    assert.equal(Object.values(run.vm.runtime.bwArcadeDeviceState.speech)[0].text, 'Hi');
    for (let i = 0; i < 16; i++) run.vm.runtime._step();
    assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.speech, {});
});

test('sprite-handle speech survives blocks, SB3, MakeCode compile and reimport without waiting', async () => {
    const source = `let animated = true
function greet(sprite: Sprite) { sprite.sayText("Animated", 900, animated, 2, 9) }
let hero = sprites.create(img\`1\`, SpriteKind.Player)
let other = sprites.create(img\`2\`, SpriteKind.Enemy)
greet(hero)
other.say("Legacy", 500, 5, 8)
let completed = 1`;
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    assert.equal(Number(Object.values(run.vm.runtime.getTargetForStage().variables)
        .find(variable => variable.name === 'completed').value), 1);
    const messages = Object.values(run.vm.runtime.bwArcadeDeviceState.speech);
    assert.deepEqual(messages.map(s => s.animated), [true, false]);
    assert.deepEqual(messages.map(s => [s.text, s.mode, s.duration, s.foreground, s.background]),
        [['Animated', 'text', 900, 2, 9], ['Legacy', 'legacy', 500, 5, 8]]);
    const text = run.creator.decompile();
    const again = new SB3Creator(); again.parse(text);
    assert.deepEqual(again.warnings, []);
    assert.ok(projectOpcodes(again.project).has('arcade_spriteSay'));
    const out = projectToArcade(run.creator.project, {costumeSvg: (target, costume) =>
        run.creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(out.unsupported, []);
    const compiled = await compile('arcade', out.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const reimported = arcadeToPseudocode(out.files);
    assert.deepEqual(reimported.unsupported, []);
    const rerun = await runProgram(reimported.code, {frames: 2, uploads: reimported.costumes, storage: true});
    assert.deepEqual(rerun.errors, []);
    assert.deepEqual(Object.values(rerun.vm.runtime.bwArcadeDeviceState.speech).map(s =>
        [s.text, s.mode, s.duration, s.foreground, s.background]),
        messages.map(s => [s.text, s.mode, s.duration, s.foreground, s.background]));
});

test('speech replacement, clearing, zero duration and destruction own their lifetime', () => {
    const Arcade = loadExtensionClass('arcade');
    const ext = new Arcade({on() {}, emit() {}});
    const id = ext.spawnSprite({KIND: 'Player', X: 80, Y: 60, WIDTH: 1, HEIGHT: 1});
    const speak = args => ext.spriteSay({ID: id, TEXT: 'Hello', DURATION: -1, ANIMATED: false,
        FOREGROUND: 15, BACKGROUND: 1, MODE: 'text', ...args});
    assert.equal(speak({DURATION: 100}), undefined);
    ext._advance(0.05);
    speak({TEXT: 'Persistent'});
    ext._advance(1);
    assert.equal(ext._state().speech[id].text, 'Persistent');
    speak({TEXT: ''});
    assert.deepEqual(ext._state().speech, {});
    speak({DURATION: 0}); ext._advance(1 / 30);
    assert.deepEqual(ext._state().speech, {});
    speak({}); ext.destroySprite({ID: id});
    assert.deepEqual(ext._state().speech, {});
});

test('speech literals keep quotes, field labels, newlines and numeric-looking text across Code and export', async () => {
    const message = '00123 "quoted" text for 7 ms animated 1 text color 2 box color 3 mode "legacy"\nNext line';
    const imported = arcadeToPseudocode(`let hero = sprites.create(img\`1\`, SpriteKind.Player)\n` +
        `hero.sayText(${JSON.stringify(message)}, 500, false, 2, 9)`);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.creator.warnings, []);
    assert.deepEqual(run.errors, []);
    assert.equal(Object.values(run.vm.runtime.bwArcadeDeviceState.speech)[0].text, message);
    const again = new SB3Creator(); again.parse(run.creator.decompile());
    const speech = again.project.targets.flatMap(t => Object.values(t.blocks)).find(b => b.opcode === 'arcade_spriteSay');
    assert.equal(speech.inputs.TEXT[1][1], message);
    const out = projectToArcade(run.creator.project, {costumeSvg: (_, costume) => run.creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(out.unsupported, []);
    assert.ok(out.ts.includes(JSON.stringify(message)));
    const reimported = arcadeToPseudocode(out.files);
    const reloaded = await runProgram(reimported.code, {frames: 2, uploads: reimported.costumes, storage: true});
    assert.equal(Object.values(reloaded.vm.runtime.bwArcadeDeviceState.speech)[0].text, message);
});

test('authored self speech and reporter animation export to valid PXT without numeric coercion of text', async () => {
    const creator = new SB3Creator();
    creator.parse(`DEVICE ARCADE
SPRITE hero:
WHEN flag clicked:
  arcade say "self" text "00123" for -1 ms animated (1 = 1) text color 2 box color 9 mode "text"
`);
    creator.applyCustomSVG('hero', arcadeToPseudocode('let art = sprites.create(img`1`, SpriteKind.Player)').costumes[0].svg);
    assert.deepEqual(creator.warnings, []);
    const out = projectToArcade(creator.project, {costumeSvg: (_, costume) => creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(out.unsupported, []);
    // (the export names a sprite `<name>Sprite`, A4's rule)
    // (`1 = 1` of two literals is the constant it is: `0 == 1` does not compile)
    assert.match(out.ts, /heroSprite\.sayText\("00123", -1, true, 2, 9\)/);
    const compiled = await compile('arcade', out.files);
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
});

test('the pinned hat overlap game speaks from the colliding handle while its script host stays hidden', async () => {
    const imported = arcadeToPseudocode(readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-hat-speech.ts'), 'utf8'));
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 2, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.targets.find(target => target.getName() === 'Game').visible, false);
    const state = run.vm.runtime.bwArcadeDeviceState;
    for (const sprite of Object.values(state.sprites)) {
        run.vm.runtime._primitives.arcade_setSpriteProperty({ID: sprite.id, PROPERTY: 'x', VALUE: 80}, {});
        run.vm.runtime._primitives.arcade_setSpriteProperty({ID: sprite.id, PROPERTY: 'y', VALUE: 60}, {});
    }
    run.vm.runtime._step();
    const player = Object.values(state.sprites).find(sprite => sprite.kind === 'Player');
    assert.equal(state.speech[player.id].text, 'Excuse Me!');
    assert.equal(state.speech[player.id].duration, 500);
    assert.equal(state.speech[player.id].animated, false);
    run.vm.greenFlag();
    assert.deepEqual(state.speech, {});
});

test('a sprite whose package artwork is absent cannot be reported as translated', () => {
    const source = 'let hero = sprites.create(lab2imgs.crystal_ball, SpriteKind.Player)';
    const result = arcadeToPseudocode(source);
    assert.ok(result.unsupported.some(gap => gap.includes('lab2imgs.crystal_ball') &&
        gap.includes('artwork is unavailable')));
});

test('pinned food and castle sprites retain their built-in artwork', () => {
    const source = `let snack = sprites.create(sprites.food.smallTaco, SpriteKind.Food)
let hero = sprites.create(sprites.castle.heroWalkFront1, SpriteKind.Player)`;
    const result = arcadeToPseudocode(source);
    assert.deepEqual(result.unsupported, []);
    // Each built-in image arrives once as an image resource (its own costume,
    // the artwork) that the sprite is created from; the template's costume is
    // a placeholder.
    const art = result.costumes.filter(costume => /^__arcadeBackground/.test(costume.sprite));
    assert.equal(art.length, 2);
    assert.ok(result.costumes.every(costume => costume.svg.includes('<svg')));
    assert.ok(art.every(costume => costume.svg.length > 1000), 'the built-in artwork, not a placeholder');
    assert.match(result.code, /set snack to \(arcade create image \(arcade frame image array "__arcadeBackground1Image"/);
    assert.match(result.code, /set hero to \(arcade create image \(arcade frame image array "__arcadeBackground2Image"/);
});
