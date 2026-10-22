import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,delimiter} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as probe from '../scripts/probe-pyodide-packer.mjs';
import {parseJobs} from '../scripts/lib/workflow-gates.mjs';

const quoted=s=>"'"+s.replaceAll("'","'\\''")+"'";
function fixture(mode='ok'){
 const root=mkdtempSync(join(tmpdir(),'pyodide-setup-'));mkdirSync(join(root,'scripts'));mkdirSync(join(root,'bin'));
 const script=join(root,'scripts','probe-pyodide-packer.mjs');copyFileSync(new URL('../scripts/probe-pyodide-packer.mjs',import.meta.url),script);
 const log=join(root,'npm-args.json'),fake=join(root,'fake-npm.mjs');
 writeFileSync(fake,`import{writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
 writeFileSync(process.env.BW_TEST_PYODIDE_NPM_LOG,JSON.stringify(process.argv.slice(2)));
 if(process.env.BW_TEST_PYODIDE_NPM_MODE==='delay')setTimeout(()=>process.exit(23),750);
 else if(process.env.BW_TEST_PYODIDE_NPM_MODE==='refuse')process.exit(42);
 else{const dir=join(process.cwd(),'node_modules','pyodide');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'pyodide.mjs'),'export async function loadPyodide(){throw new Error("measurement marker");}');}`);
 writeFileSync(join(root,'bin','npm'),'#!/bin/sh\nexec '+quoted(process.execPath)+' '+quoted(fake)+' "$@"\n',{mode:0o755});
 const env={...process.env,PATH:join(root,'bin')+delimiter+dirname(process.execPath)+delimiter+process.env.PATH,BW_TEST_PYODIDE_NPM_LOG:log,BW_TEST_PYODIDE_NPM_MODE:mode};
 return{root,script,log,env,run:args=>spawnSync(process.execPath,[script,...args],{env,encoding:'utf8',timeout:5000}),close:()=>rmSync(root,{recursive:true,force:true})};
}

test('install-only prepares the isolated runtime without loading or measuring it',()=>{
 const f=fixture();try{const r=f.run(['--install-only']);assert.equal(r.status,0,r.stderr);assert.ok(existsSync(join(f.root,'artifacts','pyodide','node_modules','pyodide','pyodide.mjs')));assert.ok(JSON.parse(readFileSync(f.log)).includes('pyodide'));assert.doesNotMatch(r.stderr,/measurement marker/);}finally{f.close();}
});

test('the existing developer install mode still proceeds to the actual measurement entry',()=>{
 const f=fixture();try{const r=f.run(['--install']);assert.notEqual(r.status,0);assert.match(r.stderr,/measurement marker/);assert.ok(JSON.parse(readFileSync(f.log)).includes('pyodide'));}finally{f.close();}
});

test('install-only reports a refused installer instead of claiming setup succeeded',()=>{
 const f=fixture('refuse');try{const r=f.run(['--install-only']);assert.notEqual(r.status,0);assert.ok(existsSync(f.log),'the installer was actually called');assert.ok(!existsSync(join(f.root,'artifacts','pyodide','node_modules','pyodide','pyodide.mjs')));}finally{f.close();}
});

test('a stalled installation is terminated by its own deadline',()=>{
 const f=fixture('delay');try{
  const code=`import assert from 'node:assert/strict';import{installPyodide}from ${JSON.stringify(pathToFileURL(f.script).href)};try{installPyodide({timeoutMs:40});assert.fail('installer returned without its deadline');}catch(error){assert.equal(error.code,'ETIMEDOUT');console.log('installer deadline observed');}`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',code],{env:f.env,encoding:'utf8',timeout:5000});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/installer deadline observed/);
 }finally{f.close();}
});

test('both CI setup calls install only and retain their existing four-minute budgets',()=>{
 const text=readFileSync(new URL('../.github/workflows/build.yml',import.meta.url),'utf8');
 const setups=[...parseJobs(text).values()].flatMap(j=>j.steps).filter(s=>s.name==='Install Pyodide for the FPGA bitstream-packer gate (tolerated absent)');assert.equal(setups.length,2);assert.ok(setups.every(s=>s.timeout===4));
 const calls=text.split('\n').filter(line=>line.trimStart().startsWith('run: node scripts/probe-pyodide-packer.mjs '));assert.equal(calls.length,2);for(const line of calls){assert.match(line,/--install-only(?:\s|$)/);assert.ok(line.includes('|| echo "::warning::pyodide install failed'));}
 assert.ok(probe.INSTALL_ONLY_TIMEOUT_MS>0&&probe.INSTALL_ONLY_TIMEOUT_MS<4*60*1000,'the child deadline fits inside the unchanged outer setup budget');
});
