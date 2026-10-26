// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTROL_PAIR_SCHEMA,createControlPair,admitControlPair,restoreControlPair,compareControlPair} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/control-pairs.js';
import {EXPERIMENT_SCHEMA,EXPERIMENT_BYTE_LIMIT,experimentsFromRuns,experimentsToRuns,measurementExperiments} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/experiments.js';
import {compareMeasurementRuns,createMeasurementRecorder,measurementRunsToCsv} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/recording.js';
const a={modelSha256:'a'.repeat(64),rawModelSha256:'c'.repeat(64)},b={modelSha256:'b'.repeat(64),rawModelSha256:'d'.repeat(64)};
const da={id:'shaft',kind:'jointAngle',label:'Baseline',joint:'ja',binding:'baseline-members'},db={...da,label:'Control',joint:'jb',binding:'control-members'};
const clone=v=>structuredClone(v);
const run=(c,d,values=[1,3,5],times=[0,100,250])=>({id:'run-1',origin:'simulation',modelSha256:c.rawModelSha256,definitions:[d],samples:times.map((elapsedMs,i)=>({elapsedMs,timeMs:1000+elapsedMs,readings:[{id:d.id,kind:d.kind,label:d.label,unit:'°',source:'jolt-joint',available:values[i]!==null,value:values[i],reason:values[i]===null?'missing-target':''}]}))});
const inputs=()=>({modelSha256:a.modelSha256,label:'Explicit control',mappings:[{baselineId:'shaft',controlId:'shaft'}],baseline:{packet:experimentsFromRuns([run(a,da)],a),context:a},control:{packet:experimentsFromRuns([{...run(b,db,[5,null,10]),origin:'csv'}],b),context:b}});
const pair=()=>createControlPair(inputs());

