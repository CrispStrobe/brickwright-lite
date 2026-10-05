import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass, probeExtension} from './helpers/bw-extensions.mjs';
import {VM, SB3Creator} from './helpers/bw-vm.mjs';
import {pixelsToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';

const Arcade = loadExtensionClass('arcade');
const runtime = () => {
    const out = new EventEmitter();
    out.startHats = () => [];
    out.requestRedraw = () => {};
    out.getSpriteTargetByName = () => null;
    return out;
};

// A legacy overlap hat exists only when its script is registered. The VM
// dispatches that exact script with event handles through _pushThread.
const legacyOverlap = (rt, pushed, includeCreated = false) => {
    const target = {blocks: {getBlock: () => ({fields: {A: {value: 'Player'}, B: {value: 'Enemy'}}})}};
    rt.allScriptsByOpcodeDo = (opcode, visit) => {
        if (opcode === 'arcade_whenSpritesOverlap') visit({blockId: 'overlap'}, target);
        if (includeCreated && opcode === 'arcade_whenSpriteCreated') visit({blockId: 'created'}, target);
    };
    rt._pushThread = blockId => {const thread = {}; pushed(thread, blockId); return thread;};
};
let originalMotion;
const motionOracle = () => originalMotion ||= runPxtArcade(`
let artwork=image.create(16,16)
artwork.fill(2)
let moving=sprites.create(artwork,SpriteKind.Player)
moving.setPosition(80,60)
moving.vx=30
game.currentScene().physicsEngine.move(1/30)
let frameX=moving.x
let bouncing=sprites.create(artwork,SpriteKind.Player)
bouncing.setPosition(151,9)
bouncing.setBounceOnWall(true)
bouncing.vx=60
bouncing.vy=-60
game.currentScene().physicsEngine.move(1/30)
let firstX=bouncing.x
let firstY=bouncing.y
let firstVx=bouncing.vx
let firstVy=bouncing.vy
game.currentScene().physicsEngine.move(1/30)
let secondX=bouncing.x
let secondY=bouncing.y
let secondVx=bouncing.vx
let secondVy=bouncing.vy
`);

test('Arcade handle blocks are defined and implemented for the GUI and VM', () => {
    const p = probeExtension(Arcade, runtime());
    assert.equal(p.error, null);
    for (const opcode of ['spawnSprite', 'destroySprite', 'setSpriteProperty', 'spriteProperty',
        'setSpriteKind', 'setSpriteBounceOnWall', 'setSpriteGhostThroughSprites',
        'spriteOverlaps', 'spriteCount', 'whenSpriteCreated', 'whenSpritesOverlap',
        'eventSprite']) {
        assert.ok(p.opcodes.has(opcode), `${opcode} absent from palette`);
        assert.ok(p.methods.has(opcode), `${opcode} has no implementation`);
    }
});

test('Arcade sprite handles preserve identity, kinds, AABB overlap, and physics across frames', async () => {
    const rt = runtime();
    const ext = new Arcade(rt);
    const first = ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 80, Y: 60, WIDTH: 16, HEIGHT: 16});
    const second = ext.spawnSprite({TEMPLATE: 'enemy', KIND: 'Enemy', X: 95, Y: 60, WIDTH: 16, HEIGHT: 16});
    assert.notEqual(first, second);
    assert.equal(ext.spriteCount({KIND: 'Player'}), 1);
    assert.equal(ext.spriteOverlaps({A: first, B: second}), true, '16px boxes overlap at 15px separation');
    ext.setSpriteProperty({ID: second, PROPERTY: 'x', VALUE: 97});
    assert.equal(ext.spriteOverlaps({A: first, B: second}), false);
    ext.setSpriteProperty({ID: first, PROPERTY: 'vx', VALUE: 30});
    rt.emit('ARCADE_FRAME');
    assert.equal(ext.spriteProperty({ID: first, PROPERTY: 'x'}), (await motionOracle()).frameX);
    ext.setSpriteKind({ID: first, KIND: 'Friend'});
    assert.equal(ext.spriteCount({KIND: 'Player'}), 0);
    assert.equal(ext.spriteCount({KIND: 'Friend'}), 1);
    ext.destroySprite({ID: first});
    assert.equal(ext.spriteCount({KIND: 'Friend'}), 0);
});

