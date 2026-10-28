import test from 'node:test';
import assert from 'node:assert/strict';
import {loadExtensionClass,bundledExtensionIds} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const sdk=()=>({kind:'sdk',name:'Image'});
const field=()=>({name:'picture',type:'Image',valueKind:'sdk',sdkType:sdk(),readonly:false});
const spec=()=>({name:'PictureHolder',fields:[field()],parameters:[{name:'picture',type:'Image',optional:false,sdkType:sdk()}],initializer:'',constructor:'',methods:[]});
async function fixture(){
 const runtime=createArcadeRuntimeMock(),errors=[];runtime.on('BLOCKS_ERROR',message=>errors.push(message));
 const Arcade=loadExtensionClass(bundledExtensionIds().get('arcade')),extension=new Arcade(runtime)._inst;
 const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
 runtime.emit('PROJECT_START');return {runtime,errors,extension,BW,dispose(){runtime.emit('RUNTIME_DISPOSED');}};
}
test('native SDK Image fields and unused constructor arguments use the actual owner before any class body',async()=>{
 const f=await fixture();try{
  const {extension:e,BW}=f;e._objectHeap.register(spec());
  // Nonempty bodies would fail procedure lookup if reached. Every invalid
  // argument must instead fail its SDK type check before either lookup.
  e._objectHeap.register({...spec(),name:'GuardedBodyHolder',initializer:'EffectfulInitializer',constructor:'EffectfulConstructor'});
  const picture=e.createImage({WIDTH:0,HEIGHT:0});
  const object=e.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([picture],BW.jsonReplacer)});
  assert.equal(e._objectHeap.inspect(object).className,'PictureHolder');assert.equal(BW.decode(e._objectHeap.get(object,'picture')),undefined);
  e._objectHeap.set(object,'picture',picture);assert.equal(e._objectHeap.get(object,'picture'),picture);
  const clone=e.cloneImage({IMAGE:picture});e._objectHeap.set(object,'picture',clone);assert.notEqual(e._image(clone),e._image(picture));
  for(const value of [20,'20',undefined,BW.reference(f.runtime,'image','missing'),{bwReference:{...picture.bwReference,extra:1}},{...picture,extra:1}]){
   assert.throws(()=>e._objectHeap.set(object,'picture',value));
   const count=f.errors.length;assert.equal(BW.decode(e.createObject({CLASS:'GuardedBodyHolder',ARGS:JSON.stringify([value===undefined?BW.UNDEFINED:value])})),undefined);assert.equal(f.errors.length,count+1);
  }
  assert.equal(e._objectHeap.get(object,'picture'),clone);f.runtime.emit('PROJECT_STOP_ALL');assert.equal(e._objectHeap.get(object,'picture'),clone);
  assert.equal(f.errors.length,6);
  assert.ok(f.errors.every(error=>/argument structure differs|body is missing|owned Image/.test(error.message)));
 }finally{f.dispose();}
});
test('native SDK class markers require exact fields and constructor source-facing types',async()=>{
 const f=await fixture();try{
  const badFields=[{...field(),sdkType:{kind:'sdk',name:'Sprite'}},{...field(),sdkType:{...sdk(),extra:true}},{...field(),type:'Number'},{...field(),valueKind:'callable'},{...field(),sdkType:undefined},{...field(),valueKind:undefined}];
  for(const bad of badFields)assert.throws(()=>f.extension._objectHeap.register({...spec(),fields:[bad]}));
  for(const parameter of [{name:'picture',type:'Number',optional:false,sdkType:sdk()},{name:'picture',type:'Image',optional:false,sdkType:{kind:'named',name:'Image'}},{name:'picture',type:'Image',optional:false,sdkType:{...sdk(),extra:true}}])assert.throws(()=>f.extension._objectHeap.register({...spec(),parameters:[parameter]}));
  assert.deepEqual(f.errors,[]);
 }finally{f.dispose();}
});
test('native SDK Image service is closed until Start and replaces disposed owners only on legitimate load',async()=>{
 const f=await fixture();try{
  const {extension:e,runtime,BW}=f;const old=e.createImage({WIDTH:1,HEIGHT:1});runtime.emit('RUNTIME_DISPOSED');
  assert.throws(()=>e._objectHeap.register(spec()),/disposed/);runtime.emit('PROJECT_LOADED');
  e._objectHeap.register(spec());const early=e.createImage({WIDTH:1,HEIGHT:1});
  assert.equal(BW.decode(e.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([early],BW.jsonReplacer)})),undefined);assert.match(f.errors.at(-1).message,/inactive native owner/);
  runtime.emit('PROJECT_START');e._objectHeap.register(spec());
  for(const stale of [old,early])assert.equal(BW.decode(e.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([stale],BW.jsonReplacer)})),undefined);
  const live=e.createImage({WIDTH:1,HEIGHT:1}),object=e.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([live],BW.jsonReplacer)});assert.equal(e._objectHeap.inspect(object).className,'PictureHolder');
 }finally{f.dispose();}
});
test('native SDK method parameter and result roles agree with the one structured signature',async()=>{
 const f=await fixture();try{
  const method={name:'copy',procedure:'CopyImage %s %s',parameters:[{name:'picture',type:'Image',optional:false}],returnType:'Image',typeParameters:[],callableSignature:{kind:'callable',parameters:[{name:'picture',optional:false,type:sdk()}],result:sdk()}};
  const bad=[{...method,returnType:'Number'},{...method,parameters:[{...method.parameters[0],type:'String'}]},{...method,parameters:[{...method.parameters[0],sdkType:sdk()}]},{...method,callableSignature:{...method.callableSignature,result:{...sdk(),extra:true}}}];
  for(const current of bad)assert.throws(()=>f.extension._objectHeap.register({...spec(),methods:[current]}));
  const definition=f.extension._objectHeap.register({...spec(),methods:[method]});assert.deepEqual(definition.methods.get('copy').callableSignature.result,sdk());
  const picture=f.extension.createImage({WIDTH:1,HEIGHT:1}),object=f.extension.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([picture])});
  const malformed={bwReference:{...picture.bwReference,extra:1}};
  assert.equal(f.BW.decode(f.extension.callObjectMethod({OBJECT:object,METHOD:'copy',ARGS:JSON.stringify([malformed])})),undefined);assert.match(f.errors.at(-1).message,/owned Image/);
  assert.equal(f.BW.decode(f.extension.callObjectMethod({OBJECT:object,METHOD:'copy',ARGS:JSON.stringify([picture])})),undefined);assert.match(f.errors.at(-1).message,/procedure is not defined/);
 }finally{f.dispose();}
});

