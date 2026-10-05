import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Task E1 keeps the import half of these round trips; the export half (projectToArcade, then compiling or running the exported TypeScript in PXT, then re-importing it) returns with task E2 (docs/OPEN-TASKS-2026-09-29.md).
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const source=`enum ActionKind {Rest=-3,Moving=Rest+4,Next}
let red=img\`2\`
let blue=img\`7\`
let sequence=animation.createAnimation(ActionKind.Moving,1000000)
let alias=sequence
sequence.addAnimationFrame(red)
alias.addAnimationFrame(blue)
function echoAnimation(value:animation.Animation){let held=value;return held}
let animations=[sequence,alias]
let selected=animations[1]
let same=echoAnimation(selected)===sequence
let last=sequence.getImage()===blue
let action=alias.getAction()
let initialInterval=alias.getInterval()
sequence.setInterval(2000000)
let changedInterval=alias.getInterval()
let hero=sprites.create(img\`3\`,SpriteKind.Player)
animation.attachAnimation(hero,sequence)
animation.setAction(hero,ActionKind.Moving)
let initialPixel=hero.image.getPixel(0,0)
let modern=sprites.create(img\`5\`,SpriteKind.Food)
let frames=[red,blue]
animation.runImageAnimation(modern,frames,1000000,false)
animation.stopAnimation(animation.AnimationTypes.All,modern)
let stoppedPixel=modern.image.getPixel(0,0)
let complete=sequence.getAction()===1`;

test('typed legacy animation objects and modern image commands survive Code/SB3 and executed PXT export',async()=>{
    const options={dependencies:{device:'*',animation:'*'},waitForGlobals:{complete:true}};
    const expected=await runPxtArcade(source,options);
    const names=['same','last','action','initialInterval','changedInterval','initialPixel','stoppedPixel','complete'];
    assert.equal(expected.same,true);assert.equal(expected.last,true);assert.equal(expected.action,1);assert.equal(expected.initialPixel,3);
    const check=run=>{const actual=vars(run);for(const name of names)assert.equal(actual[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:70,uploads:imported.costumes,storage:true});check(run);return run;};
    const imported=arcadeToPseudocode(source),run=await execute(imported);
    await execute({...imported,code:run.creator.decompile()});
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,70);check(run);
    const v=vars(run),p=run.vm.runtime._primitives;
    assert.equal(p.arcade_imagePixel({IMAGE:p.arcade_spriteImage({ID:v.hero}),X:0,Y:0}),7,'legacy playback uses attached frame image');
    p.arcade_runImageAnimation({ID:v.modern,FRAMES:v.frames,INTERVAL:50,LOOP:false});await stepFrames(run.vm,1);
    assert.equal(p.arcade_imagePixel({IMAGE:p.arcade_spriteImage({ID:v.modern}),X:0,Y:0}),2);
    await stepFrames(run.vm,1);assert.equal(p.arcade_imagePixel({IMAGE:p.arcade_spriteImage({ID:v.modern}),X:0,Y:0}),7);
    await stepFrames(run.vm,3);assert.equal(p.arcade_imagePixel({IMAGE:p.arcade_spriteImage({ID:v.modern}),X:0,Y:0}),7,'nonlooping playback retains last frame');
});
