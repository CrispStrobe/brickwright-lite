// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createServer,request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
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
 let destroyed=0;const stalled=Object.assign(new EventEmitter(),{headers:{},destroy(){destroyed++;}});
 await assert.rejects(readBody(stalled,{timeoutMs:20}),e=>e.status===408);assert.equal(destroyed,1);
});

const settleRequest=(port,{headers,chunks})=>new Promise(resolve=>{
 const out={status:null,body:'',requestError:null,responseComplete:false};
 const req=httpRequest({host:'127.0.0.1',port,method:'POST',path:'/api/v1/runs',headers},res=>{out.status=res.statusCode;out.headers=res.headers;res.setEncoding('utf8');res.on('data',d=>{out.body+=d;});res.on('end',()=>{out.responseComplete=true;resolve(out);});res.on('error',()=>resolve(out));});
 req.on('error',e=>{out.requestError=e.code??'error';if(out.status===null)resolve(out);});
 for(const chunk of chunks)req.write(chunk);req.end();
});
test('a chunked over-limit body receives the JSON 413 refusal before its request is ended',async()=>{
 const {default:handler}=await import('../tools/model-api/api/handler.mjs');
 const token='z'.repeat(43),names=['MODEL_API_AGENT_TOKENS','MODEL_API_MASTER_KEY','MODEL_API_REPOSITORY','MODEL_API_REF','MODEL_API_WORKER_REVISION','MODEL_API_GITHUB_TOKEN','MODEL_API_ADMISSION_REPOSITORY','MODEL_API_ADMISSION_BRANCH','MODEL_API_ADMISSION_TOKEN','MODEL_API_ADMISSION_EPOCH'];
 const saved=Object.fromEntries(names.map(n=>[n,process.env[n]])),fetchBefore=globalThis.fetch;let network=0;
 Object.assign(process.env,{MODEL_API_AGENT_TOKENS:JSON.stringify([{id:'probe',sha256:createHash('sha256').update(token).digest('hex')}]),MODEL_API_MASTER_KEY:'07'.repeat(32),MODEL_API_REPOSITORY:'owner/worker',MODEL_API_REF:'fixture-tag',
  MODEL_API_WORKER_REVISION:'a'.repeat(40),MODEL_API_GITHUB_TOKEN:'fixture',MODEL_API_ADMISSION_REPOSITORY:'owner/state',MODEL_API_ADMISSION_BRANCH:'main',MODEL_API_ADMISSION_TOKEN:'fixture',MODEL_API_ADMISSION_EPOCH:'fixture-epoch-0001'});
 globalThis.fetch=async()=>{network++;throw Error('must not call');};
 const server=createServer((req,res)=>{handler(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  // Same shape as the hosted probe: 16 x 64 KiB chunks plus one byte, no Content-Length.
  const chunks=[...Array.from({length:16},()=>Buffer.alloc(65536,120)),Buffer.from('x')];
  const r=await settleRequest(server.address().port,{headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Transfer-Encoding':'chunked'},chunks});
  assert.equal(r.status,413,'over-limit chunked body must be answered, not reset: '+JSON.stringify({requestError:r.requestError}));
  assert.equal(r.responseComplete,true);assert.equal(JSON.parse(r.body).error.code,'too-large');assert.match(r.headers['content-type'],/^application\/json/);
  assert.equal(network,0);
  const ok=await settleRequest(server.address().port,{headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Transfer-Encoding':'chunked'},chunks:[Buffer.from('{"')]});
  assert.equal(ok.status,400);assert.equal(JSON.parse(ok.body).error.code,'invalid-json');
 }finally{
  await new Promise(r=>{server.closeAllConnections?.();server.close(r);});globalThis.fetch=fetchBefore;
  for(const n of names){if(saved[n]===undefined)delete process.env[n];else process.env[n]=saved[n];}
 }
});
test('a refused streamed body is ended only after its response finishes',async()=>{
 const fakeRequest=()=>{const r=new EventEmitter();r.headers={};r.destroyed=0;r.paused=0;r.destroy=()=>{r.destroyed++;};r.pause=()=>{r.paused++;};return r;};
 const fakeResponse=()=>{const r=new EventEmitter();r.headers={};r.setHeader=(k,v)=>{r.headers[k.toLowerCase()]=v;};return r;};
 const big=fakeRequest(),bigRes=fakeResponse(),pending=readBody(big,{res:bigRes});big.emit('data',Buffer.alloc(1048576,120));big.emit('data',Buffer.from('x'));
 await assert.rejects(pending,e=>e.status===413&&e.code==='too-large');
 assert.equal(big.destroyed,0,'request must survive until the refusal is written');assert.equal(big.paused,1);assert.equal(bigRes.headers.connection,'close');
 bigRes.emit('finish');assert.equal(big.destroyed,1);bigRes.emit('close');assert.equal(big.destroyed,1);
 const stalled=fakeRequest(),stalledRes=fakeResponse();await assert.rejects(readBody(stalled,{timeoutMs:20,res:stalledRes}),e=>e.status===408&&e.code==='body-timeout');
 assert.equal(stalled.destroyed,0);stalledRes.emit('close');assert.equal(stalled.destroyed,1);
 stalled.emit('data',Buffer.from('late'));stalled.emit('end');
 const bare=fakeRequest();await assert.rejects(readBody(bare,{timeoutMs:20}),e=>e.status===408);assert.equal(bare.destroyed,1,'without a response the request is still ended');
});