test('changing a pixel-art costume updates the handle bounds used by overlap', () => {
    const rt = runtime();
    const costume = image => ({dataFormat: 'svg', rotationCenterX: image.width * 2,
        rotationCenterY: image.height * 2, asset: {data: new TextEncoder().encode(pixelsToSvg(image))}});
    const costumes = [costume(parseImageLiteral('1 1\n1 1')),
        costume(parseImageLiteral('2 2 2\n2 2 2'))];
    const clone = {currentCostume: 0, setCostume(index) { this.currentCostume = index; },
        getCostumes: () => costumes, setVisible() {}, setXY() {}};
    rt.getSpriteTargetByName = () => ({makeClone: () => clone});
    rt.addTarget = () => {};
    const ext = new Arcade(rt);
    const hero = ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 80, Y: 60, WIDTH: 2, HEIGHT: 2});
    const foe = ext.spawnSprite({TEMPLATE: 'foe', KIND: 'Enemy', X: 82, Y: 60, WIDTH: 2, HEIGHT: 2});
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), false);
    ext.setSpriteCostume({ID: hero, COSTUME: 1});
    assert.equal(ext.spriteProperty({ID: hero, PROPERTY: 'width'}), 3);
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), true);
});

test('Arcade overlaps require opaque pixels from both costumes', () => {
    const rt = runtime();
    const events = [];
    legacyOverlap(rt, thread => events.push(thread));
    const costume = source => {
        const image = parseImageLiteral(source);
        return {dataFormat: 'svg', rotationCenterX: image.width * 2,
            rotationCenterY: image.height * 2, asset: {data: new TextEncoder().encode(pixelsToSvg(image))}};
    };
    const template = costumes => ({makeClone: () => ({currentCostume: 0,
        setCostume(index) { this.currentCostume = index; }, getCostumes: () => costumes,
        setVisible() {}, setXY() {}})});
    const templates = {hero: template([costume('1 .\n. .')]),
        foe: template([costume('. 2\n. .'), costume('1 .\n. .')])};
    rt.getSpriteTargetByName = name => templates[name];
    rt.addTarget = () => {};
    const ext = new Arcade(rt);
    const hero = ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 80, Y: 60, WIDTH: 2, HEIGHT: 2});
    const foe = ext.spawnSprite({TEMPLATE: 'foe', KIND: 'Enemy', X: 80, Y: 60, WIDTH: 2, HEIGHT: 2});
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), false);
    rt.emit('ARCADE_FRAME');
    assert.equal(events.length, 0);
    ext.setSpriteCostume({ID: foe, COSTUME: 1});
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), true);
    rt.emit('ARCADE_FRAME');
    assert.ok(events.length > 0);
});

test('Arcade bounce reverses only velocity directed through a screen edge', async () => {
    const rt = runtime();
    const ext = new Arcade(rt);
    const id = ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 151, Y: 9, WIDTH: 16, HEIGHT: 16});
    ext.setSpriteBounceOnWall({ID: id, ON: 1});
    ext.setSpriteProperty({ID: id, PROPERTY: 'vx', VALUE: 60});
    ext.setSpriteProperty({ID: id, PROPERTY: 'vy', VALUE: -60});
    rt.emit('ARCADE_FRAME');
    const sprite = rt.bwArcadeDeviceState.sprites[id];
    const expected = await motionOracle();
    assert.equal(sprite.x, expected.firstX);
    assert.equal(sprite.y, expected.firstY);
    assert.equal(sprite.vx, expected.firstVx);
    assert.equal(sprite.vy, expected.firstVy);
    rt.emit('ARCADE_FRAME');
    assert.equal(sprite.x, expected.secondX);
    assert.equal(sprite.y, expected.secondY);
    assert.equal(sprite.vx, expected.secondVx);
    assert.equal(sprite.vy, expected.secondVy);
    ext.setSpriteBounceOnWall({ID: id, ON: 0});
    ext.setSpriteProperty({ID: id, PROPERTY: 'vx', VALUE: 60});
    rt.emit('ARCADE_FRAME');
    rt.emit('ARCADE_FRAME');
    assert.ok(sprite.x > 152);
});

