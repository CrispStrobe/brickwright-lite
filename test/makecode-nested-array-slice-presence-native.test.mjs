import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {VM,runProgram,stepFrames,clearStrayTimers,quitStrandedVMs,INTEGRATED} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {loadExtensionClass,bundledExtensionIds} from './helpers/bw-extensions.mjs';
import {runPxtScheduled} from './helpers/pxt-scheduled-runtime.mjs';
const require=createRequire(import.meta.url);
const BW=require(path.join(INTEGRATED,'node_modules/scratch-vm/src/util/bw-values.js'));
const build=source=>{const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.errors,[]);assert.deepEqual(creator.warnings,[]);return creator;};
const allBlocks=creator=>creator.project.targets.flatMap(target=>Object.values(target.blocks));
const baseline='let rows=[[5],[6]];let copied=rows.slice(0,1);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];';

test('actual Blocks and generated Code slice-bound edits invalidate presence without restoring original source',()=>{
    const creator=build(baseline),target=creator.project.targets.find(target=>Object.values(target.blocks).some(b=>b.opcode==='arrays_referenceSlice'));
    const slice=Object.values(target.blocks).find(b=>b.opcode==='arrays_referenceSlice');
    const receiverPair=b=>{
        const slot=b.inputs?.ARRAY?.[1];
        if(Array.isArray(slot)&&slot.length===3&&slot[0]===12)return slot.slice(1);
        const reporter=typeof slot==='string'&&target.blocks[slot];
        return reporter?.opcode==='data_variable'?reporter.fields?.VARIABLE:null;
    };
    const consumers=Object.values(target.blocks).filter(b=>b.opcode==='arrays_mutateReference'&&receiverPair(b)?.[0]==='selected');
    assert.equal(consumers.length,1,'one actual indexed write targets the selected row');
    const consumer=consumers[0],receiver=receiverPair(consumer);
    assert.equal(receiver.length,2);assert.equal(receiver[0],'selected');
    const declarations=creator.project.targets.filter(t=>Object.hasOwn(t.variables||{},receiver[1]));
    assert.equal(declarations.length,1);assert.equal(declarations[0].variables[receiver[1]][0],'selected','actual receiver ID and name agree');
    const proof=createArrayReferenceExportAuthority(creator.project);
    assert.equal(proof.validateInput(target,consumer).ok,true);assert.deepEqual(projectToArcade(creator.project).unsupported,[]);
    const bound=target.blocks[slice.inputs.START[1]];assert.equal(bound.opcode,'operator_add');
    const before=creator.decompile(),value=bound.inputs.NUM2[1];
    if(Array.isArray(value)){assert.ok([4,5,6,7,8].includes(value[0]));assert.equal(Number(value[1]),0);value[1]='9';}
    else {const shadow=target.blocks[value];assert.equal(shadow.opcode,'math_number');assert.equal(Number(shadow.fields.NUM[0]),0);shadow.fields.NUM[0]='9';}
    assert.equal(proof.validateInput(target,consumer).ok,false,'old physical proof is not current after the real bound edit');
    const edited=creator.decompile();assert.notEqual(edited,before);
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>/^Array reference /.test(s)));
    const fromCode=new Creator();fromCode.parse(edited);assert.deepEqual(fromCode.errors,[]);assert.deepEqual(fromCode.warnings,[]);
    assert.ok(projectToArcade(fromCode.project).unsupported.some(s=>/^Array reference /.test(s)),'Code contains the edited bound, not original source');
    const pattern=/(slice array reference [^\n]+? from )(.+?)( to )/g;
    assert.equal([...edited.matchAll(pattern)].length,1);
    const repaired=edited.replace(pattern,(_whole,prefix,_start,to)=>prefix+'(0 + 0)'+to);
    assert.notEqual(repaired,edited);const fresh=new Creator();fresh.parse(repaired);
    assert.deepEqual(fresh.errors,[]);assert.deepEqual(fresh.warnings,[]);assert.deepEqual(projectToArcade(fresh.project).unsupported,[]);
    assert.equal(allBlocks(fresh).filter(b=>b.opcode==='arrays_referenceSlice').length,1);
});

