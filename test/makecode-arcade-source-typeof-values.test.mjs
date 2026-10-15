import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
const require=createRequire(import.meta.url),BW=require(VM_SRC+'/util/bw-values.js'),Arcade=loadExtensionClass('arcade');
const spec={name:'Box',fields:[],initializer:'',constructor:'',parameters:[],methods:[]};
const fixture=()=>{const runtime=createArcadeRuntimeMock(),native=new Arcade(runtime)._inst;return {runtime,native,type:native._sourceTypeOf};};
const objects=f=>{const array=BW.arrayReference(f.runtime,[1,2]),image=f.native.createImage({WIDTH:2,HEIGHT:1}),buffer=f.native.bufferFromHex({HEX:'0102'});f.native._objectHeap.register(spec);const allocation=f.native._objectHeap.allocate('Box');return {array,image,buffer,object:allocation.ref,allocation};};
test('source typeof canonical codec primitives and real literal liveSpritehandle stay primitive',()=>{
 const f=fixture();assert.equal(f.native._callableValues.runtime,f.runtime);assert.equal(f.native._callableValues.values,BW);assert.equal(f.native._callableValues.resources.size,0);
 for(const x of [0,-0,NaN,Infinity,-Infinity,true,false,'','[1,2]','null','undefined','{"bwReference":{"kind":"callable"}}','雪🙂'])assert.equal(f.type(BW.encode(x)),typeof x);
 assert.equal(f.type(null),'object');assert.equal(f.type(BW.UNDEFINED),'undefined');
 const image=f.native.createImage({WIDTH:1,HEIGHT:1}),handle=f.native.createImageSprite({IMAGE:image,KIND:1000});
 assert.equal(typeof handle,'string');assert.ok(f.native._spriteValues.has(handle));
 const literal=(' '+handle).slice(1);assert.equal(f.type(literal),'string');
});
test('source typeof actual Array Image Buffer class construction identity qualifies without held callable codec',()=>{
 const f=fixture(),r=objects(f);for(const ref of [r.array,r.image,r.buffer,r.object]) {const alias=BW.decode(JSON.parse(JSON.stringify(ref)));assert.equal(f.type(alias),'object');assert.equal(BW.compare(alias,'===',ref),true);}
 assert.equal(f.native._objectHeap.inspect(r.object).constructing,true);f.native._objectHeap.finish(r.object,r.allocation.token);assert.equal(f.type(r.object),'object');
});
test('source typeof refuses callable transport despite its actual service owner and rejects forged refs',()=>{
 const f=fixture(),carrier=BW.reference(f.runtime,'callable','fake');assert.throws(()=>f.native._callableValues.resource(carrier),/Stale or foreign callable reference/);assert.throws(()=>f.type(carrier),/unsupported reference owner callable/);
 assert.throws(()=>f.type({bwReference:{kind:'callable',id:'fake',scope:'fake'}}),/foreign or stale callable reference/);
 for(const kind of ['array','image','buffer','object'])assert.throws(()=>f.type(BW.reference(f.runtime,kind,'missing')),/typeof:/);
 assert.equal(f.native._bufferHeap,undefined);for(const x of [{},[],()=>1])assert.throws(()=>f.type(x),/unregistered/);
});
test('source typeof actual foreign owners and native owner replacement remain refused',()=>{
 const f=fixture(),g=fixture(),refs=objects(g);for(const ref of [refs.array,refs.image,refs.buffer,refs.object])assert.throws(()=>f.type(ref),/foreign or stale/);
 const own=objects(f);f.native._objectHeap={inspect:()=>({className:'Box'})};assert.throws(()=>f.type(own.object),/native owner changed or disposed/);
});
test('source typeof actual restart rejects stale refs and supports new current owners',()=>{
 const f=fixture(),r=objects(f);f.runtime.emit('PROJECT_START');for(const ref of [r.array,r.image,r.buffer,r.object])assert.throws(()=>f.type(ref),/foreign or stale|missing or stale/);
 const next=objects(f);for(const ref of [next.array,next.image,next.buffer,next.object])assert.equal(f.type(ref),'object');
});
test('source typeof disposed lifetime guard refuses retained image maps until actual Load and Start',()=>{
 const f=fixture(),r=objects(f);f.runtime.emit('RUNTIME_DISPOSED');for(const ref of [r.array,r.image,r.buffer,r.object])assert.throws(()=>f.type(ref),/native owner changed or disposed/);
 f.runtime.emit('PROJECT_LOADED');f.runtime.emit('PROJECT_START');const next=objects(f);for(const ref of [next.array,next.image,next.buffer,next.object])assert.equal(f.type(ref),'object');
});
test('source typeof unsupported known reference kinds cannot infer object from codec label',()=>{
 const f=fixture();for(const kind of ['scene','tile','animation','player'])assert.throws(()=>f.type(BW.reference(f.runtime,kind,'registered-looking')),/unsupported reference owner/);
});
test('source typeof current native owner identity and body removal remain actual authority boundaries',()=>{
 const f=fixture(),r=objects(f);f.native._images.clear();assert.throws(()=>f.type(r.image),/image body missing/);
 f.native._bufferHeap=null;assert.throws(()=>f.type(r.buffer),/buffer body missing or stale/);
 f.native._runtime={};assert.throws(()=>f.type(r.array),/native owner changed/);
});
test('source typeof empty and mutated arrays and empty Buffer preserve actual owner identity',()=>{
 const f=fixture(),array=BW.arrayReference(f.runtime,[]);assert.equal(f.type(array),'object');BW.arrayValue(f.runtime,array).push('json-looking');assert.equal(f.type(array),'object');
 const empty=f.native.createBuffer({SIZE:0});assert.equal(f.type(empty),'object');assert.equal(f.native._buffer(empty).length,0);
});

test('source typeof reporter is connected and returns String, with named runtime errors', () => {
 const f=fixture(),block=f.native.getInfo().blocks.find(block=>block.opcode==='sourceTypeOf');
 assert.equal(block.blockType,'reporter');assert.ok(block.arguments.VALUE);assert.equal(block.arguments.VALUE.menu,undefined);
 for(const [input,expected]of [[undefined,'undefined'],[BW.UNDEFINED,'undefined'],[null,'object'],[false,'boolean'],[0,'number'],[BW.encode('null'),'string']])assert.equal(f.native.sourceTypeOf({VALUE:input}),expected);
 assert.equal(f.native.sourceTypeOf({}),'undefined');
 const errors=[];f.runtime.on('BLOCKS_ERROR',message=>errors.push(message));
 assert.equal(f.native.sourceTypeOf({VALUE:BW.reference(f.runtime,'image','missing')}),BW.UNDEFINED);
 assert.match(String(errors.at(-1)),/Arcade source typeof: image body missing/);
 f.runtime.emit('RUNTIME_DISPOSED');assert.throws(()=>f.type(1),/disposed/);
});
