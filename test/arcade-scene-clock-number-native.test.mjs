import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers,quitStrandedVMs} from './helpers/bw-vm.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
import {retain,channels,clean,errorRecord,actualData,captureCreator} from './helpers/scene-clock-native-evidence.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values'),dispatch=require(VM_SRC+'/dispatch/central-dispatch');
const source='let entered=0;let seen=0;let after=0;function receive(value:number){entered+=1;seen=value}receive(game.runtime());receive(game.runtime());let rendered=game.runtime().toString();after=1;';
const imported=source=>{try{return arcadeToPseudocode(source);}catch(error){retain('actual-source-import-error',{input:source,error:errorRecord(error)});throw error;}};
const actualCells=run=>run.vm.runtime.targets.flatMap(target=>Object.entries(target.variables).map(([id,variable])=>{
    const row={target:target.id,targetName:target.sprite?.name,isOriginal:target.isOriginal,id,name:variable.name,raw:actualData(variable.value)};
    try{row.value=BW.decode(variable.value);}catch(error){row.decodeError=errorRecord(error);}return row;
}));
const checkedValues=actual=>Object.fromEntries(['entered','seen','after','rendered'].map(name=>{const matches=actual.cells.filter(cell=>cell.name===name);assert.equal(matches.length,1,'actual unique cell '+name);assert.equal(Object.hasOwn(matches[0],'decodeError'),false);return[name,matches[0].value];}));
const observation=(t,label,run)=>{
    const runtime=run.vm.runtime,cells=actualCells(run),service=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[service],ext=adapter?._inst;
    const references=new Map([[runtime,{$runtime:true}],...runtime.targets.map(target=>[target,{$target:target.id}])]),data=value=>actualData(value,new Map(),references);
    const entry=runtime._blockInfo?.find(category=>category.id==='arcade')?.blocks?.find(entry=>entry.json?.type==='arcade_sceneMillis');
    const actual={label,cells,errors:[...run.errors],creatorChannels:channels(run.creator),calls:[...run.calls],project:JSON.parse(run.vm.toJSON()),binding:{service,instanceRuntimeMatches:ext?._runtime===runtime,entry:data(entry),registeredFunctionMatches:entry?.info?.func===runtime.getOpcodeFunction('arcade_sceneMillis')},scene:data(runtime.bwArcadeDeviceState),sceneSerial:ext?._ownedSpriteSceneSerial,sceneEpoch:ext?._terrainEpoch,sceneRegistry:data(ext?._sceneValues),threads:runtime.threads.map(thread=>({topBlock:thread.topBlock,target:thread.target?.id,status:thread.status,isKilled:thread.isKilled,stack:data(thread.stack),frames:data(thread.stackFrames)})),caches:runtime.targets.map(target=>({target:target.id,cache:data(target.blocks?._cache?._executeCached)}))};
    retain(label+'-runtime',actual);t.diagnostic(JSON.stringify(actual));return actual;
};
const execute=async(label,source,options={})=>{
    retain(label+'-input',{source,options});
    try{return await runProgram(source,{...options,observeCreator:(creator,error)=>captureCreator(label,creator,error)});}
    catch(error){retain(label+'-execution-rejection',{error:errorRecord(error),runtimeReturn:{provided:false,reason:'runProgram rejected before returning its VM handle'}});throw error;}
};
const finish=run=>{run.vm.stopAll();run.vm.clear();run.vm.quit();clearStrayTimers();};
const cleanup=()=>{quitStrandedVMs();clearStrayTimers();};
const instance=run=>{const service=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[service];assert.equal(adapter._inst._runtime,run.vm.runtime);return {adapter,ext:adapter._inst};};
const accepted=(t,label,run,edited=false)=>{const actual=observation(t,label,run);actual.values=checkedValues(actual);clean(run.creator,['warnings','errors','unparsed']);assert.deepEqual(actual.errors,[]);assert.equal(actual.values.entered,2);assert.equal(actual.values.after,1);assert.equal(typeof actual.values.seen,'number');assert.equal(Number.isFinite(actual.values.seen),true);assert.ok(actual.values.seen>=0);assert.equal(typeof actual.values.rendered,'string');assert.equal(Number.isFinite(Number(actual.values.rendered)),true);if(edited){assert.ok(actual.values.seen>=1000000,'actual edited second argument changes the observed value');assert.ok(Number(actual.values.rendered)<actual.values.seen,'unmodified third clock remains independent of the edited argument');}else assert.ok(Number(actual.values.rendered)>=actual.values.seen);assert.equal(run.calls.get('arcade_sceneMillis'),3,'each actual clock expression executes once');};

