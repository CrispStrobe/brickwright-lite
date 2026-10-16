import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers,quitStrandedVMs} from './helpers/bw-vm.mjs';
import {restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {extendableControls} from './fixtures/arcade-extendable-source-controls.mjs';
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
function errors(rows){
    const seen=new WeakMap();let next=0;
    const encode=(value,depth=0)=>{
        if(value===undefined)return {$actualScalar:'Undefined'};
        if(typeof value==='number' && (!Number.isFinite(value)||Object.is(value,-0)))return {$actualScalar:String(value),negativeZero:Object.is(value,-0)};
        if(typeof value==='bigint'||typeof value==='symbol')return {$actualScalar:typeof value,value:String(value)};
        if(value===null || typeof value!=='object')return typeof value==='function'?{$unobserved:'Function'}:value;
        if(seen.has(value))return {$reference:seen.get(value)};
        const id=++next;seen.set(value,id);
        if(depth>8)return {$id:id,$unexpanded:'depth'};
        const out={$id:id};
        for(const key of Reflect.ownKeys(value)){
            const d=Object.getOwnPropertyDescriptor(value,key),name=typeof key==='symbol'?String(key):key;
            out[name]=Object.hasOwn(d,'value')?encode(d.value,depth+1):{$unobserved:'accessor'};
        }
        return out;
    };
    return rows.map(row=>encode(row));
}
function retain(name,record){const root=process.env.BW_PHYSICAL_UPDATE_EVIDENCE_DIR;
    if(root){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(record));}}
async function close(run){
    const failures=[];
    for(const action of [()=>run?.vm.stopAll(),()=>run?.vm.quit(),()=>quitStrandedVMs(),()=>clearStrayTimers()]){
        try{action();}catch(error){failures.push(error);}
    }
    return failures;
}

test('physical update preserves the complete existing imagePause partial-construction guest',async()=>{
    const source=extendableControls.imagePause,imported=arcadeToPseudocode(source);let run,clock,primary,primaryPresent=false;
    const fact={source,imported,initialHelperFlag:'UNOBSERVED',stages:[]};
    try {
        assert.deepEqual(imported.unsupported,[]);
        run=await runProgram(imported.code,{frames:0,frameAuthority:'timed',storage:true,uploads:imported.costumes});
        fact.initialErrors=errors(run.errors);fact.creatorProject=run.creator.project;
        fact.creatorChannels={warnings:run.creator.warnings,errors:run.creator.errors,unparsed:run.creator.unparsed};
        try {clock=await restartTimedArcadeRun(run,100);}catch(error){primary=error;primaryPresent=true;}
        fact.stages.push({name:'deadline100',values:values(run),errors:errors(run.errors),primary:{present:primaryPresent,value:primaryPresent?errors([primary]):null}});
        if(clock){run.vm.stopAll();await clock.advanceTo(120);fact.stages.push({name:'afterStop120',values:values(run),errors:errors(run.errors)});}
        retain('imagePause',fact);
        if(primaryPresent)throw primary;
        assert.deepEqual(run.errors,[]);
        assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.creator.errors,[]);assert.deepEqual(run.creator.unparsed,[]);
        assert.equal(fact.stages[0].values.completed,7);
        assert.equal(fact.stages[0].values.before,2,'real updates occur before marker initialization');
        assert.equal(fact.stages[0].values.total,4);
    } finally {const cleanup=await close(run);fact.cleanupErrors=errors(cleanup);if(run){fact.finalErrors=errors(run.errors);fact.finalValues=values(run);}retain('imagePause-final',fact);assert.deepEqual(cleanup,[]);if(run)assert.deepEqual(run.errors,[]);}
});

test('a throwing physical root preserves earlier effects and leaves the detached input handler live',async()=>{
    const source=`let ticks=0
let entered=0
let child=0
let after=0
let detached=0
function fail(){child=1;throw "physical-update"}
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){detached+=1})
class Actor extends sprites.ExtendableSprite {
 constructor(){super(img\`1\`,SpriteKind.Player)}
 update(dt:number){ticks+=1;if(entered===0){entered=1;fail();after=1}}
}
let actor=new Actor()`;
    const imported=arcadeToPseudocode(source,{throwPrototype:true});let run,primary,primaryPresent=false;
    const fact={source,imported,initialHelperFlag:'UNOBSERVED',events:[],stages:[]};
    try {
        assert.deepEqual(imported.unsupported,[]);
        run=await runProgram(imported.code,{frames:0,frameAuthority:'timed',storage:true,uploads:imported.costumes});
        fact.initialErrors=errors(run.errors);fact.creatorProject=run.creator.project;
        run.vm.runtime.on('BLOCKS_ERROR',error=>fact.events.push(errors([error])[0]));
        try {await restartTimedArcadeRun(run,40);}catch(error){primary=error;primaryPresent=true;}
        fact.stages.push({name:'afterPhysicalFailure',values:values(run),errors:errors(run.errors),primary:{present:primaryPresent,value:primaryPresent?errors([primary]):null}});
        run.vm.postIOData('keyboard',{key:' ',isDown:true});
        try {await stepFrames(run.vm,8,20);}finally{run.vm.postIOData('keyboard',{key:' ',isDown:false});}
        fact.stages.push({name:'afterActualInput',values:values(run),errors:errors(run.errors)});
        retain('throwingPhysicalUpdate',fact);
        if(primaryPresent)throw primary;
        assert.equal(fact.stages[0].values.entered,1);assert.equal(fact.stages[0].values.child,1);
        assert.equal(fact.stages[0].values.after,0);
        assert.equal(fact.stages[1].values.detached,1,'unrelated event handler must not be retired with the failed update');
        assert.ok(fact.stages[1].values.ticks>=2);
        assert.ok(fact.events.some(e=>String(e?.message||e).includes('physical-update')));
        assert.ok(!run.errors.some(e=>String(e?.message||e).includes('actual managed call')));
    } finally {const cleanup=await close(run);fact.cleanupErrors=errors(cleanup);if(run){fact.finalErrors=errors(run.errors);fact.finalValues=values(run);}retain('throwingPhysicalUpdate-final',fact);assert.deepEqual(cleanup,[]);}
});
