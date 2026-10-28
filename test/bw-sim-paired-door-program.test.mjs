// SPDX-License-Identifier: BSD-3-Clause
// Finite authored programme outcome; no experimental promotion or fitted law bound.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,openSync,writeSync,closeSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {hubsOf,catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {supportsWasmSimd} from '../overlay/scratch-gui/src/lib/bw-sim/physics/wasm-simd.js';
import {observeAddon} from '../scripts/lib/sim-lab-addon-judge.mjs';
import {judgeDoorProgrammeOutcome} from '../scripts/lib/sim-lab-paired-door-outcome.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const vars=vm=>Object.fromEntries(Object.values(vm.runtime.getTargetForStage().variables).map(v=>[v.name,v.value]));
const markers=['rack_front','rack_back','door_front_0','door_front_1','door_back_0','door_back_1'];
const CAP=48*1024**2,TRACE_CAP=32*1024**2,JSON_CAP=8*1024**2;
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
function sourceRuntime(){
    const head=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');
    const entries=execFileSync('git',['ls-tree','-rz','HEAD','--','overlay/scratch-gui/src/lib','overlay/scratch-vm','scripts/lib','test/helpers',
        'test/bw-sim-paired-door-program.test.mjs','package.json','package-lock.json','packages/scratch-gui/package.json','packages/scratch-gui/package-lock.json'],{cwd:ROOT}).toString().split('\0').filter(Boolean);
    const ownSource={};
    for(const entry of entries){const [modeAndBlob,name]=entry.split('\t');if(!/\.(?:m?js|jsx|json)$/.test(name))continue;
        const bytes=readFileSync(path.join(ROOT,name)),blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        assert.equal(blob,modeAndBlob.split(' ')[2],`actual source matches checkout ${name}`);ownSource[name]={bytes:bytes.length,sha256:sha(bytes),gitBlob:blob};}
    const core=path.join(ROOT,'overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js');
    const specifier=supportsWasmSimd()?'jolt-physics/wasm-simd-compat':'jolt-physics/wasm-compat';
    // Match the original GUI hook: ordinary root resolution first, GUI fallback
    // only on not-found/export absence. This is resolution only, not another import.
    let modulePath;
    try{modulePath=createRequire(core).resolve(specifier);}catch(e){if(!['MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(e.code))throw e;modulePath=createRequire(path.join(INTEGRATED,'package.json')).resolve(specifier);}
    const guiRequire=createRequire(path.join(INTEGRATED,'package.json')),packagePath=guiRequire.resolve('jolt-physics/package.json');
    const pkg=JSON.parse(readFileSync(packagePath)),lock=JSON.parse(readFileSync(path.join(ROOT,'packages/scratch-gui/package-lock.json')));
    const pinned=lock.packages['node_modules/jolt-physics'];assert.equal(pkg.version,pinned.version,'actual engine matches frozen lock');
    const vmRoot=path.join(INTEGRATED,'node_modules/scratch-vm'),vmPackage=JSON.parse(readFileSync(path.join(vmRoot,'package.json')));
    const vmPin=lock.packages['node_modules/scratch-vm'];assert.equal(vmPackage.version,vmPin.version,'actual VM matches frozen lock');
    const vmSources={};
    const walkVm=(dir,relative='')=>{for(const e of readdirSync(dir,{withFileTypes:true})){
        const name=path.join(relative,e.name),full=path.join(dir,e.name);assert.ok(!e.isSymbolicLink(),'regular VM source census');
        if(e.isDirectory())walkVm(full,name);else if(e.isFile()&&/\.(?:js|json)$/.test(name)){const b=readFileSync(full);vmSources[name]={bytes:b.length,sha256:sha(b)};}}};
    walkVm(path.join(vmRoot,'src'));

    const exported=pkg.exports['./'+specifier.split('/').slice(1).join('/')];
    assert.ok(exported&&typeof exported==='object'&&Object.keys(exported).every(k=>['types','default'].includes(k)),'same import/require engine export');
    assert.equal(modulePath,path.resolve(path.dirname(packagePath),exported.default),'exact source-resolved engine module');
    const runtime={schema:'bw.paired-door.source-runtime.v1',sourceHead:head,sourceTree:tree,eventHead:process.env.GITHUB_SHA??null,
        runId:process.env.GITHUB_RUN_ID??null,runAttempt:process.env.GITHUB_RUN_ATTEMPT??null,job:process.env.GITHUB_JOB??null,
        node:process.version,v8:process.versions.v8,platform:process.platform,arch:process.arch,ownSource,
        vm:{version:vmPackage.version,packageJsonSha256:sha(readFileSync(path.join(vmRoot,'package.json'))),lockedIntegrity:vmPin.integrity,lockedResolved:vmPin.resolved,sourceFiles:vmSources},
        jolt:{specifier,moduleFile:path.relative(path.dirname(packagePath),modulePath),moduleSha256:sha(readFileSync(modulePath)),
            packageVersion:pkg.version,packageJsonSha256:sha(readFileSync(packagePath)),lockedVersion:pinned.version,lockedIntegrity:pinned.integrity,lockedResolved:pinned.resolved},
        boundary:'Actual source-resolved Jolt module; packaged native provenance requires separate owning-fork admission. No second engine import, CI/runtime parity, physical/browser or release claim.'};
    return runtime;
}
for(const coldMs of [0,1000])test(`actual repaired Door authored programme cold${coldMs}`,{timeout:180000},async()=>{
    const dir=path.join(ROOT,'test-results/paired-door',`cold${coldMs}`);mkdirSync(dir,{recursive:true});
    const manifest={};let total=0,fd=null,nativeBytes=0,nativeHash=createHash('sha256'),failure=null,basePart=null;
    const raw={schema:'bw.paired-door.outcome.v1',complete:false,coldMs,vmErrors:[],nonfinite:0,fixedRows:0,frames:[],bindings:[]};
    const start=process.hrtime.bigint(),wall=()=>assert.ok(Number(process.hrtime.bigint()-start)/1e9<=180,'finite wall cap; hosted step timeout is outer bound');
    const encode=v=>JSON.stringify(v,(_k,x)=>{if(typeof x==='number'&&!Number.isFinite(x)){raw.nonfinite++;return {$nonfinite:String(x)};}return x;});
    const put=(name,value)=>{const bytes=Buffer.from(encode(value)+'\n');assert.ok(bytes.length<=JSON_CAP&&total+bytes.length<=CAP,'evidence member/aggregate cap');
        writeFileSync(path.join(dir,name),bytes,{flag:'wx'});total+=bytes.length;manifest[name]={bytes:bytes.length,sha256:sha(bytes)};};
    try{
        put('source-runtime.json',sourceRuntime());
        const model=readFileSync(path.join(ROOT,'overlay/scratch-gui/static/sim-lab/models/paired-door-sync.ldr'));
        const programme=readFileSync(path.join(ROOT,'overlay/scratch-gui/static/sim-lab/programs/paired-door-sync.bw'));
        raw.modelSha256=sha(model);raw.programmeSha256=sha(programme);
        assert.equal(raw.modelSha256,'a1ecbb2c21dd0a39f88c67ac5f4ed229ee40d365820be9b27c47993fa1c6cef6');
        assert.equal(raw.programmeSha256,'483ebd35317bbc9840a4a2dd285ee90d2cdd3fb3a124568a8221c3c0d9bab101');
        const catalog=catalogFrom(JSON.parse(readFileSync(path.join(ROOT,'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'))));
        let final={};fd=openSync(path.join(dir,'native.ndjson'),'wx');
        const result=await runRobotLabProgram(programme.toString(),{modelText:model.toString(),catalog,autoPorts:false,coldMs,timeLimitMs:60000,afterMs:500,frameMs:20,withSpike:false,
            observeSetup:({session,vm,prepared:p})=>{
                wall();assert.ok(vm.extensionManager._loadedExtensions.has('robotlab'),'actual extension loaded before observation');
                assert.equal(typeof vm.runtime.robotLab?.motorAngle,'function');
                const hubs=hubsOf(p.model,p.mechanism,catalog,{all:true});assert.equal(hubs.length,1,'one actual authored hub');
                basePart=hubs[0].id;const baseOwners=p.mechanism.bodies.filter(b=>b.parts.includes(basePart));
                assert.equal(baseOwners.length,1);assert.equal(baseOwners[0].id,hubs[0].body);
                assert.equal(p.runModel.parts.filter(part=>part.id===basePart).length,1);
                raw.base={part:basePart,body:baseOwners[0].id,profile:hubs[0].profile};
                raw.setupSessionMs=session.time;raw.nativeStartSeconds=session.core.time;
                raw.apiMotors=vm.runtime.robotLab.motors();assert.equal(raw.apiMotors.filter(m=>m.port==='A'&&m.direct).length,1,'ready real motor API binding');
                raw.setupEncoderAngleDeg=vm.runtime.robotLab.motorAngle('A');
                assert.equal(p.mechanism.actuators.filter(a=>a.port==='A').length,1,'real motor A binding');
                raw.bindings=markers.flatMap(part=>p.mechanism.bodies.filter(b=>b.parts.includes(part)).map(b=>({part,body:b.id,motion:b.motion})));
                for(const part of markers){assert.equal(p.runModel.parts.filter(p=>p.id===part).length,1);assert.equal(raw.bindings.filter(b=>b.part===part).length,1);}
                put('constructed-bindings.json',{base:raw.base,bindings:raw.bindings,model:p.model,runModel:p.runModel,mechanism:p.mechanism,issues:p.issues});
                const error=e=>{assert.ok(raw.vmErrors.length<64);raw.vmErrors.push(String(e).slice(0,2048));};vm.runtime.on('BLOCKS_ERROR',error);vm.on('BLOCKS_ERROR',error);
                session.core.observeFixedSteps(({t,stepSeconds})=>{
                    wall();assert.ok(++raw.fixedRows<=12500);raw.nativeEndSeconds=t;
                    const line={t,stepSeconds,bodies:Object.fromEntries(p.mechanism.bodies.map(b=>[b.id,{pose:session.core.bodyPose(b.id),linear:session.core.bodyLinearVelocity(b.id),angular:session.core.bodyAngularVelocity(b.id),dynamics:session.core.bodyDynamics(b.id)}])),
                        joints:Object.fromEntries(p.mechanism.joints.filter(j=>['hinge','slider'].includes(j.type)).map(j=>[j.id,{state:session.core.jointState(j.id),effort:session.core.jointDynamics(j.id)}]))};
                    const bytes=Buffer.from(encode(line)+'\n');assert.ok(nativeBytes+bytes.length<=TRACE_CAP&&total+bytes.length<=CAP-2*JSON_CAP,'native trace cap with failure-report reserve');
                    let offset=0;
                    while(offset<bytes.length){const count=writeSync(fd,bytes,offset,bytes.length-offset);assert.ok(count>0,'native writer made progress');
                        nativeHash.update(bytes.subarray(offset,offset+count));offset+=count;nativeBytes+=count;total+=count;}
                });
            },observeFrame:({session,vm})=>{wall();final=vars(vm);return {variables:final,encoderAngleDeg:vm.runtime.robotLab.motorAngle('A'),nativeSeconds:session.core.time};}
        });
        raw.final=final;raw.finishedAt=result.finishedAt;
        const cold=result.track.filter(f=>f.phase==='cold');raw.programmeStartSessionMs=cold.length?cold.at(-1).t:raw.setupSessionMs;
        raw.flagDatumEncoderAngleDeg=cold.length?cold.at(-1).extra.encoderAngleDeg:raw.setupEncoderAngleDeg;
        raw.flagDatumOrigin=cold.length?'last-cold-snapshot-before-greenFlag':'setup-no-cold-no-intervening-physics';
        assert.equal(raw.programmeStartSessionMs,raw.setupSessionMs+coldMs,'original helper cold ticks precede greenFlag');
        raw.programmeElapsedMs=result.finishedAt-raw.programmeStartSessionMs;
        put('frames.json',result.track);
        const observation=observeAddon(result,basePart);assert.equal(observation.base.id,raw.base.body);
        const observed=result.track.map(f=>{const bodies={...f.bodies};
            // The original helper records dynamic body poses. Static owners have
            // their actual fixed compiled pose; require declaration, never fake zero.
            for(const b of result.mechanism.bodies)if(!bodies[b.id]){assert.equal(b.motion,'static');bodies[b.id]={position:b.position,rotation:b.rotation};}
            return {...f,bodies};});
        raw.frames=observed.map(f=>({t:f.t,phase:f.phase,...f.extra,markers:Object.fromEntries(markers.map(id=>[id,observation.point(f,id)]))}));
        assert.deepEqual(result.issues,[]);assert.deepEqual(result.unsupported,[]);
        raw.complete=true;raw.outcome=judgeDoorProgrammeOutcome(raw);
    }catch(e){failure=e;raw.complete=false;raw.error={name:e.name,message:String(e.message).slice(0,2048),stack:String(e.stack).slice(0,8192)};}
    finally{
        if(fd!==null){closeSync(fd);manifest['native.ndjson']={bytes:nativeBytes,sha256:nativeHash.digest('hex')};}
        raw.nativeBytes=nativeBytes;
        try{put('outcome.json',raw);}catch(e){failure??=e;const small={schema:raw.schema,complete:false,error:raw.error??{name:e.name,message:String(e.message)},fixedRows:raw.fixedRows,nativeBytes,nonfinite:raw.nonfinite};
            put('failure.json',small);}
        // Seal every emitted member, including partial native bytes, on failure.
        // Rehash the real directory, including any partial member from a failed
        // write, so custody never assumes a write completed atomically.
        total=0;
        for(const name of readdirSync(dir)){assert.notEqual(name,'files.json','fresh evidence directory required');const b=readFileSync(path.join(dir,name));
            manifest[name]={bytes:b.length,sha256:sha(b)};total+=b.length;}
        const bytes=Buffer.from(JSON.stringify({schema:'bw.paired-door.files.v1',complete:!failure,totalBytes:total,files:manifest})+'\n');
        assert.ok(bytes.length<=65536&&total+bytes.length<=CAP);writeFileSync(path.join(dir,'files.json'),bytes,{flag:'wx'});
    }
    if(failure)throw failure;
});
