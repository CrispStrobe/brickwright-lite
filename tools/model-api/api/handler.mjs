// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createGateway} from '../lib/gateway.mjs';import {githubBackend} from '../lib/github.mjs';import {readBody,reply,applyCors} from '../lib/http.mjs';import {ApiError} from '../lib/protocol.mjs';
export default async function handler(req,res){try{
 if(applyCors(req,res,(process.env.MODEL_API_ALLOWED_ORIGINS||'https://crispstrobe.github.io').split(',').map(s=>s.trim()).filter(Boolean)))return;
 const master=Buffer.from(process.env.MODEL_API_MASTER_KEY||'','hex'),tokens=JSON.parse(process.env.MODEL_API_AGENT_TOKENS||'[]');
 const backend=githubBackend({repository:process.env.MODEL_API_REPOSITORY||'CrispStrobe/brickwright-lite',workflow:'model-measurements.yml',ref:process.env.MODEL_API_REF||'main',token:process.env.MODEL_API_GITHUB_TOKEN,master});
 const gateway=createGateway({tokens,master,backend}),url=new URL(req.url,'https://model-api.invalid'),route=url.searchParams.get('route');
 const path=route!==null?'/v1/'+route:url.pathname.replace(/^\/api/,'');
 const result=await gateway({method:req.method,path,authorization:req.headers.authorization,body:req.method==='POST'?await readBody(req):undefined});reply(res,result.status,result.body);
 }catch(e){reply(res,e instanceof ApiError?e.status:503,{error:{code:e instanceof ApiError?e.code:'configuration',message:e instanceof ApiError?e.message:'Measurement service is not configured'}});}}
