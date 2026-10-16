import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values'),dispatch=require(VM_SRC+'/dispatch/central-dispatch');
const source='let entered=0;let seen=0;let after=0;function receive(value:number){entered+=1;seen=value}receive(game.runtime());receive(game.runtime());let rendered=game.runtime().toString();after=1;';
const imported=source=>arcadeToPseudocode(source);
const values=run=>Object.fromEntries(run.vm.runtime.targets.filter(target=>target.isOriginal!==false).flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,BW.decode(variable.value)]));
const cleanCreator=run=>{for(const key of ['warnings','errors','unparsed']){assert.equal(Object.hasOwn(run.creator,key),true);assert.deepEqual(run.creator[key],[]);}};
const observation=(t,label,run)=>{const actual={label,values:values(run),errors:[...run.errors],creator:{warnings:run.creator.warnings,errors:run.creator.errors,unparsed:run.creator.unparsed},calls:[...run.calls],project:JSON.parse(run.vm.toJSON())};t.diagnostic(JSON.stringify(actual));return actual;};
const finish=run=>{run.vm.stopAll();run.vm.quit();clearStrayTimers();};
const instance=run=>{const service=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[service];assert.equal(adapter._inst._runtime,run.vm.runtime);return {adapter,ext:adapter._inst};};
const accepted=(t,label,run,edited=false)=>{const actual=observation(t,label,run);cleanCreator(run);assert.deepEqual(actual.errors,[]);assert.equal(actual.values.entered,2);assert.equal(actual.values.after,1);assert.equal(typeof actual.values.seen,'number');assert.equal(Number.isFinite(actual.values.seen),true);assert.ok(actual.values.seen>=0);assert.equal(typeof actual.values.rendered,'string');assert.equal(Number.isFinite(Number(actual.values.rendered)),true);if(edited){assert.ok(actual.values.seen>=1000000,'actual edited second argument changes the observed value');assert.ok(Number(actual.values.rendered)<actual.values.seen,'unmodified third clock remains independent of the edited argument');}else assert.ok(Number(actual.values.rendered)>=actual.values.seen);assert.equal(run.calls.get('arcade_sceneMillis'),3,'each actual clock expression executes once');};

test('scene clock two sequential ordinary Number callers survive current Code, same/fresh SB3 and edited export/reimport',async t=>{
    const result=imported(source);t.diagnostic(JSON.stringify({stage:'import',result}));assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);let run;
    try{
        run=await runProgram(result.code,{frames:20});accepted(t,'source',run);const project=JSON.parse(run.vm.toJSON()),code=run.creator.decompile(project),bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());t.diagnostic(JSON.stringify({stage:'current Code',code}));
        run.vm.stopAll();await run.vm.loadProject(bytes);run.calls.clear();run.errors.length=0;run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'same SB3',run);finish(run);run=null;
        run=await runProgram(code,{frames:20});accepted(t,'current Code',run);finish(run);run=null;
        run=await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});run.vm.stopAll();await run.vm.loadProject(bytes);run.calls.clear();run.errors.length=0;run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'fresh SB3',run);
        // Genuine current graph edit: append a connected Number addition to the
        // second call's clock operand, with the source clock itself preserved.
        const current=JSON.parse(run.vm.toJSON()),target=current.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sceneMillis'));
        const candidates=Object.entries(target.blocks).filter(([,block])=>block.opcode==='arcade_sceneMillis').map(([id,node])=>{
            let parent=target.blocks[node.parent];const seen=new Set();while(parent&&!['arcade_callFunction','procedures_call'].includes(parent.opcode)){assert.equal(seen.has(parent),false);seen.add(parent);parent=target.blocks[parent.parent];}return {id,node,call:parent};
        }).filter(candidate=>candidate.call);assert.equal(candidates.length,2,'the two actual ordinary callers');
        const precedes=(left,right)=>{let node=target.blocks[left.next];const seen=new Set();while(node&&!seen.has(node)){if(node===right)return true;seen.add(node);node=target.blocks[node.next];}return false;};
        const seconds=candidates.filter(candidate=>candidates.some(other=>other!==candidate&&precedes(other.call,candidate.call)));assert.equal(seconds.length,1,'actual second caller in the current command chain');
        const {id:clockId,node:clock}=seconds[0],parent=target.blocks[clock.parent],slot=Object.entries(parent.inputs).find(([,slot])=>slot[1]===clockId);assert.ok(slot);
        const addition='authored-clock-current-plus';assert.equal(Object.hasOwn(target.blocks,addition),false);
        target.blocks[addition]={opcode:'operator_add',next:null,parent:clock.parent,inputs:{NUM1:[2,clockId],NUM2:[1,[4,'1000000']]},fields:{},shadow:false,topLevel:false};clock.parent=addition;parent.inputs[slot[0]][1]=addition;
        const exported=projectToArcade(current);t.diagnostic(JSON.stringify({stage:'edited current export',current,exported}));assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.match(exported.ts,/game\.runtime\(\)/);assert.match(exported.ts,/1000000/);finish(run);run=null;
        const again=imported(exported.files);t.diagnostic(JSON.stringify({stage:'edited current reimport',again}));assert.deepEqual(again.unsupported,[]);assert.deepEqual(again.warnings,[]);
        run=await runProgram(again.code,{frames:20});accepted(t,'edited export reimport',run,true);
    }finally{if(run)finish(run);}
});

