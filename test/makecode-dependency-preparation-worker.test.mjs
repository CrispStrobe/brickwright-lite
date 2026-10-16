import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {resolveProjectInputsMakeCode,WORKER_JS} from '../overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js';

// The actual OWN worker handler and package-input glue run over authored SDK
// method stubs. No original PXT SDK, source compiler, simulator or Worker runs.
async function harness(run,{failure=false,initFailure=false,constructionFailure=false}={}) {
 const saved={Worker:globalThis.Worker,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 const blobs=new Map(),workers=[],revoked=[],calls={compile:0,install:[],options:[],requests:[],configure:0};let serial=0;
 URL.createObjectURL=blob=>{const key='blob:authored-'+(++serial);blobs.set(key,blob);return key;};URL.revokeObjectURL=url=>revoked.push(url);
 class FakeWorker {
  constructor(url){
   this.terminated=0;workers.push(this);if(constructionFailure)throw Error('authored worker construction refusal');
   this.ready=(async()=>{
    const source=await blobs.get(url).text();assert.equal(source,WORKER_JS);
    const context=vm.createContext({self:{},postMessage:value=>this.onmessage({data:structuredClone(value)}),
     fetch:async address=>{calls.requests.push(address);assert.match(address,/\/arcade\/target.json$/);return {ok:!initFailure,status:initFailure?404:200,json:async()=>({id:'arcade'})};},
     importScripts:address=>{assert.match(address,/\/arcade\/pxtworker.js$/);context.self.onmessage=()=>{throw Error('foreign SDK handler must be replaced');};}});
    vm.runInContext(source,context,{timeout:1000});
    context.bwMakeCode.configure=()=>{calls.configure++;};
    context.pxt={appTarget:{id:'arcade',runtime:{}},
     simpleInstallPackagesAsync:async files=>{calls.install.push(structuredClone(files));if(failure)throw Object.assign(new Error('authored preparation refusal'),{code:'PACKAGE_REFUSED',diagnostics:['actual authored diagnostic']});},
     setHwVariant:value=>assert.equal(value,''),setAppTargetVariant:value=>assert.equal(value,null),
     simpleGetCompileOptionsAsync:async(files,options)=>{calls.options.push(structuredClone(options));assert.equal(options.native,false);return {fileSystem:{},sourceFiles:['main.ts'],jres:{}};}};
    context.pxtc={service:{performOperation:()=>{calls.compile++;throw Error('SOURCE_COMPILATION_FORBIDDEN');}}};
    this.context=context;
   })();
  }
  postMessage(message){this.ready.then(()=>this.context.self.onmessage({data:structuredClone(message)})).catch(error=>this.onerror({message:error.message}));}
  terminate(){this.terminated++;}
 }
 globalThis.Worker=FakeWorker;
 try {await run({calls,workers,revoked,create:async()=>{const worker=new FakeWorker(URL.createObjectURL(new Blob([WORKER_JS])));await worker.ready;return worker;}});}
 finally {globalThis.Worker=saved.Worker;URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;}
}
const files={'main.ts':'info.setScore(1)','pxt.json':JSON.stringify({files:['main.ts'],dependencies:{device:'*'}})};

test('public browser preparation reaches actual early return without source compilation or base hex',async()=>{
 await harness(async({calls,workers,revoked})=>{
  const value=await resolveProjectInputsMakeCode({target:'arcade',files,fetchExtensions:false,baseUrl:'https://authored.invalid/'});
  assert.deepEqual(value.packages,{});assert.deepEqual(value.sourceOrder,[]);assert.equal(Object.hasOwn(value,'success'),false);
  assert.equal(value.target,'arcade');assert.deepEqual(value.inputFiles,files);assert.deepEqual(value.dependencyBindings,{device:'target:*'});
  assert.equal(calls.install.length,1);assert.equal(calls.options.length,1);assert.equal(calls.configure,1);assert.equal(calls.compile,0);
  assert.deepEqual(calls.requests,['https://authored.invalid/static/makecode/arcade/target.json']);
  assert.equal(workers.length,1);assert.equal(workers[0].terminated,1);assert.equal(revoked.length,1);
 });
});

test('preparation errors retain their diagnostics and dispose the fresh operation',async()=>{
 await harness(async({calls,workers,revoked})=>{
  await assert.rejects(resolveProjectInputsMakeCode({target:'arcade',files,fetchExtensions:false,baseUrl:'https://authored.invalid/'}),error=>{
   assert.equal(error.code,'PACKAGE_REFUSED');assert.deepEqual(error.diagnostics,['actual authored diagnostic']);assert.deepEqual(error.workerError.diagnostics,['actual authored diagnostic']);return true;
  });
  assert.equal(calls.compile,0);assert.equal(workers[0].terminated,1);assert.equal(revoked.length,1);
 },{failure:true});
});

test('sequential preparations use separate current files and fresh worker lifetimes',async()=>{
 await harness(async({calls,workers,revoked})=>{
  for(const value of [1,2])await resolveProjectInputsMakeCode({target:'arcade',files:{...files,'main.ts':'info.setScore('+value+')'},fetchExtensions:false,baseUrl:'https://authored.invalid/'});
  assert.equal(workers.length,2);assert.notEqual(workers[0],workers[1]);assert.deepEqual(workers.map(worker=>worker.terminated),[1,1]);assert.equal(revoked.length,2);
  assert.deepEqual(calls.install.map(value=>value['main.ts']),['info.setScore(1)','info.setScore(2)']);assert.equal(calls.compile,0);
 });
});


test('actual package resolver refuses conflicting aliases and ambiguous exact source identities',async()=>{
 await harness(async({create})=>{
  const worker=await create(),sdk=worker.context.bwMakeCode;
  const entry=(repo,ref,dependencies={})=>({repo,refs:[ref],targets:['arcade'],files:{'pxt.json':JSON.stringify({dependencies,files:['main.ts']}),'main.ts':'namespace authored {}'}});
  sdk.extensions=[entry('example/outer','v1',{shared:'github:example/shared#v2'}),entry('example/shared','v1'),entry('example/shared','v2')];
  assert.throws(()=>sdk.resolveExtensions({shared:'github:example/shared#v1',outer:'github:example/outer#v1'},'arcade',[]),error=>error.code==='DEPENDENCY_CONFLICT');
  sdk.extensions=[entry('example/outer','v1',{shared:'github:example/shared#v1'}),entry('example/shared','v1')];
  assert.throws(()=>sdk.resolveExtensions({shared:'*',outer:'github:example/outer#v1'},'arcade',[]),error=>error.code==='DEPENDENCY_CONFLICT');
  assert.throws(()=>sdk.resolveExtensions({outer:'github:example/outer#v1',shared:'*'},'arcade',[]),error=>error.code==='DEPENDENCY_CONFLICT');
  assert.equal(sdk.resolveExtensions({device:'*'},'arcade',[]).identities.device,'target:*','normal target default remains valid');
  sdk.extensions=[entry('example/shared/path','v1'),entry('example/shared/path','v1')];
  assert.throws(()=>sdk.resolveExtensions({shared:'github:example/shared/path#v1'},'arcade',[]),error=>error.code==='AMBIGUOUS_EXTENSION');
  sdk.extensions=[entry('example/shared/path','v1')];
  assert.throws(()=>sdk.resolveExtensions({shared:'github:example/shared/path#'},'arcade',[]),error=>error.code==='UNSUPPORTED_EXTENSION');
  assert.equal(Object.keys(sdk.resolveExtensions({first:'github:example/shared/path#v1',second:'github:example/shared/path#v1'},'arcade',[]).overrides).length,2,'different declared package aliases are retained');
  assert.equal(sdk.resolveExtensions({shared:'github:example/shared/other#v1'},'arcade',[]).unresolved.length,1,'subpath mismatch must not select another package');
  assert.equal(sdk.resolveExtensions({shared:'github:example/shared/path#v2'},'arcade',[]).unresolved.length,1,'ref mismatch must not select another version');
  assert.equal(sdk.resolveExtensions({shared:'github:example/shared/path#v1'},'microbit',[]).unresolved.length,1,'target mismatch must not select another package');
  worker.terminate();
 });
});


test('initialization and construction failures release owned worker URLs without compiling',async()=>{
 await harness(async({calls,workers,revoked})=>{
  const input={...files,'pxt.json':JSON.stringify({files:['main.ts'],dependencies:{custom:'github:example/missing#v1'}})};
  await assert.rejects(resolveProjectInputsMakeCode({target:'arcade',files:input,fetchExtensions:false,baseUrl:'https://authored.invalid/'}),error=>error.code==='NO_RUNTIME'&&error.fetchDisabled===true&&Array.isArray(error.fetchedExtensions));
  assert.equal(calls.compile,0);assert.equal(calls.install.length,0);assert.equal(workers[0].terminated,1);assert.equal(revoked.length,1);
 },{initFailure:true});
 await harness(async({calls,revoked})=>{
  await assert.rejects(resolveProjectInputsMakeCode({target:'arcade',files,fetchExtensions:false,baseUrl:'https://authored.invalid/'}),/worker construction refusal/);
  assert.equal(calls.compile,0);assert.equal(revoked.length,1);
 },{constructionFailure:true});
});
