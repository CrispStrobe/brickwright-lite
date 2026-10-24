// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Readable} from 'node:stream';
import {admitResultLayout,boundedResultArchive,crc32} from '../tools/model-api/lib/bounded-result.mjs';
import {boundedResponseBytes,ARTIFACT_BYTES} from '../tools/model-api/lib/bounded-http.mjs';
import {readBody} from '../tools/model-api/lib/http.mjs';
import {seal,open} from '../tools/model-api/lib/crypto.mjs';
const requireApi=createRequire(new URL('../tools/model-api/package.json',import.meta.url)),JSZip=requireApi('jszip');
assert.equal(JSZip.version,'3.10.1');
const make=async(text,{compression='DEFLATE',streamFiles=false}={})=>{const z=new JSZip();z.file('result.enc',text);return z.generateAsync({type:'nodebuffer',compression,streamFiles});};
const reject=code=>error=>error.code===code;
const central=bytes=>bytes.readUInt32LE(bytes.length-6);

test('HTTP declared overflow refuses before a body reader or arrayBuffer, and streamed overflow cancels',async()=>{
 let opened=0,cancelled=0,arrayBuffers=0;
 const response={headers:new Headers({'content-length':String(ARTIFACT_BYTES+1)}),body:{getReader(){opened++;throw Error('must not open');},cancel(){cancelled++;return Promise.resolve();}},arrayBuffer(){arrayBuffers++;throw Error('must not allocate');}};
 await assert.rejects(boundedResponseBytes(response),reject('result-too-large'));assert.equal(opened,0);assert.equal(arrayBuffers,0);assert.equal(cancelled,1);
 let cancel=0;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(400));c.enqueue(new Uint8Array(200));},cancel(){cancel++;}});
 await assert.rejects(boundedResponseBytes(new Response(body),{limit:512}),reject('result-too-large'));assert.equal(cancel,1);
});
test('missing and false Content-Length never bypass actual bounds; short mismatches and malformed lengths refuse',async()=>{
 assert.equal((await boundedResponseBytes(new Response('abc'),{limit:512})).toString(),'abc');
 await assert.rejects(boundedResponseBytes(new Response('x'.repeat(600),{headers:{'content-length':'3'}}),{limit:512}),reject('result-too-large'));
 await assert.rejects(boundedResponseBytes(new Response('abc',{headers:{'content-length':'9'}}),{limit:512}),reject('invalid-response'));
 for(const value of ['NaN','-1','9007199254740992','99999999999999999'])await assert.rejects(boundedResponseBytes(new Response('abc',{headers:{'content-length':value}}),{limit:512}),reject('result-too-large'));
});
test('body stalls have their own finite deadline and read errors retain original identity',async()=>{
 let cancelled=0;const response=new Response(new ReadableStream({cancel(){cancelled++;}}));
 await assert.rejects(boundedResponseBytes(response,{limit:512,context:{deadline:Date.now()+20}}),reject('deadline-exceeded'));assert.equal(cancelled,1);
 const original=new Error('original stream failure');const failed=new Response(new ReadableStream({start(c){c.error(original);}}));
 await assert.rejects(boundedResponseBytes(failed),error=>error===original);
});
test('actual encrypted worker payload and LF survive STORE, DEFLATE and genuine data descriptors with CRC',async()=>{
 const master=Buffer.alloc(32,7),id='11111111-1111-4111-8111-111111111111';
 const text=seal(master,'result:'+id,{requestId:id,owner:'f'.repeat(32),report:{status:'fixture-only'}})+'\n';
 for(const options of [{compression:'STORE'},{compression:'DEFLATE'},{compression:'DEFLATE',streamFiles:true}]){
  const bytes=await make(text,options),actual=await boundedResultArchive(bytes);assert.equal(actual,text);assert.equal(open(master,'result:'+id,actual).report.status,'fixture-only');
 }
 assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
});
test('entry-count and malformed central/local layout refuse BEFORE JSZip metadata allocation',async()=>{
 const good=await make('hello');let loads=0;
 const cases=[];for(const change of [b=>b.writeUInt16LE(100,b.length-12),b=>b.writeUInt16LE(1,b.length-18),b=>b.writeUInt32LE(0xffffffff,b.length-6),b=>b.writeUInt16LE(4096,central(b)+30),b=>b.writeUInt16LE(1,central(b)+32),b=>b.writeUInt32LE(1,central(b)+42),b=>b.writeUInt16LE(1,6),b=>b.writeUInt16LE(12,8),b=>b.writeUInt16LE(45,central(b)+6),b=>{b[30]=47;},b=>b.writeUInt32LE(0xa1ff0000,central(b)+38)]){const b=Buffer.from(good);change(b);cases.push(b);}
 for(const bytes of cases)await assert.rejects(boundedResultArchive(bytes,{loadZip:async()=>{loads++;throw Error('decoder must not run');}}),reject('invalid-result'));
 assert.equal(loads,0);
 const many=new JSZip();for(let i=0;i<100;i++)many.file('file-'+i,'');const bytes=await many.generateAsync({type:'nodebuffer'});
 await assert.rejects(boundedResultArchive(bytes,{loadZip:async()=>{loads++;throw Error('decoder must not run');}}),reject('invalid-result'));assert.equal(loads,0);
});
test('declared expansion is admitted before decoder, including ZIP64/multidisk and unknown extra fields',async()=>{
 const good=await make('hello');let loads=0;
 const tooBig=Buffer.from(good);tooBig.writeUInt32LE(ARTIFACT_BYTES+1,central(tooBig)+24);
 await assert.rejects(boundedResultArchive(tooBig,{loadZip:async()=>{loads++;}}),reject('result-too-large'));assert.equal(loads,0);
 const zip64=Buffer.from(good);zip64.writeUInt16LE(65535,zip64.length-12);assert.throws(()=>admitResultLayout(zip64),reject('invalid-result'));
});
test('actual 8MiB native decode succeeds; underreported 8MiB+1 expansion hits native maxOutputLength',async()=>{
 const exact=await make('x'.repeat(ARTIFACT_BYTES));assert.equal((await boundedResultArchive(exact)).length,ARTIFACT_BYTES);
 const bomb=await make('x'.repeat(ARTIFACT_BYTES+1));bomb.writeUInt32LE(ARTIFACT_BYTES,22);bomb.writeUInt32LE(ARTIFACT_BYTES,central(bomb)+24);
 await assert.rejects(boundedResultArchive(bomb),reject('result-too-large'));
});
test('CRC corruption and trailing compressed bytes cannot pass through the admitted encrypted entry',async()=>{
 const good=await make('hello');const corrupt=Buffer.from(good);corrupt.writeUInt32LE(0,14);corrupt.writeUInt32LE(0,central(corrupt)+16);
 await assert.rejects(boundedResultArchive(corrupt),reject('invalid-result'));
 const at=central(good),hidden=Buffer.concat([good.subarray(0,at),Buffer.from('JUNK'),good.subarray(at)]),next=at+4;
 hidden.writeUInt32LE(good.readUInt32LE(18)+4,18);hidden.writeUInt32LE(good.readUInt32LE(at+20)+4,next+20);hidden.writeUInt32LE(next,hidden.length-6);
 await assert.rejects(boundedResultArchive(hidden),reject('invalid-result'));
});
test('descriptor extents/CRC and raw UTF8 are validated without trimming the real worker LF',async()=>{
 const d=await make('payload\n',{streamFiles:true}),a=central(d)-16;const corrupt=Buffer.from(d);corrupt.writeUInt32LE(0,a+4);
 await assert.rejects(boundedResultArchive(corrupt),reject('invalid-result'));
 const noSig=Buffer.concat([d.subarray(0,a),d.subarray(a+4)]);noSig.writeUInt32LE(central(d)-4,noSig.length-6);assert.equal(await boundedResultArchive(noSig),'payload\n');
 const invalidUtf=await make(Buffer.from([255,254]));await assert.rejects(boundedResultArchive(invalidUtf),reject('invalid-result'));
});
test('incoming request bytes, declarations and stalled body remain bounded',async()=>{
 const req=Readable.from([Buffer.from('abc')]);req.headers={'content-length':'3'};assert.equal((await readBody(req)).toString(),'abc');
 const declared={headers:{'content-length':'1048577'},get body(){throw Error('must not consume');}};await assert.rejects(readBody(declared),e=>e.status===413);
 const mismatch=Readable.from(['abc']);mismatch.headers={'content-length':'5'};await assert.rejects(readBody(mismatch),e=>e.status===400);
 let destroyed=0;const stalled={headers:{},[Symbol.asyncIterator](){return{next:()=>new Promise(()=>{}),return:async()=>({done:true})};},destroy(){destroyed++;}};
 await assert.rejects(readBody(stalled,{timeoutMs:20}),e=>e.status===408);assert.equal(destroyed,1);
});
