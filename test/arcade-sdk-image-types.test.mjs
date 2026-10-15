import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import createTypes from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-types.js';
import createOwner from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-image-owner.js';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const imageType=()=>({kind:'sdk',name:'Image'});
const signature=(input,result=input)=>({kind:'callable',parameters:[{name:'image',optional:false,type:input}],result});
function fixture(){
    const runtime=new EventEmitter(),extension={_runtime:runtime},images=new Map();let identities=new WeakMap();
    const resolve=function(value){return images.get(BW.referenceId(runtime,value,'image'));};
    const owner=createOwner(runtime,BW,()=>({extension,images,identities,resolve,current:true}));owner.start();
    const heap={definition:name=>{if(name==='Image')return {name:'Image',parent:null};throw Error('unknown class');},inspect:()=>({className:'Image'})};
    const types=createTypes(runtime,BW,heap,null,owner);
    const body={width:0,height:0,pixels:new Uint8Array()},ref=BW.reference(runtime,'image','actual');images.set('actual',body);identities.set(body,'actual');
    return {types,owner,ref,runtime,heap,restart(){images.clear();identities=new WeakMap();}};
}
test('SDK Image signatures are opt-in exact leaves distinct from ordinary named Image',()=>{
    const f=fixture();assert.deepEqual(f.types.validate(imageType()),imageType());
    const closed=createTypes(f.runtime,BW,f.heap);assert.throws(()=>closed.validate(imageType()),/SDK signature/);
    for(const type of [{kind:'sdk',name:'Sprite'},{kind:'sdk',name:'Font'},{kind:'sdk',name:'Buffer'},{kind:'sdk',name:'Image',annotation:true},{kind:'sdk'}])assert.throws(()=>f.types.validate(type),/SDK signature/);
    let calls=0;assert.throws(()=>f.types.validate({kind:'sdk',get name(){calls++;return 'Image';}}),/SDK signature/);assert.equal(calls,0);
    assert.deepEqual(f.types.validate({kind:'named',name:'Image'}),{kind:'named',name:'Image'});
    assert.throws(()=>f.types.instantiate(signature({kind:'named',name:'Image'}),[],[f.ref]),/structure/);
});
test('SDK invocation arguments and results require the actual live Image owner',()=>{
    const f=fixture(),sig=signature(imageType());
    assert.deepEqual(f.types.actual(f.ref),imageType());assert.deepEqual(f.types.instantiate(sig,[],[f.ref]),sig);assert.equal(f.types.result(sig,f.ref),f.ref);
    for(const value of ['',undefined,20,{width:0,height:0,pixels:new Uint8Array()},BW.reference(f.runtime,'image','missing'),BW.reference(new EventEmitter(),'image','actual')])assert.throws(()=>f.types.instantiate(sig,[],[value]));
    let getters=0;assert.throws(()=>f.types.actual({get bwReference(){getters++;return f.ref.bwReference;}}),/malformed/);assert.equal(getters,0);
    assert.throws(()=>f.types.actual({bwReference:{...f.ref.bwReference,annotation:true}}),/owned Image/);
    assert.throws(()=>f.types.actual({bwReference:Object.assign(Object.create({kind:'image'}),{id:'actual',scope:f.ref.bwReference.scope})}),/malformed/);
    f.runtime.emit('PROJECT_STOP_ALL');assert.equal(f.types.result(sig,f.ref),f.ref);
    f.restart();assert.throws(()=>f.types.result(sig,f.ref),/epoch/);f.owner.start();assert.throws(()=>f.types.result(sig,f.ref),/body is missing/);
    f.owner.dispose();assert.throws(()=>f.types.actual(f.ref),/inactive/);
});
test('generic inference retains an owned SDK leaf without granting a named Image',()=>{
    const f=fixture(),generic={name:'T',constraint:'',defaultType:''};
    assert.deepEqual(f.types.instantiate(signature({kind:'named',name:'T'}),[generic],[f.ref]),signature(imageType()));
    assert.throws(()=>f.types.result(signature(imageType()),BW.reference(f.runtime,'object','pretend')),/structure/);
});
