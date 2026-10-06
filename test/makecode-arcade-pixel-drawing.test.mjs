import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {runProgram, SB3Creator} from './helpers/bw-vm.mjs';
import {loadExtensionClass, probeExtension} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
const require = createRequire(import.meta.url);
const palette = [null,'#ffffff','#ff2121','#ff93c4','#ff8135','#fff609','#249ca3','#78dc52','#003fad','#87f2ff','#8e2ec4','#a4839f','#5c406c','#e5cdc4','#91463d','#000000'];
const engine = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')(palette,
    require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const exported = creator => projectToArcade(creator.project, {costumeSvg: (t,c) => creator.assets.get(c.assetId)?.data});

test('drawing and pixel reading agree with pinned PXT at clipped edges, reversed lines, and fractional coordinates', () => {
    const source = readFileSync(new URL('../packages/scratch-gui/static/makecode/arcade/sim/common-sim.js', import.meta.url), 'utf8');
    const context = {pxsim: {RefObject: class {}}, ImageMethods: {}};
    const end = source.indexOf('pxsim.RefImage = RefImage;');
    runInNewContext(source.slice(source.indexOf('class RefImage extends'), end + 'pxsim.RefImage = RefImage;'.length), context);
    for (const [first,last] of [['setPixel','fill'], ['fillRect','_fillRect'], ['drawLineLow','drawIcon']]) {
        runInNewContext(source.slice(source.indexOf(`function ${first}(img`), source.indexOf(`function ${last}(img`)), context);
    }
    for (const [w,h] of [[1,1],[3,5],[8,7]]) {
        const image = {width:w,height:h,pixels:new Uint8Array(w*h)};
        const pxt = new context.pxsim.RefImage(w,h,4);
        const points = [-4,-1,-0.5,0,0.5,1,w-1,w+3];
        for (let i=0;i<points.length;i++) for (let j=0;j<points.length;j++) {
            const args = [points[i],points[j],points[j],points[i], (i+j)%16];
            for (const op of ['drawLine','fillRect']) {
                image.pixels.fill(0); pxt.data.fill(0);
                engine.draw(image,op,...args.map(String)); context.ImageMethods[op](pxt,...args);
                assert.deepEqual([...image.pixels],[...pxt.data], `${op} ${w}x${h} ${args}`);
            }
            engine.draw(image,'setPixel',points[i],points[j],7);
            context.ImageMethods.setPixel(pxt,points[i],points[j],7);
            assert.deepEqual([...image.pixels],[...pxt.data]);
            assert.equal(engine.getPixel(image,points[i],points[j]),context.ImageMethods.getPixel(pxt,points[i],points[j]));
        }
    }
});

test('sprite pixel reporters and drawing commands execute through Code, SB3, PXT export and reimport', async () => {
    const source = `let sampled = 0
let outside = 99
let increased = 0
function paint(sprite: Sprite) {
    sprite.image.fill(0)
    sprite.image.setPixel(0, 0, 2)
    sprite.image.fillRect(1, 0, 2, 2, 5)
    sprite.image.drawLine(3, 2, 0, 2, 7)
}
let hero = sprites.create(img\`1 1 1 1\n1 1 1 1\n1 1 1 1\`, SpriteKind.Player)
paint(hero)
sampled = hero.image.getPixel(2, 1)
outside = hero.image.getPixel(-1, 0)
increased = hero.image.getPixel(0, 0) + 1
controller.A.onEvent(ControllerButtonEvent.Pressed, function () { hero.image.setPixel(0, 0, 0) })`;
    const imported = arcadeToPseudocode(source); assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames:10,uploads:imported.costumes,storage:true});
    assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
    const state = Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0];
    assert.deepEqual([...state.image.pixels], [2,5,5,0,0,5,5,0,7,7,7,7]);
    const values = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).map(v => [v.name,v.value]));
    assert.equal(values.sampled,5); assert.equal(values.outside,0); assert.equal(values.increased,3);
    const ext = new (loadExtensionClass('arcade'))(); const paletteProbe = probeExtension(loadExtensionClass('arcade'));
    for (const opcode of ['spritePixel','setSpritePixel','drawSpriteImage']) assert.ok(paletteProbe.opcodes.has(opcode));
    assert.equal(ext.spritePixel({ID:'missing',X:0,Y:0}),0);
    run.vm.postIOData('keyboard',{key:' ',isDown:true}); for(let i=0;i<4;i++)run.vm.runtime._step();
    assert.equal(state.image.pixels[0],0); assert.equal(state.mask[0],0);
    const saved = await run.vm.saveProjectSb3(); await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
    run.vm.greenFlag(); for(let i=0;i<10;i++)run.vm.runtime._step();
    assert.equal(Object.values(run.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels[0],2);
    const recreated = new SB3Creator(); recreated.parse(run.creator.decompile()); assert.deepEqual(recreated.warnings,[]);
    const out = exported(run.creator); assert.deepEqual(out.unsupported,[]);
    const built = await compile('arcade',out.files); assert.equal(built.success,true,JSON.stringify(built.diagnostics));
    const again = arcadeToPseudocode(out.ts); assert.deepEqual(again.unsupported,[]);
    const rerun = await runProgram(again.code,{frames:10,uploads:again.costumes,storage:true});
    assert.deepEqual([...Object.values(rerun.vm.runtime.bwArcadeDeviceState.sprites)[0].image.pixels], [2,5,5,0,0,5,5,0,7,7,7,7]);
});