// Three independently named supported windows in one finite program: a source
// shrink before copying, negative END, and result shrink after row acquisition.
// All outer copies are detached; their surviving nested row objects are shared.
const source=`let rows=[[5],[6],[7]];rows.pop();let copied=rows.slice(0,1);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];let detached=copied!==rows;let sourceLength=rows.length;let copiedLength=copied.length;
let tailRows=[[15],[16]];let tailCopy=tailRows.slice(0,-1);let tailAlias=tailCopy;let tailSelected:number[]=null;tailSelected=tailAlias[0];tailSelected[0]=19;let tailObserved=tailRows[0][0];let tailSame=tailSelected===tailRows[0];let tailDetached=tailCopy!==tailRows;let tailLength=tailCopy.length;
let popRows=[[25],[26]];let popCopy=popRows.slice(0,1);let popAlias=popCopy;let popSelected:number[]=null;popSelected=popAlias[0];popCopy.pop();popSelected[0]=29;let popObserved=popRows[0][0];let popSame=popSelected===popRows[0];let popDetached=popCopy!==popRows;let popLength=popCopy.length;`;
const expected={observed:9,same:true,detached:true,sourceLength:2,copiedLength:1,tailObserved:19,tailSame:true,tailDetached:true,tailLength:1,popObserved:29,popSame:true,popDetached:true,popLength:0};
const normalize=name=>name.replace(/^Game_/,'');
function nativeState(vm){
    const rows=vm.runtime.targets.flatMap(target=>Object.values(target.variables||{}));
    const value=name=>{const matches=rows.filter(row=>normalize(row.name)===name);assert.equal(matches.length,1,name);return matches[0].value;};
    const scalars=Object.fromEntries(Object.keys(expected).map(name=>[name,BW.decode(value(name))]));
    const aliases=[];
    for(const [rowsName,copyName,aliasName,selectedName,popped] of [['rows','copied','alias','selected',false],['tailRows','tailCopy','tailAlias','tailSelected',false],['popRows','popCopy','popAlias','popSelected',true]]){
        const rowsBody=BW.arrayValue(vm.runtime,value(rowsName)),copyBody=BW.arrayValue(vm.runtime,value(copyName));
        assert.ok(Array.isArray(rowsBody));assert.ok(Array.isArray(copyBody));
        aliases.push({sameCopy:value(copyName)===value(aliasName),detached:copyBody!==rowsBody,sharedRow:value(selectedName)===rowsBody[0],copyRow:popped?copyBody.length===0:copyBody[0]===rowsBody[0]});
    }
    return {scalars,aliases};
}
function checkNative(t,run,stage){
    t.diagnostic(JSON.stringify({stage,errors:run.errors}));
    const actual=nativeState(run.vm);t.diagnostic(JSON.stringify({stage,...actual,errors:run.errors}));
    assert.deepEqual(run.errors,[],stage);assert.deepEqual(actual.scalars,expected,stage);
    for(const alias of actual.aliases)assert.deepEqual(alias,{sameCopy:true,detached:true,sharedRow:true,copyRow:true},stage);
    return actual;
}
async function reopenFresh(buffer,vms){
    const vm=new VM();vms.add(vm);const errors=[];vm.runtime.on('BLOCKS_ERROR',e=>errors.push(e));
    const Storage=(await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;vm.attachStorage(new Storage());
    const ids=bundledExtensionIds(),manager=vm.extensionManager,original=manager.loadExtensionURL.bind(manager);
    manager.loadExtensionURL=id=>{
        if(!ids.has(id))return original(id);
        if(!manager.isExtensionLoaded(id))manager._loadedExtensions.set(id,manager._registerInternalExtension(new (loadExtensionClass(ids.get(id)))(vm.runtime)));
        return Promise.resolve();
    };
    await vm.loadProject(buffer);vm.runtime.bwArcadeFrameAuthority='manual';vm.start();vm.greenFlag();vm.quit();await stepFrames(vm,20);return {vm,errors};
}

test('bounded nested slice values and shallow aliases survive Code same/fresh SB3 and one original PXT execution',async t=>{
    const vms=new Set();t.after(()=>{
        const cleanup=[];
        for(const vm of vms){try{vm.stopAll();}catch(e){cleanup.push(e);}try{vm.quit();}catch(e){cleanup.push(e);}}
        try{quitStrandedVMs();}catch(e){cleanup.push(e);}try{clearStrayTimers();}catch(e){cleanup.push(e);}
        assert.deepEqual(cleanup,[],'all owned VM/timer cleanup returns');
    });
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:20,storage:true});vms.add(run.vm);
    assert.deepEqual(run.creator.errors,[]);assert.deepEqual(run.creator.warnings,[]);checkNative(t,run,'source');
    assert.equal(allBlocks(run.creator).filter(b=>b.opcode==='arrays_referenceSlice').length,3);
    const code=await runProgram(run.creator.decompile(),{frames:20,storage:true});vms.add(code.vm);checkNative(t,code,'generated-Code');
    const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()),prior=nativeState(run.vm);
    t.diagnostic(JSON.stringify({stage:'saved-SB3',bytes:saved.length,prior}));
    await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,20);checkNative(t,run,'same-VM-SB3');
    const fresh=await reopenFresh(saved,vms);checkNative(t,fresh,'fresh-VM-SB3');
    const project=JSON.parse(fresh.vm.toJSON()),before=structuredClone(project);
    const exported=projectToArcade(project,{costumeSvg:(_target,costume)=>run.creator.assets.get(costume.assetId)?.data});
    t.diagnostic(JSON.stringify({stage:'current-live-export',unsupported:exported.unsupported,warnings:exported.warnings,files:Object.keys(exported.files||{})}));
    assert.deepEqual(project,before);assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.equal(exported.files['main.ts'],exported.ts);
    const reimported=arcadeToPseudocode(exported.files);assert.deepEqual(reimported.unsupported,[]);
    const back=await runProgram(reimported.code,{frames:20,storage:true});vms.add(back.vm);checkNative(t,back,'exported-files-reimport');
    // Exactly one new original compilation and genuine scheduler execution.
    // Core-only exported TS is compiled here, not a previously built full-game binary.
    const original=await runPxtScheduled(exported.ts);const entries=Object.entries(original.globals);
    const pxt=name=>{const matches=entries.filter(([key])=>normalize(key)===name);assert.equal(matches.length,1,'PXT '+name);return matches[0][1];};
    const scalars=Object.fromEntries(Object.keys(expected).map(name=>[name,pxt(name)]));
    const aliases=[];
    for(const [rowsName,copyName,aliasName,selectedName,popped] of [['rows','copied','alias','selected',false],['tailRows','tailCopy','tailAlias','tailSelected',false],['popRows','popCopy','popAlias','popSelected',true]]){
        const rows=pxt(rowsName),copy=pxt(copyName);assert.ok(Array.isArray(rows.data));assert.ok(Array.isArray(copy.data));
        aliases.push({sameCopy:copy===pxt(aliasName),detached:copy!==rows,sharedRow:pxt(selectedName)===rows.data[0],copyRow:popped?copy.data.length===0:copy.data[0]===rows.data[0]});
    }
    t.diagnostic(JSON.stringify({stage:'original-PXT',scalars,aliases,scheduler:original.scheduler}));
    assert.deepEqual(scalars,expected);for(const alias of aliases)assert.deepEqual(alias,{sameCopy:true,detached:true,sharedRow:true,copyRow:true});
    assert.equal(original.scheduler.mainCompleted,true);assert.equal(original.scheduler.pendingChildFibers,0);assert.equal(original.scheduler.suspendedFrames,0);assert.equal(original.scheduler.observedErrors,0);assert.equal(original.scheduler.cleanup.cleanupErrorCount,0);
});