for(const mode of ['registered function','source method','adapter delegate','metadata function','metadata extra argument','metadata accessor arguments','opcode lookup','text clock state','nonfinite clock state','current extra field','current extra input'])test('scene clock native Number argument refuses '+mode+' before constrained effects',async t=>{
    const result=imported(source);assert.deepEqual(result.unsupported,[]);let run,restore=()=>{};
    try{
        run=await runProgram(result.code,{frames:20});accepted(t,'genuine before '+mode,run);run.vm.stopAll();run.vm.greenFlag();const runtime=run.vm.runtime,{adapter,ext}=instance(run);
        if(mode==='registered function'){const original=runtime._primitives.arcade_sceneMillis;runtime._primitives.arcade_sceneMillis=()=>42;restore=()=>{runtime._primitives.arcade_sceneMillis=original;};}
        if(mode==='source method'){ext.sceneMillis=()=>42;restore=()=>{delete ext.sceneMillis;};}
        if(mode==='adapter delegate'){const original=adapter.sceneMillis;adapter.sceneMillis=()=>42;restore=()=>{adapter.sceneMillis=original;};}
        if(mode==='metadata function'){const category=runtime._blockInfo.find(category=>category.id==='arcade'),entry=category.blocks.find(entry=>entry.json?.type==='arcade_sceneMillis'),original=entry.info.func;entry.info.func=()=>42;restore=()=>{entry.info.func=original;};}
        if(mode==='metadata extra argument'){const entry=runtime._blockInfo.find(category=>category.id==='arcade').blocks.find(entry=>entry.json?.type==='arcade_sceneMillis');entry.info.arguments.EXTRA={type:'number'};restore=()=>{delete entry.info.arguments.EXTRA;};}
        if(mode==='metadata accessor arguments'){const info=runtime._blockInfo.find(category=>category.id==='arcade').blocks.find(entry=>entry.json?.type==='arcade_sceneMillis').info,descriptor=Object.getOwnPropertyDescriptor(info,'arguments');Object.defineProperty(info,'arguments',{get(){throw Error('must not read schema accessor');},configurable:true});restore=()=>Object.defineProperty(info,'arguments',descriptor);}
        if(mode==='opcode lookup'){const original=runtime.getOpcodeFunction;runtime.getOpcodeFunction=function(name){return original.call(this,name);};restore=()=>{runtime.getOpcodeFunction=original;};}
        if(mode==='text clock state')runtime.bwArcadeDeviceState.elapsedMs='42';
        if(mode==='nonfinite clock state')runtime.bwArcadeDeviceState.elapsedMs=Infinity;
        if(mode==='current extra field'||mode==='current extra input'){
            const current=JSON.parse(run.vm.toJSON()),target=current.targets.find(target=>Object.values(target.blocks).some(block=>block.opcode==='arcade_sceneMillis')),clock=Object.values(target.blocks).find(block=>block.opcode==='arcade_sceneMillis');
            if(mode==='current extra field')clock.fields.EXTRA=['bad',null];else clock.inputs.EXTRA=[1,[4,'1']];
            run.vm.stopAll();await run.vm.loadProject(current);run.vm.greenFlag();
        }
        let rejectedFrame=null;try{await stepFrames(run.vm,20);}catch(error){rejectedFrame={name:error.name,message:error.message,stack:error.stack};}
        const actual=observation(t,'refused '+mode,run);t.diagnostic(JSON.stringify({stage:'actual frame rejection channel',mode,rejectedFrame}));assert.equal(actual.values.entered,0);assert.equal(actual.values.after,0);
        assert.ok([...actual.errors,...(rejectedFrame?[rejectedFrame.message]:[])].some(error=>/Scene clock Number:|primitive producer|actual producer|current graph/i.test(error)),'named actual producer refusal; a rejected frame stays a separate channel');
    }finally{restore();if(run)finish(run);}
});

test('scene clock genuine metadata refresh and restart renew current completion, never an old receipt',async t=>{
    const result=imported(source);let run;try{
        run=await runProgram(result.code,{frames:20});accepted(t,'before actual refresh',run);run.vm.stopAll();await run.vm.extensionManager.refreshBlocks({throwOnError:true});run.calls.clear();run.errors.length=0;run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'after actual refresh',run);
    }finally{if(run)finish(run);}
});
