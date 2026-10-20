import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runTimedArcadeProgram} from './helpers/arcade-timed-native.mjs';
import {restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {clearStrayTimers} from './helpers/bw-vm.mjs';
import {extendableControls,extendableLifecycleControls} from './fixtures/arcade-extendable-source-controls.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
function observed(run,name){const result=values(run);return Object.fromEntries((name==='destroyedUpdate'?['total','destroyedCalls','remaining','same','kind']:name==='constructorPause'?['completed','before','total','deltas']:['completed','before','total']).map(key=>[key,result[key]]));}
for(const[name,source]of Object.entries(extendableControls))test('actual native ExtendableSprite '+name,async()=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runTimedArcadeProgram(imported.code,{milliseconds:100,uploads:imported.costumes,storage:true});
    try{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const result=values(run);
        if(name==='destroyedUpdate'){
            assert.equal(result.total,1);assert.equal(result.destroyedCalls,1);assert.equal(result.remaining,0);
            assert.equal(result.same,true);assert.equal(result.kind,1000);
        }else{
            assert.equal(result.completed,7);assert.equal(result.before,2);assert.equal(result.total,4);
            if(name==='constructorPause')assert.equal(result.deltas,'0,20,20,20,');
        }
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
for(const[name,source]of Object.entries(extendableLifecycleControls))test('actual native ExtendableSprite lifecycle '+name,async()=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runTimedArcadeProgram(imported.code,{milliseconds:100,uploads:imported.costumes,storage:true});
    try{
        const result=values(run);
        if(process.env.BW_EXTENDABLE_NATIVE_EVIDENCE_DIR){const root=process.env.BW_EXTENDABLE_NATIVE_EVIDENCE_DIR;fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify({code:imported.code,result,errors:run.errors}));}
        assert.deepEqual(run.errors,[]);
        if(name==='plainRemoval'){
            assert.equal(result.indefinite,true);assert.equal(result.plainIndefinite,true);assert.equal(result.first,0);assert.equal(result.total,1);assert.equal(result.remaining,0);
        }else if(name==='destroyedScene'){
            assert.equal(result.sequence,'UDU');assert.equal(result.total,2);assert.equal(result.delta,0);
        }else if(name==='scenePause'){
            assert.equal(result.sequence,'ABC');assert.equal(result.total,1);assert.equal(result.children,2);assert.equal(result.deltas,'0,');
        }else{
            assert.equal(result.sequence,'ABCC');assert.equal(result.total,3);assert.equal(result.deltas,'0,41,20,');
        }
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
test('Stop and project replacement cancel a paused native update without stale field writes',async()=>{
    const imported=arcadeToPseudocode(extendableLifecycleControls.updatePause);
    const run=await runTimedArcadeProgram(imported.code,{milliseconds:20,uploads:imported.costumes,storage:true});
    try{
        assert.equal(values(run).trace,'A');assert.equal(values(run).updates,1);
        run.vm.stopAll();await run.clock.advanceTo(100);
        assert.equal(values(run).trace,'A','stopped method cannot finish its pending write');
        await restartTimedArcadeRun(run,20);assert.equal(values(run).trace,'A');assert.equal(values(run).updates,1);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();await run.vm.loadProject(saved);await restartTimedArcadeRun(run,100);
        assert.equal(values(run).sequence,'ABCC');assert.equal(values(run).total,3);
        assert.equal(values(run).deltas,'0,41,20,');assert.deepEqual(run.errors,[]);
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
test('BW-authored ordinary flag setup activates only its actual registered update callback',async()=>{
    const imported=arcadeToPseudocode(`let updates=0
class Actor extends sprites.ExtendableSprite {
 constructor(){super(img\`1\`,SpriteKind.Player)}
 update(dt:number){updates+=1}
}
let actor=new Actor()`);
    // This is a separately BW-authored ordinary setup contract. Source-only
    // preinitialization declarations cannot be moved under a stock flag hat.
    const code=imported.code.replace('WHEN arcade source starts:','WHEN green flag clicked:')
        .split('\n').filter(line=>!/^  declare arcade source (scalar|reference) /.test(line)).join('\n');
    assert.notEqual(code,imported.code);
    const run=await runTimedArcadeProgram(code,{milliseconds:0,uploads:imported.costumes,storage:true});
    try{
        // Ordinary caller/constructor threads still need ordinary VM turns.
        // Source scene timer turns may drain the owned callback, not its stock
        // ancestor. The physical scene worker retains its own timer cadence.
        for(let time=20;time<=100;time+=20){await run.clock.advanceTo(time);await stepFrames(run.vm,1,20);}
        assert.deepEqual(run.errors,[]);assert.ok(values(run).updates>0);
        assert.equal(run.vm.runtime._arcadeFramePhase.hasSourceProject(),true,'actual registered method activates the driver without a source/native hat');
    }
    finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
test('plain Sprite lifespan, AutoDestroy and speech expiry share the source scene update pass',async()=>{
    const imported=arcadeToPseudocode(`let keep=sprites.create(img\`1\`,SpriteKind.Player)
let indefinite=keep.lifespan===undefined
let dying=sprites.create(img\`2\`,SpriteKind.Food)
dying.lifespan=20
let outside=sprites.create(img\`3\`,SpriteKind.Enemy)
outside.setPosition(180,60)
outside.setFlag(SpriteFlag.AutoDestroy,true)
keep.sayText("Hi",30)
pause(40)
let players=sprites.allOfKind(SpriteKind.Player).length
let food=sprites.allOfKind(SpriteKind.Food).length
let enemies=sprites.allOfKind(SpriteKind.Enemy).length`);
    assert.deepEqual(imported.unsupported,[]);
    const run=await runTimedArcadeProgram(imported.code,{milliseconds:60,uploads:imported.costumes,storage:true});
    try{
        assert.deepEqual(run.errors,[]);const result=values(run);
        assert.equal(result.indefinite,true);assert.equal(result.players,1);assert.equal(result.food,0);assert.equal(result.enemies,0);
        const {importGuiDependency}=await import('./helpers/bw-integrated.mjs');
        const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
        const native=dispatch.services[run.vm.extensionManager._loadedExtensions.get('arcade')]._inst;
        assert.equal(native._runtime,run.vm.runtime);assert.equal(native._speech.size,0);
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
test('ExtendableSprite Code and same/fresh saved projects preserve original constructor/update observations',async()=>{
    for(const[name,source]of Object.entries(extendableControls)){
        const imported=arcadeToPseudocode(source),runs=[];
        try{
            const run=await runTimedArcadeProgram(imported.code,{milliseconds:100,uploads:imported.costumes,storage:true});runs.push(run);
            const expected=observed(run,name);
            const code=await runTimedArcadeProgram(run.creator.decompile(),{milliseconds:100,uploads:imported.costumes,storage:true});runs.push(code);
            assert.deepEqual(code.errors,[]);assert.deepEqual(code.creator.warnings,[]);assert.deepEqual(observed(code,name),expected);
            const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);await restartTimedArcadeRun(run,100);
            assert.deepEqual(run.errors,[]);assert.deepEqual(observed(run,name),expected);
            const fresh=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true,frameAuthority:'timed'});runs.push(fresh);
            fresh.vm.stopAll();await fresh.vm.loadProject(saved);await restartTimedArcadeRun(fresh,100);
            assert.deepEqual(fresh.errors,[]);assert.deepEqual(observed(fresh,name),expected);
            const exported=projectToArcade(code.creator.project,{costumeSvg:(t,c)=>code.creator.assets.get(c.assetId)?.data});
            assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/extends sprites\.ExtendableSprite/);
            const restored=arcadeToPseudocode(exported.files);assert.deepEqual(restored.unsupported,[]);
            const again=await runTimedArcadeProgram(restored.code,{milliseconds:100,uploads:restored.costumes,storage:true});runs.push(again);
            assert.deepEqual(again.errors,[]);assert.deepEqual(observed(again,name),expected);
        }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
    }
});
