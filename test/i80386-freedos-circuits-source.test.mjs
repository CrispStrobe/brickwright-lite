import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {deriveCircuitsProbe} from '../scripts/verify-i80386-freedos-circuits-direct.mjs';

test('direct Circuit probe is an exact accepted-browser derivative with a real VDP key route',()=>{
 const {generated,generatedSha256}=deriveCircuitsProbe();
 assert.equal(createHash('sha256').update(generated).digest('hex'),generatedSha256);
 assert.match(generated,/page\.locator\('\[data-vdp-screen\]:visible'\)/);
 assert.match(generated,/vdp\.click\(\)/);
 assert.match(generated,/vdp\.evaluate\(el=>document\.activeElement===el\)/);
 assert.match(generated,/vdpCanvas\.evaluate\(circuitTextObserver\)/);
 assert.match(generated,/actual Circuit VDP pixels show guest shell response/);
 assert.match(generated,/Circuit guest output survives Code return/);
 assert.doesNotMatch(generated,/window\.__benchTarget\.keyIn\(/,'no diagnostic input injection');
 const directory=mkdtempSync(join(process.env.BW_TEST_TMPDIR || tmpdir(),'freedos-circuits-source-'));
 try{
  const generatedPath=join(directory,'probe.mjs');writeFileSync(generatedPath,generated);
  const parsed=spawnSync(process.execPath,['--check',generatedPath],{encoding:'utf8',timeout:5000});
  assert.equal(parsed.status,0,parsed.stderr);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('production build version derives from exact PR head, not ambient merge commit',()=>{
 const overlayPath=new URL('../overlay/scratch-gui/webpack.config.js',import.meta.url);
 const overlay=existsSync(overlayPath)?readFileSync(overlayPath,'utf8'):
  execFileSync('git',['show','HEAD:overlay/scratch-gui/webpack.config.js'],{encoding:'utf8'});
 const workflow=readFileSync(new URL('../.github/workflows/i80386-freedos-circuits-direct-actual.yml',import.meta.url),'utf8');
 const source=overlay.match(/const buildVersion = \(\) => \{[\s\S]*?\n\};/)?.[0];
 assert.ok(source,'actual webpack buildVersion source');
 const head='a99cca704877f57a85ff4628f10b94ecdb1ad933';
 const merge='b32b8a7000000000000000000000000000000000';
 const version=env=>runInNewContext(`${source}\nbuildVersion()`,{
  process:{env},require:()=>{throw Error('unexpected Git fallback');}
 });
 assert.equal(version({GITHUB_SHA:head,VERCEL_GIT_COMMIT_SHA:merge}),head.slice(0,7));
 assert.equal(version({GITHUB_SHA:merge}),merge.slice(0,7));
 assert.notEqual(head.slice(0,7),merge.slice(0,7));
 assert.match(workflow,/GITHUB_SHA="\$BW_EXPECTED_HEAD" NODE_ENV=production/);
 assert.match(workflow,/assert\.equal\(manifest\.commit,process\.env\.BW_EXPECTED_HEAD\.slice\(0,7\)/);
 assert.match(workflow,/cmp overlay\/scratch-gui\/webpack\.config\.js packages\/scratch-gui\/webpack\.config\.js/);
});
