// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Writable} from 'node:stream';
import {finished} from 'node:stream/promises';
import {writeCrossRatioRecord} from './fixtures/bw-sim/cross-ratio/emit.mjs';
import {readCrossRatio,readCrossRatioLines} from '../scripts/verify-sim-cross-ratio.mjs';
import {judgeCrossRatio,crossRatioProgramGraph} from '../scripts/lib/sim-lab-cross-ratio-judge.mjs';
import {analyticRecord,ANALYTIC_IDENTITY} from './fixtures/bw-sim/cross-ratio/analytic.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),hash=x=>createHash('sha256').update(x).digest('hex');
const C=JSON.parse(read('test/fixtures/bw-sim/cross-ratio/contract.json'));
const check=r=>readCrossRatio(r,{expectedIdentity:ANALYTIC_IDENTITY});
// Synchronous independent consumer preflight precedes even importing the
// native harness. A failed negative control cannot continue into engine cases.
const good=analyticRecord(),cut=analyticRecord(true);
check(good);check(cut);judgeCrossRatio(good);judgeCrossRatio(cut,{control:true,expectedIssueKeys:C.topology['remove-pivot-P'].issueKeys});
const corruptions={
 'missing row':r=>r.track.splice(40,1),
 'duplicate row':r=>r.track.splice(40,0,structuredClone(r.track[40])),
 'reordered row':r=>[r.track[40],r.track[41]]=[r.track[41],r.track[40]],
 'nonfinite quaternion':r=>r.track[30].bodies.output.rotation[0]=NaN,
 'nonunit quaternion':r=>r.track[30].bodies.output.rotation[3]=2,
 'wrong input':r=>r.input.program+='\n',
 'wrong CI tree':r=>r.identity.tree='4'.repeat(40),
 'edited summary':r=>r.summary={lawErrorDeg:0},
 'muted input':r=>{for(const f of r.track){f.bodies.input=structuredClone(r.track[0].bodies.input);}},
 'wrong output branch':r=>{r.track[30].bodies.output.rotation=[0,1,0,0];},
 'missing stage':r=>{for(const f of r.track)if(f.extra.variables.stage===5)f.extra.variables.arrived=0;},
 'whole assembly control':r=>{r.variant='remove-pivot-P';r.mechanism.bodies.pop();},
 'forged completion':r=>r.track.at(-1).extra.variables.failed=1,
 'early hold end':r=>r.track.pop(),
 'wrong control bytes':r=>{r.variant='remove-pivot-P';},
 'dynamic floor':r=>r.mechanism.bodies.find(b=>b.id==='ground').motion='dynamic',
 'missing ground':r=>r.mechanism.bodies.find(b=>b.id==='ground').id='floor',
 'fixed input':r=>r.mechanism.bodies.find(b=>b.id==='input').motion='static',
 'one-frame holds':r=>{let last=-1;for(const f of r.track){const v=f.extra.variables;if(v.stage===last)v.arrived=0;else last=v.stage;}},
 'swapped repeated-angle holds':r=>{for(const f of r.track){const v=f.extra.variables;if(v.stage===0)v.stage=3;else if(v.stage===3)v.stage=0;}}
};
for(const [name,mutate]of Object.entries(corruptions)){
 const r=structuredClone(good);mutate(r);assert.throws(()=>check(r),undefined,name);
}
const signs=structuredClone(good);
for(const f of signs.track)for(const p of Object.values(f.bodies))p.rotation=p.rotation.map(x=>-x);
assert.deepEqual(check(signs),check(good),'quaternion sign is not a physical change');
const shifted=structuredClone(good);for(const f of shifted.track)for(const p of Object.values(f.bodies))p.position[0]+=.001;
// A global translation changes neither a relative law nor true hinge closure.
assert.ok(check(shifted).lawErrorDeg<1e-8);
assert.throws(()=>readCrossRatio(good),/external/);
for(const files of [{},Object.fromEntries(Object.entries(ANALYTIC_IDENTITY.files).slice(1))]){
 const identity={...ANALYTIC_IDENTITY,files},r={...good,identity};
 assert.throws(()=>readCrossRatio(r,{expectedIdentity:identity}),/file census/);
}
assert.throws(()=>readCrossRatioLines('',{expectedIdentity:ANALYTIC_IDENTITY}));
test('Cross Ratio: independent circle fixtures, 20 corruptions, sign and translation controls',()=>assert.equal(Object.keys(corruptions).length,20));
// Exercise the actual retained-TAP transport, including cold-clock boundaries,
// complete case census and refused corruption, before any engine is imported.
const analyticLines=[];
for(const coldMs of C.timing.coldMs)for(const control of [false,true]){
 const record=analyticRecord(control,coldMs),{track,...header}=record;
 analyticLines.push('# CROSS_RATIO '+JSON.stringify({type:'header',record:header}),
  ...track.map(frame=>'# CROSS_RATIO '+JSON.stringify({type:'frame',frame})),
  '# CROSS_RATIO '+JSON.stringify({type:'end',record:{finishedAt:record.finishedAt}}));
}
const wire=analyticLines.join('\n'),wireOptions={expectedIdentity:ANALYTIC_IDENTITY};
assert.equal(readCrossRatioLines(wire,wireOptions).length,4);
const wireCuts=[
 analyticLines.slice(0,-1).join('\n'),
 wire+'\n'+wire,
 analyticLines.filter(l=>!l.includes('"type":"header"')).join('\n'),
 analyticLines.filter(l=>!l.includes('"type":"frame"')).join('\n'),
 wire.replace('"type":"frame"','"type":"invented"'),
 wire.replace('"t":25,','"t":24,')
];
for(const broken of wireCuts){assert.notEqual(broken,wire);assert.throws(()=>readCrossRatioLines(broken,wireOptions));}
test('Cross Ratio: retained TAP four-case readback and six stream corruptions',()=>assert.equal(wireCuts.length,6));
const graphFixture={targets:[{name:'Stage',isStage:true,blocks:{hat:{opcode:'event_whenflagclicked',next:'move',inputs:{},fields:{},topLevel:true},move:{opcode:'data_setvariableto',parent:'hat',next:null,fields:{VARIABLE:['x','x']},inputs:{VALUE:[1,[4,'1']]},mutation:{tag:'original'}}},variables:{x:['x',1]},lists:{route:['route',[60,30,45]]},broadcasts:{watch:'watchdog'}}]};
const graphCuts=[
 p=>p.targets[0].blocks.move.fields.VARIABLE[0]='y',
 p=>p.targets[0].blocks.move.inputs.VALUE[1][1]='999',
 p=>p.targets[0].blocks.hat.next=null,
 p=>p.targets[0].blocks.move.mutation.tag='edited',
 p=>p.targets[0].lists.route[1][1]=150,
 p=>p.targets[0].variables.x[1]=99,
 p=>p.targets[0].broadcasts.watch='other'
];
const expectedGraph=crossRatioProgramGraph(graphFixture);
for(const edit of graphCuts){const changed=structuredClone(graphFixture);edit(changed);assert.notDeepEqual(crossRatioProgramGraph(changed),expectedGraph);}
test('Cross Ratio: full saved-program graph rejects seven same-opcode content edits',()=>assert.equal(graphCuts.length,7));
const detachedCuts=[
 r=>r.issues.push({severity:'warning',code:'loose-part',parts:['invented']}),
 r=>r.issues.pop(),
 r=>{delete r.track[5].bodies.capture0;},
 r=>r.mechanism.bodies.find(b=>b.id==='capture0').motion='static'
];
for(const edit of detachedCuts){const bad=structuredClone(cut);edit(bad);assert.throws(()=>check(bad));}
test('Cross Ratio: exact detached-capture diagnostics and all-body pose census',()=>assert.equal(detachedCuts.length,4));
// Real Writable backpressure and the independent consumer test retention
// without replaying physics. No console method is an evidence transport.
const chunks=[],transport=new Writable({highWaterMark:1,write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));setImmediate(callback);}});
for(const coldMs of C.timing.coldMs)for(const control of [false,true])await writeCrossRatioRecord(analyticRecord(control,coldMs),transport);
transport.end();await finished(transport);
assert.equal(readCrossRatioLines(Buffer.concat(chunks).toString(),wireOptions).length,4);
const brokenTransport=new Writable({highWaterMark:1,write(chunk,encoding,callback){setImmediate(()=>callback(new Error('deliberate receiver failure')));}});
await assert.rejects(writeCrossRatioRecord(good,brokenTransport),/deliberate receiver failure/);
const directStreamChild=execFileSync(process.execPath,['--max-old-space-size=128','--input-type=module','--eval',`
 import {analyticRecord} from './test/fixtures/bw-sim/cross-ratio/analytic.mjs';
 import {writeCrossRatioRecord} from './test/fixtures/bw-sim/cross-ratio/emit.mjs';
 console.log=()=>{};
 for(const coldMs of [0,1000])for(const control of [false,true])await writeCrossRatioRecord(analyticRecord(control,coldMs));
`],{cwd:new URL('../',import.meta.url),maxBuffer:8*1024*1024});
assert.equal(readCrossRatioLines(directStreamChild.toString(),wireOptions).length,4,'default stdout retains all records even when console.log is captured');
test('Cross Ratio: direct record stream handles backpressure and refuses receiver failure',()=>assert.ok(transport.writableFinished));
const {runRobotLabProgram}=await import('./helpers/robot-lab-direct-vm.mjs');
const {catalogFrom,prepareModel}=await import('../overlay/scratch-gui/src/lib/bw-sim/sim-session.js');
const original=read('overlay/scratch-gui/static/sim-lab/models/cross-ratio.ldr'),program=read('overlay/scratch-gui/static/sim-lab/programs/cross-ratio.bw');
const removed=original.replace(/^0 !BW ID pivot_axle_P\n(?:0 [^\n]*\n)*1 [^\n]*\n/gm,'');
assert.equal(hash(original),C.modelSha256);assert.equal(hash(program),C.programSha256);assert.notEqual(original,removed);
const catalogue=read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'),catalog=catalogFrom(JSON.parse(catalogue));
const prepared=[original,removed].map(text=>prepareModel(text,catalog,{mat:'plain',autoPorts:false}));
assert.equal(prepared[0].mechanism.joints.length-prepared[1].mechanism.joints.length,1,'only one physical hinge removed');
assert.equal(prepared[0].model.parts.length,127);assert.equal(prepared[1].model.parts.length,126);
for(const [i,p]of prepared.entries()){
 const expected=C.topology[i?'remove-pivot-P':'original'];
 assert.equal(p.mechanism.bodies.length,expected.bodyCount);
 assert.deepEqual(p.mechanism.bodies.map(b=>[...b.parts].sort()).sort((a,b)=>a.join('\0')<b.join('\0')?-1:a.join('\0')>b.join('\0')?1:0),expected.bodyPartGroups);
 assert.deepEqual(p.issues.map(i=>i.severity+':'+i.code+':'+[...(i.parts||[])].sort().join(',')).sort(),expected.issueKeys);
}
for(const p of prepared){assert.equal(p.mechanism.actuators.length,1);assert.equal(p.mechanism.actuators[0].port,'A');}
const identity={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),files:Object.fromEntries(C.identityPaths.map(p=>[p,hash(readFileSync(new URL('../'+p,import.meta.url)))]))};
for(const coldMs of C.timing.coldMs)for(const control of [false,true])test(`Cross Ratio actual VM/Jolt: ${control?'remove P':'original'}, cold ${coldMs}ms`,{timeout:240000},async()=>{
 const vmErrors=[];let setup;
 const r=await runRobotLabProgram(program,{modelText:control?removed:original,catalog,autoPorts:false,frameMs:25,coldMs,afterMs:C.timing.afterMs,timeLimitMs:C.timing.timeLimitMs,
  observeSetup:({session,vm,prepared})=>{
   vm.runtime.on('ERROR',e=>vmErrors.push(String(e)));vm.runtime.on('BLOCKS_ERROR',e=>vmErrors.push(String(e)));vm.on('BLOCKS_ERROR',e=>vmErrors.push(String(e)));vm.on('ERROR',e=>vmErrors.push(String(e)));
   for(const block of vm.runtime.targets.flatMap(t=>Object.values(t.blocks._blocks))){
    const literal=Object.keys(block.fields||{}).length===1&&Object.keys(block.inputs||{}).length===0;
    assert.ok(block.opcode in vm.runtime._primitives||block.opcode in vm.runtime._hats||literal,'actual registered opcode: '+block.opcode);
   }
   setup={t:0,phase:'cold',bodies:Object.fromEntries(prepared.mechanism.bodies.filter(b=>b.motion==='dynamic').map(b=>[b.id,session.core.bodyPose(b.id)])),busy:{A:false},extra:{variables:{},modes:{A:'idle'}}};
  },
  observeFrame:({vm,hub,session})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:{A:hub.motors._controllers[0].mode},sessionFailed:session.failed?String(session.failed):null})});
 if(r.track[0].t!==0)r.track.unshift(setup);
 // Keep raw failure records before any acceptance assertion. NDJSON avoids
 // one enormous log line; the existing unit artifact retains the original TAP.
 const record={...r,schema:1,kind:'cross-ratio-native',identity,contractSha256:hash(read('test/fixtures/bw-sim/cross-ratio/contract.json')),variant:control?'remove-pivot-P':'original',input:{originalModel:original,program,model:control?removed:original,modelSha256:hash(control?removed:original)},timing:{...C.timing,coldMs},vmErrors};
 await writeCrossRatioRecord(record);
 assert.ok(r.track.every(f=>!f.extra.sessionFailed));
 judgeCrossRatio(r,{control,expectedIssueKeys:C.topology[control?'remove-pivot-P':'original'].issueKeys});
 const independent=readCrossRatio(record,{expectedIdentity:identity});
 console.log('Cross Ratio independently checked '+JSON.stringify({control,coldMs,...independent}));
});