test('GhostThroughSprites blocks reporters and overlap hats until disabled', () => {
    const rt = runtime();
    const events = [];
    legacyOverlap(rt, thread => events.push(thread));
    const ext = new Arcade(rt);
    const hero = ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 80, Y: 60, WIDTH: 2, HEIGHT: 2});
    const foe = ext.spawnSprite({TEMPLATE: 'foe', KIND: 'Enemy', X: 80, Y: 60, WIDTH: 2, HEIGHT: 2});
    ext.setSpriteGhostThroughSprites({ID: hero, ON: 1});
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), false);
    rt.emit('ARCADE_FRAME');
    assert.equal(events.length, 0);
    ext.setSpriteGhostThroughSprites({ID: hero, ON: 0});
    assert.equal(ext.spriteOverlaps({A: hero, B: foe}), true);
    rt.emit('ARCADE_FRAME');
    assert.ok(events.length > 0);
});

test('Arcade state resets when another project loads or the green flag restarts it', () => {
    const rt = runtime();
    const ext = new Arcade(rt);
    ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 80, Y: 60, WIDTH: 16, HEIGHT: 16});
    assert.equal(ext.spriteCount({KIND: 'Player'}), 1);
    rt.emit('PROJECT_LOADED');
    assert.equal(ext.spriteCount({KIND: 'Player'}), 0);
    ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 80, Y: 60, WIDTH: 16, HEIGHT: 16});
    rt.emit('PROJECT_START');
    assert.equal(ext.spriteCount({KIND: 'Player'}), 0);
    assert.equal(rt.bwArcadeDeviceState.nextSpriteId, 0);
});

test('Arcade sprite creation and overlap start kind-filtered hats with event handles', () => {
    const rt = runtime();
    const calls = [];
    rt.startHats = (opcode, fields) => {
        const thread = {};
        calls.push({opcode, fields, thread});
        return [thread];
    };
    legacyOverlap(rt, (thread, blockId) => calls.push({opcode: blockId === 'created' ? 'arcade_whenSpriteCreated' : 'arcade_whenSpritesOverlap', thread}), true);
    const ext = new Arcade(rt);
    const a = ext.spawnSprite({TEMPLATE: 'a', KIND: 'Player', X: 80, Y: 60, WIDTH: 16, HEIGHT: 16});
    const b = ext.spawnSprite({TEMPLATE: 'b', KIND: 'Enemy', X: 84, Y: 60, WIDTH: 16, HEIGHT: 16});
    assert.equal(calls[0].opcode, 'arcade_whenSpriteCreated');
    assert.equal(ext.eventSprite({WHICH: 'first'}, {thread: calls[0].thread}), a);
    rt.emit('ARCADE_FRAME');
    const hit = calls.find(x => x.opcode === 'arcade_whenSpritesOverlap' &&
        ext.eventSprite({WHICH: 'first'}, {thread: x.thread}) === a);
    assert.ok(hit);
    assert.equal(ext.eventSprite({WHICH: 'first'}, {thread: hit.thread}), a);
    assert.equal(ext.eventSprite({WHICH: 'second'}, {thread: hit.thread}), b);
    assert.equal(ext.whenSpriteCreated({KIND: 'Enemy'}, {thread: calls[1].thread}), true);
    assert.equal(ext.whenSpriteCreated({KIND: 'Player'}, {thread: calls[1].thread}), false);
    assert.equal(ext.whenSpritesOverlap({A: 'Player', B: 'Enemy'}, {thread: hit.thread}), true);
    assert.equal(ext.whenSpritesOverlap({A: 'Enemy', B: 'Player'}, {thread: hit.thread}), false);
});

test('a real VM frame advances a handle and spawning clones its visible template', async () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nSPRITE hero:\nWHEN flag clicked:\n  hide\n');
    const vm = new VM();
    try {
        await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        const ext = new Arcade(vm.runtime);
        const before = vm.runtime.targets.length;
        const id = ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 80, Y: 60, WIDTH: 16, HEIGHT: 16});
        assert.equal(vm.runtime.targets.length, before + 1);
        assert.equal(vm.runtime.bwArcadeDeviceState.spriteTargets[id].x, 0);
        ext.setSpriteProperty({ID: id, PROPERTY: 'vx', VALUE: 30});
        vm.runtime._step();
        const expected = await motionOracle();
        assert.equal(ext.spriteProperty({ID: id, PROPERTY: 'x'}), expected.frameX);
        // Arcade drawing floors the left edge to the screen pixel grid.
        assert.equal(vm.runtime.bwArcadeDeviceState.spriteTargets[id].x, (Math.floor(expected.frameX - 8) + 8 - 80) * 3);
    } finally { vm.quit(); }
});
