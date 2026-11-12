// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Pure construction/source controls. No physics engine or VM is started here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {catalogFrom,prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {parseModel,serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const read=p=>readFileSync(join(root,p),'utf8');
const sourcePath='test/fixtures/model-files/twinpoint-source/original.ldr';
const modelPath='overlay/scratch-gui/static/sim-lab/models/twinpoint.ldr';
const generator=read('scripts/adapt-seven-machines.mjs');
const C=catalogFrom(JSON.parse(read('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json')));
const parse=text=>{const p=parseModel(text,{catalog:C});assert.deepEqual(p.refusals,[]);return p.model;};
const text=read(modelPath),candidate=parse(text);
const clone=v=>JSON.parse(JSON.stringify(v));
const byId=(model,id)=>{const p=model.parts.find(p=>p.id===id);assert.ok(p,`missing ${id}`);return p;};
const mv=(m,v)=>[0,1,2].map(i=>m[3*i]*v[0]+m[3*i+1]*v[1]+m[3*i+2]*v[2]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const world=(p,c)=>({...c,position:add(p.position,mv(p.rotation,c.position)),axis:mv(p.rotation,c.axis)});
const pinOf=(m,catalog=C)=>{const p=byId(m,'hingeP');return world(p,catalog.get(p.part).connectors[0]);};
const old=clone(candidate);byId(old,'hingeP').part='3673.dat';
byId(old,'hingeP').position=add(byId(old,'hingeP').position,mv(byId(old,'hingeP').rotation,[-5,0,0]));

// Independently join the unchanged world pin line to all catalogued holes.
// Same existing pin-axle construction limits: 1 degree, 2.5 LDU radial,
// and at least min(8, shaft length, hole length) axial engagement.
function matches(model){
 const shaft=pinOf(model),out=[];
 for(const p of model.parts)for(const c of C.get(p.part).connectors){
  if(c.type!=='pinhole')continue;
  const h=world(p,c),delta=sub(h.position,shaft.position),a=dot(delta,shaft.axis);
  const radial=sub(delta,shaft.axis.map(v=>v*a));
  const engagement=Math.min(shaft.length/2,a+h.length/2)-Math.max(-shaft.length/2,a-h.length/2);
  if(Math.abs(dot(shaft.axis,h.axis))>=Math.cos(Math.PI/180)-1e-12&&
     Math.sqrt(dot(radial,radial))<=2.5+1e-9&&engagement>=Math.min(8,shaft.length,h.length)-1e-9)
   out.push({part:p.id,hole:c.id,engagement});
 }
 return out;
}
function construction(model){
 const pin=byId(model,'hingeP'),s=pinOf(model),previous=pinOf(old);
 assert.equal(pin.part,'32002.dat');assert.deepEqual(pin.rotation,byId(old,'hingeP').rotation);
 assert.deepEqual(s.position,previous.position);assert.deepEqual(s.axis,previous.axis);
 assert.equal(s.friction,false);assert.equal(s.length,30);
 assert.equal(byId(model,'linkBP').part,'4586.dat');assert.equal(byId(model,'linkCP').part,'4586.dat');
 assert.deepEqual(matches(model),[{part:'linkBP',hole:'h1',engagement:10},{part:'linkCP',hole:'h1',engagement:10}]);
 assert.equal(model.parts.length,117);
}

// Nominal LDraw source-profile certificate, not a manufactured fit or force
// oracle: 32002.dat -> connect.dat/connect3.dat; 4586.dat -> peghole.dat.
// Intervals use the unchanged world connector centre as axial zero in LDU.
// The catalogue intentionally retains its existing simpler collision proxy.
const profile={span:[-15,15],shaftRadius:6,boreRadius:6,counterboreRadius:8,
 holes:[[-15,-5],[5,15]],outerSeats:[[-15,-13],[13,15]],
 lips:[{interval:[-15,-13],radius:6.5},{interval:[13,15],radius:6.5}],
 collar:{interval:[3,7],radius:8},collarSeat:[5,7]};
function nominalRetention(p){
 for(let i=0;i<2;i++){
  assert.ok(p.span[0]<=p.holes[i][0]&&p.span[1]>=p.holes[i][1],'full hole engagement');
  assert.deepEqual(p.lips[i].interval,p.outerSeats[i]);
  assert.ok(p.lips[i].radius>p.boreRadius&&p.lips[i].radius<=p.counterboreRadius,'retaining lip in counterbore');
 }
 assert.ok(p.shaftRadius<=p.boreRadius);
 assert.ok(p.collar.interval[0]<=p.collarSeat[0]&&p.collar.interval[1]>=p.collarSeat[1]);
 assert.equal(p.collar.radius,p.counterboreRadius);
}

test('Twinpoint reviewed original and authoritative adaptation preserve the connector centre',()=>{
 assert.equal(createHash('sha256').update(readFileSync(join(root,sourcePath))).digest('hex'),'266de2d4580f3ea253d40c11eefe8dd74062e80bf3a4182b1ac13dc1e8eca6b0');
 construction(candidate);assert.deepEqual(matches(candidate),matches(old));
 assert.deepEqual(byId(candidate,'hingeP').position,[80,-124.89996,95]);
 assert.deepEqual(pinOf(candidate).position,[80,-124.89996,90]);
});

test('Twinpoint stock catalogue mass, connector and proxy remain the existing part data',()=>{
 const stock=C.get('32002.dat');assert.equal(stock.massGrams,.2);
 assert.deepEqual(stock.connectors,[{id:'p',type:'pin',position:[-5,0,0],axis:[1,0,0],length:30,friction:false}]);
 assert.deepEqual(stock.colliders,[{shape:'box',halfExtents:[15,8,8],position:[-5,0,0]}]);
 assert.deepEqual(profile.span,[-pinOf(candidate).length/2,pinOf(candidate).length/2]);
 nominalRetention(profile);
});

test('Twinpoint adaptation regenerates byte-for-byte twice and refuses changed original input',t=>{
 const directory=mkdtempSync(join(root,'test/.twinpoint-pin-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 for(let i=0;i<2;i++){
  const output=join(directory,`generated-${i}.ldr`);
  const r=spawnSync(process.execPath,['scripts/adapt-seven-machines.mjs','twinpoint',sourcePath,output],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024**2});
  assert.equal(r.status,0,r.stderr);assert.equal(readFileSync(output,'utf8'),text);
 }
 const altered=join(directory,'altered.ldr');writeFileSync(altered,read(sourcePath)+'\n');
 const r=spawnSync(process.execPath,['scripts/adapt-seven-machines.mjs','twinpoint',altered,join(directory,'refused.ldr')],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024**2});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Source differs from reviewed input/);
});

