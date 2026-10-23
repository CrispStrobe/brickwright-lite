// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {ApiError,LIMITS} from './protocol.mjs';
export async function readBody(req,{timeoutMs=10000}={}) {
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new TypeError('Invalid body deadline');
 const declared=req.headers?.['content-length'];
 if(declared!==undefined&&(typeof declared!=='string'||!/^\d{1,16}$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>LIMITS.bodyBytes))throw new ApiError(413,'too-large','Submission exceeds body limit');
 if(req.body!==undefined){const size=typeof req.body==='string'||Buffer.isBuffer(req.body)?Buffer.byteLength(req.body):Buffer.byteLength(JSON.stringify(req.body));if(size>LIMITS.bodyBytes)throw new ApiError(413,'too-large','Submission exceeds body limit');return req.body;}
 const iterator=req[Symbol.asyncIterator](),chunks=[];let total=0,done=false,timer;
 const expired=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new ApiError(408,'body-timeout','Submission body deadline exceeded')),timeoutMs);});
 try{for(;;){const item=await Promise.race([iterator.next(),expired]);if(item.done){done=true;break;}const chunk=item.value;if(typeof chunk!=='string'&&!(chunk instanceof Uint8Array))throw new ApiError(400,'invalid-body','Invalid request body');const length=Buffer.byteLength(chunk);if(length>LIMITS.bodyBytes-total)throw new ApiError(413,'too-large','Submission exceeds body limit');total+=length;chunks.push(Buffer.from(chunk));}
 if(declared!==undefined&&total!==Number(declared))throw new ApiError(400,'invalid-body','Submission body length mismatch');return Buffer.concat(chunks,total);
 }finally{clearTimeout(timer);if(!done){try{req.destroy?.();}catch{}try{const closed=iterator.return?.();closed?.catch(()=>{});}catch{}}}
}
export function reply(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));}

export function applyCors(req,res,allowed){
 const origin=req.headers.origin;if(!origin)return false;
 if(!allowed.includes(origin))throw new ApiError(403,'origin-refused','Origin is not allowed');
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return true;}return false;
}
