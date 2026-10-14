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
            assert.equal(f.buffer(f.fonts.read(ref,'data')).isReadOnly(),true,'reported static flag preserves selected simulator metadata');
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
        // Internal service proof only: a static flag does not implement the
        // separate, required public read-slice mutation admission fence.
        const offset=(65-32)*8+2,original=view.getByte(offset);
        view.setNumber(buffers.NumberFormat.UInt8LE,offset,original^255);
        assert.equal(body[offset],original^255);
        assert.throws(()=>view.setByte(offset,original),/Writing to read only buffer/);
        view.setNumber(buffers.NumberFormat.UInt8LE,offset,original);
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
        f.runtime.emit('PROJECT_START');f.runtime.emit('PROJECT_LOADED');assert.throws(()=>f.fonts.constant('font8'),/disposed or stopped/,'disposed owner never revives');
    }finally{f.fonts.dispose();g.fonts.dispose();}
});

import {SDK_FONT_RECORD,SDK_FONT_FIELDS,sdkFontRecordType,sdkFontPublicType} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-font-value-descriptors.js';
test('Font interface descriptor matches native fields without inventing a constructor or inheritance',()=>{
    const {FIELD_SPECIFICATIONS,FONT_RECORD_NAME}=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-font-values.js');
    assert.deepEqual(FIELD_SPECIFICATIONS,SDK_FONT_FIELDS);assert.equal(FONT_RECORD_NAME,SDK_FONT_RECORD.name);
    assert.equal(SDK_FONT_RECORD.constructible,false);assert.equal(SDK_FONT_RECORD.inheritable,false);
    assert.equal(sdkFontRecordType('image.Font'),FONT_RECORD_NAME);assert.equal(sdkFontPublicType(FONT_RECORD_NAME),'image.Font');
    assert.equal(sdkFontRecordType('own.Font'),'own.Font');assert.equal(sdkFontRecordType('Font'),'Font');
});
test('actual managed heap field reads route to the current Font owner and refuse construction and mutation',()=>{
    const makeHeap=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/object-heap.js');
    const f=fixture(),heap=makeHeap(f.runtime,values,f.fonts.heapHooks);
    try{
        const font=f.fonts.constant('font8');
        assert.equal(heap.get(font,'charWidth'),6);
        assert.equal(values.compare(heap.get(font,'data'),'===',f.fonts.read(font,'data')),true);
        assert.throws(()=>heap.set(font,'charWidth',9),/mutation is not qualified/);
        assert.throws(()=>heap.allocate('__bwSDK_Font'),/cannot be constructed or inherited/);
    }finally{f.fonts.dispose();heap.dispose();}
});

import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
test('native Font attachment routes fields and fences every public glyph Buffer writer',()=>{
    const runtime=createArcadeRuntimeMock(),native=new(loadExtensionClass('arcade'))(runtime)._inst,errors=[];
    runtime.on('BLOCKS_ERROR',error=>errors.push(String(error?.message || error)));
    try{
        const font=native.fontValue({FONT:'font8'}),data=native.objectField({OBJECT:font,FIELD:'data'});
        assert.equal(native.objectField({OBJECT:font,FIELD:'charWidth'}),6);
        assert.equal(native.bufferLength({BUFFER:data}),5272);
        assert.equal(native.bufferIsReadOnly({BUFFER:data}),true);
        const body=native._buffer(data),before=body.toHex(),source=native.createBuffer({SIZE:2});
        const alias=native._bufferReference(new buffers.PxtBuffer(body.buffer,body.byteOffset+1,2));
        const array=require(VM_SRC+'/util/bw-values.js').arrayReference(runtime,[1,2]);
        const operations=[
            ['bufferSetByte',{OFFSET:0,VALUE:99}],['bufferSetNumber',{FORMAT:'UInt8LE',OFFSET:0,VALUE:99}],
            ['bufferWrite',{OFFSET:0,SOURCE:source}],['bufferFill',{VALUE:99,OFFSET:0,LENGTH:2}],
            ['bufferShift',{AMOUNT:1,OFFSET:0,LENGTH:2}],['bufferRotate',{AMOUNT:1,OFFSET:0,LENGTH:2}],
            ['bufferPackAt',{OFFSET:0,FORMAT:'BB',ARRAY:array}]
        ];
        for(const ref of [data,alias])for(const [method,args]of operations){
            const count=errors.length;native[method]({...args,BUFFER:ref});
            assert.equal(errors.length,count+1,method);assert.match(errors.at(-1),/glyph Buffer mutation is not qualified/);
            assert.equal(body.toHex(),before,method);
        }
        const ordinary=native.createBuffer({SIZE:8}),count=errors.length;
        for(const [method,args]of operations)native[method]({...args,BUFFER:ordinary});
        assert.deepEqual(errors.slice(count),[],'ordinary allocated Buffer writers remain available');
        native.setObjectField({OBJECT:font,FIELD:'charWidth',VALUE:9});
        assert.match(errors.at(-1),/field mutation is not qualified/);
        assert.equal(native.objectField({OBJECT:font,FIELD:'charWidth'}),6);
        const otherRuntime=createArcadeRuntimeMock(),other=new(loadExtensionClass('arcade'))(otherRuntime)._inst;
        try{assert.equal(values.decode(other.objectField({OBJECT:font,FIELD:'charWidth'})),undefined);}finally{otherRuntime.emit('RUNTIME_DISPOSED');}
        runtime.emit('PROJECT_STOP_ALL');
        assert.equal(values.decode(native.objectField({OBJECT:font,FIELD:'charWidth'})),undefined);
        runtime.emit('PROJECT_START');
        assert.equal(values.decode(native.objectField({OBJECT:font,FIELD:'charWidth'})),undefined);
        const current=native.fontValue({FONT:'font8'});
        assert.equal(native.objectField({OBJECT:current,FIELD:'charWidth'}),6);
        runtime.emit('PROJECT_LOADED');
        assert.equal(values.decode(native.objectField({OBJECT:current,FIELD:'charWidth'})),undefined);
    }finally{runtime.emit('RUNTIME_DISPOSED');}
});