test('raw and dispatched Image arguments bind the same once-coerced JSON text',async()=>{
 const f=await fixture();try{
  const {extension:e,BW}=f;e._objectHeap.register({...spec(),methods:[{name:'copy',procedure:'CopyImage %s %s',parameters:[{name:'picture',type:'Image',optional:false}],returnType:'Image',typeParameters:[],callableSignature:{kind:'callable',parameters:[{name:'picture',optional:false,type:sdk()}],result:sdk()}}]});
  const image=e.createImage({WIDTH:1,HEIGHT:1}),good=JSON.stringify([image]),bad=JSON.stringify([{bwReference:{...image.bwReference,extra:1}}]);
  let conversions=0;const changing={toString(){return ++conversions===1?good:bad;}};
  const object=e.createObject({CLASS:'PictureHolder',ARGS:changing});assert.equal(conversions,1);assert.equal(e._objectHeap.inspect(object).className,'PictureHolder');
  conversions=0;e.callObjectMethod({OBJECT:object,METHOD:'copy',ARGS:changing});assert.equal(conversions,1);assert.match(f.errors.at(-1).message,/procedure is not defined/);
  conversions=0;const reversed={toString(){return ++conversions===1?bad:good;}};
  assert.equal(BW.decode(e.createObject({CLASS:'PictureHolder',ARGS:reversed})),undefined);assert.equal(conversions,1);assert.match(f.errors.at(-1).message,/owned Image/);
 }finally{f.dispose();}
});

test('disposed Image owner skips shared Start events without reviving authority or aborting unrelated listeners',async()=>{
 const f=await fixture();try{
  const {extension:e,runtime,BW}=f;e._objectHeap.register(spec());const old=e.createImage({WIDTH:1,HEIGHT:1});
  let laterStarts=0;runtime.on('PROJECT_START',()=>{laterStarts++;});runtime.emit('RUNTIME_DISPOSED');
  for(let n=0;n<2;n++)assert.doesNotThrow(()=>runtime.emit('PROJECT_START'));
  assert.equal(laterStarts,2);assert.throws(()=>e._objectHeap.register(spec()),/disposed/);
  assert.deepEqual(f.errors,[],'shared Start is inert for the disposed Image owner');
  runtime.emit('PROJECT_LOADED');e._objectHeap.register(spec());const beforeStart=e.createImage({WIDTH:1,HEIGHT:1});
  assert.equal(BW.decode(e.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([beforeStart],BW.jsonReplacer)})),undefined);assert.match(f.errors.at(-1).message,/inactive native owner/);
  runtime.emit('PROJECT_START');e._objectHeap.register(spec());
  for(const stale of [old,beforeStart])assert.equal(BW.decode(e.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([stale],BW.jsonReplacer)})),undefined);
  const current=e.createImage({WIDTH:1,HEIGHT:1}),object=e.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([current],BW.jsonReplacer)});assert.equal(e._objectHeap.inspect(object).className,'PictureHolder');
  e._objectHeap.set(object,'picture',current);assert.equal(e._objectHeap.get(object,'picture'),current);
  runtime.emit('PROJECT_STOP_ALL');assert.equal(e._objectHeap.get(object,'picture'),current,'Stop preserves the current Image body');
 }finally{f.dispose();}
});
test('real VM GreenFlag after clear stays inert for disposed Images until loaded replacement and actual new bodies',async()=>{
 const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
 const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
 let run;try{
  run=await runProgram('SPRITE Game:\nWHEN flag clicked:\n  set picture to (arcade new image width (2) height (2))\n',{frames:20,storage:true});
  assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  const service=run.vm.extensionManager._loadedExtensions.get('arcade'),e=dispatch.services[service]._inst;assert.ok(e._runtime===run.vm.runtime);
  const picture=()=>run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name==='picture'||variable.name==='Game_picture')?.value;
  const old=picture();assert.equal(e._image(old).width,2);const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
  run.vm.clear();let starts=0;run.vm.runtime.on('PROJECT_START',()=>{starts++;});assert.doesNotThrow(()=>run.vm.greenFlag());assert.equal(starts,1);
  assert.throws(()=>e._objectHeap.register(spec()),/disposed/);assert.equal(e._image(old),null);
  await run.vm.loadProject(saved);run.vm.runtime.bwArcadeFrameAuthority='manual';run.vm.greenFlag();await stepFrames(run.vm,20,20);
  const fresh=picture();assert.ok(fresh);assert.notDeepEqual(fresh,old);assert.deepEqual(Array.from(e._image(fresh).pixels),[0,0,0,0]);
  e._objectHeap.register(spec());const object=e.createObject({CLASS:'PictureHolder',ARGS:JSON.stringify([fresh])});assert.equal(e._objectHeap.inspect(object).className,'PictureHolder');assert.deepEqual(run.errors,[]);
 }finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
