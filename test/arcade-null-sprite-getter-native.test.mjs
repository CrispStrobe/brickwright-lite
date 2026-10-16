import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC,loadExtensionClass} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import {currentArtworkNullSpriteRoutes,nonnullSpriteCurrentCells} from './helpers/null-sprite-current-artwork.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values');
const exceptions=require(VM_SRC+'/util/bw-arcade-exceptions');
const value=(run,name)=>BW.decode(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name===name)?.value);
const source=property=>`let receiver:Sprite=null;let made:Sprite=null;let after=0;let result=0;let independent=0;
game.onUpdate(function(){independent+=1});
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){
made=sprites.create(img\`1\`,SpriteKind.Projectile);
result=receiver.${property};made.setPosition(10,20);made.vy=-200;after=1;
});`;
async function trigger(run,property) {
    const signals=[];run.vm.runtime.on('BLOCKS_ERROR',error=>signals.push(error));
    await stepFrames(run.vm,3);const prior=value(run,'independent');
    run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,8);
    run.vm.postIOData('keyboard',{key:' ',isDown:false});await stepFrames(run.vm,3);
    assert.equal(signals.length,1);assert.ok(signals[0] instanceof TypeError);
    const diagnostic=exceptions.diagnostic(run.vm.runtime,signals[0]);assert.equal(diagnostic?.kind,'primitive-fault');
    assert.match(diagnostic.message,/Expected type Sprite but received type null/);
    const block=run.vm.runtime.targets.flatMap(target=>Object.values(target.blocks._blocks)).find(node=>node.id===diagnostic.block);
    assert.equal(block?.opcode,'arcade_spriteProperty');
    assert.equal(value(run,'after'),0);assert.equal(value(run,'result'),0);
    assert.equal(run.calls.get('arcade_setSpritePosition')||0,0);
    assert.equal(run.calls.get('arcade_setSpriteProperty')||0,0);
    assert.ok(value(run,'independent')>prior,'unrelated update callback continues');
    assert.equal(run.calls.get('arcade_spriteProperty'),1,'one actual getter operation');
    assert.notEqual(value(run,'made'),null,'creation preceding fault survives');
    assert.equal(run.errors.filter(message=>message.includes('Expected type Sprite but received type null')).length>=1,true);
    assert.equal(property==='x'||property==='y'||property==='width'||property==='height',true);
}

for(const property of ['x','y','width','height'])test('native actual null '+property+' faults before later effects and keeps unrelated callbacks live',async()=>{
    const imported=arcadeToPseudocode(source(property));assert.deepEqual(imported.unsupported,[]);let run;
    try{run=await runProgram(imported.code,{frames:0});assert.deepEqual(run.creator.warnings,[]);await trigger(run,property);}
    finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('native source/Code/same and fresh SB3/current export retain the physical null x failure',currentArtworkNullSpriteRoutes);

test('direct native service retains null text, absent IDs and real Sprite getter behavior',()=>{
    const Arcade=loadExtensionClass('arcade'),runtime=createArcadeRuntimeMock();
    runtime.startHats=()=>[];runtime.requestRedraw=()=>{};runtime.getSpriteTargetByName=()=>null;
    const adapter=new Arcade(runtime),ext=adapter._inst;
    for(const ID of [null,'null','',undefined,'missing'])assert.equal(ext.spriteProperty({ID,PROPERTY:'x'}),0);
    const id=ext.spawnSprite({NAME:'hero',KIND:'Player',X:12,Y:34});
    assert.equal(ext.spriteProperty({ID:id,PROPERTY:'x'}),12);assert.equal(ext.spriteProperty({ID:id,PROPERTY:'y'}),34);
    assert.ok(ext.spriteProperty({ID:id,PROPERTY:'width'})>0);assert.ok(ext.spriteProperty({ID:id,PROPERTY:'height'})>0);
});

test('nested ordinary null getter faults retire enclosing callers without their later effects',async()=>{
    const imported=arcadeToPseudocode(`let receiver:Sprite=null;let entered=0;let innerAfter=0;let outerAfter=0;let independent=0;
game.onUpdate(function(){independent+=1});
function fail(){entered=1;return receiver.x}
function outer(){let result=fail();innerAfter=1;return result}
let answer=outer();outerAfter=1;`);
    assert.deepEqual(imported.unsupported,[]);let run;
    try{
        run=await runProgram(imported.code,{frames:0});const signals=[];run.vm.runtime.on('BLOCKS_ERROR',error=>signals.push(error));
        await stepFrames(run.vm,12);assert.equal(value(run,'entered'),1);assert.equal(value(run,'innerAfter'),0);assert.equal(value(run,'outerAfter'),0);
        assert.equal(signals.length,1);assert.ok(signals[0] instanceof TypeError);assert.equal(exceptions.diagnostic(run.vm.runtime,signals[0])?.kind,'primitive-fault');
        const prior=value(run,'independent');await stepFrames(run.vm,4);assert.ok(value(run,'independent')>prior);
    }finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('physical nonnull getter returns ordinary values and continues normally',nonnullSpriteCurrentCells);