import {sdkFontExportRecords,SDK_FONT_VALUE_OPCODES,hasSdkFontValues,seedSdkFontValueType} from '../overlay/scratch-gui/src/lib/bw-makecode/sdk-font-export-types.js';
test('Font export interface activity comes only from actual Font factory reporters',()=>{
    const [record]=sdkFontExportRecords();
    assert.equal(record.intrinsic,true);assert.equal(record.record,true);
    assert.equal(record.constructor,'');assert.deepEqual(record.parameters,[]);assert.deepEqual(record.methods,[]);
    for(const opcode of SDK_FONT_VALUE_OPCODES){
        assert.equal(hasSdkFontValues({targets:[{blocks:{value:{opcode}}}]}),true);
        const calls=[];seedSdkFontValueType({opcode},'actual-cell',(cell,type)=>calls.push([cell,type]));
        assert.deepEqual(calls,[['actual-cell','__bwSDK_Font']]);
    }
    const calls=[];seedSdkFontValueType({opcode:'data_variable'},'font5',(cell,type)=>calls.push([cell,type]));
    assert.deepEqual(calls,[]);assert.equal(hasSdkFontValues({targets:[{blocks:{font5:{opcode:'text',fields:{TEXT:['font8']}}}}]}),false);
});

import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('Font creation and lifecycle revocation do not initialize glyph resources',()=>{
    const file=new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/sdk-font-values.js',import.meta.url);
    const actualText=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/text-pxt.js');
    let initialized=0;const module={exports:{}};
    // Observe the original initializer boundary without replacing its result.
    vm.runInNewContext(readFileSync(file,'utf8'),{module,exports:module.exports,require:name=>name==='./text-pxt'?(...args)=>{initialized++;return actualText(...args);}:name==='./buffer'?buffers:require(name)});
    const f=fixture();let ordinary=f.bufferReference(new buffers.PxtBuffer(2));
    const fonts=module.exports.create(f.runtime,values,f.bufferOwner);
    try{
        assert.equal(initialized,0);
        const foreign=f.fonts.constant('font8');
        for(const action of [()=>fonts.scale(foreign,2),()=>fonts.print(null,'A',0,0,1,foreign),()=>fonts.printCenter(null,'A',0,1,foreign)]){
            assert.throws(action,/foreign, stale/);assert.equal(initialized,0,'invalid first Font must not materialize resources');
        }
        fonts.guardBufferMutation(ordinary);assert.equal(initialized,0);
        f.runtime.emit('PROJECT_START');f.runtime.emit('PROJECT_LOADED');assert.equal(initialized,0);
        ordinary=f.bufferReference(new buffers.PxtBuffer(2));
        fonts.constant('font8');assert.equal(initialized,1);
        fonts.constant('font5');assert.equal(initialized,1);
        f.runtime.emit('PROJECT_STOP_ALL');fonts.guardBufferMutation(ordinary);assert.equal(initialized,1);
        f.runtime.emit('PROJECT_START');assert.equal(initialized,1);
        fonts.constant('font8');assert.equal(initialized,2);
    }finally{fonts.dispose();f.fonts.dispose();}
});
test('native glyph backing aliases are fenced before data getter and across Stop',()=>{
    const runtime=createArcadeRuntimeMock(),native=new(loadExtensionClass('arcade'))(runtime)._inst,errors=[];
    runtime.on('BLOCKS_ERROR',error=>errors.push(String(error?.message || error)));
    try{
        const font=native.fontValue({FONT:'font8'}),body=native._sdkFontValues.resolve(font).data;
        const alias=native._bufferReference(new buffers.PxtBuffer(body.buffer,body.byteOffset+2,1));
        const before=body[2],ordinary=native.createBuffer({SIZE:1});
        native.bufferSetNumber({BUFFER:alias,FORMAT:'UInt8LE',OFFSET:0,VALUE:99});
        assert.match(errors.at(-1),/glyph Buffer mutation is not qualified/);assert.equal(body[2],before);
        runtime.emit('PROJECT_STOP_ALL');const count=errors.length;
        native.bufferSetNumber({BUFFER:ordinary,FORMAT:'UInt8LE',OFFSET:0,VALUE:77});
        assert.equal(errors.length,count);assert.equal(native.bufferGetByte({BUFFER:ordinary,OFFSET:0}),77);
        native.bufferSetNumber({BUFFER:alias,FORMAT:'UInt8LE',OFFSET:0,VALUE:99});
        assert.equal(errors.length,count+1);assert.match(errors.at(-1),/glyph Buffer mutation is not qualified/);assert.equal(body[2],before);
    }finally{runtime.emit('RUNTIME_DISPOSED');}
});
