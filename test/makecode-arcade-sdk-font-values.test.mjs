import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const values=require('../overlay/scratch-vm/src/util/bw-values.js');
const buffers=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const {create,RESOURCE_MANIFEST}=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-font-values.js');
const fixture=()=>{
    const runtime=new EventEmitter(),bytes=new Map(),ids=new WeakMap();let next=0;
    const bufferReference=body=>{let id=ids.get(body);if(!id){id='font-test-buffer:'+ ++next;ids.set(body,id);bytes.set(id,body);}return values.reference(runtime,'buffer',id);};
    const bufferOwner={reference:bufferReference,resolve:ref=>{const body=bytes.get(values.referenceId(runtime,ref,'buffer'));if(!body)throw new Error('Buffer owner rejected reference');return body;}};
    const fonts=create(runtime,values,bufferOwner);
    return {runtime,fonts,bytes,bufferReference,bufferOwner,buffer:ref=>bytes.get(values.referenceId(runtime,ref,'buffer'))};
};
test('actual SDK Font constants and UTF16 selection preserve record identity and current metrics',()=>{
    const f=fixture();try{
        const small=f.fonts.constant('font5'),normal=f.fonts.constant('font8'),large=f.fonts.constant('font12');
        assert.equal(values.compare(small,'===',f.fonts.constant('font5')),true);
        assert.equal(values.compare(normal,'===',f.fonts.forText('ascii\n')),true);
        assert.equal(values.compare(normal,'===',f.fonts.forText('\u2000')),true);
        assert.equal(values.compare(large,'===',f.fonts.forText('\u2001')),true);
        assert.equal(values.compare(large,'===',f.fonts.forText('😀')),true);
        for(const [ref,width,height,length]of [[small,6,5,904],[normal,6,8,5272],[large,12,12,202488]]){
            assert.equal(f.fonts.read(ref,'charWidth'),width);assert.equal(f.fonts.read(ref,'charHeight'),height);
            assert.equal(values.decode(f.fonts.read(ref,'multiplier')),undefined);
            assert.equal(f.buffer(f.fonts.read(ref,'data')).length,length);
        }
        assert.ok(Object.isFrozen(RESOURCE_MANIFEST));
        assert.equal(Object.isFrozen(f.fonts.resolve(normal)),false,'the SDK record itself is mutable');
    }finally{f.fonts.dispose();}
});
test('scaling preserves original identity below two and shares exact glyph storage above two',()=>{
    const f=fixture();try{
        const base=f.fonts.constant('font8'),data=f.fonts.read(base,'data');
        for(const size of [-1,0,1,1.9,NaN,Infinity])assert.equal(values.compare(base,'===',f.fonts.scale(base,size)),true);
        const double=f.fonts.scale(base,2.9),quad=f.fonts.scale(double,2);
        assert.equal(values.compare(base,'===',double),false);assert.equal(f.fonts.read(double,'charWidth'),12);
        assert.equal(f.fonts.read(double,'multiplier'),2);assert.equal(f.fonts.read(quad,'multiplier'),4);
        assert.equal(values.compare(data,'===',f.fonts.read(double,'data')),true);
        assert.equal(values.compare(data,'===',f.fonts.read(quad,'data')),true);
        const body=f.fonts.resolve(base).data,view=f.buffer(data);
        assert.equal(view.buffer,body.buffer);assert.equal(view.byteOffset,body.byteOffset);
        assert.equal(view.getNumber(buffers.NumberFormat.UInt16LE,0),32);
    }finally{f.fonts.dispose();}
});
test('read slice rejects field and shared glyph writes while keeping unrelated Buffer operations available',()=>{
    const f=fixture();try{
        const base=f.fonts.constant('font5'),scaled=f.fonts.scale(base,2),data=f.fonts.read(scaled,'data');
        assert.throws(()=>f.fonts.write(base,'charWidth',9),/field mutation is not qualified/);
        assert.throws(()=>f.fonts.guardBufferMutation(data),/glyph Buffer mutation is not qualified/);
        assert.throws(()=>f.fonts.guardBufferMutation(values.decode(JSON.parse(JSON.stringify(data)))),/glyph Buffer mutation is not qualified/);
        const storage=f.buffer(data);
        const view=f.bufferReference(new buffers.PxtBuffer(storage.buffer,storage.byteOffset+1,1));
        assert.throws(()=>f.fonts.guardBufferMutation(view),/glyph Buffer mutation is not qualified/);
        const copy=f.bufferReference(new buffers.PxtBuffer(storage));assert.doesNotThrow(()=>f.fonts.guardBufferMutation(copy));
        const ordinary=f.bufferReference(new buffers.PxtBuffer(1));assert.doesNotThrow(()=>f.fonts.guardBufferMutation(ordinary));
        assert.throws(()=>f.fonts.constant('font13'),/Unknown/);assert.throws(()=>f.fonts.read(base,'unknown'),/Unknown/);
        assert.throws(()=>f.fonts.forText(1),/actual String/);assert.throws(()=>f.fonts.scale(base,'2'),/actual Number/);
    }finally{f.fonts.dispose();}
});
test('actual owner rejects foreign, stopped, restarted, loaded and disposed references',()=>{
    const f=fixture(),g=fixture();try{
        const ref=f.fonts.constant('font8');assert.throws(()=>g.fonts.read(ref,'charWidth'),/foreign, stale/);
        const clone=values.decode(JSON.parse(JSON.stringify(ref)));assert.equal(f.fonts.read(clone,'charHeight'),8);
        f.runtime.emit('PROJECT_STOP_ALL');assert.throws(()=>f.fonts.read(ref,'charWidth'),/disposed or stopped/);
        f.runtime.emit('PROJECT_START');assert.throws(()=>f.fonts.read(ref,'charWidth'),/foreign, stale/);
        const next=f.fonts.constant('font8');assert.equal(f.fonts.read(next,'charWidth'),6);
        f.runtime.emit('PROJECT_LOADED');assert.throws(()=>f.fonts.read(next,'charWidth'),/foreign, stale/);
        f.runtime.emit('RUNTIME_DISPOSED');assert.throws(()=>f.fonts.constant('font8'),/disposed or stopped/);
    }finally{f.fonts.dispose();g.fonts.dispose();}
});
