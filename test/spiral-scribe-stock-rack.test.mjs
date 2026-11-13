// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {EXPERIMENTAL_MODELS, EXPERIMENTAL_MODEL_DETAILS} from '../overlay/scratch-gui/src/lib/bw-sim/model/experimental-models.js';
const asset = path => readFileSync(new URL('../overlay/scratch-gui/'+path,import.meta.url),'utf8');
const ldr=asset('static/sim-lab/models/spiral-scribe.ldr'), mpd=asset('static/sim-lab/models/spiral-scribe.mpd');
const program=asset('static/sim-lab/programs/spiral-scribe.bw');
const catalog=new Map(JSON.parse(asset('src/lib/bw-sim/part-meta/parts.json')).parts.map(p=>[p.part,p]));
const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), norm=a=>Math.hypot(...a);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} differs from ${b}`);
const transform=(m,v)=>[0,1,2].map(i=>dot(m.slice(i*3,i*3+3),v));
function parse(text) {
 const parts=new Map(),ports=new Map(); let id,port;
 for(const line of text.split(/\r?\n/)) {
  if(line.startsWith('0 !BW ID '))id=line.slice(9);
  else if(line.startsWith('0 !BW PORT '))port=line.slice(11);
  else if(line.startsWith('1 ')) {
   const fields=line.trim().split(/\s+/),values=fields.slice(2,14).map(Number);
   assert.equal(fields.length,15);assert.ok(values.every(Number.isFinite));
   assert.ok(id&&!parts.has(id),'every part has one unique stable ID');
   assert.ok(catalog.has(fields[14]),'only catalogued stock parts');
   parts.set(id,{part:fields[14],position:values.slice(0,3),matrix:values.slice(3)});
   if(port){assert.ok(!ports.has(port));ports.set(port,id);} id=port=undefined;
  }
 }
 return {parts,ports};
}
const {parts,ports}=parse(ldr);
function connector(model,id,name) {
 const part=model.get(id);assert.ok(part,`missing part ${id}`);
 const c=catalog.get(part.part).connectors.find(c=>c.id===name);assert.ok(c,`${id} lacks ${name}`);
 return {...c,position:add(part.position,transform(part.matrix,c.position)),axis:transform(part.matrix,c.axis),
  normal:c.data?.normal&&transform(part.matrix,c.data.normal)};
}
function fullInsertion(hole,shaft) {
 assert.ok((hole.type==='axlehole'&&shaft.type==='axle')||(hole.type==='pinhole'&&shaft.type==='pin'),'compatible socket/shaft');
 near(Math.abs(dot(hole.axis,shaft.axis)),1);
 const offset=sub(hole.position,shaft.position),along=dot(offset,shaft.axis);
 near(norm(sub(offset,shaft.axis.map(x=>x*along))),0);
 near(Math.min(along+hole.length/2,shaft.length/2)-Math.max(along-hole.length/2,-shaft.length/2),hole.length);
 return [dot(hole.position,shaft.axis)-hole.length/2,dot(hole.position,shaft.axis)+hole.length/2];
}
function checkMounts(model) {
 for(const [end,rackHole,railHole] of [['-100','x2','h4'],['100','x0','h13']]) {
  const axle=connector(model,`rack_mount_axle_${end}`,'a');
  const sockets=[connector(model,'radial_rack',rackHole),connector(model,`rack_link_${end}`,'h0'),
   ...['-95','-75','-45'].map(y=>connector(model,`rack_mount_bush_${end}_${y}`,'c'))];
  const intervals=sockets.map(h=>fullInsertion(h,axle)).sort((a,b)=>a[0]-b[0]);
  near(intervals[0][0],dot(axle.position,axle.axis)-axle.length/2);
  near(intervals.at(-1)[1],dot(axle.position,axle.axis)+axle.length/2);
  for(let i=1;i<intervals.length;i++)near(intervals[i-1][1],intervals[i][0]);
  const pin=connector(model,`rack_link_pin_${end}`,'p');assert.equal(model.get(`rack_link_pin_${end}`).part,'2780.dat');
  const paired=[connector(model,`rack_link_${end}`,'h1'),connector(model,'carriage_rail_60',railHole)]
   .map(h=>fullInsertion(h,pin)).sort((a,b)=>a[0]-b[0]);
  near(paired[0][1],paired[1][0]);
  near(dot(pin.position,pin.axis),paired[0][1]); // collar at the beam/thin-link interface
  assert.ok(!model.has(`rack_link_pin_bush_${end}`),'no axle bush on a friction pin');
 }
}
test('stock rack has two fully inserted non-overlapping axle/link/pin chains',()=>{
 assert.equal(parts.get('radial_rack').part,'18942.dat');checkMounts(parts);
});
test('mount checks reject a buried collar, wrong pin and displaced rack',()=>{
 for(const alter of [m=>{m.get('rack_link_pin_-100').position[1]-=5;},
  m=>{m.get('rack_link_pin_100').part='43093.dat';},m=>{m.get('radial_rack').position[0]+=1;}]) {
  const changed=structuredClone(parts);alter(changed);assert.throws(()=>checkMounts(changed));
 }
});
test('gearing and tooth-line placement preserve the existing ideal radial feed',()=>{
 const teeth=id=>catalog.get(parts.get(id).part).gear.teeth;
 for(const [id,n] of [['drive_gear',20],['carrier_ring',60],['sun_gear',24],['planet_gear',24],['feed_pinion',12]])assert.equal(teeth(id),n);
 const rack=connector(parts,'radial_rack','teeth'),pinion=parts.get('feed_pinion');
 const pitchRadiusLdu=teeth('feed_pinion')/2/0.4; // existing module-1 ideal law, not measured pitch
 near(dot(sub(pinion.position,rack.position),rack.normal),pitchRadiusLdu);
 near(dot(sub(pinion.position,rack.position),transform(pinion.matrix,[0,0,1])),0);
 const along=dot(sub(pinion.position,rack.position),rack.axis),idealStrokeLdu=2*Math.PI*pitchRadiusLdu;
 assert.ok(Math.abs(along)+idealStrokeLdu+pitchRadiusLdu<rack.length/2,
  'catalogue span covers the ideal excursion and pitch-circle footprint; not dynamic travel proof');
});
test('existing program motor/broadcast names resolve in the whole model and registry',()=>{
 const entry=EXPERIMENTAL_MODELS.find(m=>m.file==='spiral-scribe.ldr');
 assert.equal(entry.example,'spiral-scribe.bw');assert.equal(entry.experimental,true);
 const used=[...program.matchAll(/\blab (?:(?:run|stop) motor|motor) ([A-F])\b/g)].map(m=>m[1]);assert.ok(used.length>0);
 for(const port of used){assert.equal(ports.get(port),'motor_A');assert.equal(parts.get(ports.get(port)).part,'54696p01.dat');}
 const handlers=new Set([...program.matchAll(/^WHEN I receive "([^"]+)":/gm)].map(m=>m[1]));
 for(const match of program.matchAll(/\bbroadcast "([^"]+)"/g))assert.ok(handlers.has(match[1]));
 for(const id of ['motor_A','drive_gear','carrier_ring','sun_gear','planet_gear','feed_pinion','radial_rack','output_marker'])assert.ok(parts.has(id),id);
});
test('whole LDR/MPD stay synchronized and catalogue count retains experimental status',()=>{
 assert.equal(mpd,'0 FILE spiral-scribe.ldr\n'+ldr+'\n0 NOFILE\n');assert.deepEqual(parse(mpd),{parts,ports});
 assert.equal(parts.size,183);const details=EXPERIMENTAL_MODEL_DETAILS['spiral-scribe.ldr'];
 assert.equal(details.pieces,parts.size);assert.equal(details.experimental,true);
});

test('audit reports the installed rack separately and rejects malformed rack placements',()=>{
 const script=new URL('../scripts/audit-spiral-racks.mjs',import.meta.url);
 const actual=spawnSync(process.execPath,[fileURLToPath(script)],{encoding:'utf8',timeout:3000});
 assert.equal(actual.status,0,actual.stderr);
 const report=JSON.parse(actual.stdout);
 assert.equal(report.activeRack,'18942.dat');assert.equal(report.reference,'64781.dat');
 assert.match(report.referenceRole,/original.*benchmark/);
 const placement=/^0 !BW ID radial_rack\r?\n([^\r\n]+)$/m.exec(ldr)[1];
 const intercept=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
 const model=fs.readFileSync(0,'utf8'),read=fs.readFileSync;
 fs.readFileSync=(path,...args)=>String(path).endsWith('/models/spiral-scribe.ldr')?model:read(path,...args);
 syncBuiltinESMExports();await import(process.argv[1]);`;
 const missing=placement.split(/\s+/);missing.splice(2,1);
 const nonfinite=placement.split(/\s+/);nonfinite[2]='NaN';
 for(const row of [placement.replace(/^1 /,'0 '),missing.join(' '),nonfinite.join(' ')]) {
  const result=spawnSync(process.execPath,['--input-type=module','-e',intercept,script.href],
   {encoding:'utf8',timeout:3000,input:'0 !BW ID radial_rack\n'+row+'\n'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/finite LDraw Type 1/);
 }
});
