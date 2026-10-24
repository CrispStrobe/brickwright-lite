// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('scripts/verify-sim-lab-browser.mjs');
function checkExampleCoverage(workflow){
 const named=[...script.matchAll(/runExample\('([^']+)\.ldr'\)/g)].map(m=>m[1]).filter(x=>x!=='fixed-machines');
 const robots=[...script.slice(script.indexOf('const EXAMPLES = ['),script.indexOf('const CPU_THROTTLE')).matchAll(/file: '([^']+)\.ldr'/g)].map(m=>m[1]);
 const loops=[...script.matchAll(/for \(const id of \[([^\]]+)\]\) if \(runExample\(id\+'\.ldr'\)\)/g)];
 assert.ok(loops.length);const extras=loops.flatMap(loop=>[...loop[1].matchAll(/'([^']+)'/g)].map(m=>m[1]));
 // The new-model gate filters its own id list rather than a runExample loop.
 const newModels=[...script.matchAll(/const newModelIds = \[([^\]]+)\]/g)].flatMap(m=>[...m[1].matchAll(/'([^']+)'/g)].map(n=>n[1]));
 const expected=[...new Set([...named,...robots,...extras,...newModels])].sort();
 // Match the actual filter's primary -> automatically included control pairs.
 const automatic=[...script.matchAll(/\(id==='([^']+)' && runExample\('([^']+)\.ldr'\)\)/g)].map(m=>({control:m[1],primary:m[2]}));
 assert.deepEqual(automatic.map(p=>p.primary).sort(),['cable-compass','cascade','rise-ratio','wavemaker']);
 const groups=[...workflow.matchAll(/run: npm run verify:sim-lab -- --part=examples --examples=([^\s]+)/g)].map(m=>m[1].split(','));
 const actual=groups.flatMap(ids=>[...new Set([...ids,...automatic.filter(p=>ids.includes(p.primary)).map(p=>p.control)])]);
 assert.equal(new Set(actual).size,actual.length,'no duplicate work between CI groups');assert.deepEqual(actual.sort(),expected);
}
test('CI example groups cover every authored example branch exactly once',()=>{
 checkExampleCoverage(read('.github/workflows/build.yml'));
});
test('coverage refuses an omitted primary/control pair and a separate duplicate control gate',()=>{
 const workflow=read('.github/workflows/build.yml');
 const command='run: npm run verify:sim-lab -- --part=examples --examples=cascade';
 assert.equal(workflow.split(command+'\n').length,2);
 assert.throws(()=>checkExampleCoverage(workflow.replace(command+'\n','run: true\n')));
 assert.throws(()=>checkExampleCoverage(workflow+'\n'+command+'-control\n'),/duplicate work/);
});

test('split mechanism groups retain every original machine exactly once', () => {
 const script=read('scripts/verify-sim-lab-browser.mjs');
 const helper=read('scripts/lib/sim-lab-seven-machines-gate.mjs');
 const roster=helper.slice(helper.indexOf('export const SEVEN_MODELS='),helper.indexOf('export const sevenMachinesInteractions'));
 const expected=[...roster.matchAll(/\['([^']+)',\d+,\d+\]/g)].map(m=>m[1]).sort();
 const groups=[...script.matchAll(/await runSeven\('[^']+',\[([^\]]+)\]\)/g)];
 const actual=groups.flatMap(m=>[...m[1].matchAll(/'([^']+)'/g)].map(n=>n[1])).sort();
 assert.ok(expected.length>=8);
 assert.deepEqual(actual,expected,'all original programs, manual controls, instructions and both lesson languages remain assigned');
 assert.equal(new Set(actual).size,actual.length);
});

function checkAtlasPartition(workflow){
 const steps=workflow.split(/\n      - name: /);
 const producer=steps.filter(s=>s.includes('--intake-capture=atlas-six'));
 const consumer=steps.filter(s=>s.includes('--part=intake-replay --intake=atlas-six'));
 assert.equal(producer.length,1,'one actual saved-project producer');
 assert.equal(consumer.length,1,'one full original-project replay consumer');
 for(const s of [...producer,...consumer]){
  assert.match(s,/timeout-minutes: 8\s/,'unchanged bounded step');
  assert.match(s,/matrix.shard == 'robotaddon9'/,'same job retains original exported file');
 }
 assert.ok(steps.indexOf(producer[0])<steps.indexOf(consumer[0]),'capture precedes replay');
 assert.match(producer[0],/--part=examples --examples=atlas-six --intake-capture=atlas-six/);
}
test('Atlas CI partition preserves original export and full replay under existing budgets',()=>{
 const workflow=read('.github/workflows/build.yml');checkAtlasPartition(workflow);
 assert.throws(()=>checkAtlasPartition(workflow.replace('--part=intake-replay --intake=atlas-six','--part=examples --examples=oblique')),/consumer/);
 assert.throws(()=>checkAtlasPartition(workflow.replace('--intake-capture=atlas-six','')),/producer/);
 assert.throws(()=>checkAtlasPartition(workflow.replace("matrix.shard == 'robotaddon9'","matrix.shard == 'robotaddon8'")),/same job/);
 assert.throws(()=>checkAtlasPartition(workflow.replace('saved-project replay\n        timeout-minutes: 8','saved-project replay\n        timeout-minutes: 9')),/bounded step/);
});
