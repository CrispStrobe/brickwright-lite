// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('CI example groups cover every authored example branch exactly once',()=>{
 const script=read('scripts/verify-sim-lab-browser.mjs'),workflow=read('.github/workflows/build.yml');
 const named=[...script.matchAll(/runExample\('([^']+)\.ldr'\)/g)].map(m=>m[1]).filter(x=>x!=='fixed-machines');
 const robots=[...script.slice(script.indexOf('const EXAMPLES = ['),script.indexOf('const CPU_THROTTLE')).matchAll(/file: '([^']+)\.ldr'/g)].map(m=>m[1]);
 const loops=[...script.matchAll(/for \(const id of \[([^\]]+)\]\) if \(runExample\(id\+'\.ldr'\)\)/g)];
 assert.ok(loops.length);const extras=loops.flatMap(loop=>[...loop[1].matchAll(/'([^']+)'/g)].map(m=>m[1]));
 const expected=[...new Set([...named,...robots,...extras])].sort();
 const actual=[...workflow.matchAll(/run: npm run verify:sim-lab -- --part=examples --examples=([^\n]+)/g)].flatMap(m=>m[1].split(','));
 assert.equal(new Set(actual).size,actual.length,'no duplicate work between CI groups');assert.deepEqual(actual.sort(),expected);
});
