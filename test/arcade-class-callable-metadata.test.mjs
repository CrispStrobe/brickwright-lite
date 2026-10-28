import test from 'node:test';
import assert from 'node:assert/strict';
import createMetadata from '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/class-callable-metadata.js';
const named=name=>({kind:'named',name});
const callback={kind:'callable',parameters:[{name:'s',optional:false,type:named('State')}],result:named('T')};
const method=()=>{const action=structuredClone(callback);return {name:'apply',procedure:'actualApply %s %s',returnType:'T',typeParameters:[{name:'T',constraint:'',defaultType:''}],
    parameters:[{name:'action',type:'callable',optional:false,callableSignature:action}],
    callableSignature:{kind:'callable',parameters:[{name:'action',optional:false,type:action}],result:named('T')}};};
test('inert class catalogue preserves generic callback templates without allocating or admitting a callable reference',()=>{
    const metadata=createMetadata(new Map([['State',{name:'State',parent:null}]]));
    const result=metadata.method(method());assert.equal(result.callableSignature.result.name,'T');assert.equal(Object.isFrozen(result.parameters[0].callableSignature),true);
    assert.equal(metadata.field({type:'callable',valueKind:'callable',callableSignature:{kind:'callable',parameters:[],result:named('number')}}).result.name,'number');
});
test('inert metadata refuses opaque, unknown, intrinsic and mismatched callback signatures',()=>{
    const metadata=createMetadata(new Map([['State',{name:'State',parent:null}],['Native',{name:'Native',intrinsic:true}]]));
    for(const name of ['any','Missing','Native']) {
        const value=method();value.callableSignature.parameters[0].type.parameters[0].type=named(name);
        assert.throws(()=>metadata.method(value),/opaque|no declared|ordinary managed/);
    }
    const value=method();value.parameters[0].type='number';assert.throws(()=>metadata.method(value),/callback signature differs/);
    assert.throws(()=>metadata.field({type:'callable',callableSignature:{kind:'callable',parameters:[],result:named('number')}}),/explicit callable field/);
});
