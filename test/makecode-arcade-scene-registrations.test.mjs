import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name.replace(/^Game_/,''),variable.value]));

// Each original compilation is awaited before starting the next. The real PXT
// scheduler is used; comparisons avoid counts whose value depends on frame rate.
async function verify(source,names,{done='registrationsDone',input=null,originalInput=''}={}) {
    const expected=await runPxtArcade(source+originalInput,{waitForGlobals:{[done]:true}});
    assert.equal(expected[done],true);
    const check=run=>{
        const actual=values(run);
        for(const name of names)assert.equal(actual[name],expected[name],name);
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
    };
    const execute=async imported=>{
        assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:180,uploads:imported.costumes,storage:true});
        if(input)await input(run);
        check(run);return run;
    };
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    const exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});
    assert.deepEqual(exported.unsupported,[]);
    const again=await runPxtArcade(exported.ts+originalInput,{waitForGlobals:{[done]:true}});
    for(const name of names)assert.equal(again[name],expected[name],name+' in exported PXT');
    await execute(arcadeToPseudocode(exported.files));
    return {expected,exported};
}

test('forever, life-zero and countdown callbacks retain scene registration sites and captured cells through Code/export',async()=>{
    const source=`
let parentForever=false
let parentInterval=false
let childForever=false
let childInterval=false
let parentLifeWeight=0
let childLifeWeight=0
let parentCountdown=false
let childCountdown=false
function installParent(){
    let weight=3
    game.forever(function(){parentForever=true})
    game.onUpdateInterval(0,function(){parentInterval=true})
    info.onLifeZero(function(){parentLifeWeight=weight;info.setLife(2)})
    info.onCountdownEnd(function(){parentCountdown=true})
    weight=4
}
installParent()
info.setLife(1)
info.changeLifeBy(-1)
info.startCountdown(0.04)
while(!parentForever || !parentInterval || !parentCountdown || parentLifeWeight===0){pause(5)}
game.pushScene()
function installChild(){
    let weight=6
    forever(function(){childForever=true})
    game.onUpdateInterval(0,function(){childInterval=true})
    info.player2.onLifeZero(function(){childLifeWeight=weight;info.player2.setLife(2)})
    info.onCountdownEnd(function(){childCountdown=true})
    weight=7
}
installChild()
info.player2.setLife(1)
info.player2.changeLifeBy(-1)
info.startCountdown(0.04)
while(!childForever || !childInterval || !childCountdown || childLifeWeight===0){pause(5)}
game.popScene()
let restoredLife=info.life()
let registrationsDone=parentForever && parentInterval && parentCountdown && childForever && childInterval && childCountdown && parentLifeWeight===4 && childLifeWeight===7
`;
    const {expected,exported}=await verify(source,['parentForever','parentInterval','childForever','childInterval','parentLifeWeight','childLifeWeight','parentCountdown','childCountdown','restoredLife','registrationsDone']);
    assert.equal(expected.parentLifeWeight,4);assert.equal(expected.childLifeWeight,7);assert.equal(expected.restoredLife,2);
    assert.match(exported.ts,/game\.forever\(/);assert.match(exported.ts,/info\.player2\.onLifeZero\(/);assert.match(exported.ts,/info\.onCountdownEnd\(/);
});

test('scene sprite overlap and kind-destruction registrations retain typed event arguments and shared captures',async()=>{
    const source=`
game.pushScene()
let art=image.create(2,2)
art.fill(5)
let actor=sprites.create(art,SpriteKind.Player)
let food=sprites.create(art,SpriteKind.Food)
actor.setPosition(30,40)
food.setPosition(30,40)
let overlapIdentity=false
let destroyedIdentity=false
let overlapWeight=0
let destroyedWeight=0
let destroyedX=-1
function install(){
    let actors=[actor,food]
    let weight=3
    sprites.onDestroyed(SpriteKind.Food,function(dead){destroyedIdentity=dead===actors[1];destroyedWeight=weight;destroyedX=dead.x})
    sprites.onOverlap(SpriteKind.Player,SpriteKind.Food,function(first,second){overlapIdentity=first===actors[0] && second===actors[1];overlapWeight=weight;second.destroy()})
    weight=9
}
install()
while(!destroyedIdentity){pause(5)}
let registrationsDone=overlapIdentity && destroyedIdentity && overlapWeight===9 && destroyedWeight===9
`;
    const {expected,exported}=await verify(source,['overlapIdentity','destroyedIdentity','overlapWeight','destroyedWeight','destroyedX','registrationsDone']);
    assert.equal(expected.destroyedX,30);
    assert.match(exported.ts,/sprites\.onOverlap\(/);assert.match(exported.ts,/sprites\.onDestroyed\(/);assert.match(exported.ts,/: Sprite\[\]/);
});

test('scene button replacement and dynamic interval callbacks use captured registration values through Code/export',async()=>{
    const source=`
let buttonWeight=0
let buttonHits=0
let intervalReady=false
let registrationsDone=false
function installButton(weight:number){controller.A.onEvent(ControllerButtonEvent.Pressed,function(){buttonHits++;buttonWeight=weight;registrationsDone=intervalReady && buttonWeight===7})}
installButton(3)
game.pushScene()
installButton(2)
installButton(7)
function installInterval(period:number){game.onUpdateInterval(period,function(){intervalReady=true})}
installInterval(0)
`;
    const {expected,exported}=await verify(source,['buttonWeight','buttonHits','intervalReady','registrationsDone'],{
        originalInput:'\nwhile(!intervalReady){pause(5)}\ncontroller.A.setPressed(true)\nwhile(!registrationsDone){pause(5)}\ncontroller.A.setPressed(false)\npause(40)\ncontroller.B.setPressed(true)\npause(60)\ncontroller.B.setPressed(false)',
        input:async run=>{run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,8);run.vm.postIOData('keyboard',{key:' ',isDown:false});await stepFrames(run.vm,1);run.vm.postIOData('keyboard',{key:'z',isDown:true});await stepFrames(run.vm,8);run.vm.postIOData('keyboard',{key:'z',isDown:false});}
    });
    assert.equal(expected.buttonWeight,7);assert.equal(expected.buttonHits,1);
    assert.match(exported.ts,/controller\.A\.onEvent\(/);assert.match(exported.ts,/game\.onUpdateInterval\(/);
});

test('a tap shorter than one frame delivers both scene button edges once through Code/export',async()=>{
    const source=`
game.pushScene()
let pressedWeight=0
let releasedWeight=0
let bCrossfire=0
let shortTapDone=false
function install(){
    let weight=2
    controller.A.onEvent(ControllerButtonEvent.Pressed,function(){pressedWeight+=weight;shortTapDone=pressedWeight===2 && releasedWeight===2})
    controller.A.onEvent(ControllerButtonEvent.Released,function(){releasedWeight+=weight;shortTapDone=pressedWeight===2 && releasedWeight===2})
    controller.B.onEvent(ControllerButtonEvent.Pressed,function(){bCrossfire++})
}
install()
`;
    const {expected}=await verify(source,['pressedWeight','releasedWeight','bCrossfire','shortTapDone'],{
        done:'shortTapDone',
        originalInput:'\ncontroller.A.setPressed(true)\ncontroller.A.setPressed(false)\nwhile(!shortTapDone){pause(5)}',
        input:async run=>{
            // No frame and no delay between input edges: a real short tap.
            run.vm.postIOData('keyboard',{key:' ',isDown:true});
            run.vm.postIOData('keyboard',{key:' ',isDown:false});
            await stepFrames(run.vm,8);
        }
    });
    assert.equal(expected.pressedWeight,2);assert.equal(expected.releasedWeight,2);assert.equal(expected.bCrossfire,0);
});
