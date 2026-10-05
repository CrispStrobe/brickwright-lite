import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {loadExtensionClass, probeExtension} from './helpers/bw-extensions.mjs';
import {SB3Creator, runProgram} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
import {compile} from '../scripts/lib/pxt-node.mjs';
const Arcade = loadExtensionClass('arcade');
function setup () {
    const rt = new EventEmitter(); rt.startHats = () => []; rt.requestRedraw = () => {};
    rt.getSpriteTargetByName = () => null;
    return {rt, ext: new Arcade(rt)};
}
const spawn = ext => ext.spawnSprite({TEMPLATE: '', KIND: 'Player', X: 80, Y: 60, WIDTH: 2, HEIGHT: 2});

test('sprite flag command is available in the Blocks palette and VM', () => {
    const {rt} = setup(); const probe = probeExtension(Arcade, rt);
    assert.equal(probe.error, null);
    assert.ok(probe.opcodes.has('setSpriteFlag')); assert.ok(probe.methods.has('setSpriteFlag'));
});

test('Ghost is a composite mask and Invisible changes rendering without disabling overlaps', () => {
    const {rt, ext} = setup(); const hero = spawn(ext), foe = spawn(ext);
    const sprite = rt.bwArcadeDeviceState.sprites[hero];
    ext.setSpriteFlag({ID: hero, FLAG: 'Ghost', ON: 1});
    assert.equal(sprite.flags, 7168);
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), false);
    ext.setSpriteGhostThroughSprites({ID: hero, ON: 0});
    assert.equal(sprite.flags, 3072);
    assert.equal(sprite.ghostThroughWalls, true); assert.equal(sprite.ghostThroughTiles, true);
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), true);
    ext.setSpriteFlag({ID: hero, FLAG: 'Ghost', ON: 0});
    const target = {visible: true, setVisible(value) { this.visible = value; }};
    rt.bwArcadeDeviceState.spriteTargets[hero] = target;
    ext.setSpriteFlag({ID: hero, FLAG: 'Invisible', ON: 1});
    assert.equal(target.visible, false); assert.equal(sprite.flags, 128);
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), true);
    ext.setSpriteFlag({ID: hero, FLAG: 'Invisible', ON: 'false'});
    assert.equal(target.visible, true); assert.equal(sprite.flags, 0);
});

test('projectile default AutoDestroy survives changes to other flags', () => {
    const {rt, ext} = setup();
    const id = ext.spawnProjectile({TEMPLATE: '', KIND: 'Projectile', MODE: 'side', VX: 30, VY: 0, WIDTH: 1, HEIGHT: 1});
    ext.setSpriteFlag({ID: id, FLAG: 'Invisible', ON: 1});
    assert.equal(rt.bwArcadeDeviceState.sprites[id].flags, 132);
    assert.equal(rt.bwArcadeDeviceState.sprites[id].autoDestroy, true);
    ext.setSpriteAutoDestroy({ID: id, ON: 'false'});
    assert.equal(rt.bwArcadeDeviceState.sprites[id].flags, 128);
    assert.equal(rt.bwArcadeDeviceState.sprites[id].autoDestroy, false);
});

test('flag literals and computed Booleans survive Code, Blocks, MakeCode compile and reimport', async () => {
    const source = `let enabled = 1
function hide(sprite: Sprite) { sprite.setFlag(SpriteFlag.Invisible, enabled == 1) }
let hero = sprites.create(img\`1\`, SpriteKind.Player)
let foe = sprites.create(img\`2\`, SpriteKind.Enemy)
hero.setFlag(SpriteFlag.Ghost, true)
hero.setFlag(SpriteFlag.GhostThroughTiles, false)
hero.setFlag(SpriteFlag.StayInScreen, true)
hide(hero)
hide(foe)`;
    const imported = arcadeToPseudocode(source); assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 5, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
    const state = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
    assert.equal(state.find(s => s.kind === 'Player').flags, 6280);
    assert.equal(state.find(s => s.kind === 'Enemy').flags, 128);
    const recreated = new SB3Creator(); recreated.parse(run.creator.decompile());
    assert.deepEqual(recreated.warnings, []);
});

