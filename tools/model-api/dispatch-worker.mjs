#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Trusted workflow controller; never execute uploaded commands or expose its key to the worker.
import {readFileSync,writeFileSync} from 'node:fs';import {open,seal} from './lib/crypto.mjs';import {validateSubmission} from './lib/protocol.mjs';
const[mode,...args]=process.argv.slice(2),master=Buffer.from(process.env.MODEL_API_MASTER_KEY||'','hex');if(master.length!==32)throw Error('Missing worker key');
if(mode==='prepare'){
 const[eventPath,inputPath,metaPath]=args,event=JSON.parse(readFileSync(eventPath)),id=event.inputs?.request_id;if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid request id');const payload=open(master,'request:'+id,event.inputs.envelope);if(!/^[a-f0-9]{32}$/.test(payload.owner))throw Error('Invalid owner');const submission=validateSubmission(payload.submission);writeFileSync(inputPath,JSON.stringify({model:submission.model,...(submission.program?{program:submission.program}:{}),settings:submission.settings,measurements:submission.measurements}));writeFileSync(metaPath,JSON.stringify({id,owner:payload.owner}));
}else if(mode==='seal'){
 const[metaPath,reportPath,outputPath]=args,meta=JSON.parse(readFileSync(metaPath));let report;try{report=JSON.parse(readFileSync(reportPath));}catch{report={status:'failed',error:{code:'worker-failed',message:'Bounded worker failed or exceeded its budget'},qualification:{status:'not-evaluated'}};}
 writeFileSync(outputPath,seal(master,'result:'+meta.id,{requestId:meta.id,owner:meta.owner,report})+'\n');
}else throw Error('Unknown trusted controller operation');
