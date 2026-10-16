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
    const row={target:target.id,targetName:target.sprite?.name,isStage:target.isStage,isOriginal:target.isOriginal,id,name:variable.name,raw:actualData(variable.value)};
    try{row.value=BW.decode(variable.value);}catch(error){row.decodeError=errorRecord(error);}return row;
}));
// Bind observations to the actual current writer graph and VARIABLE IDs. Export
// may rename sprite variables; neither original names nor expected values select
// a cell. This is an authored test oracle, never a product Number certificate.
const roleBindings=project=>{
    const owners=project.targets.filter(target=>Object.values(target.blocks||{}).some(block=>block.opcode==='procedures_definition'));
    assert.equal(owners.length,1,'one actual procedure target');
    const target=owners[0],blocks=target.blocks,all=Object.values(blocks);
    const one=(items,label)=>{assert.equal(items.length,1,label);return items[0];};
    const child=(block,input)=>{const slot=block.inputs?.[input];assert.ok(Array.isArray(slot));assert.ok([1,2,3].includes(slot[0]));return typeof slot[1]==='string'?blocks[slot[1]]:slot[1];};
    const literal=node=>{
        if(Array.isArray(node))return [4,5,6,7,8,10].includes(node[0])?node[1]:undefined;
        if(node?.opcode==='math_number')return node.fields.NUM[0];
        if(node?.opcode==='text')return node.fields.TEXT[0];
        if(node?.opcode==='operator_add'&&Number(literal(child(node,'NUM1')))===0)return literal(child(node,'NUM2'));
        return undefined;
    };
    const chain=start=>{const result=[],seen=new Set();let node=start;while(node){assert.equal(seen.has(node),false,'acyclic actual command chain');seen.add(node);result.push(node);node=node.next?blocks[node.next]:null;}return result;};
    const descendants=start=>{const result=[],seen=new Set();const visit=node=>{if(!node||Array.isArray(node))return;assert.equal(seen.has(node),false,'unique actual expression edge');seen.add(node);result.push(node);for(const name of Object.keys(node.inputs||{}))visit(child(node,name));};visit(start);return result;};
    const definition=one(all.filter(block=>block.opcode==='procedures_definition'),'one actual definition'),body=chain(blocks[definition.next]);
    const constraint=one(body.filter(block=>block.opcode==='arcade_declareParameterConstraint'),'one connected Number formal');assert.equal(constraint.fields.TYPE[0],'Number');
    const assignment=one(body.filter(block=>block.opcode==='data_setvariableto'&&child(block,'VALUE')?.opcode==='arcade_getLocal'),'one connected formal assignment'),formal=child(assignment,'VALUE');assert.equal(literal(child(formal,'NAME')),constraint.fields.PARAMETER[0]);
    // The actual typed scalar lowerer represents entered += 1 as a native
    // binary-value assignment. Select it by its owned self-read and literal
    // operand, never by its current cell value or source variable spelling.
    const increment=one(body.filter(block=>{
        if(block.opcode!=='data_setvariableto'||block===assignment)return false;
        const value=child(block,'VALUE'),left=value?.opcode==='arrays_valueBinary'?child(value,'LEFT'):null,right=value?.opcode==='arrays_valueBinary'?child(value,'RIGHT'):null,field=block.fields.VARIABLE;
        return value?.fields?.OP?.[0]==='+'&&Array.isArray(left)&&left.length===3&&left[0]===12&&left[1]===field[0]&&left[2]===field[1]&&Number(literal(right))===1;
    }),'one connected typed owned self-read plus one writer');
    assert.deepEqual(body,[constraint,increment,assignment],'exact connected constraint, self increment, formal assignment body');
    const hat=one(all.filter(block=>block.opcode==='arcade_whenSourceStarts'),'one current main hat'),main=chain(blocks[hat.next]);
    const calls=main.filter(block=>block.opcode==='procedures_call');assert.equal(calls.length,2,'two connected ordinary callers');
    const prototype=child(definition,'custom_block');assert.equal(prototype?.opcode,'procedures_prototype');assert.equal(prototype.mutation.proccode,constraint.fields.PROCEDURE[0]);
    for(const call of calls){assert.equal(call.mutation.proccode,prototype.mutation.proccode);assert.equal(descendants(call).filter(node=>node.opcode==='arcade_sceneMillis').length,1,'each current caller owns one clock expression');}
    const rendered=one(main.filter(block=>block.opcode==='data_setvariableto'&&descendants(child(block,'VALUE')).some(node=>node.opcode==='arcade_sceneMillis')),'one connected clock text writer');
    const text=child(rendered,'VALUE');assert.ok(['operator_join','arcade_inspectValue'].includes(text?.opcode),'actual Number text lowering');assert.equal(descendants(text).filter(node=>node.opcode==='arcade_sceneMillis').length,1);
    const after=main.at(-1);assert.equal(after.opcode,'data_setvariableto');assert.equal(Number(literal(child(after,'VALUE'))),1);assert.ok(main.indexOf(calls[1])<main.indexOf(rendered)&&main.indexOf(rendered)<main.indexOf(after),'call, text, completion order');
    const roles={entered:increment,seen:assignment,rendered,after},bindings={};
    for(const [role,writer]of Object.entries(roles)){
        const field=writer.fields.VARIABLE;assert.ok(Array.isArray(field)&&typeof field[1]==='string');
        const owner=one(project.targets.filter(candidate=>Object.hasOwn(candidate.variables||{},field[1])),'unique current variable owner '+role),variable=owner.variables[field[1]];assert.equal(variable[0],field[0]);
        bindings[role]={id:field[1],name:variable[0],ownerName:owner.name,isStage:owner.isStage,writer:Object.keys(blocks).find(id=>blocks[id]===writer)};
    }
    assert.equal(new Set(Object.values(bindings).map(binding=>binding.id)).size,4,'four distinct actual variable IDs');
    const clockOperands=calls.map(call=>{const node=one(descendants(call).filter(node=>node.opcode==='arcade_sceneMillis'),'one actual clock operand per connected call');return{id:Object.keys(blocks).find(id=>blocks[id]===node),node,call};});
    return {bindings,target,clockOperands};
};
const checkedValues=actual=>{
    const {bindings}=roleBindings(actual.project);retain(actual.label+'-actual-role-bindings',bindings);
    return Object.fromEntries(Object.entries(bindings).map(([role,binding])=>{const matches=actual.cells.filter(cell=>cell.id===binding.id);assert.equal(matches.length,1,'actual unique cell ID '+role);const cell=matches[0];assert.equal(cell.name,binding.name);assert.equal(cell.targetName,binding.ownerName);assert.equal(cell.isStage,binding.isStage);assert.equal(Object.hasOwn(cell,'decodeError'),false);return[role,cell.value];}));
};
const observation=(t,label,run)=>{
    const runtime=run.vm.runtime,cells=actualCells(run),service=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[service],ext=adapter?._inst;
    const references=new Map([[runtime,{$runtime:true}],...runtime.targets.map(target=>[target,{$target:target.id}])]),data=value=>actualData(value,new Map(),references);
    const entry=runtime._blockInfo?.find(category=>category.id==='arcade')?.blocks?.find(entry=>entry.json?.type==='arcade_sceneMillis');
    const actual={label,cells,errors:[...run.errors],creatorChannels:channels(run.creator),calls:[...run.calls],project:JSON.parse(run.vm.toJSON()),binding:{service,instanceRuntimeMatches:ext?._runtime===runtime,entry:data(entry),registeredFunctionMatches:entry?.info?.func===runtime.getOpcodeFunction('arcade_sceneMillis')},scene:data(runtime.bwArcadeDeviceState),sceneSerial:ext?._ownedSpriteSceneSerial,sceneEpoch:ext?._terrainEpoch,sceneRegistry:data(ext?._sceneValues),threads:runtime.threads.map(thread=>({topBlock:thread.topBlock,target:thread.target?.id,status:thread.status,isKilled:thread.isKilled,stack:data(thread.stack),frames:data(thread.stackFrames)})),caches:runtime.targets.map(target=>({target:target.id,cache:data(target.blocks?._cache?._executeCached)}))};
    retain(label+'-runtime',actual);t.diagnostic(JSON.stringify(actual));return actual;
};
const execute=async(label,source,options={})=>{
    retain(label+'-input',{source,options,generatedBootstrapZIP:{provided:false,boundary:'runProgram internally generates and loads its Creator ZIP; exact bootstrap ZIP bytes UNOBSERVED. Actual later VM-saved ZIP bytes are retained separately before every explicit same/fresh load.'}});
    try{return await runProgram(source,{...options,observeCreator:(creator,error)=>captureCreator(label,creator,error)});}
    catch(error){retain(label+'-execution-rejection',{error:errorRecord(error),runtimeReturn:{provided:false,reason:'runProgram rejected before returning its VM handle'}});throw error;}
};
const finish=(run,expectedErrors=[],primaryError=null)=>{
    const failures=[];
    const actions=[...(run?[['stopAll',()=>run.vm.stopAll()],['clear',()=>run.vm.clear()],['quit',()=>run.vm.quit()]]:[]),['quitStrandedVMs',quitStrandedVMs],['clearStrayTimers',clearStrayTimers]];
    for(const [label,action]of actions)try{action();}catch(error){failures.push({label,error:errorRecord(error)});}
    const errors=run?{provided:Object.hasOwn(run,'errors'),kind:Array.isArray(run.errors)?'array':typeof run.errors,value:run.errors}:{provided:false,reason:'no returned VM handle'};
    retain('actual-post-cleanup',{errors,failures,expectedErrors,primaryError:primaryError?errorRecord(primaryError):null});
    try{assert.deepEqual(failures,[]);if(run){assert.ok(Array.isArray(run.errors),'actual post-cleanup runtime error array');assert.deepEqual(run.errors,expectedErrors,'cleanup cannot silently append runtime errors');}}
    catch(error){if(!primaryError)throw error;retain('secondary-cleanup-failure',errorRecord(error));}
};
const instance=run=>{const service=run.vm.extensionManager._loadedExtensions.get('arcade'),adapter=dispatch.services[service];assert.equal(adapter._inst._runtime,run.vm.runtime);return {adapter,ext:adapter._inst};};
const accepted=(t,label,run,edited=false)=>{const actual=observation(t,label,run);actual.values=checkedValues(actual);clean(run.creator,['warnings','errors','unparsed']);assert.equal(actual.binding.instanceRuntimeMatches,true);assert.equal(actual.binding.registeredFunctionMatches,true);assert.deepEqual(actual.errors,[]);assert.equal(actual.values.entered,2);assert.equal(actual.values.after,1);assert.equal(typeof actual.values.seen,'number');assert.equal(Number.isFinite(actual.values.seen),true);assert.ok(actual.values.seen>=0);assert.equal(typeof actual.values.rendered,'string');assert.equal(Number.isFinite(Number(actual.values.rendered)),true);if(edited){assert.ok(actual.values.seen>=1000000,'actual edited second argument changes the observed value');assert.ok(Number(actual.values.rendered)<actual.values.seen,'unmodified third clock remains independent of the edited argument');}else assert.ok(Number(actual.values.rendered)>=actual.values.seen);assert.equal(run.calls.get('arcade_sceneMillis'),3,'each actual clock expression executes once');};

