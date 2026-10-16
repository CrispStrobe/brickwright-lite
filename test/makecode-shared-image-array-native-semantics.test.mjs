import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import JSZip from 'jszip';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {VM_SRC} from './helpers/bw-extensions.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values.js');

// Public Code route only. Current Code, portable reload, changed artwork and
// original SDK execution require distinct qualification. No edited-art fallback.
const source=`let pictures: Image[] = [img\`1 .
. 2\`]
let equalPictures: Image[] = [img\`1 .
. 2\`]
let first = pictures[0]
let initialPixel = first.getPixel(0, 0)
first.setPixel(0, 0, 7)
let again = pictures[0]
let aliasPixel = again.getPixel(0, 0)
let copy = pictures[0].clone()
first.setPixel(0, 0, 8)
let clonePixel = copy.getPixel(0, 0)
let mutatedPixel = again.getPixel(0, 0)
let independent = equalPictures[0]
let independentPixel = independent.getPixel(0, 0)
let ordinary: number[] = []
ordinary.push(3)
ordinary.push(4)
let ordinaryCount = ordinary.length
let ordinaryItem = ordinary[0]
console.log(initialPixel)
console.log(aliasPixel)
console.log(clonePixel)
console.log(mutatedPixel)
console.log(independentPixel)
console.log(ordinaryCount)
console.log(ordinaryItem)`;
const expected={initialPixel:1,aliasPixel:7,clonePixel:7,mutatedPixel:8,independentPixel:1,ordinaryCount:2,ordinaryItem:3};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const channels=value=>Object.fromEntries(Object.getOwnPropertyNames(value).filter(k=>/unsupported|warn|error|unparsed|diagnostic|refus/i.test(k)).map(key=>{
    const d=Object.getOwnPropertyDescriptor(value,key);return[key,!Object.hasOwn(d,'value')?{kind:'accessor-not-read'}:{kind:Array.isArray(d.value)?'array':d.value===null?'null':typeof d.value,value:d.value}];
}));
const requireClean=value=>{for(const [key,row]of Object.entries(channels(value)))assert.ok(row.kind==='array'&&row.value.length===0,key);};

// All writes are charged together. A packet must additionally bound actual
// import traces and child logs; this counter does not claim a filesystem quota.
function evidence(){
    const root=process.env.BW_SHARED_FRAME_NATIVE_OUTPUT;
    // Ordinary unit discovery runs every semantic assertion without a private
    // output path. A qualification launcher must require the exact owned path
    // before importing this whole module and admit all captures afterwards.
    if(!root)return {write(){},json(){},inventory:[]};
    let total=0;const inventory=[];
    const write=(name,bytes)=>{assert.equal(path.basename(name),name);const b=Buffer.from(bytes);assert.ok(b.length<=16*1024*1024);assert.ok(total+b.length<=96*1024*1024);fs.writeFileSync(path.join(root,name),b,{flag:'wx'});total+=b.length;inventory.push({name,bytes:b.length,sha256:sha(b)});};
    return {write,json:(name,value)=>write(name,JSON.stringify(value,(_k,v)=>v===undefined?{$actualScalar:'Undefined'}:v,2)+'\n'),inventory};
}

