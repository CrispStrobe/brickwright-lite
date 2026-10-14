import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),host=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/scene-flags.js');

test('Scene flags retain conditional previous order and live registration during rendering',()=>{
    const h=host.create(),scene={flags:0},a={z:1,id:0},b={z:0,id:1};h.register(scene,a);h.register(scene,b);
    assert.equal(scene.flags,1);assert.equal(h.begin(scene),true);assert.equal(scene.flags,5);
    assert.deepEqual(h.order(scene,[a,b]),[b,a]);assert.equal(scene.flags,4);h.finish(scene);assert.equal(scene.flags,0);
    a.z=0;assert.deepEqual(h.order(scene,[a,b]),[b,a],'no dirty bit retains previous order');
    h.dirty(scene);assert.deepEqual(h.order(scene,[a,b]),[a,b],'dirty sorting uses selected SDK public id tie breaker');
    b.z=1;h.dirty(scene);const live=h.order(scene,[a,b]);assert.deepEqual(live,[a,b]);
    const c={z:-10,id:2};h.register(scene,c);assert.deepEqual(live,[a,b,c],'an in-flight Scene iterator sees a newly appended sprite');
    assert.equal(scene.flags,1);assert.deepEqual(h.order(scene,[a,b,c]),[c,a,b]);
    h.remove(scene,a);assert.deepEqual(h.currentOrder(scene),[c,b]);
});

test('manual IsRendering suppression preserves raw flags and scene ownership',()=>{
    const h=host.create(),parent={flags:0},child={flags:2.5};assert.equal(h.through(child),true);
    child.flags=5;assert.equal(h.begin(child),false);assert.equal(child.flags,5);
    h.dirty(parent);assert.equal(parent.flags,1);assert.equal(child.flags,5);
    child.flags=2.5;assert.equal(h.begin(child),true);assert.equal(child.flags,6);h.finish(child);assert.equal(child.flags,2);
});


test('selected PXT pairwise selection sort may reverse equal z across a lower third sprite',()=>{
 const h=host.create(),scene={flags:0},a={z:0,id:0},b={z:0,id:0},c={z:-20,id:2};
 h.register(scene,a);h.register(scene,b);h.register(scene,c);assert.deepEqual(h.order(scene,[a,b,c]),[c,b,a]);
});

test('actual generated particle BaseSprite z setter dirties only the current Scene and preserves equal writes',async()=>{
 const {EventEmitter}=await import('node:events');
 const {loadExtensionClass}=await import('./helpers/bw-extensions.mjs');
 const runtime=createArcadeRuntimeMock();runtime.requestRedraw=()=>{};
 const arcade=new (loadExtensionClass('arcade'))(runtime),ext=arcade._inst;
 const image=arcade.createImage({WIDTH:2,HEIGHT:2});arcade.mutateImage({IMAGE:image,OP:'fill',COLOR:2});
 const id=arcade.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'});
 arcade.startSpriteEffect({ID:id,EFFECT:'fire',DURATION:0});
 const parent=ext._state(),source=ext._particleScenes.get(parent).allSprites[0];
 parent.flags=0;source.z=source.z;assert.equal(parent.flags,0);
 source.z=source.z+1;assert.equal(parent.flags,1);
 arcade.pushScene();const child=ext._state();parent.flags=0;child.flags=0;
 source.z=NaN;assert.equal(child.flags,1);assert.equal(parent.flags,0);
 child.flags=0;source.z=NaN;assert.equal(child.flags,1,'NaN is not equal to its preceding value');
 runtime.emit('PROJECT_START');
});

test('Scene flag palette defaults use numeric shadows while connected primitive values retain identity', async () => {
    const {loadExtensionClass} = await import('./helpers/bw-extensions.mjs');
    const {createArcadeRuntimeMock} = await import('./helpers/arcade-runtime-mock.mjs');
    const BW = (await import('../overlay/scratch-vm/src/util/bw-values.js')).default;
    const arcade = new (loadExtensionClass('arcade'))(createArcadeRuntimeMock());
    const value = arcade.getInfo().blocks.find(block => block.opcode === 'setSceneFlags').arguments.VALUE;
    assert.equal(value.type, 'number');
    assert.equal(value.defaultValue, 0);
    const scene = arcade.currentScene();
    const blocks = {command: {inputs: {VALUE: {block: 'shadow', shadow: 'shadow'}}}, shadow: {opcode: 'math_number'}};
    const util = {thread: {peekStack: () => 'command'}, target: {blocks: {getBlock: id => blocks[id]}}};
    arcade.setSceneFlags({SCENE: scene, VALUE: String(value.defaultValue)}, util);
    assert.equal(BW.decode(arcade.sceneFlags({SCENE: scene})), 0);
    blocks.command.inputs.VALUE.block = 'connected';
    blocks.connected = {opcode: 'data_variable'};
    arcade.setSceneFlags({SCENE: scene, VALUE: '2.5'}, util);
    assert.equal(BW.decode(arcade.sceneFlags({SCENE: scene})), '2.5', 'connected values are not numeric editor shadows');
});
