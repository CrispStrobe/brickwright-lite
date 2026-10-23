// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {judgeWaveMaker} from './sim-lab-wavemaker-judge.mjs';
import {judgeSineShuttle,judgeQuartermaster} from './sim-lab-sine-quarter-judge.mjs';
// This registry and the judges are reviewer-owned. A model-building agent owns
// its candidate pack, never this acceptance boundary or the physical test gates.
export const QUALIFICATION_JUDGES=Object.freeze({'scotch-yoke-v1':judgeSineShuttle,'latched-indexer-v1':judgeQuartermaster,'cardan-differential-v1':judgeWaveMaker});
export const QUALIFICATION_NATIVE_TESTS=Object.freeze({wavemaker:'test/bw-sim-wavemaker.test.mjs'});
export function qualificationContracts(requested){
 const data=JSON.parse(readFileSync(new URL('../../docs/data/robot-lab-qualification.json',import.meta.url)));
 assert.equal(data.version,1);assert.ok(Array.isArray(data.models)&&data.models.length>0);
 const seen=new Set();for(const c of data.models){
  assert.match(c.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);assert.ok(!seen.has(c.id),'unique model');seen.add(c.id);
  assert.ok(Object.hasOwn(QUALIFICATION_JUDGES,c.judge),'A new principle needs an independently reviewed judge');
  assert.ok(Number.isInteger(c.parts)&&c.parts>50);assert.ok(c.ports.length>=1&&c.ports.length<=3&&new Set(c.ports).size===c.ports.length);assert.ok(c.ports.every(p=>/^[A-F]$/.test(p)));
  for(const k of ['coldMs','timeLimitMs','afterMs','frameMs'])assert.ok(Number.isFinite(c[k])&&c[k]>0,k);
  assert.ok(c.frameMs<=25&&c.timeLimitMs<=180000&&c.coldMs>=500);if(c.nativeSuite){assert.ok(Object.hasOwn(QUALIFICATION_NATIVE_TESTS,c.nativeSuite));assert.equal(c.physicalControl,'wavemaker-control.ldr');assert.equal(c.judge,'cardan-differential-v1');}else assert.ok(c.disconnect.length>0&&new Set(c.disconnect).size===c.disconnect.length);assert.ok(c.frozenOutput);
 }
 if(!requested)return data.models;
 assert.ok(requested.length>0&&new Set(requested).size===requested.length);for(const id of requested)assert.ok(seen.has(id),`No reviewed qualification contract: ${id}`);
 return data.models.filter(c=>requested.includes(c.id));
}
export function disconnectedSource(source,ids){
 for(const id of ids)assert.equal(source.split('\n').filter(line=>line==='0 !BW ID '+id).length,1,'exactly one removed physical part '+id);
 return source.split(/(?=^0 !BW ID )/m).filter(b=>!ids.some(id=>b.startsWith('0 !BW ID '+id+'\n'))).join('');
}
