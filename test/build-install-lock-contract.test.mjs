import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../.github/workflows/build.yml',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../scripts/lib/gui-harness-source.mjs',import.meta.url),'utf8');
const normalName='Install',transientName='Install the local FPGA toolchain (the deployable build is flag-on)';
const normal='(cd packages/scratch-gui && npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund)';
const transient='(cd packages/scratch-gui && npm install --no-save --ignore-scripts --legacy-peer-deps --no-audit --no-fund @yowasp/yosys)';
const guard='git diff --exit-code -- packages/scratch-gui/package.json packages/scratch-gui/package-lock.json';
const build=text=>{
 const at=text.indexOf('\n  build:\n');if(at<0)throw Error('missing build job');const rest=text.slice(at+1),next=/\n  [A-Za-z][\w-]*:\n/.exec(rest);return next?rest.slice(0,next.index):rest;
};
const step=(job,name)=>{
 const rows=job.split('\n'),matches=[];for(let i=0;i<rows.length;i++)if(rows[i]==='      - name: '+name)matches.push(i);
 if(matches.length!==1)throw Error('missing or duplicate step '+name);let end=matches[0]+1;while(end<rows.length&&!/^ {6}- /.test(rows[end]))end++;
 return rows.slice(matches[0],end).join('\n');
};
const inspect=text=>{
 const job=build(text),normalStep=step(job,normalName),transientStep=step(job,transientName),problems=[];
 for(const [name,body,command]of [[normalName,normalStep,normal],[transientName,transientStep,transient]]){
  const lines=body.split('\n').map(line=>line.trim()),commands=lines.filter(line=>line===command),guards=lines.filter(line=>line===guard);
  if(commands.length!==1)problems.push(name+': exact lock-aware install missing');
  if(guards.length!==1||lines.indexOf(guard)<=lines.indexOf(command))problems.push(name+': post-install tracked-input guard missing or reordered');
  if(!lines.includes('set -euo pipefail')||lines.indexOf('set -euo pipefail')>lines.indexOf(command))problems.push(name+': fail-fast shell missing');
  if(/--package-lock(?:=false|\s+false)|--force|continue-on-error|git\s+(?:reset|restore|checkout|clean|update-index)|\|\|/.test(body))problems.push(name+': lock bypass or swallowed failure');
 }
 const order=['Integrate the Code tab (sb3-creator)',normalName,transientName,'Apply the scratch-vm overlay (built-in extensions)','Write GUI build source manifest'].map(name=>job.indexOf('      - name: '+name+'\n'));
 if(order.some(at=>at<0)||order.some((at,i)=>i>0&&at<=order[i-1]))problems.push('actual dependency/install/overlay/manifest order changed');
 return problems;
};
const replaceStep=(text,name,edit)=>{
 const start=text.indexOf('\n  build:\n')+1;assert.ok(start>0,'actual build job exists');
 const job=build(text),old=step(job,name),within=job.indexOf(old);
 assert.ok(within>=0);assert.equal(job.indexOf(old,within+old.length),-1,'selected step body is unique within build');
 const changed=edit(old);assert.notEqual(changed,old,'mutation must change the actual step');
 const offset=start+within,result=text.slice(0,offset)+changed+text.slice(offset+old.length);
 assert.equal(result.slice(0,start),text.slice(0,start),'earlier sibling jobs remain exact');
 const changedJob=build(result);
 assert.notEqual(changedJob,job,'mutation must reach the actual build job');
 assert.equal(step(changedJob,name),changed,'actual selected build step contains the complete mutation');
 assert.equal(result.slice(start+changedJob.length),text.slice(start+job.length),'later sibling jobs remain exact');
 return result;
};
test('deployable build uses immutable-lock ci then lock-aware transient install with both tracked-input fences',()=>{
 assert.deepEqual(inspect(source),[]);assert.match(manifest,/assert\.equal\(dirty, '', 'Harness tracked source must match its reviewed checkout'\)/);
});
test('normal install or omission of the ci peer and script policy is refused',()=>{
 for(const [before,after]of [['npm ci','npm install'],['--legacy-peer-deps ',''],['--ignore-scripts ','']]){
  const changed=replaceStep(source,normalName,body=>body.replace(before,after));assert.ok(inspect(changed).some(message=>message.includes('exact lock-aware install')));
 }
});
test('each missing or pre-install tracked lock fence is independently refused',()=>{
 for(const name of [normalName,transientName]){
  const omitted=replaceStep(source,name,body=>body.replace('          '+guard,''));assert.ok(inspect(omitted).some(message=>message.includes('post-install')));
  const moved=replaceStep(source,name,body=>body.replace('          '+guard,'').replace('          set -euo pipefail','          '+guard+'\n          set -euo pipefail'));assert.ok(inspect(moved).some(message=>message.includes('reordered')));
 }
});
test('transient no-save or locked-graph removal and lock-reset workarounds are refused',()=>{
 for(const edit of [body=>body.replace('--no-save ',''),body=>body.replace('--no-save','--no-save --package-lock=false'),body=>body+'\n          git restore packages/scratch-gui/package-lock.json',body=>body.replace(guard,guard+' || true')]){
  const changed=replaceStep(source,transientName,edit);assert.ok(inspect(changed).length);
 }
});
test('sibling job guards cannot replace the deployable build guard and install failures stay terminal',()=>{
 const changed=replaceStep(source,normalName,body=>body.replace('          '+guard,''));assert.ok(inspect(changed).length);
 const sibling='\n  unrelated:\n    steps:\n      - run: '+guard+'\n';assert.ok(inspect(changed+sibling).length);
 for(const name of [normalName,transientName]){
  const changed=replaceStep(source,name,body=>body.replace('set -euo pipefail','set +e'));assert.ok(inspect(changed).some(message=>message.includes('fail-fast')));
 }
});
