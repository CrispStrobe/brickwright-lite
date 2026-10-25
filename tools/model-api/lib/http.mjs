// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {ApiError,LIMITS} from './protocol.mjs';
// Reads at most LIMITS.bodyBytes within the body deadline. A refused stream is paused, never destroyed
// before its JSON error is written: destroying the request first resets the connection (a hosted function
// then reports an invocation failure instead of the 413/408). With `res`, the request is ended once that
// response finishes or closes, and `Connection: close` asks the host not to reuse the half-read socket.
export async function readBody(req,{timeoutMs=10000,res}={}) {
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new TypeError('Invalid body deadline');
 const declared=req.headers?.['content-length'];
 if(declared!==undefined&&(typeof declared!=='string'||!/^\d{1,16}$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>LIMITS.bodyBytes))throw new ApiError(413,'too-large','Submission exceeds body limit');
 if(req.body!==undefined){const size=typeof req.body==='string'||Buffer.isBuffer(req.body)?Buffer.byteLength(req.body):Buffer.byteLength(JSON.stringify(req.body));if(size>LIMITS.bodyBytes)throw new ApiError(413,'too-large','Submission exceeds body limit');return req.body;}
 return new Promise((resolve,reject)=>{
  const chunks=[];let total=0,settled=false;
  const detach=()=>{clearTimeout(timer);req.off('data',onData);req.off('end',onEnd);req.off('error',onError);req.off('close',onClose);};
  const refuse=error=>{if(settled)return;settled=true;detach();try{req.pause?.();}catch{}endAfterResponse(req,res);reject(error);};
  const onData=chunk=>{
   if(typeof chunk!=='string'&&!(chunk instanceof Uint8Array))return refuse(new ApiError(400,'invalid-body','Invalid request body'));
   const length=Buffer.byteLength(chunk);if(length>LIMITS.bodyBytes-total)return refuse(new ApiError(413,'too-large','Submission exceeds body limit'));
   total+=length;chunks.push(Buffer.from(chunk));
  };
  const onEnd=()=>{if(settled)return;settled=true;detach();
   if(declared!==undefined&&total!==Number(declared))return reject(new ApiError(400,'invalid-body','Submission body length mismatch'));resolve(Buffer.concat(chunks,total));};
  const onError=error=>refuse(error);
  const onClose=()=>refuse(new Error('Request body closed before completion'));
  const timer=setTimeout(()=>refuse(new ApiError(408,'body-timeout','Submission body deadline exceeded')),timeoutMs);
  req.on('data',onData);req.on('end',onEnd);req.on('error',onError);req.on('close',onClose);
 });
}
function endAfterResponse(req,res){
 const end=()=>{try{req.destroy?.();}catch{}};
 if(!res||typeof res.once!=='function'||res.writableFinished||res.destroyed){end();return;}
 try{if(!res.headersSent)res.setHeader('Connection','close');}catch{}
 let ended=false;const once=()=>{if(!ended){ended=true;end();}};res.once('finish',once);res.once('close',once);
}
export function reply(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));}

export function applyCors(req,res,allowed){
 const origin=req.headers.origin;if(!origin)return false;
 if(!allowed.includes(origin))throw new ApiError(403,'origin-refused','Origin is not allowed');
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return true;}return false;
}
