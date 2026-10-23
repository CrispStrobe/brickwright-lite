#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {basename} from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const at=a.indexOf('=');if(!a.startsWith('--')||at<3)throw Error('Use --model=file.ldr --program=file.bw --out=report.json');return[a.slice(2,at),a.slice(at+1)];}));
const base=process.env.MODEL_API_URL,token=process.env.MODEL_API_TOKEN;if(!base||!token||!args.model||!args.out)throw Error('Set MODEL_API_URL and MODEL_API_TOKEN, and provide --model and a fresh --out path');if(existsSync(args.out))throw Error('Preserve existing reports; choose a new output path');
const body={model:{name:basename(args.model),text:readFileSync(args.model,'utf8')},...(args.program?{program:{name:basename(args.program),text:readFileSync(args.program,'utf8')}}:{}),...(args.measurements?{measurements:JSON.parse(readFileSync(args.measurements,'utf8'))}:{})};
const call=async(path,method='GET',data)=>{const r=await fetch(base.replace(/\/$/,'')+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(60000)}),value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value;};
const job=await call('/runs','POST',body);console.log(JSON.stringify({id:job.id,status:job.status}));const deadline=Date.now()+30*60*1000;
while(Date.now()<deadline){const s=await call('/runs/'+job.id);if(['completed','failed'].includes(s.status)){const result=await call('/runs/'+job.id+'/result');writeFileSync(args.out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,report:args.out}));if(result.status!=='completed')process.exitCode=1;break;}await new Promise(resolve=>setTimeout(resolve,5000));}
if(!existsSync(args.out))throw Error('Job remains pending; poll its saved id later');
