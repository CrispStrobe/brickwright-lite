// SPDX-License-Identifier: BSD-3-Clause
// Parent-only process containment. This module imports no VM or physics engine.
import {spawn} from 'node:child_process';
import {openSync,writeSync,closeSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function runBoundedPhysicsChild({args,cwd,logDir,evidenceDir,signal,timeoutMs=180000}) {
    assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=180000,'bounded child wall deadline');
    mkdirSync(logDir,{recursive:true});const outputCap=8*1024**2;
    const fds=[openSync(path.join(logDir,'stdout.log'),'wx'),openSync(path.join(logDir,'stderr.log'),'wx')];
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const started=process.hrtime.bigint();let bytes=0,reason=null,killSent=false,killElapsedMs=null,spawnError=null;
    const child=spawn(process.execPath,args,{cwd,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
    const stop=why=>{reason??=why;if(!killSent){killSent=true;killElapsedMs=Number(process.hrtime.bigint()-started)/1e6;
        // The new detached child owns this group, including any metadata git
        // subprocess. No shared runner process or externally supplied PID.
        try{if(process.platform==='win32')child.kill('SIGKILL');else if(child.pid)process.kill(-child.pid,'SIGKILL');}
        catch(e){if(e.code!=='ESRCH')spawnError??=String(e);}}};
    const abort=()=>stop('parent-test-aborted');signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    const remaining=Math.max(0,timeoutMs-Number(process.hrtime.bigint()-started)/1e6);
    const deadline=setTimeout(()=>stop('wall-deadline'),remaining);
    const consume=(fd,chunk)=>{
        const allowed=Math.min(chunk.length,Math.max(0,outputCap-bytes));
        try{let offset=0;while(offset<allowed){const n=writeSync(fd,chunk,offset,allowed-offset);assert.ok(n>0);offset+=n;bytes+=n;}}
        catch(e){spawnError??=String(e);stop('log-write-failed');}
        if(allowed<chunk.length)stop('stdout-stderr-byte-cap');
    };
    child.stdout.on('data',b=>consume(fds[0],b));child.stderr.on('data',b=>consume(fds[1],b));
    child.on('error',e=>{spawnError=String(e);stop('spawn-error');});
    const result=await new Promise(resolve=>child.once('close',(code,exitSignal)=>resolve({code,signal:exitSignal})));
    clearTimeout(deadline);signal?.removeEventListener('abort',abort);fds.forEach(closeSync);
    const files={};for(const name of ['stdout.log','stderr.log']){const b=readFileSync(path.join(logDir,name));files[name]={bytes:b.length,sha256:sha(b)};}
    // A killed child cannot run its finally block. Seal its real partial files
    // here, outside the child directory, after exit and all stdio have closed.
    const partial={};
    try{for(const name of readdirSync(evidenceDir)){const b=readFileSync(path.join(evidenceDir,name));partial[name]={bytes:b.length,sha256:sha(b)};}}
    catch(e){if(e.code!=='ENOENT')throw e;}
    const receipt={schema:'bw.paired-door.process-bound.v1',timeoutMs,elapsedMs:Number(process.hrtime.bigint()-started)/1e6,
        reason,killSent,killElapsedMs,killMode:process.platform==='win32'?'child':'owned-process-group',spawnError,...result,outputBytes:bytes,outputCap,logs:files,childFiles:partial,
        boundary:'Independent parent timer; no VM/WASM on parent event loop. Partial child bytes retained on deadline/abort/failure.'};
    const b=Buffer.from(JSON.stringify(receipt)+'\n');const fd=openSync(path.join(logDir,'process.json'),'wx');try{let offset=0;while(offset<b.length){const n=writeSync(fd,b,offset,b.length-offset);assert.ok(n>0);offset+=n;}}finally{closeSync(fd);}
    return receipt;
}
