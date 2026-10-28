import test from 'node:test';
import assert from 'node:assert/strict';
import {importProjectFiles,importProjectFilesWithDependencies} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {importDependencyProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-import.js';
import {dependencyDiagnosticChannels,makeCodeWorkerErrorEnvelope} from '../overlay/scratch-gui/src/lib/bw-makecode/dependency-diagnostics.js';
import original from '../overlay/scratch-vm/src/serialization/bw-makecode-original.js';
const files=()=>({'main.ts':'info.setScore(addon.value())','pxt.json':JSON.stringify({name:'authored',files:['main.ts'],dependencies:{device:'*',addon:'github:example/addon#v1'}})});
const resolved=(input=files())=>({target:'arcade',inputFiles:{...input},dependencyBindings:{device:'target:*',addon:'github:example/addon#v1'},packages:{addon:{identity:'github:example/addon#v1',dependencyConfig:{dependencies:{device:'*'}},files:{'main.ts':'namespace addon { export function value() { return 7 } }'},resourceIds:[]}},sourceOrder:[{id:'addon',file:'main.ts'}],jres:{},runtimeConfig:{},fetchedExtensions:[{id:'addon',repo:'example/addon',ref:'v1',sha256:{'main.ts':'authored-source-hash'}}]});
const later=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('public async boundary resolves exact current dependencies before translation and retains metadata/order',async()=>{
 const input=files(),before=JSON.stringify(input);let seen;
 const result=await importProjectFilesWithDependencies(input,{target:'arcade',name:'current',version:'version',animationResources:true,fetchExtensions:false,
  resolveProjectInputs:async(target,current,options)=>{seen={target,current,options};return resolved();}});
 assert.equal(seen.target,'arcade');assert.deepEqual(seen.current,input);assert.notEqual(seen.current,input);assert.deepEqual(seen.options,{fetchExtensions:false});
 assert.deepEqual(result.files,input);assert.equal(result.source,input['main.ts']);assert.deepEqual(result.project,{target:'arcade',name:'current',version:'version'});
 assert.equal(JSON.stringify(input),before);assert.deepEqual(result.dependencyInputs.declaredDependencies,JSON.parse(input['pxt.json']).dependencies);
 assert.deepEqual(result.dependencyInputs.sourceOrder,resolved().sourceOrder);assert.equal(result.dependencyInputs.provenance[0].id,'addon');
 assert.deepEqual(result.dependencyInputs.fetchedExtensions,resolved().fetchedExtensions);
 assert.equal(result.dependencyInputs.diagnostics.resolution.status,'observed');assert.equal(result.dependencyInputs.diagnostics.preparation.status,'observed');
 assert.deepEqual(result.dependencyInputs.diagnostics.translation.channels.unsupported.value,result.unsupported);
 assert.ok(result.code.includes('7'),'actual retained helper body reaches translation');
});

test('current input snapshot is captured before awaiting; later caller changes do not replace it',async()=>{
 const input=files(),initial={...input},wait=later();let seen;
 const pending=importProjectFilesWithDependencies(input,{target:'arcade',resolveProjectInputs:async(_target,current)=>{seen=current;return wait.promise;}});
 input['main.ts']='info.setScore(999)';input['pxt.json']='changed after request';wait.resolve(resolved());
 const result=await pending;assert.deepEqual(seen,initial);assert.deepEqual(result.files,initial);assert.equal(result.source,initial['main.ts']);
});

test('resolver mutation refuses and cannot mutate authored authority or trigger translation fallback',async()=>{
 for(const mutate of [current=>{current['main.ts']='changed';},current=>{current.extra='added';},current=>{delete current['pxt.json'];}]){
  const input=files(),before=JSON.stringify(input);let translated=0;
  await assert.rejects(importDependencyProjectFiles(input,{target:'arcade',resolveProjectInputs:async(_target,current)=>{mutate(current);return resolved();}},()=>{translated++;}),error=>error.stage==='resolution'&&error.code==='DEPENDENCY_INPUT_CHANGED');
  assert.equal(translated,0);assert.equal(JSON.stringify(input),before);
 }
});

test('missing, undefined and partial preparation channels remain distinct from translator diagnostics',async()=>{
 const r=resolved();r.warnings=undefined;r.errors=null;r.diagnostics=['actual retained diagnostic'];r.fetchRefusals=[{id:'other',reason:'not available'}];
 const result=await importDependencyProjectFiles(files(),{target:'arcade',resolveProjectInputs:async()=>r},()=>({code:'retained',warnings:['translator warning'],unsupported:['translator gap']}));
 const channels=result.dependencyInputs.diagnostics.resolution.channels;
 assert.deepEqual(channels.warnings,{provided:true,kind:'undefined',value:undefined});assert.deepEqual(channels.errors,{provided:true,kind:'null',value:null});
 assert.deepEqual(channels.unparsed,{provided:false,kind:'absent'});assert.deepEqual(channels.diagnostics.value,r.diagnostics);assert.deepEqual(channels.fetchRefusals.value,r.fetchRefusals);
 assert.deepEqual(result.warnings,['translator warning']);assert.deepEqual(result.unsupported,['translator gap']);
 assert.equal(dependencyDiagnosticChannels({warnings:[]}).warnings.kind,'array');
});

test('resolver, preparer and translator exceptions keep their own stage, cause and diagnostics',async()=>{
 const problem=Object.assign(new Error('package unavailable'),{code:'NO_EXTENSION',extensions:['example/addon#v1'],refused:[{id:'addon',reason:'disabled'}],warnings:undefined});
 await assert.rejects(importProjectFilesWithDependencies(files(),{target:'arcade',resolveProjectInputs:async()=>{throw problem;}}),error=>{
  assert.equal(error.stage,'resolution');assert.equal(error.code,'NO_EXTENSION');assert.equal(error.cause,problem);assert.deepEqual(error.details.extensions,problem.extensions);assert.equal(error.dependencyInputs.diagnostics.preparation.status,'unavailable');return true;
 });
 const unsafe=files();unsafe['__bwDependencyInputs/authored.ts']='';
 await assert.rejects(importProjectFilesWithDependencies(unsafe,{target:'arcade',resolveProjectInputs:async(_target,current)=>resolved(current)}),error=>error.stage==='preparation'&&/reserved/.test(error.message));
 await assert.rejects(importDependencyProjectFiles(files(),{target:'arcade',resolveProjectInputs:async()=>resolved()},()=>{throw problem;}),error=>error.stage==='translation'&&error.cause===problem);
});

test('explicit offline async calls and other targets use the existing sync reader without resolving',async()=>{
 for(const [input,opts]of [[files(),{target:'arcade',prepareDependencies:false}],[{'main.ts':'basic.showNumber(1)'},{target:'microbit'}],[{'main.py':'print(1)'},{target:'arcade'}]]){
  let calls=0;const result=await importProjectFilesWithDependencies(input,{...opts,resolveProjectInputs:()=>{calls++;throw Error('must not resolve');}});
  assert.deepEqual(result,importProjectFiles(input,opts));assert.equal(result.files,input);assert.equal(calls,0);
 }
});

test('actual stale preparation results cannot repair current changed dependency declarations',async()=>{
 const input=files(),stale=resolved();
 input['pxt.json']=JSON.stringify({...JSON.parse(input['pxt.json']),dependencies:{device:'*',addon:'github:example/addon#v2'}});
 await assert.rejects(importProjectFilesWithDependencies(input,{target:'arcade',originalSnapshot:stale,
  resolveProjectInputs:async()=>stale}),error=>error.stage==='resolution'&&error.code==='DEPENDENCY_IDENTITY_MISMATCH'&&/input files/.test(error.message));
 const contradictory=resolved(input);
 await assert.rejects(importProjectFilesWithDependencies(input,{target:'arcade',resolveProjectInputs:async()=>contradictory}),error=>error.code==='DEPENDENCY_IDENTITY_MISMATCH'&&/current package/.test(error.message));
});

test('target, graph, transitive identity and fetched-source contradictions refuse in the shared helper',async()=>{
 for(const mutate of [
  r=>{r.target='microbit';},r=>{delete r.inputFiles;},r=>{r.dependencyBindings.device='target:other';},
  r=>{r.packages.addon.identity='github:example/addon#v2';},r=>{r.fetchedExtensions[0].ref='v2';},
  r=>{r.fetchedExtensions[0].repo='example/other/path';},r=>{r.packages.extra={};},
  r=>{r.packages.addon.dependencyConfig.dependencies.shared='github:example/shared#v1';}
 ]){
  const r=resolved();mutate(r);
  await assert.rejects(importProjectFilesWithDependencies(files(),{target:'arcade',resolveProjectInputs:async()=>r}),error=>error.stage==='resolution'&&error.code==='DEPENDENCY_IDENTITY_MISMATCH');
 }
});

test('existing original record save/load retains dependency provenance without granting source restoration',()=>{
 const record=original.record('arcade',files(),'current');record.dependencyInputs={declaredDependencies:{addon:'github:example/addon#v1'},provenance:[{id:'addon',file:'main.ts'}]};
 const runtime={bwMakeCode:record},project={targets:[]};original.save(project,runtime);const next={};original.load(project,next);const saved={targets:[]};original.save(saved,next);
 assert.deepEqual(saved.bwMakeCode.dependencyInputs,record.dependencyInputs);assert.deepEqual(saved.bwMakeCode.files,record.files);
 assert.notEqual(next.bwMakeCode.files,record.files);assert.equal(original.original(saved).status,'unsettled');
});

test('bounded worker errors retain actual declared diagnostics and name unavailable overflow',()=>{
 const error=Object.assign(new Error('missing'),{code:'NO_EXTENSION',extensions:['example/addon#v2'],warnings:undefined,diagnostics:['actual'],stack:'private stack',secret:'never serialized'});
 const value=makeCodeWorkerErrorEnvelope(error);assert.equal(value.message,'missing');assert.deepEqual(value.warnings,{$kind:'undefined'});assert.deepEqual(value.diagnostics,['actual']);assert.equal(Object.hasOwn(value,'stack'),false);assert.equal(Object.hasOwn(value,'secret'),false);
 const huge=makeCodeWorkerErrorEnvelope(Object.assign(new Error('huge'),{diagnostics:Array.from({length:257},()=>'?')}));
 assert.equal(huge.detailsUnavailable.code,'DEPENDENCY_ERROR_DETAILS_UNAVAILABLE');assert.equal(Object.hasOwn(huge,'diagnostics'),false);
});


test('refusal channels preserve absent, undefined, null, empty and partial observations',async()=>{
 for(const name of ['fetchRefusals','refused']){
  assert.deepEqual(dependencyDiagnosticChannels({})[name],{provided:false,kind:'absent'});
  for(const item of [undefined,null,[],[{id:'addon',reason:'offline'}]]){
   const r=resolved();r[name]=item;
   const result=await importDependencyProjectFiles(files(),{target:'arcade',resolveProjectInputs:async()=>r},()=>({code:'retained',unsupported:[]}));
   const channel=result.dependencyInputs.diagnostics.resolution.channels[name];
   assert.equal(channel.provided,true);assert.equal(channel.kind,item===undefined?'undefined':item===null?'null':'array');assert.deepEqual(channel.value,item);
  }
 }
 const future=[{id:'other',reason:'retained partial refusal'}];
 assert.deepEqual(dependencyDiagnosticChannels({packageRefusals:future}).packageRefusals,{provided:true,kind:'array',value:future});
 const problem=Object.assign(new Error('disabled'),{fetchRefusals:future,refused:undefined});
 await assert.rejects(importProjectFilesWithDependencies(files(),{target:'arcade',resolveProjectInputs:async()=>{throw problem;}}),error=>{
  const channels=error.dependencyInputs.diagnostics.resolution.channels;
  assert.deepEqual(channels.fetchRefusals,{provided:true,kind:'array',value:future});assert.deepEqual(channels.refused,{provided:true,kind:'undefined',value:undefined});return true;
 });
});