const transition=async(t,label,run,operation)=>{
    observation(t,label+' before',run);assert.ok(Array.isArray(run.errors));assert.deepEqual(run.errors,[]);
    try{await operation();}catch(error){retain(label+'-transition-rejection',errorRecord(error));observation(t,label+' rejected',run);throw error;}
    const actual=observation(t,label+' after',run);assert.ok(Array.isArray(run.errors));assert.deepEqual(actual.errors,[],'stop/load/refresh cannot silently append errors');
};
test('scene clock two sequential ordinary Number callers survive current Code, same/fresh SB3 and edited export/reimport',async t=>{
    const result=imported(source);retain('source-import-return',{result,channels:channels(result)});t.diagnostic(JSON.stringify({stage:'import',result}));clean(result,['unsupported','warnings']);let run,primaryError=null;
    try{
        run=await execute('source',result.code,{frames:20});accepted(t,'source',run);const project=JSON.parse(run.vm.toJSON()),code=run.creator.decompile(project),bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());retain('actual-current-Code',{code,project});retain('actual-current-saved-ZIP',bytes,true);t.diagnostic(JSON.stringify({stage:'current Code',code}));
        await transition(t,'same stop',run,()=>run.vm.stopAll());retain('same-load-actual-ZIP',bytes,true);await transition(t,'same load',run,()=>run.vm.loadProject(bytes));run.calls.clear();run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'same SB3',run);finish(run);run=null;
        run=await execute('current-Code',code,{frames:20});accepted(t,'current Code',run);finish(run);run=null;
        run=await execute('fresh-SB3-bootstrap','DEVICE ARCADE\nSPRITE Game:\nWHEN arcade source starts:\n  hide',{frames:0});retain('fresh-bootstrap-unobserved',{initialHelperGreenFlag:'UNOBSERVED/no input/zero requested frames',calls:[...run.calls],errors:[...run.errors]});await transition(t,'fresh stop',run,()=>run.vm.stopAll());retain('fresh-load-actual-ZIP',bytes,true);await transition(t,'fresh load',run,()=>run.vm.loadProject(bytes));run.calls.clear();run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'fresh SB3',run);
        // Genuine current graph edit: append a connected Number addition to the
        // second call's clock operand, with the source clock itself preserved.
        const current=JSON.parse(run.vm.toJSON()),{target,clockOperands:candidates}=roleBindings(current);assert.equal(candidates.length,2,'the two actual ordinary caller operands, using expression input edges only');
        const precedes=(left,right)=>{let node=target.blocks[left.next];const seen=new Set();while(node&&!seen.has(node)){if(node===right)return true;seen.add(node);node=target.blocks[node.next];}return false;};
        const seconds=candidates.filter(candidate=>candidates.some(other=>other!==candidate&&precedes(other.call,candidate.call)));assert.equal(seconds.length,1,'actual second caller in the current command chain');
        const {id:clockId,node:clock}=seconds[0],parent=target.blocks[clock.parent],slot=Object.entries(parent.inputs).find(([,slot])=>slot[1]===clockId);assert.ok(slot);
        const addition='authored-clock-current-plus';assert.equal(Object.hasOwn(target.blocks,addition),false);
        target.blocks[addition]={opcode:'operator_add',next:null,parent:clock.parent,inputs:{NUM1:[2,clockId],NUM2:[1,[4,'1000000']]},fields:{},shadow:false,topLevel:false};clock.parent=addition;parent.inputs[slot[0]][1]=addition;
        const exported=projectToArcade(current);retain('edited-current-export-return',{current,exported,channels:channels(exported)});t.diagnostic(JSON.stringify({stage:'edited current export',current,exported}));clean(exported,['unsupported','warnings']);assert.match(exported.ts,/game\.runtime\(\)/);assert.match(exported.ts,/1000000/);finish(run);run=null;
        const again=imported(exported.files);retain('edited-current-reimport-return',{inputFiles:exported.files,again,channels:channels(again)});t.diagnostic(JSON.stringify({stage:'edited current reimport',again}));clean(again,['unsupported','warnings']);
        run=await execute('edited-current-reimport',again.code,{frames:20});accepted(t,'edited export reimport',run,true);
    }catch(error){primaryError=error;retain('positive-route-failure',errorRecord(error));throw error;}finally{finish(run,[],primaryError);}
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
    }finally{try{restore();}finally{finish(run,Array.isArray(run?.errors)?[...run.errors]:[]);}}
});

test('scene clock genuine metadata refresh and restart renew current completion, never an old receipt',async t=>{
    const result=imported(source);let run;try{
        run=await execute('refresh',result.code,{frames:20});accepted(t,'before actual refresh',run);await transition(t,'refresh stop',run,()=>run.vm.stopAll());await transition(t,'refresh metadata',run,()=>run.vm.extensionManager.refreshBlocks({throwOnError:true}));run.calls.clear();run.vm.greenFlag();await stepFrames(run.vm,20);accepted(t,'after actual refresh',run);
    }finally{finish(run);}
});