test('Twinpoint retains every other placed part and its original five-joint topology',()=>{
 const input=parse(read(sourcePath));
 for(const p of input.parts)if(['linkBP','linkCP'].includes(p.id))p.part='4586.dat';
 // Compare at the unchanged serializer's precision, not raw reviewed-input
 // decimals against its formatted generated output.
 const original=parse(serializeModel(input,{name:'twinpoint.ldr',title:'baseline'}));
 assert.deepEqual(candidate.parts.filter(p=>p.id!=='hingeP'),original.parts.filter(p=>p.id!=='hingeP'));
 const baselineText=serializeModel(old,{name:'twinpoint.ldr',title:'baseline'});
 const before=prepareModel(baselineText,C,{mat:'plain'}),after=prepareModel(text,C,{mat:'plain'});
 assert.deepEqual(before.issues,[]);assert.deepEqual(after.issues,[]);
 assert.equal(after.mechanism.joints.length,5);assert.ok(after.mechanism.joints.every(j=>j.type==='hinge'));
 assert.deepEqual(after.mechanism.joints,before.mechanism.joints);
 for(const key of ['actuators','noCollide','hubs','couplings','devices','gravity'])assert.deepEqual(after.mechanism[key],before.mechanism[key]);
 const roles=m=>m.bodies.map(({id,parts,role})=>({id,parts,role}));
 assert.deepEqual(roles(after.mechanism),roles(before.mechanism));
 assert.deepEqual(after.mechanism.bodies.find(b=>b.parts.includes('hingeP')).parts,['hingeP','linkBP']);
 assert.deepEqual(after.mechanism.actuators.map(a=>a.port),['A','B']);
 for(const p of candidate.parts)assert.deepEqual(solidOverlaps(candidate,C,p),[],p.id);
});

test('Twinpoint connector controls detect missing, reversed or excess compensation and wrong stock pin',()=>{
 for(const amount of [-5,-10,5]){
  const m=clone(candidate),p=byId(m,'hingeP');p.position=add(p.position,mv(p.rotation,[amount,0,0]));
  assert.throws(()=>construction(m));
 }
 const wrong=clone(candidate);byId(wrong,'hingeP').part='3673.dat';assert.throws(()=>construction(wrong));
 const thick=clone(candidate);byId(thick,'linkCP').part='40490.dat';assert.throws(()=>construction(thick));
});

test('Twinpoint production-block mutation detects a removed origin compensation',()=>{
 const start=generator.indexOf("if(id==='twinpoint'){");const end=generator.indexOf("if(id==='stride-lab'){",start);
 assert.ok(start>=0&&end>start);const block=generator.slice(start,end);
 const adapted=code=>{const m=parse(read(sourcePath));runInNewContext(code,{id:'twinpoint',model:m});return parse(serializeModel(clone(m),{name:'twinpoint.ldr',title:'mutation'}));};
 construction(adapted(block));
 const mutant=block.replace('v+5*p.rotation[3*i]','v');assert.notEqual(mutant,block);
 assert.throws(()=>construction(adapted(mutant)));
});

test('Twinpoint nominal retention controls reject short span, either missing lip and invalid collar',()=>{
 for(const change of [p=>p.span=[-10,10],p=>p.lips[0].radius=6,p=>p.lips[1].radius=6,p=>p.collar.radius=9,p=>p.collar.interval=[0,4]]){
  const p=clone(profile);change(p);assert.throws(()=>nominalRetention(p));
 }
});