test('controller-local sprite handles remain independent and can flow into flag procedures', async () => {
    const source = `function hide(sprite: Sprite) { sprite.setFlag(SpriteFlag.Invisible, true) }
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    let hero = sprites.create(img\`1\`, SpriteKind.Player)
    hero.setFlag(SpriteFlag.Ghost, true)
    hide(hero)
})`;
    const result = arcadeToPseudocode(source); assert.deepEqual(result.unsupported, []);
    const run = await runProgram(result.code, {frames: 4, uploads: result.costumes, storage: true});
    for (let n = 0; n < 2; n++) {
        run.vm.postIOData('keyboard', {key: ' ', isDown: true});
        for (let i = 0; i < 4; i++) run.vm.runtime._step();
        run.vm.postIOData('keyboard', {key: ' ', isDown: false});
    }
    assert.deepEqual(run.creator.warnings, []); assert.deepEqual(run.errors, []);
    const sprites = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
    assert.equal(sprites.length, 2); assert.notEqual(sprites[0].id, sprites[1].id);
    assert.ok(sprites.every(s => s.flags === 7296));
});

test('Boolean assignments toggle flags repeatedly and survive native SB3 serialization', async () => {
    const result = arcadeToPseudocode(`let hidden = false
let hat = sprites.create(img\`1\`, SpriteKind.Player)
controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    hidden = !hidden
    hat.setFlag(SpriteFlag.Invisible, hidden)
})`);
    assert.deepEqual(result.unsupported, []);
    const run = await runProgram(result.code, {frames: 4, uploads: result.costumes, storage: true});
    for (const expected of [true, false, true]) {
        run.vm.postIOData('keyboard', {key: 'z', isDown: true});
        for (let i = 0; i < 4; i++) run.vm.runtime._step();
        run.vm.postIOData('keyboard', {key: 'z', isDown: false});
        assert.equal(Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].invisible, expected);
    }
    assert.deepEqual(run.creator.warnings, []);
    const native = JSON.parse(run.vm.toJSON());
    const flags = native.targets.flatMap(target => Object.values(target.blocks || {}))
        .filter(block => block.opcode === 'arcade_setSpriteFlag');
    assert.equal(flags.length, 1); assert.equal(flags[0].fields.FLAG[0], 'Invisible');
    const roundtrip = new SB3Creator(); roundtrip.parse(run.creator.decompile(native));
    assert.deepEqual(roundtrip.warnings, []);
});

test('pinned firework source retains local creation, Ghost, and sprite image mutation', async () => {
    const source = readFileSync(new URL('./fixtures/makecode/arcade-firework-flags.ts', import.meta.url), 'utf8');
    const result = arcadeToPseudocode(source);
    assert.deepEqual(result.unsupported, []);
    const compiled = await compile('arcade', {'main.ts': source, 'pxt.json': JSON.stringify({name: 'firework', dependencies: {device: '*'}, files: ['main.ts']})});
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    const run = await runProgram(result.code, {frames: 4, keys: [' '], uploads: result.costumes, storage: true});
    assert.deepEqual(run.creator.warnings, []); assert.deepEqual(run.errors, []);
    const firework = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];
    assert.equal(firework.kind, 'Firework'); assert.equal(firework.flags, 7172);
    assert.equal(firework.vy, -15);
});

test('unknown flags remain explicit gaps in import and authored Code', () => {
    const result = arcadeToPseudocode('let hero = sprites.create(img`1`, SpriteKind.Player)\nhero.setFlag(SpriteFlag.ShowPhysics, true)');
    assert.ok(result.unsupported.some(gap => gap.includes('setFlag')));
    // E0: the dialect refuses an unknown flag by name rather than warning.
    assert.throws(() => new SB3Creator().parse('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  arcade set flag ShowPhysics of 1 to 1'),
        error => error.code === 'DIALECT_UNPARSED_LINES' && error.lines[0].text === 'arcade set flag ShowPhysics of 1 to 1');
});