test('scene clock two sequential ordinary Number callers survive current Code, same/fresh SB3 and edited export/reimport',async t=>{
    const result=imported(source);retain('source-import-return',{result,channels:channels(result)});t.diagnostic(JSON.stringify({stage:'import',result}));clean(result,['unsupported','warnings']);let run;
    try{
        run=await execute('source',result.code,{frames:20});accepted(t,'source',run);const project=JSON.parse(run.vm.toJSON()),code=run.creator.decompile(project),bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());retain('actual-current-Code',{code,project});retain('actual-current-saved-ZIP',bytes,true);t.diagnostic(JSON.stringify({stage:'current Code',code}));
        run.vm.stopAll();retain('same-load-actual-ZIP',bytes,true);await run.vm.loadProject(bytes);run.calls.clear();run.errors.length=0;run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'same SB3',run);finish(run);run=null;
        run=await execute('current-Code',code,{frames:20});accepted(t,'current Code',run);finish(run);run=null;
        run=await execute('fresh-SB3-bootstrap','DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});retain('fresh-bootstrap-unobserved',{initialHelperGreenFlag:'UNOBSERVED/no input/zero requested frames',calls:[...run.calls],errors:[...run.errors]});run.vm.stopAll();retain('fresh-load-actual-ZIP',bytes,true);await run.vm.loadProject(bytes);run.calls.clear();run.errors.length=0;run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'fresh SB3',run);
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
        const exported=projectToArcade(current);retain('edited-current-export-return',{current,exported,channels:channels(exported)});t.diagnostic(JSON.stringify({stage:'edited current export',current,exported}));clean(exported,['unsupported','warnings']);assert.match(exported.ts,/game\.runtime\(\)/);assert.match(exported.ts,/1000000/);finish(run);run=null;
        const again=imported(exported.files);retain('edited-current-reimport-return',{inputFiles:exported.files,again,channels:channels(again)});t.diagnostic(JSON.stringify({stage:'edited current reimport',again}));clean(again,['unsupported','warnings']);
        run=await execute('edited-current-reimport',again.code,{frames:20});accepted(t,'edited export reimport',run,true);
    }catch(error){retain('positive-route-failure',errorRecord(error));throw error;}finally{try{if(run)finish(run);}finally{cleanup();}}
});

for(const mode of ['registered function','source method','adapter delegate','metadata function','metadata extra argument','metadata accessor arguments','opcode lookup','text clock state','nonfinite clock state','current extra field','current extra input'])test('scene clock native Number argument refuses '+mode+' before constrained effects',async t=>{
    const result=imported(source);retain('negative-'+mode+'-import',{result,channels:channels(result)});clean(result,['unsupported','warnings']);let run,restore=()=>{};
    try{
        run=await execute('negative-'+mode,result.code,{frames:20});accepted(t,'genuine before '+mode,run);run.vm.stopAll();run.vm.greenFlag();const runtime=run.vm.runtime,{adapter,ext}=instance(run);
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
        const actual=observation(t,'refused '+mode,run);actual.values=checkedValues(actual);retain('negative-'+mode+'-rejected-frame',{rejectedFrame});t.diagnostic(JSON.stringify({stage:'actual frame rejection channel',mode,rejectedFrame}));assert.equal(actual.values.entered,0);assert.equal(actual.values.after,0);
        assert.ok([...actual.errors,...(rejectedFrame?[rejectedFrame.message]:[])].some(error=>/Scene clock Number:|primitive producer|actual producer|current graph/i.test(error)),'named actual producer refusal; a rejected frame stays a separate channel');
    }finally{try{restore();if(run)finish(run);}finally{cleanup();}}
});

test('scene clock genuine metadata refresh and restart renew current completion, never an old receipt',async t=>{
    const result=imported(source);let run;try{
        run=await execute('refresh',result.code,{frames:20});accepted(t,'before actual refresh',run);run.vm.stopAll();await run.vm.extensionManager.refreshBlocks({throwOnError:true});run.calls.clear();run.errors.length=0;run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'after actual refresh',run);
    }finally{try{if(run)finish(run);}finally{cleanup();}}
});