test('actual shared Image aliases clones equal resources and ordinary Arrays survive Stop and restart',async()=>{
    const out=evidence(),failures=[],cleanup=[],runs=[];let run,primary;
    const attempt=(phase,operation)=>{try{return operation();}catch(error){cleanup.push({phase,message:String(error)});return null;}};
    out.json('source.json',{source,expected,scope:'ONE_PUBLIC_CODE_NATIVE_ALIAS_CLONE_STOP_RESTART; CHANGED_ART_UNAVAILABLE'});
    try{
        const imported=arcadeToPseudocode(source);out.json('actual-import.json',{imported,channels:channels(imported)});requireClean(imported);
        run=await runProgram(imported.code,{frames:0,storage:true,retainExtensionTimers:true,frameAuthority:'timed',uploads:imported.costumes,
            observeCreator(creator,error){out.json('actual-creator-before-helper-load.json',{project:creator.project,channels:channels(creator),parseError:error?String(error):null});}});
        runs.push(run);
        // This is the helper's actual original buffer, retained after its load.
        // Its bootstrap activation is not claimed as observed source execution.
        out.write('actual-helper.sb3',run.buffer);
        out.json('actual-runtime-after-helper.json',{project:JSON.parse(run.vm.toJSON()),errors:run.errors,calls:[...run.calls.entries()],bootstrap:'UNOBSERVED_HELPER_ACTIVATION'});
        const zip=await JSZip.loadAsync(run.buffer),members=[];
        for(const name of Object.keys(zip.files).sort())if(!zip.files[name].dir){const bytes=await zip.files[name].async('nodebuffer');members.push({name,bytes:bytes.length,sha256:sha(bytes)});out.write('zip-member-'+members.length+'.bin',bytes);}
        out.json('actual-helper-members.json',members);requireClean(run.creator);
        const actualFrameBlocks=run.creator.project.targets.flatMap(target=>Object.entries(target.blocks||{}).filter(([,b])=>b.opcode==='arcade_frameImage').map(([id,block])=>({owner:{isStage:target.isStage,name:target.name},id,block})));
        out.json('actual-shared-frame-blocks.json',actualFrameBlocks);
        assert.equal(actualFrameBlocks.length,4,'four actual source selections use the native shared resource word');
        const resourceKeys=new Set(actualFrameBlocks.map(({block})=>{const socket=block.inputs.KEY;assert.ok(Array.isArray(socket)&&socket[0]===1&&Array.isArray(socket[1])&&socket[1][0]===10);return socket[1][1];}));
        assert.equal(resourceKeys.size,2,'two distinct actual backing resources, even with equal pixels');
        const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
        const service=run.vm.extensionManager._loadedExtensions.get('arcade'),arcade=dispatch.services[service]?._inst;
        assert.ok(arcade&&arcade._runtime===run.vm.runtime,'current real per-VM extension owner');
        const roleNames=[...Object.keys(expected),'first','again','copy','independent','ordinary'];
        const roles={};
        for(const name of roleNames){
            const owners=run.creator.project.targets.flatMap(target=>Object.entries(target.variables||{}).filter(([,v])=>v[0]===name).map(([id])=>({isStage:target.isStage,name:target.name,id,writerBlocks:run.creator.project.targets.flatMap(writerOwner=>Object.entries(writerOwner.blocks||{}).filter(([,b])=>b.opcode==='data_setvariableto'&&b.fields?.VARIABLE?.[1]===id).map(([blockId,b])=>({blockId,block:b,writerOwner:{isStage:writerOwner.isStage,name:writerOwner.name}})))})));
            out.json('actual-role-candidates-'+name+'.json',owners);
            assert.equal(owners.length,1,'unique actual Creator variable '+name);const owner=owners[0];
            const targets=run.vm.runtime.targets.filter(t=>t.isOriginal!==false&&t.isStage===owner.isStage&&t.getName()===owner.name);
            assert.equal(targets.length,1,'same unique actual stage/name owner '+name);const target=targets[0],variable=target.variables[owner.id];
            assert.ok(variable&&variable.name===name,'same actual variable id and owner '+name);assert.ok(owner.writerBlocks.length,'actual connected variable writer '+name);
            for(const [writerIndex,writer]of owner.writerBlocks.entries()){
                const creatorOwners=run.creator.project.targets.filter(t=>t.isStage===writer.writerOwner.isStage&&t.name===writer.writerOwner.name);
                const runtimeOwners=run.vm.runtime.targets.filter(t=>t.isOriginal!==false&&t.isStage===writer.writerOwner.isStage&&t.getName()===writer.writerOwner.name);
                assert.equal(creatorOwners.length,1);assert.equal(runtimeOwners.length,1);const sourceOwner=creatorOwners[0],actualOwner=runtimeOwners[0];
                const actualWriter=actualOwner.blocks.getBlock(writer.blockId),stageOwners=run.vm.runtime.targets.filter(t=>t.isStage);assert.equal(stageOwners.length,1);
                // Guarded Target.lookupVariableById semantics: local table first,
                // then Stage globals for a non-stage target. No same-name lookup.
                const local=Object.hasOwn(actualOwner.variables,owner.id),resolved=local?actualOwner.variables[owner.id]:!actualOwner.isStage&&Object.hasOwn(stageOwners[0].variables,owner.id)?stageOwners[0].variables[owner.id]:undefined;
                const chain=[];let cursor=writer.blockId,issue=null;const seen=new Set();
                while(cursor){
                    if(seen.has(cursor)){issue='CYCLIC_PARENT_CHAIN';break;}seen.add(cursor);
                    const original=sourceOwner.blocks[cursor],actual=actualOwner.blocks.getBlock(cursor);
                    if(!original||!actual){issue='MISSING_PHYSICAL_CHAIN_BLOCK';break;}
                    const incoming=[];
                    for(const [parentId,b]of Object.entries(sourceOwner.blocks)){
                        if(b.next===cursor)incoming.push({parentId,kind:'next'});
                        for(const [input,socket]of Object.entries(b.inputs||{}))if(Array.isArray(socket)&&socket.slice(1).some(value=>value===cursor))incoming.push({parentId,kind:'input',input});
                    }
                    const runtimeIncoming=[];
                    for(const [parentId,b]of Object.entries(actualOwner.blocks._blocks)){
                        if(b.next===cursor)runtimeIncoming.push({parentId,kind:'next'});
                        for(const [input,socket]of Object.entries(b.inputs||{}))if(socket.block===cursor||socket.shadow===cursor)runtimeIncoming.push({parentId,kind:'input',input});
                    }
                    const edgeKey=edge=>JSON.stringify(edge);incoming.sort((a,b)=>edgeKey(a).localeCompare(edgeKey(b)));runtimeIncoming.sort((a,b)=>edgeKey(a).localeCompare(edgeKey(b)));
                    chain.push({id:cursor,original,actual,incoming,runtimeIncoming});
                    if(JSON.stringify(incoming)!==JSON.stringify(runtimeIncoming)){issue='CURRENT_RUNTIME_INCOMING_EDGE_MISMATCH';break;}
                    if(actual.opcode!==original.opcode||actual.parent!==original.parent||actual.next!==original.next){issue='CURRENT_RUNTIME_CHAIN_MISMATCH';break;}
                    if(original.parent){if(incoming.length!==1||incoming[0].parentId!==original.parent){issue='NONUNIQUE_ACTUAL_PARENT_EDGE';break;}}
                    else if(incoming.length||!original.topLevel||original.opcode!=='arcade_whenSourceStarts'){issue='NOT_CURRENT_SOURCE_ENTRY_ROOT';break;}
                    cursor=original.parent;
                }
                const proof={variableID:owner.id,cellOwner:{isStage:target.isStage,name:target.getName(),runtimeTargetId:target.id},writerOwner:{...writer.writerOwner,runtimeTargetId:actualOwner.id},actualWriter,scopeResolution:local?'local':'stage',resolvedIsExactRoleCell:resolved===variable,parentChain:chain,issue};
                out.json('actual-writer-proof-'+name+'-'+writerIndex+'.json',proof);
                assert.equal(actualWriter?.fields?.VARIABLE?.id,owner.id,'same actual runtime writer variable id');assert.equal(actualWriter.fields.VARIABLE.name,'VARIABLE');assert.equal(actualWriter.fields.VARIABLE.value,name);
                assert.equal(resolved,variable,'actual writer resolves the exact role variable object');assert.equal(issue,null,'unique physical writer chain reaches actual source entry');
                writer.runtimeWriterOwnerId=actualOwner.id;writer.scopeResolution=proof.scopeResolution;writer.resolvedIsExactRoleCell=true;writer.parentChain=chain.map(row=>({id:row.id,opcode:row.actual.opcode,incoming:row.incoming}));
            }
            roles[name]={...owner,runtimeTargetId:target.id,variable};
        }
        out.json('actual-role-bindings.json',Object.fromEntries(Object.entries(roles).map(([name,{variable,...row}])=>[name,row])));
        const values=()=>Object.fromEntries(Object.entries(roles).map(([name,row])=>[name,BW.decode(row.variable.value)]));
        const rawValues=()=>Object.fromEntries(Object.entries(roles).map(([name,row])=>[name,row.variable.value]));
        const snapshots=[];
        const snapshot=label=>{
            const row={label,values:values(),rawValues:rawValues(),errors:run.errors,frameImages:[...arcade._frameImages.entries()],frameDefinitions:[...arcade._frameDefinitions.entries()],images:[...arcade._images.entries()].map(([id,image])=>({id,width:image.width,height:image.height,pixels:Array.from(image.pixels)})),runtimeProject:JSON.parse(run.vm.toJSON())};
            snapshots.push(row);out.json('actual-snapshot-'+label+'.json',row);return row;
        };
        // Actual observer-only Image lookup uses the original read-only native
        // method. It does not create a reference, warm a frame or invoke a guest.
        const check=label=>{
            const row=snapshot(label);assert.deepEqual(run.errors,[]);assert.equal(arcade._frameImages.size,2,'both actual shared backing resources populated');
            for(const [name,value]of Object.entries(expected))assert.equal(row.values[name],value,label+': '+name);
            const first=arcade._image(roles.first.variable.value),again=arcade._image(roles.again.variable.value),copy=arcade._image(roles.copy.variable.value),independent=arcade._image(roles.independent.variable.value);
            out.json('actual-image-relations-'+label+'.json',{firstAlias:first===again,cloneFresh:copy!==first,equalInitializerFresh:independent!==first,firstPixels:first?Array.from(first.pixels):null,copyPixels:copy?Array.from(copy.pixels):null,independentPixels:independent?Array.from(independent.pixels):null});
            assert.ok(first&&again&&copy&&independent);assert.equal(first,again);assert.notEqual(copy,first);assert.notEqual(independent,first);assert.deepEqual(Array.from(first.pixels),[8,0,0,2]);assert.deepEqual(Array.from(copy.pixels),[7,0,0,2]);assert.deepEqual(Array.from(independent.pixels),[1,0,0,2]);return first;
        };
        const oldClock=await restartTimedArcadeRun(run,0);
        for(let i=1;i<=20;i++){await oldClock.advanceTo(i*10);await stepFrames(run.vm,1,10);out.json('first-step-'+String(i).padStart(2,'0')+'.json',{clock:oldClock.now(),values:values(),rawValues:rawValues(),errors:run.errors});}
        const firstImage=check('first');const oldHandles=[...arcade._frameImages.values()];
        run.vm.stopAll();snapshot('stopped');
        const restarted=await restartTimedArcadeRun(run,0,{beforeFirstFrame(){snapshot('restart-before-first-frame');assert.equal(arcade._frameImages.size,0);assert.equal(arcade._frameDefinitions.size,0);}});
        for(let i=1;i<=20;i++){await restarted.advanceTo(i*10);await stepFrames(run.vm,1,10);out.json('restart-step-'+String(i).padStart(2,'0')+'.json',{clock:restarted.now(),values:values(),rawValues:rawValues(),errors:run.errors});}
        const newImage=check('restarted');assert.notEqual(newImage,firstImage,'restart reconstructs actual current resource');assert.ok([...arcade._frameImages.values()].every(handle=>!oldHandles.includes(handle)),'new current handles after project start');
        out.json('actual-result.json',{status:'PASS_OBSERVED_HEADLESS_PUBLIC_CODE_ALIAS_CLONE_ORDINARY_ARRAY_STOP_RESTART',snapshots:snapshots.map(r=>r.label),changedArtwork:'UNAVAILABLE_SEPARATE_PUBLIC_EDIT_GATE',errors:run.errors});
    }catch(error){primary=error;attempt('retain-primary',()=>out.json('actual-primary-error.json',{name:error.name,message:error.message,stack:error.stack}));}
    finally{
        for(const owned of runs){attempt('stop-own-vm',()=>owned.vm.stopAll());attempt('quit-own-vm',()=>owned.vm.quit());attempt('detach-own-clock',()=>{delete owned.vm.runtime.bwArcadeProgramClock;});attempt('retain-cleanup-errors',()=>out.json('actual-errors-after-cleanup.json',{errors:owned.errors}));if(!Array.isArray(owned.errors)||owned.errors.length)failures.push('actual runtime errors after cleanup');}
        attempt('clear-owned-fixture-timers',()=>clearStrayTimers());attempt('retain-cleanup',()=>out.json('actual-cleanup.json',{cleanup,failures,earlyFailureVMLifetime:run?'owned helper returned':'UNKNOWN; packet must terminate whole owned process group'}));attempt('retain-inventory',()=>out.json('actual-output-inventory.json',out.inventory));
    }
    if(primary)throw primary;assert.deepEqual(cleanup,[]);assert.deepEqual(failures,[]);
});
