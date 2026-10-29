// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,statSync,accessSync,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Writable} from 'node:stream';
import {once} from 'node:events';
import {finished} from 'node:stream/promises';
import {writeCrossRatioRecord,diagnoseCrossRatioRecord} from './fixtures/bw-sim/cross-ratio/emit.mjs';
import {readCrossRatio,readCrossRatioLines} from '../scripts/verify-sim-cross-ratio.mjs';
import {judgeCrossRatio,crossRatioProgramGraph,assertCrossRatioBrowserProgram,captureCrossRatioInitial} from '../scripts/lib/sim-lab-cross-ratio-judge.mjs';
import {analyticRecord,ANALYTIC_IDENTITY} from './fixtures/bw-sim/cross-ratio/analytic.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),hash=x=>createHash('sha256').update(x).digest('hex');
const C=JSON.parse(read('test/fixtures/bw-sim/cross-ratio/contract.json'));
// A new Node test runner owns its own IPC context. Inheriting the parent's
// child role makes --test refuse to run the fixture as a recursive invocation.
const childProcessEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='NODE_TEST_CONTEXT'));
// Git supplies checkout metadata only. Bind its actual executable and repository
// explicitly; the independent original reader still verifies both IDs and hashes.
const checkoutIdentity=({root,executable,expectedCommit,environment=process.env,invoke=execFileSync})=>{
 assert.ok(typeof executable==='string'&&isAbsolute(executable),'declare an absolute Git executable');
 assert.ok(typeof root==='string'&&isAbsolute(root),'declare the repository root');
 const tool=realpathSync(executable),cwd=realpathSync(root);
 assert.ok(statSync(tool).isFile(),'Git executable is a regular file');accessSync(tool,constants.X_OK);
 const env=Object.fromEntries(Object.entries(environment).filter(([key])=>!key.startsWith('GIT_')));
 env.GIT_OPTIONAL_LOCKS='0';env.GIT_NO_REPLACE_OBJECTS='1';
 const output=invoke(tool,['-c','gc.auto=0','-c','maintenance.auto=false','rev-parse','HEAD','HEAD^{tree}'],
  {cwd,env,encoding:'utf8',timeout:5000,maxBuffer:1024,windowsHide:true});
 const lines=output.split(/\r?\n/);if(lines.at(-1)==='')lines.pop();
 assert.ok(lines.length===2&&lines.every(id=>/^[0-9a-f]{40}$/.test(id)),'exact commit and tree identities');
 if(expectedCommit!==undefined){assert.match(expectedCommit,/^[0-9a-f]{40}$/);assert.equal(lines[0],expectedCommit,'actual checkout matches the CI commit');}
 return{commit:lines[0],tree:lines[1]};
};
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
 'string VM error ledger':r=>{r.vmErrors='';},
 'string unsupported ledger':r=>{r.unsupported='';},
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
test('Cross Ratio: independent circle fixtures, 22 corruptions, sign and translation controls',()=>assert.equal(Object.keys(corruptions).length,22));
// Exercise the actual retained-TAP transport, including cold-clock boundaries,
// complete case census and refused corruption, before any engine is imported.
const wireItems=[];
for(const coldMs of C.timing.coldMs)for(const control of [false,true]){
 const record=analyticRecord(control,coldMs),{track,...header}=record;
 wireItems.push({type:'header',record:header},...track.map(frame=>({type:'frame',frame})),{type:'end',record:{finishedAt:record.finishedAt}});
}
// Consumer fixtures encode independently of the producer's transport helper.
const encodeItem=item=>{const b=Buffer.from(JSON.stringify(item));return '# CROSS_RATIO_WIRE_V1 '+b.length+' '+hash(b)+' '+b.toString('base64');};
const encodeItems=items=>items.map(encodeItem).join('\n');
const wire=encodeItems(wireItems),wireOptions={expectedIdentity:ANALYTIC_IDENTITY};
assert.equal(readCrossRatioLines(wire,wireOptions).length,4);
const unknown=structuredClone(wireItems);unknown.find(i=>i.type==='frame').type='invented';
const wrongTime=structuredClone(wireItems);wrongTime.find(i=>i.type==='frame'&&i.frame.t===25).frame.t=24;
const wireCuts=[
 encodeItems(wireItems.slice(0,-1)),wire+'\n'+wire,
 encodeItems(wireItems.filter(i=>i.type!=='header')),encodeItems(wireItems.filter(i=>i.type!=='frame')),
 encodeItems(unknown),encodeItems(wrongTime)
];
for(const broken of wireCuts){assert.notEqual(broken,wire);assert.throws(()=>readCrossRatioLines(broken,wireOptions));}
const firstLine=encodeItem(wireItems[0]),fields=firstLine.slice(2).split(' ');
const damagedWire=[
 [fields[0],fields[1],'0'.repeat(64),fields[3]].join(' '),
 [fields[0],Number(fields[1])+1,fields[2],fields[3]].join(' '),
 [fields[0],fields[1],fields[2],fields[3]+'*'].join(' '),
 [fields[0],fields[1],fields[2],(fields[3][0]==='A'?'B':'A')+fields[3].slice(1)].join(' ')
];
for(const broken of damagedWire)assert.throws(()=>readCrossRatioLines(broken+'\n'+wire,wireOptions));
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
 r=>r.mechanism.bodies.find(b=>b.id==='capture0').motion='static',
 r=>{delete r.mechanism.bodies.find(b=>b.id==='capture0').motion;for(const frame of r.track)delete frame.bodies.capture0;}
];
for(const edit of detachedCuts){const bad=structuredClone(cut);edit(bad);assert.throws(()=>check(bad));}
test('Cross Ratio: exact detached-capture diagnostics and all-body pose census',()=>assert.equal(detachedCuts.length,5));
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
 import {writeCrossRatioRecord,diagnoseCrossRatioRecord} from './test/fixtures/bw-sim/cross-ratio/emit.mjs';
 console.log=()=>{};
 for(const coldMs of [0,1000])for(const control of [false,true])await writeCrossRatioRecord(analyticRecord(control,coldMs));
