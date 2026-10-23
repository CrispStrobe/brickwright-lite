#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import http from 'node:http';import {createGateway} from './lib/gateway.mjs';import {localBackend} from './lib/local-backend.mjs';import {readBody,reply} from './lib/http.mjs';
const master=Buffer.from(process.env.MODEL_API_MASTER_KEY||'','hex'),gateway=createGateway({tokens:JSON.parse(process.env.MODEL_API_AGENT_TOKENS||'[]'),master,backend:localBackend(master)});
const server=http.createServer(async(req,res)=>{try{const result=await gateway({method:req.method,path:new URL(req.url,'http://localhost').pathname.replace(/^\/api/,''),authorization:req.headers.authorization,body:req.method==='POST'?await readBody(req):undefined});reply(res,result.status,result.body);}catch(e){reply(res,e.status||500,{error:{code:e.code||'request-failed',message:e.status?e.message:'Request failed'}});}});server.listen(Number(process.env.MODEL_API_PORT||8767),'127.0.0.1',()=>console.log(JSON.stringify({listening:server.address().port,mode:'local-development'})));
