// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createHash,createHmac,randomBytes,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
import {ApiError,LIMITS} from './protocol.mjs';
export const sha256=v=>createHash('sha256').update(v).digest('hex');
const key=(master,purpose)=>createHmac('sha256',master).update('brickwright-model-api-v1:'+purpose).digest();
export function authenticate(header,tokens){
 if(typeof header!=='string'||!/^Bearer [A-Za-z0-9_-]{32,128}$/.test(header))throw new ApiError(401,'unauthorized','A valid bearer token is required');
 const given=Buffer.from(sha256(header.slice(7)),'hex');let owner=null;
 for(const t of tokens){if(!t||typeof t.id!=='string'||!t.id||!/^[a-f0-9]{64}$/.test(t.sha256))throw new ApiError(503,'configuration','Invalid token configuration');if(timingSafeEqual(given,Buffer.from(t.sha256,'hex')))owner=t.id;}
 if(!owner)throw new ApiError(401,'unauthorized','A valid bearer token is required');return owner;
}
export const ownerTag=(master,id)=>createHmac('sha256',key(master,'owner')).update(id).digest('hex').slice(0,32);
export function seal(master,purpose,value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(master,purpose),iv);c.setAAD(Buffer.from(purpose));const bytes=Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(value)))),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]).toString('base64url');}
export function open(master,purpose,value,maxBytes=LIMITS.bodyBytes){try{const b=Buffer.from(value,'base64url');if(b.length<29)throw Error();const c=createDecipheriv('aes-256-gcm',key(master,purpose),b.subarray(0,12));c.setAAD(Buffer.from(purpose));c.setAuthTag(b.subarray(12,28));const plain=Buffer.concat([c.update(b.subarray(28)),c.final()]);return JSON.parse(gunzipSync(plain,{maxOutputLength:maxBytes}));}catch{throw new ApiError(422,'invalid-envelope','Invalid encrypted data');}}
export function signJob(master,value){const data=Buffer.from(JSON.stringify(value)).toString('base64url');return data+'.'+createHmac('sha256',key(master,'job')).update(data).digest('base64url');}
export function readJob(master,text,tag,now=Date.now()){
 try{const[data,mac,...rest]=text.split('.');if(rest.length)throw Error();const expected=createHmac('sha256',key(master,'job')).update(data).digest(),actual=Buffer.from(mac,'base64url');if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw Error();const job=JSON.parse(Buffer.from(data,'base64url'));if(job.owner!==tag||!/^[-a-f0-9]{36}$/.test(job.id)||!Number.isSafeInteger(job.createdAt)||now-job.createdAt>86400000||now<job.createdAt-60000||(job.runId!==null&&!Number.isSafeInteger(job.runId)))throw Error();return job;}catch{throw new ApiError(404,'not-found','Job not found or expired');}
}