test('pair preserves canonical and original identities, duplicate role-qualified run IDs, origins and different bindings',()=>{
 const p=pair(),r=restoreControlPair(JSON.parse(JSON.stringify(p)),a);
 assert.equal(p.schema,CONTROL_PAIR_SCHEMA);assert.equal(p.baseline.schema,EXPERIMENT_SCHEMA);
 assert.equal(r.baseline.id,'run-1');assert.equal(r.control.id,'run-1');
 assert.equal(r.baseline.modelSha256,a.rawModelSha256);assert.equal(r.control.modelSha256,b.rawModelSha256);
 assert.equal(r.baseline.canonicalModelSha256,a.modelSha256);assert.equal(r.control.canonicalModelSha256,b.modelSha256);
 assert.equal(r.baseline.origin,'simulation');assert.equal(r.control.origin,'csv');
 assert.equal(r.baseline.definitions[0].binding,da.binding);assert.equal(r.control.definitions[0].binding,db.binding);
 assert.deepEqual(measurementExperiments(p),p);
 p.baseline.runs[0].samples[0][2][0][0]=999;assert.equal(r.baseline.samples[0].readings[0].value,1);
});
test('exact timestamp intersection and control-minus-baseline preserve observed values and explicit gaps',()=>{
 const i=inputs();i.control.packet=experimentsFromRuns([run(b,db,[7,null,12],[0,100,300])],b);
 const r=compareControlPair(createControlPair(i),a)[0];
 assert.deepEqual(r.pairs.map(p=>p.elapsedMs),[0,100]);assert.equal(r.pairs[0].delta,6);
 assert.equal(r.pairs[1].a,3);assert.equal(r.pairs[1].b,null);assert.equal(r.pairs[1].delta,null);assert.equal(r.pairs[1].controlReason,'missing-target');
 assert.equal(r.baseline.canonicalModelSha256,a.modelSha256);assert.equal(r.control.canonicalModelSha256,b.modelSha256);
 assert.equal(r.unit,'°');assert.equal(r.source,'jolt-joint');assert.deepEqual(r.range,[{min:1,max:5},{min:7,max:12}]);
});
test('no common time and unavailable source-less observations do not fabricate alignment or source',()=>{
 const i=inputs();i.baseline.packet=experimentsFromRuns([run(a,da,[null,null,null])],a);i.control.packet=experimentsFromRuns([run(b,db,[null,null,null],[1,101,251])],b);
 for(const role of ['baseline','control'])for(const s of i[role].packet.runs[0].samples)s[2][0][1]='';
 const r=compareControlPair(createControlPair(i),a)[0];assert.deepEqual(r.pairs,[]);assert.equal(r.source,null);assert.deepEqual(r.range,[{min:null,max:null},{min:null,max:null}]);
});
test('creation independently admits both model contexts and anchor must be a member',()=>{
 for(const mutate of [i=>{i.baseline.context={modelSha256:'e'.repeat(64)};},i=>{i.control.context=a;},i=>{delete i.control.context;},i=>{i.modelSha256='f'.repeat(64);},i=>{i.control=i.baseline;}]){const i=inputs();mutate(i);assert.throws(()=>createControlPair(i),/model|context|identities/);}
 const i=inputs();i.modelSha256=b.modelSha256;assert.equal(restoreControlPair(createControlPair(i),b).control.canonicalModelSha256,b.modelSha256);
 assert.throws(()=>restoreControlPair(pair(),b),/anchor/);
});
test('restore strengthens each role with optional contexts and never bypasses current live bindings',()=>{
 const p=pair(),bad={...a,definitions:[{...da,binding:'wrong'}]};
 assert.throws(()=>restoreControlPair(p,bad),/binding mismatch/);
 assert.throws(()=>restoreControlPair(p,a,{control:{...b,definitions:[{...db,joint:'wrong'}]}}),/binding mismatch/);
 assert.throws(()=>restoreControlPair(p,a,{control:a}),/model mismatch/);
 assert.throws(()=>restoreControlPair(p,bad,{baseline:{...a,definitions:[da]}}),/binding mismatch/);
 assert.equal(restoreControlPair(p,a,{control:{...b,definitions:[db]}}).control.definitions[0].joint,db.joint);
});
test('mapping cardinality, endpoints and duplicates are strict and admission is immutable',()=>{
 for(const mappings of [[],null,[{baselineId:'missing',controlId:'shaft'}],[{baselineId:'shaft',controlId:'missing'}],[{baselineId:'shaft',controlId:'shaft'},{baselineId:'shaft',controlId:'shaft'}],[{baselineId:'',controlId:'shaft'}],[{baselineId:'x'.repeat(129),controlId:'shaft'}],Array.from({length:5},()=>({baselineId:'shaft',controlId:'shaft'}))]){const p=pair();p.mappings=mappings;const before=clone(p);assert.throws(()=>admitControlPair(p),/mapping|endpoints/);assert.deepEqual(p,before);}
});
test('kinds must match even with equal units; bad source and unit never bypass v1 admission',()=>{
 const i=inputs(),d={id:'shaft',kind:'angle',label:'Geometry',targets:['p','q','r']},r=run(b,d);r.samples.forEach(s=>{s.readings[0].source='part-origins';});i.control.packet=experimentsFromRuns([r],b);assert.throws(()=>createControlPair(i),/kinds differ/);
 const p=pair();p.control.runs[0].samples[0][2][0][1]='invented';assert.throws(()=>admitControlPair(p),/source/);
 const bad=run(b,db);bad.samples[0].readings[0].unit='rad';assert.throws(()=>experimentsFromRuns([bad],b),/reading/);
});
test('nested v2, zero/multiple runs, future versions and interpolation refuse',()=>{
 for(const role of ['baseline','control']){
  const p=pair();p[role]=pair();assert.throws(()=>admitControlPair(p),/v1 history/);
  const empty=pair();empty[role].runs=[];assert.throws(()=>admitControlPair(empty),/exactly one/);
  const extra=pair();extra[role].runs.push({...clone(extra[role].runs[0]),id:'run-2'});assert.throws(()=>admitControlPair(extra),/exactly one/);
 }
 assert.throws(()=>measurementExperiments({...pair(),schema:'bw.sim-lab.experiments.v99'}),/schema/);
 assert.throws(()=>admitControlPair({...pair(),alignment:'interpolate'}),/alignment/);
});
test('factory requires explicit run selection from a two-run source and retains original ID',()=>{
 const i=inputs();i.baseline.packet=experimentsFromRuns([run(a,da),{...run(a,da,[4,5,6]),id:'run-2'}],a);
 assert.throws(()=>createControlPair(i),/select a run/);i.baseline.runId='run-2';const p=createControlPair(i);assert.equal(p.baseline.runs.length,1);assert.equal(p.baseline.runs[0].id,'run-2');assert.equal(p.baseline.runs[0].samples[0][2][0][0],4);
 i.baseline.runId='missing';assert.throws(()=>createControlPair(i),/missing/);
});
test('sample/duration/trace and aggregate history byte caps remain unchanged',()=>{
 const excess=pair();excess.control.runs[0].samples=Array.from({length:601},(_,i)=>[i*99,null,[[1,'jolt-joint','']]]);assert.throws(()=>admitControlPair(excess),/samples/);
 const duration=pair();duration.control.runs[0].samples[2][0]=60000;assert.throws(()=>admitControlPair(duration),/elapsed time/);
 const traces=pair();traces.control.runs[0].definitions=Array.from({length:5},(_,i)=>({...db,id:'m'+i}));assert.throws(()=>admitControlPair(traces),/1-4/);
 assert.throws(()=>admitControlPair({...pair(),unknown:'x'.repeat(EXPERIMENT_BYTE_LIMIT)}),/aggregate history byte limit/);
});
test('ordinary comparison, append and CSV imports remain strict',()=>{
 const ap=experimentsFromRuns([run(a,da)],a),bp=experimentsFromRuns([run(b,db)],b),ar=experimentsToRuns(ap,a)[0],br=experimentsToRuns(bp,b)[0];
 assert.deepEqual(compareMeasurementRuns([ar,br]),[]);assert.throws(()=>experimentsFromRuns([ar,br],a),/model mismatch/);
 const recorder=createMeasurementRecorder();recorder.restore(ap,a);const before=recorder.snapshot();assert.throws(()=>recorder.importCsv(measurementRunsToCsv([br]),a),/model mismatch/);assert.deepEqual(recorder.snapshot(),before);
});


