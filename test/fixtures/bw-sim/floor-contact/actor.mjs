// SPDX-License-Identifier: BSD-3-Clause
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runRobotLabProgram} from '../../../helpers/robot-lab-direct-vm.mjs';
import {judgeSarrusLift} from '../../../../scripts/lib/sim-lab-sarrus-lift-judge.mjs';
import {floorObservation} from './bounds.mjs';
import {sha256} from './kernel-source.mjs';
import {runCompoundDrop} from './drop.mjs';
const read = file => readFileSync(new URL(file, import.meta.url));
const manifest = JSON.parse(read('./manifest.json'));
const lock=JSON.parse(readFileSync(new URL('../../../../packages/scratch-gui/package-lock.json',import.meta.url)));
const {version,resolved,integrity}=lock.packages['node_modules/jolt-physics'];
const engine={version,resolved,integrity};
const pinSource=readFileSync(new URL('../../../../'+manifest.engine.pinSource,import.meta.url),'utf8');
const pinnedURL=pinSource.match(/const JOLT_PHYSICS_URL = '([^']+)'/)[1];
const pinnedIntegrity=pinSource.match(/const JOLT_PHYSICS_INTEGRITY = '([^']+)'/)[1];
assert.equal(pinnedIntegrity,manifest.engine.integrity);
assert.equal(resolved,pinnedURL);assert.equal(integrity,manifest.engine.integrity);
assert.equal(version,manifest.engine.version);
const mode = process.argv[2], coldMs = Number(process.argv[3]);
assert.ok(['driven','intact','held','drop'].includes(mode));
assert.ok(manifest.coldStartsMs.includes(coldMs));
const inputs=[];
for (const input of manifest.inputs) {
    const bytes = read(input.file);
    assert.equal(bytes.length,input.bytes); assert.equal(sha256(bytes),input.sha256);
    inputs.push({file:input.file,bytes:bytes.length,sha256:sha256(bytes)});
}
if(mode==='drop'){
    const drop=await runCompoundDrop(manifest);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(globalThis.floorKernelReceipts.length,1);
    console.log('FLOOR1436_RESULT '+JSON.stringify({schemaVersion:manifest.schemaVersion,mode,coldMs,inputs,engine,kernel:globalThis.floorKernelReceipts[0],...drop}));
    process.exit(0);
}
const motorCommands=[];
const rows = []; let escapedSteps=0, insideEscapedSteps=0, firstEscape=null, firstInsideEscape=null, floor, bodies, hubId, initialHubY, maxHubDrop=0, maxMotorAngle=0;
const result = await runRobotLabProgram(read(mode==='held'?'inputs/observe.bw':'inputs/drive.bw').toString(), {
    modelText: read(mode==='intact'?'inputs/intact.ldr':'inputs/single-chain.ldr').toString(),
    timeLimitMs: manifest.caseLimits[mode], coldMs,
    // Continue observing to the full driven safety horizon even if the real program stops early.
    afterMs: mode==='driven'?manifest.caseLimits.driven:0,
    observeSetup({session,prepared,vm}) {
        const api=vm.runtime.robotLab, original=api.runMotorDegrees;
        api.runMotorDegrees=function(...args){motorCommands.push(structuredClone(args));return original.apply(this,args);};
        const ground = prepared.mechanism.bodies.find(b=>b.id==='ground');
        floor={top:ground.position[1]+ground.colliders[0].halfExtents[1],bottom:ground.position[1]-ground.colliders[0].halfExtents[1],half:ground.colliders[0].halfExtents[0]};
        bodies=prepared.mechanism.bodies.filter(b=>b.motion==='dynamic');
        hubId=prepared.mechanism.bodies.find(b=>b.parts.some(p=>p==='hub'))?.id;
        // All dynamic bodies are checked, so the hub name is diagnostic only.
        session.core.observeFixedSteps(({t,stepSeconds})=>{
            assert.equal(stepSeconds,manifest.dtSeconds);
            const [minTop,worst,outside,insideEscaped]=floorObservation(bodies,id=>session.core.bodyPose(id),floor,manifest.floorEscapeEpsilonM);
            if(minTop<floor.bottom-manifest.floorEscapeEpsilonM){escapedSteps++;firstEscape??=t;}
            if(insideEscaped){insideEscapedSteps++;firstInsideEscape??=t;}
            rows.push([t,minTop,worst,outside,insideEscaped]);
        });
    },
    observeFrame({session,prepared}) {
        const id=hubId||bodies[0].id, y=session.core.bodyPose(id).position[1];
        initialHubY??=y;maxHubDrop=Math.max(maxHubDrop,initialHubY-y);
        const actuator=prepared.mechanism.actuators[0];
        maxMotorAngle=Math.max(maxMotorAngle,Math.abs(session.core.jointState(actuator.joint).angle));
        return null;
    }
});
await new Promise(resolve=>setImmediate(resolve));
const receipts=globalThis.floorKernelReceipts;
assert.equal(receipts.length,1,'one actual kernel load receipt');
assert.equal(receipts[0].variant,process.env.BW_FLOOR_KERNEL_VARIANT);
if(mode==='intact') {assert.ok(result.finishedAt>25000&&result.finishedAt<45000);judgeSarrusLift('sarrus-lift',result);}
if(mode==='held') assert.ok(result.finishedAt>8000&&result.finishedAt<10000,'held program completes at its original wait');
const report={schemaVersion:manifest.schemaVersion,mode,coldMs,inputs,engine,motorCommands,kernel:receipts[0],floor,bodyIds:bodies.map(b=>b.id),
    finishedAt:result.finishedAt,programCompleted:result.finishedAt!==null,observedUntilMs:rows.at(-1)[0]*1000,
    escapedSteps,insideEscapedSteps,firstEscape,firstInsideEscape,maxHubDrop,maxMotorAngle,rows};
console.log('FLOOR1436_RESULT '+JSON.stringify(report));
