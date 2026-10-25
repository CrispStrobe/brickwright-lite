import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require=createRequire(import.meta.url);
const {PxtBuffer,fromHex,fromUTF8,literal,MAX_BUFFER_BYTES}=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');

test('facade adopts the original detached slice storage without copying it again',()=>{
    const original=Uint8Array.prototype.slice,source=literal('01020304');let detached;
    Uint8Array.prototype.slice=function(...args){const out=original.apply(this,args);detached=out;return out;};
    try {
        const copy=source.slice(1,2);
        assert.ok(copy instanceof PxtBuffer);assert.equal(copy.toHex(),'0203');
        assert.equal(copy.buffer,detached.buffer);assert.equal(copy.byteOffset,detached.byteOffset);
        assert.notEqual(copy.buffer,source.buffer);assert.equal(copy.isReadOnly(),false);
        copy.setByte(0,99);assert.equal(source.toHex(),'01020304');
    }finally{Uint8Array.prototype.slice=original;}
});

test('UTF8 encodes directly into the exact bounded destination and refuses before encoding',()=>{
    const encode=TextEncoder.prototype.encode,into=TextEncoder.prototype.encodeInto;let calls=0,destination;
    TextEncoder.prototype.encode=function(){throw new Error('temporary encoder storage allocated');};
    TextEncoder.prototype.encodeInto=function(text,out){calls++;destination=out;return into.call(this,text,out);};
    try {
        const text='A€🙂\ud800X\udc00\0',bytes=fromUTF8(text);
        assert.equal(bytes.toHex(),'41e282acf09f9982efbfbd58efbfbd00');assert.equal(bytes,destination);
        assert.equal(bytes.length,16);assert.equal(bytes.buffer.byteLength,16);assert.equal(bytes.isReadOnly(),false);
        assert.equal(calls,1);
        assert.throws(()=>fromUTF8('€'.repeat(Math.floor(MAX_BUFFER_BYTES/3)+1)),/allocation limit/);
        assert.equal(calls,1);
        assert.throws(()=>fromUTF8(123),/Expected UTF8/);assert.equal(calls,1);
    }finally{TextEncoder.prototype.encode=encode;TextEncoder.prototype.encodeInto=into;}
});

test('single-storage slices and UTF8 retain original Arcade values at coercion and surrogate boundaries',async()=>{
    const cases=[[0,-1],[1,2],[-1,-1],[-3,2],[1.5,1.5],[9,3],[0,0],[NaN,-1]],texts=['','ABC','€🙂','\ud800','\udc00','\ud800X\udc00','\ufeff\0'];
    const number=x=>Number.isNaN(x)?'NaN':String(x);
    const program='let bytes = hex`01020304`\nlet slices = ""\n'+cases.map(([offset,length])=>`slices += bytes.slice(${number(offset)}, ${number(length)}).toHex() + ":" + bytes.slice(${number(offset)}, ${number(length)}).isReadOnly() + "|"`).join('\n')+'\nlet texts = ""\n'+texts.map(text=>`texts += Buffer.fromUTF8(${JSON.stringify(text)}).toHex() + "|"`).join('\n');
    const pxt=await runPxtArcade(program),bytes=literal('01020304');
    assert.equal(cases.map(([offset,length])=>{const out=bytes.slice(offset,length);return out.toHex()+':'+out.isReadOnly()+'|';}).join(''),pxt.slices);
    assert.equal(texts.map(text=>fromUTF8(text).toHex()+'|').join(''),pxt.texts);
    // Public construction from a caller's byte array still copies its storage.
    const input=fromHex('0102'),copy=new PxtBuffer(input);copy[0]=9;
    assert.equal(input.toHex(),'0102');assert.notEqual(copy.buffer,input.buffer);
});
