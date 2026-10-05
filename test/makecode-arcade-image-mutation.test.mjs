import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {loadExtensionClass, probeExtension} from './helpers/bw-extensions.mjs';
import {runProgram, SB3Creator} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
const require = createRequire(import.meta.url);
const engine = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')([
    null, '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'], require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const Arcade = loadExtensionClass('arcade');
const exportProject = creator => projectToArcade(creator.project, {costumeSvg: (t, c) => creator.assets.get(c.assetId)?.data});

test('pixel operations handle odd dimensions, transparency, and replacement without changing size', () => {
    const image = {width: 3, height: 3, pixels: Uint8Array.from([0,1,2,3,4,5,6,7,8])};
    engine.mutate(image, 'flipX'); assert.deepEqual([...image.pixels], [2,1,0,5,4,3,8,7,6]);
    engine.mutate(image, 'flipY'); assert.deepEqual([...image.pixels], [8,7,6,5,4,3,2,1,0]);
    engine.mutate(image, 'replace', 0, 15); assert.equal(image.pixels[8], 15);
    const copy = engine.decode({asset: {data: engine.svg(image)}}, image);
    assert.deepEqual(copy, image);
    engine.mutate(image, 'fill', 0); assert.ok(image.pixels.every(p => p === 0));
    assert.equal(image.width, 3); assert.equal(image.height, 3);
});

test('VM mutations isolate clones, update transparent collisions, and release renderer skins', () => {
    const rt = new EventEmitter(); rt.startHats = () => []; rt.requestRedraw = () => {};
    const calls = []; let nextSkin = 100;
    rt.renderer = {createSVGSkin(svg, center) {calls.push(['create', svg, center]); return nextSkin++;},
        updateSVGSkin(...args) {calls.push(['update', ...args]);},
        updateDrawableSkinId(...args) {calls.push(['attach', ...args]);},
        destroySkin(id) {calls.push(['destroy', id]);}};
    const asset = {data: engine.svg({width: 2, height: 1, pixels: Uint8Array.from([1,0])})};
    const costume = {dataFormat: 'svg', asset, rotationCenterX: 4, rotationCenterY: 2};
    const targets = [];
    rt.getSpriteTargetByName = () => ({makeClone() {const target = {drawableID: targets.length, currentCostume: 0,
        getCostumes: () => [costume], setVisible() {}, setXY() {}, setSize(size) { this.size = size; }, setCostume() {calls.push(['restore']);}};
        targets.push(target); return target;}});
    rt.addTarget = () => {}; rt.disposeTarget = target => rt.emit('targetWasRemoved', target);
    const ext = new Arcade(rt); assert.ok(probeExtension(Arcade, rt).opcodes.has('mutateSpriteImage'));
    const spawn = () => ext.spawnSprite({TEMPLATE: 'hero', KIND: 'Player', X: 80, Y: 60, WIDTH: 2, HEIGHT: 1});
    const a = spawn(), b = spawn();
    assert.deepEqual(targets.map(t => t.size), [75,75]);
    assert.equal(ext.spriteOverlaps({A:a, B:b}), true);
    ext.mutateSpriteImage({ID:a, OP:'flipX'});
    assert.equal(ext.spriteOverlaps({A:a, B:b}), false);
    ext.mutateSpriteImage({ID:a, OP:'fill', COLOR:2});
    assert.equal(ext.spriteOverlaps({A:a, B:b}), true);
    ext.mutateSpriteImage({ID:a, OP:'fill', COLOR:0});
    assert.equal(ext.spriteOverlaps({A:a, B:b}), false);
    assert.equal(rt.bwArcadeDeviceState.sprites[b].image, undefined);
    assert.equal(costume.asset, asset); assert.equal(engine.decode(costume, {width:2,height:1}).pixels[0], 1);
    ext.setSpriteCostume({ID:a, COSTUME:0});
    assert.equal(ext.spriteOverlaps({A:a, B:b}), true);
    assert.ok(calls.some(c => c[0] === 'destroy' && c[1] === 100));
    ext.mutateSpriteImage({ID:b, OP:'fill', COLOR:3}); ext.destroySprite({ID:b});
    assert.equal(ext._inst._imageSkins.size, 0);
    ext.mutateSpriteImage({ID:a, OP:'fill', COLOR:3}); rt.emit('PROJECT_START');
    assert.equal(ext._inst._imageSkins.size, 0);
});

