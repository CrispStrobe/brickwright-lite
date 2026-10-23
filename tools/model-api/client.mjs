#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {readFileSync,writeFileSync,existsSync} from 'node:fs';import {basename} from 'node:path';
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const at=a.indexOf('=');if(!a.startsWith('--')||at<3)throw Error('Use --model=file.ldr --program=file.bw --out=report.json');return[a.slice(2,at),a.slice(at+1)];}));
if(Object.keys(args).some(k=>!['model','program','measurements','settings','out','resume'].includes(k)))throw Error('Unknown client option');
const base=process.env.MODEL_API_URL,token=process.env.MODEL_API_TOKEN;if(!base||!token||(!args.model&&!args.resume)||!args.out)throw Error('Set MODEL_API_URL and MODEL_API_TOKEN, and provide --model or --resume plus a fresh --out path');if(existsSync(args.out))throw Error('Preserve existing reports; choose a new output path');
if(args.resume&&['model','program','measurements','settings'].some(k=>args[k]))throw Error('Resume the existing job without submitting model inputs');
const body=args.resume?null:{model:{name:basename(args.model),text:readFileSync(args.model,'utf8')},...(args.program?{program:{name:basename(args.program),text:readFileSync(args.program,'utf8')}}:{}),...(args.measurements?{measurements:JSON.parse(readFileSync(args.measurements,'utf8'))}:{}),...(args.settings?{settings:JSON.parse(readFileSync(args.settings,'utf8'))}:{})};
const call=async(path,method='GET',data,attempt=0)=>{
 let r;try{r=await fetch(base.replace(/\/$/,'')+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(60000)});}catch(e){if(method==='GET'&&attempt<5){await new Promise(resolve=>setTimeout(resolve,Math.min(5000,1000*2**attempt)));return call(path,method,data,attempt+1);}throw e;}
 const value=await r.json();if(!r.ok){if(method==='GET'&&attempt<5&&[404,409,410,429,503].includes(r.status)){await new Promise(resolve=>setTimeout(resolve,Math.min(5000,1000*2**attempt)));return call(path,method,data,attempt+1);}throw Error(JSON.stringify(value));}return value;
};
if(!args.resume&&existsSync(args.out+'.job.json'))throw Error('Preserve the previous job; choose a fresh output path');
if(!args.resume)writeFileSync(args.out+'.input.json',JSON.stringify(body,null,2)+'\n',{flag:'wx',mode:0o600});
const job=args.resume?JSON.parse(readFileSync(args.resume,'utf8')):{...await call('/runs','POST',body),clientInput:{file:basename(args.out+'.input.json'),modelSha256:hash(body.model.text),programSha256:body.program?hash(body.program.text):null,submissionSha256:hash(JSON.stringify(body))}};
if(typeof job.id!=='string'||!/^[-A-Za-z0-9_.]{1,4096}$/.test(job.id))throw Error('Invalid saved job identity');
if(args.resume&&existsSync(args.out+'.job.json')&&JSON.parse(readFileSync(args.out+'.job.json','utf8')).id!==job.id)throw Error('Output receipt belongs to another job; choose a fresh output path');
if(!existsSync(args.out+'.job.json'))writeFileSync(args.out+'.job.json',JSON.stringify(job,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({id:job.id,status:job.status,resumed:!!args.resume}));const deadline=Date.now()+30*60*1000;
while(Date.now()<deadline){const s=await call('/runs/'+job.id);if(['completed','failed'].includes(s.status)){const result=await call('/runs/'+job.id+'/result');writeFileSync(args.out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});if(result.status==='completed'&&job.clientInput&&(result.input?.modelSha256!==job.clientInput.modelSha256||result.input?.programSha256!==job.clientInput.programSha256))throw Error('Retained result input identity differs from the saved submission');console.log(JSON.stringify({status:result.status,report:args.out,inputIdentityVerified:!!job.clientInput}));if(result.status!=='completed')process.exitCode=1;break;}await new Promise(resolve=>setTimeout(resolve,5000));}
if(!existsSync(args.out))throw Error('Job remains pending; poll its saved id later');