`],{cwd:new URL('../',import.meta.url),maxBuffer:8*1024*1024});
assert.equal(readCrossRatioLines(directStreamChild.toString(),wireOptions).length,4,'default stdout retains all records even when console.log is captured');
let acknowledged=false;
const acknowledgmentItem=chunk=>{
 const frame=/^CROSS_RATIO_WIRE_V1 ([0-9]+) ([0-9a-f]{64}) ([A-Za-z0-9+/]+={0,2})\n$/.exec(chunk.toString());
 assert.ok(frame,'complete acknowledgment wire envelope');
 const bytes=Buffer.from(frame[3],'base64');
 assert.equal(bytes.length,Number(frame[1]),'acknowledgment byte extent');
 assert.equal(hash(bytes),frame[2],'acknowledgment digest');
 assert.equal(bytes.toString('base64'),frame[3],'canonical acknowledgment encoding');
 return JSON.parse(bytes.toString());
};
const ackBody=JSON.stringify({type:'end'}),ackFrame=`CROSS_RATIO_WIRE_V1 ${Buffer.byteLength(ackBody)} ${hash(ackBody)} ${Buffer.from(ackBody).toString('base64')}\n`;
assert.deepEqual(acknowledgmentItem(ackFrame),{type:'end'});
for(const damaged of [ackFrame.replace('CROSS_RATIO_WIRE_V1','OTHER_WIRE'),ackFrame.replace(' '+Buffer.byteLength(ackBody)+' ',' 1 '),
 ackFrame.replace(hash(ackBody),'0'.repeat(64)),ackFrame.replace(/=+\n$/,'\n'),ackFrame+'extra\n'])
 assert.throws(()=>acknowledgmentItem(damaged),'full acknowledgment envelope refuses a misleading payload');
const acknowledgedTransport=new Writable({highWaterMark:16*1024*1024,write(chunk,encoding,callback){
 const item=acknowledgmentItem(chunk);
 if(item.type==='end')this.emit('final-record-pending',callback);else setImmediate(callback);
}});
const pendingAck=once(acknowledgedTransport,'final-record-pending');
const writing=writeCrossRatioRecord(good,acknowledgedTransport).then(()=>{acknowledged=true;});
const [ack]=await pendingAck;assert.equal(acknowledged,false,'a true write return cannot acknowledge the final record');ack();await writing;
acknowledgedTransport.end();await finished(acknowledgedTransport);
const lateError=new Writable({highWaterMark:16*1024*1024,write(chunk,encoding,callback){setImmediate(()=>callback(new Error('late receiver failure')));}});
await assert.rejects(writeCrossRatioRecord(good,lateError),/late receiver failure/);
const earlyClose=new Writable({highWaterMark:1,write(){this.destroy();}});
await assert.rejects(writeCrossRatioRecord(good,earlyClose),/closed/);
test('Cross Ratio: direct record stream acknowledges writes and refuses receiver failures',()=>assert.ok(transport.writableFinished));
const browserClock={start:0,finishedAt:16000,track:[{t:16500}],refusals:[],apiEvents:[{name:'setMotorSpeed',args:['A',12]}]};
const browserLimits={...C.timing,routeLength:C.route.length};assertCrossRatioBrowserProgram(browserClock,browserLimits);
const browserClockCuts=[
 r=>{r.finishedAt=14999;},
 r=>{r.finishedAt=181001;r.track[0].t=181501;},
 r=>r.track[0].t=16499,
 r=>r.apiEvents=[],
 r=>r.apiEvents[0].args[0]='B',
 r=>r.refusals=[{name:'setMotorSpeed',result:{ok:false}}]
];
for(const edit of browserClockCuts){const bad=structuredClone(browserClock);edit(bad);assert.throws(()=>assertCrossRatioBrowserProgram(bad,browserLimits));}
test('Cross Ratio: browser clock, hold and actual motor API admission',()=>assert.equal(browserClockCuts.length,6));
const actualTap=execFileSync(process.execPath,['--max-old-space-size=128','--test','--test-reporter=tap','test/fixtures/bw-sim/cross-ratio/transport-probe.mjs'],{cwd:new URL('../',import.meta.url),maxBuffer:8*1024*1024,env:childProcessEnv});
assert.equal(readCrossRatioLines(actualTap.toString(),wireOptions).length,4,'actual TAP reporter preserves complete large diagnostic records');
test('Cross Ratio: actual TAP diagnostic encoding and four damaged-wire refusals',()=>assert.equal(damagedWire.length,4));
const initialPoseReads=[],initialBusyReads=[];
const initialPose={position:[.01,.02,.03],rotation:[0,0,0,1]};
const initialInput={session:{time:125,failed:new Error('observed setup failure'),core:{bodyPose:id=>{initialPoseReads.push(id);assert.equal(id,'observed-body');return initialPose;}}},
 vm:{runtime:{targets:[{variables:{stage:{name:'stage',value:7},ready:{name:'inputReady',value:1}}}]}},
 hub:{motors:{busy:port=>{initialBusyReads.push(port);return true;},_controllers:[{mode:'velocity'}]}},
 prepared:{mechanism:{bodies:[{id:'floor',motion:'static'},{id:'observed-body',motion:'dynamic'}],actuators:[{port:'A'}]}}};
const initialObserved=captureCrossRatioInitial(initialInput);
assert.deepEqual(initialObserved,{t:125,phase:'cold',bodies:{'observed-body':initialPose},busy:{A:true},extra:{variables:{stage:7,inputReady:1},modes:{A:'velocity'},sessionFailed:'Error: observed setup failure'}});
assert.deepEqual(initialPoseReads,['observed-body']);assert.deepEqual(initialBusyReads,['A']);
initialInput.session.time=375;initialInput.session.failed=null;initialInput.vm.runtime.targets[0].variables.stage.value=9;
initialInput.hub.motors.busy=()=>false;initialInput.hub.motors._controllers[0].mode='hold';initialPose.position[0]=.04;
const initialChanged=captureCrossRatioInitial(initialInput);
assert.equal(initialChanged.t,375);assert.equal(initialChanged.extra.variables.stage,9);assert.equal(initialChanged.busy.A,false);
assert.equal(initialChanged.extra.modes.A,'hold');assert.equal(initialChanged.extra.sessionFailed,null);assert.equal(initialChanged.bodies['observed-body'].position[0],.04);
test('Cross Ratio: initial snapshot reads actual clock, poses, variables and motor state',()=>assert.notDeepEqual(initialChanged,initialObserved));
test('Cross Ratio: checkout identity binds an absolute tool, repository and CI commit',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),commit='1'.repeat(40),tree='2'.repeat(40);
 let calls=0;
 const base={root,executable:process.execPath,expectedCommit:commit,environment:{PATH:'untrusted',GIT_DIR:'elsewhere',GIT_WORK_TREE:'elsewhere'},invoke:(tool,args,options)=>{
  calls++;assert.equal(tool,realpathSync(process.execPath));assert.ok(isAbsolute(tool));assert.equal(options.cwd,realpathSync(root));
  assert.deepEqual(args,['-c','gc.auto=0','-c','maintenance.auto=false','rev-parse','HEAD','HEAD^{tree}']);
  assert.deepEqual(options.env,{PATH:'untrusted',GIT_OPTIONAL_LOCKS:'0',GIT_NO_REPLACE_OBJECTS:'1'});
  assert.equal(options.timeout,5000);assert.equal(options.maxBuffer,1024);return commit+'\n'+tree+'\n';
 }};
 assert.deepEqual(checkoutIdentity(base),{commit,tree});assert.equal(calls,1);
 for(const executable of ['git',''])assert.throws(()=>checkoutIdentity({...base,executable}),/absolute Git/);
 for(const output of [commit+'\n'+'g'.repeat(40)+'\n',commit+'\n',commit+'\n'+tree+'\n'+'3'.repeat(40)+'\n'])
  assert.throws(()=>checkoutIdentity({...base,invoke:()=>output}),/exact commit and tree/);
 assert.throws(()=>checkoutIdentity({...base,expectedCommit:'3'.repeat(40)}),/actual checkout matches/);
 assert.throws(()=>checkoutIdentity({...base,invoke:()=>{throw new Error('metadata failure');}}),/metadata failure/);
});
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
const identity={...checkoutIdentity({root:fileURLToPath(new URL('../',import.meta.url)),
 executable:process.env.BW_CROSS_RATIO_GIT_EXECUTABLE??'/usr/bin/git',expectedCommit:process.env.GITHUB_SHA}),
 files:Object.fromEntries(C.identityPaths.map(p=>[p,hash(readFileSync(new URL('../'+p,import.meta.url)))]))};
for(const coldMs of C.timing.coldMs)for(const control of [false,true])test(`Cross Ratio actual VM/Jolt: ${control?'remove P':'original'}, cold ${coldMs}ms`,{timeout:240000},async context=>{
 const vmErrors=[];let setup;
 const r=await runRobotLabProgram(program,{modelText:control?removed:original,catalog,autoPorts:false,frameMs:25,coldMs,afterMs:C.timing.afterMs,timeLimitMs:C.timing.timeLimitMs,
  observeSetup:({session,vm,hub,prepared})=>{
   vm.runtime.on('ERROR',e=>vmErrors.push(String(e)));vm.runtime.on('BLOCKS_ERROR',e=>vmErrors.push(String(e)));vm.on('BLOCKS_ERROR',e=>vmErrors.push(String(e)));vm.on('ERROR',e=>vmErrors.push(String(e)));
   for(const block of vm.runtime.targets.flatMap(t=>Object.values(t.blocks._blocks))){
    const literal=Object.keys(block.fields||{}).length===1&&Object.keys(block.inputs||{}).length===0;
    assert.ok(block.opcode in vm.runtime._primitives||block.opcode in vm.runtime._hats||literal,'actual registered opcode: '+block.opcode);
   }
   setup=captureCrossRatioInitial({session,vm,hub,prepared});
  },
  observeFrame:({vm,hub,session})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables||{}).map(v=>[v.name,v.value]))),modes:{A:hub.motors._controllers[0].mode},sessionFailed:session.failed?String(session.failed):null})});
 if(r.track[0].t!==0)r.track.unshift(setup);
 // Keep raw failure records before any acceptance assertion. NDJSON avoids
 // one enormous log line; the existing unit artifact retains the original TAP.
 const record={...r,schema:1,kind:'cross-ratio-native',identity,contractSha256:hash(read('test/fixtures/bw-sim/cross-ratio/contract.json')),variant:control?'remove-pivot-P':'original',input:{originalModel:original,program,model:control?removed:original,modelSha256:hash(control?removed:original)},timing:{...C.timing,coldMs},vmErrors};
 diagnoseCrossRatioRecord(record,context);
 assert.ok(r.track.every(f=>!f.extra.sessionFailed));
 judgeCrossRatio(r,{control,expectedIssueKeys:C.topology[control?'remove-pivot-P':'original'].issueKeys});
 const independent=readCrossRatio(record,{expectedIdentity:identity});
 console.log('Cross Ratio independently checked '+JSON.stringify({control,coldMs,...independent}));
});