test('image commands execute from SB3 artwork and roundtrip through Code and compiled MakeCode', async () => {
    const source = `function recolor(sprite: Sprite) { sprite.image.replace(2, 5) }
let hero = sprites.create(img\`1 2\n3 .\`, SpriteKind.Player)
let foe = sprites.create(img\`1 2\n3 .\`, SpriteKind.Enemy)
hero.image.flipX()
hero.image.flipY()
recolor(hero)
controller.A.onEvent(ControllerButtonEvent.Pressed, function () { foe.image.fill(7) })`;
    const imported = arcadeToPseudocode(source); assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames:8, uploads:imported.costumes, storage:true});
    assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
    const state = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
    assert.deepEqual([...state.find(s => s.kind === 'Player').image.pixels], [0,3,5,1]);
    assert.equal(state.find(s => s.kind === 'Enemy').image, undefined);
    run.vm.postIOData('keyboard', {key:' ', isDown:true});
    for (let i=0;i<5;i++) run.vm.runtime._step();
    assert.deepEqual([...state.find(s => s.kind === 'Enemy').image.pixels], [7,7,7,7]);
    const saved = await run.vm.saveProjectSb3();
    await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
    run.vm.greenFlag(); for (let i = 0; i < 8; i++) run.vm.runtime._step();
    assert.deepEqual([...Object.values(run.vm.runtime.bwArcadeDeviceState.sprites).find(s => s.kind === 'Player').image.pixels], [0,3,5,1]);
    const code = run.creator.decompile(); const recreated = new SB3Creator(); recreated.parse(code);
    assert.deepEqual(recreated.warnings, []);
    assert.equal(Object.values(recreated.project.targets.find(t => t.name === 'Game').blocks).filter(b => b.opcode === 'arcade_mutateSpriteImage').length, 4);
    const exported = exportProject(run.creator); assert.deepEqual(exported.unsupported, []);
    const built = await compile('arcade', exported.files); assert.equal(built.success, true, JSON.stringify(built.diagnostics));
    const reimport = arcadeToPseudocode(exported.ts); assert.deepEqual(reimport.unsupported, []);
    const again = await runProgram(reimport.code, {frames:8, uploads:reimport.costumes, storage:true});
    assert.deepEqual([...Object.values(again.vm.runtime.bwArcadeDeviceState.sprites).find(s => s.kind === 'Player').image.pixels], [0,3,5,1]);
});

test('real flip game imports without gaps, while unsupported pixel drawing remains explicit', () => {
    const source = readFileSync(new URL('./fixtures/makecode/arcade-flip-image.ts', import.meta.url), 'utf8');
    assert.deepEqual(arcadeToPseudocode(source).unsupported, []);
    const unsupported = arcadeToPseudocode('let hero = sprites.create(img`1`, SpriteKind.Player)\nhero.image.drawCircle(0,0,1,2)');
    assert.ok(unsupported.unsupported.some(gap => gap.includes('drawCircle')));
});


test('image mutations retain shared frame identity', () => {
    const result = arcadeToPseudocode(`let __bwFrames_hero = [img\`1\`, img\`2\`]
let hero = sprites.create(img\`1\`, SpriteKind.Player)
hero.setImage(__bwFrames_hero[((Math.round(1) % 2) + 2) % 2])
hero.image.fill(3)`);
    assert.deepEqual(result.unsupported, []);
    assert.match(result.code, /arcade frame image array/);
});


test('unreadable artwork produces a runtime diagnostic instead of invented blank pixels', () => {
    const rt = new EventEmitter(); rt.startHats = () => []; rt.addTarget = () => {};
    rt.getSpriteTargetByName = () => ({makeClone: () => ({getCostumes: () => [], currentCostume: 0})});
    const errors = []; rt.on('BLOCKS_ERROR', error => errors.push(error));
    const ext = new Arcade(rt);
    const id = ext.spawnSprite({TEMPLATE:'missing', KIND:'Player', X:80, Y:60, WIDTH:2, HEIGHT:2});
    ext.mutateSpriteImage({ID:id, OP:'fill', COLOR:2});
    assert.equal(errors.length, 1); assert.match(errors[0], /cannot read this sprite artwork/);
    assert.equal(rt.bwArcadeDeviceState.sprites[id].image, null);
});


test('native pixel operations agree with the pinned PXT simulator on every palette color', () => {
    const source = readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/sim/common-sim.js', import.meta.url), 'utf8');
    const context = {pxsim: {RefObject: class {}}, ImageMethods: {}};
    const end = source.indexOf('pxsim.RefImage = RefImage;');
    runInNewContext(source.slice(source.indexOf('class RefImage extends'), end + 'pxsim.RefImage = RefImage;'.length), context);
    for (const operation of ['fill', 'replace', 'flipX', 'flipY']) {
        const start = source.indexOf('function ' + operation + '(img');
        const assignment = 'ImageMethods.' + operation + ' = ' + operation + ';';
        const finish = source.indexOf(assignment, start);
        assert.ok(start >= 0 && finish > start, operation);
        runInNewContext(source.slice(start, finish + assignment.length), context);
    }
    for (const [width,height] of [[1,1],[3,5],[8,7]]) for (let color=0;color<16;color++) {
        const native = {width,height,pixels:Uint8Array.from({length:width*height}, (_,i) => i%16)};
        const reference = new context.pxsim.RefImage(width,height,4); reference.data.set(native.pixels);
        for (const [operation, from, to] of [['flipX'], ['flipY'], ['replace',color,15-color], ['fill',color]]) {
            engine.mutate(native, operation, from, to);
            context.ImageMethods[operation](reference, from, to);
            assert.deepEqual([...native.pixels], [...reference.data], `${operation} ${width}x${height} ${color}`);
        }
    }
});
