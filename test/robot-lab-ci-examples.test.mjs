// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('CI example groups cover every authored example branch exactly once',()=>{
 const script=read('scripts/verify-sim-lab-browser.mjs'),workflow=read('.github/workflows/build.yml');
 const named=[...script.matchAll(/runExample\('([^']+)\.ldr'\)/g)].map(m=>m[1]).filter(x=>x!=='fixed-machines');
 const robots=[...script.slice(script.indexOf('const EXAMPLES = ['),script.indexOf('const CPU_THROTTLE')).matchAll(/file: '([^']+)\.ldr'/g)].map(m=>m[1]);
 const loop=/for \(const id of \[([^\]]+)\]\) if \(runExample\(id\+'\.ldr'\)\)/.exec(script);
 assert.ok(loop);const extras=[...loop[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 const expected=[...new Set([...named,...robots,...extras])].sort();
 const actual=[...workflow.matchAll(/run: npm run verify:sim-lab -- --part=examples --examples=([^\n]+)/g)].flatMap(m=>m[1].split(','));
 assert.equal(new Set(actual).size,actual.length,'no duplicate work between CI groups');assert.deepEqual(actual.sort(),expected);
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
