import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT=path.resolve(import.meta.dirname,'..');
const fullName='renode_brick_state::tests::lockstep_steps_land_exactly_one_quantum_apart_without_polling';
const workflow=readFileSync(path.join(ROOT,'.github/workflows/tauri.yml'),'utf8');
const step=name=>{
 const start=workflow.indexOf('      - name: '+name+'\n');assert.notEqual(start,-1,name);
 const end=workflow.indexOf('\n      - ',start+1);return workflow.slice(start,end<0?undefined:end);
};
const remaining=step('cargo test (remaining default suite)');
const isolated=step('cargo test (isolated lockstep timing)');
const script=isolated.slice(isolated.indexOf('        run: |\n')+15).split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');

test('default Cargo selection and isolated selection cover every test exactly once',()=>{
 const first=remaining.match(/^        run: (cargo test[^\n]+)$/m)?.[1];assert.ok(first);
 assert.deepEqual(first.split(/\s+/),['cargo','test','--manifest-path','src-tauri/Cargo.toml','--','--exact','--skip',fullName]);
 const second=script.match(/^cargo test ([^\n]+?) \| tee "\$receipt"$/m);assert.ok(second);
 assert.equal([...script.matchAll(/^cargo test /gm)].length,1);
 assert.deepEqual(second[1].split(/\s+/),['--manifest-path','src-tauri/Cargo.toml','--lib',fullName,'--','--exact','--test-threads=1','--format','pretty','--color','never']);
 // libtest applies exact matching to both positive and exclusion filters.
 // A similarly named test must remain in the normal suite, not disappear.
 const names=[fullName,fullName+'_extra','renode_brick_state::tests::other','peer::handshake'];
 const normal=names.filter(name=>name!==fullName),single=names.filter(name=>name===fullName);
 for(const name of names)assert.equal([...normal,...single].filter(n=>n===name).length,1,name);
 assert.equal(single.length,1);
 assert.ok(workflow.indexOf(remaining)<workflow.indexOf(isolated));
 assert.ok(workflow.indexOf(isolated)<workflow.indexOf('      - name: cargo clippy\n'));
 for(const text of [remaining,isolated])assert.doesNotMatch(text,/^        (?:if|continue-on-error):/m);
 assert.match(workflow,/cargo test --manifest-path src-tauri\/Cargo\.toml --features peers peer::/);
});

test('the named Rust timing test and its assertion remain present',()=>{
 // Inspect the checked-out source, including an uncommitted assertion edit.
 // Missing source fails closed; no Git binary or Rust execution is required.
 const source=readFileSync(path.join(ROOT,'apps/tauri/src-tauri/src/renode_brick_state.rs'),'utf8');
 const short=fullName.split('::').at(-1);
 assert.equal([...source.matchAll(new RegExp('fn\\s+'+short+'\\s*\\(','g'))].length,1);
 assert.match(source,/wall\[0\]\s*<\s*Duration::from_micros\(2500\)/);
 assert.match(source,/for k in 0\.\.STEPS/);
});

test('isolated shell propagates failure and refuses empty wrong or duplicate passes',()=>{
 const scratch=mkdtempSync(path.join(tmpdir(),'bw-lockstep-plan-'));
 try{
  const bin=path.join(scratch,'bin');mkdirSync(bin);
  // The actual workflow shell runs against this bounded authored control.
  // It prints harness lines only; no compiler, Cargo project or guest runs.
  writeFileSync(path.join(bin,'cargo'),'#!/bin/sh\n'+
   'printf "%s\\n" invoked >> "$BW_LOCKSTEP_CONTROL_CALLS"\n'+
   'case "$BW_LOCKSTEP_CONTROL_MODE" in\n'+
   ` pass) printf '%s\\n' 'test ${fullName} ... ok';;\n`+
   ` fail) printf '%s\\n' 'test ${fullName} ... ok'; exit 7;;\n`+
   ` duplicate) printf '%s\\n' 'test ${fullName} ... ok' 'test ${fullName} ... ok';;\n`+
   " empty) printf '%s\\n' 'running 0 tests';;\n"+
   " wrong) printf '%s\\n' 'test unrelated ... ok';;\n"+
   ' *) exit 99;;\nesac\n',{mode:0o755});
  const clean=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['GH_TOKEN','GITHUB_TOKEN'].includes(key)));
  for(const mode of ['pass','empty','wrong','duplicate','fail']){
   const calls=path.join(scratch,mode+'.calls');
   const result=spawnSync('/bin/bash',['--noprofile','--norc','-c',script],{cwd:scratch,encoding:'utf8',timeout:5000,
    env:{...clean,PATH:bin+path.delimiter+process.env.PATH,RUNNER_TEMP:scratch,BW_LOCKSTEP_CONTROL_MODE:mode,BW_LOCKSTEP_CONTROL_CALLS:calls}});
   assert.equal(result.error,undefined,mode);
   assert.equal(readFileSync(calls,'utf8').trim().split('\n').length,1,'one invocation: '+mode);
   if(mode==='pass')assert.equal(result.status,0,result.stderr);
   else assert.notEqual(result.status,0,mode+' must fail closed');
  }
 }finally{rmSync(scratch,{recursive:true,force:true});}
});
