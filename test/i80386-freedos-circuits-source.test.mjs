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
 assert.match(generated,/getByRole\('button',\{name:'Debugger',exact:true\}\)/);
 assert.match(generated,/debuggerView\.click\(\)/);
 assert.match(generated,/debuggerView\.getAttribute\('aria-pressed'\)/);
 assert.match(generated,/vdpCanvas\.click\(\)/);
 assert.match(generated,/vdp\.evaluate\(el=>document\.activeElement===el\)/);
 assert.match(generated,/vdpCanvas\.evaluate\(circuitTextObserver\)/);
 assert.match(generated,/actual Circuit VDP pixels show guest shell response/);
 assert.match(generated,/Circuit guest output survives Code return/);
 assert.doesNotMatch(generated,/window\.__benchTarget\.keyIn\(/,'no diagnostic input injection');
 assert.doesNotMatch(generated,/\.click\(\{force:true\}\)|\.focus\(\)/,'no bypass of physical click or browser focus');
 const stage=execFileSync('git',['show','HEAD:overlay/scratch-gui/src/components/stage-header/stage-header.jsx'],{encoding:'utf8'});
 const buttons=execFileSync('git',['show','HEAD:packages/scratch-gui/src/components/toggle-buttons/toggle-buttons.jsx'],{encoding:'utf8'});
 const panel=execFileSync('git',['show','HEAD:overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'],{encoding:'utf8'});
 assert.match(stage,/handleClick: \(\) => \{ setCircuitView\(\{fullWidth: true, dock: 'right'\}\); setView\('solo'\); \}/);
 assert.match(stage,/title: intl\.formatMessage\(messages\.debuggerFull\)/);
 assert.match(buttons,/aria-label=\{button\.title\}/);
 assert.match(buttons,/aria-pressed=\{button\.isSelected\}/);
 assert.match(panel,/onMouseDown=\{this\.state\.runner\.mouseIn \? this\._mouseDown : undefined\}/);
 assert.match(panel,/querySelector\('\[data-vdp-screen\]'\)\?\.focus\(\)/);
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
