// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {ApiError,LIMITS} from './protocol.mjs';
export async function readBody(req){if(req.body!==undefined)return req.body;const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>LIMITS.bodyBytes)throw new ApiError(413,'too-large','Submission exceeds body limit');chunks.push(chunk);}return Buffer.concat(chunks);}
export function reply(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(body));}

export function applyCors(req,res,allowed){
 const origin=req.headers.origin;if(!origin)return false;
 if(!allowed.includes(origin))throw new ApiError(403,'origin-refused','Origin is not allowed');
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return true;}return false;
}
