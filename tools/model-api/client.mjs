#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {basename} from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const at=a.indexOf('=');if(!a.startsWith('--')||at<3)throw Error('Use --model=file.ldr --program=file.bw --out=report.json');return[a.slice(2,at),a.slice(at+1)];}));
if(Object.keys(args).some(k=>!['model','program','measurements','settings','out'].includes(k)))throw Error('Unknown client option');
const base=process.env.MODEL_API_URL,token=process.env.MODEL_API_TOKEN;if(!base||!token||!args.model||!args.out)throw Error('Set MODEL_API_URL and MODEL_API_TOKEN, and provide --model and a fresh --out path');if(existsSync(args.out))throw Error('Preserve existing reports; choose a new output path');
const body={model:{name:basename(args.model),text:readFileSync(args.model,'utf8')},...(args.program?{program:{name:basename(args.program),text:readFileSync(args.program,'utf8')}}:{}),...(args.measurements?{measurements:JSON.parse(readFileSync(args.measurements,'utf8'))}:{}),...(args.settings?{settings:JSON.parse(readFileSync(args.settings,'utf8'))}:{})};
const call=async(path,method='GET',data,attempt=0)=>{
 let r;try{r=await fetch(base.replace(/\/$/,'')+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(60000)});}catch(e){if(method==='GET'&&attempt<5){await new Promise(resolve=>setTimeout(resolve,Math.min(5000,1000*2**attempt)));return call(path,method,data,attempt+1);}throw e;}
 const value=await r.json();if(!r.ok){if(method==='GET'&&attempt<5&&[404,409,410,429,503].includes(r.status)){await new Promise(resolve=>setTimeout(resolve,Math.min(5000,1000*2**attempt)));return call(path,method,data,attempt+1);}throw Error(JSON.stringify(value));}return value;
};
if(existsSync(args.out+'.job.json'))throw Error('Preserve the previous job; choose a fresh output path');
const job=await call('/runs','POST',body);writeFileSync(args.out+'.job.json',JSON.stringify(job,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({id:job.id,status:job.status}));const deadline=Date.now()+30*60*1000;
while(Date.now()<deadline){const s=await call('/runs/'+job.id);if(['completed','failed'].includes(s.status)){const result=await call('/runs/'+job.id+'/result');writeFileSync(args.out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,report:args.out}));if(result.status!=='completed')process.exitCode=1;break;}await new Promise(resolve=>setTimeout(resolve,5000));}
if(!existsSync(args.out))throw Error('Job remains pending; poll its saved id later');
