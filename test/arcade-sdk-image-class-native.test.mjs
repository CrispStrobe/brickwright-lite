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