test('duplicate baseline and control endpoints each refuse independently',()=>{
 const i=inputs();
 for(const role of ['baseline','control']){
  const p=i[role].packet,r=p.runs[0];r.definitions.push({...r.definitions[0],id:'other'});
  r.samples.forEach(s=>s[2].push([...s[2][0]]));
 }
 i.mappings=[{baselineId:'shaft',controlId:'shaft'},{baselineId:'other',controlId:'other'}];
 const valid=createControlPair(i);assert.equal(compareControlPair(valid,a).length,2);
 const dupA=clone(valid);dupA.mappings[1].baselineId='shaft';assert.throws(()=>admitControlPair(dupA),/unique valid endpoints/);
 const dupB=clone(valid);dupB.mappings[1].controlId='shaft';assert.throws(()=>admitControlPair(dupB),/unique valid endpoints/);
});
test('a complete two-role four-trace six-hundred-set pair fits and preserves every original sample',()=>{
 const i=inputs();
 for(const [role,c,d] of [['baseline',a,da],['control',b,db]]){
  const definitions=Array.from({length:4},(_,n)=>({...d,id:'m'+n,binding:'x'.repeat(4096)}));
  const r=run(c,d);r.definitions=definitions;
  r.samples=Array.from({length:600},(_,n)=>({elapsedMs:n*100,timeMs:1000+n*100,readings:definitions.map(def=>({...r.samples[0].readings[0],id:def.id,value:n}))}));
  i[role].packet=experimentsFromRuns([r],c);
 }
 i.mappings=Array.from({length:4},(_,n)=>({baselineId:'m'+n,controlId:'m'+n}));
 const p=createControlPair(i);assert.ok(Buffer.byteLength(JSON.stringify(p))<=EXPERIMENT_BYTE_LIMIT);
 const restored=restoreControlPair(p,a);assert.equal(restored.baseline.samples.length,600);assert.equal(restored.control.samples[599].readings[3].value,599);
 assert.equal(compareControlPair(p,a)[3].pairs.length,600);
});
test('comparison never emits an infinite derived delta from finite observations',()=>{
 const i=inputs();i.baseline.packet=experimentsFromRuns([run(a,da,[-1e308,-1e308,-1e308])],a);i.control.packet=experimentsFromRuns([run(b,db,[1e308,1e308,1e308])],b);
 const result=compareControlPair(createControlPair(i),a)[0];
 assert.equal(result.pairs[0].a,-1e308);assert.equal(result.pairs[0].b,1e308);assert.equal(result.pairs[0].delta,null);assert.equal(result.pairs[0].available,false);assert.equal(result.pairs[0].reason,'nonfinite-delta');
});
