// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {EXPERIMENTAL_MODELS,EXPERIMENTAL_MODEL_DETAILS} from '../overlay/scratch-gui/src/lib/bw-sim/model/experimental-models.js';
import {loadModelLesson,lessonId} from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
const GUI=new URL('../overlay/scratch-gui/',import.meta.url);
const fetcher=async path=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL(path,GUI),'utf8'))});
test('every experimental entry ships its model, MPD, program, licence and details',()=>{
 for(const m of EXPERIMENTAL_MODELS){
  const id=m.file.replace(/\.ldr$/,'');
  for(const f of [`models/${id}.ldr`,`models/${id}.mpd`,`programs/${m.example}`,`licenses/${id}.txt`])assert.ok(existsSync(new URL(`static/sim-lab/${f}`,GUI)),`${id}: ${f}`);
  const d=EXPERIMENTAL_MODEL_DETAILS[m.id||m.file];
  assert.ok(d&&d.experimental&&d.description.en&&d.description.de,id);
  assert.ok(m.intro.en&&m.intro.de&&m.experimental,id);
  // A jog range starts from the saved datum, so it must contain zero.
  for(const l of Object.values(m.manualJog||{}))assert.ok(l.minDeg<=0&&l.maxDeg>=0&&l.stepDeg>0&&l.speedDps>0,id);
 }
});
test('every experimental entry has a complete EN/DE lesson linking only established models',async()=>{
 const established=new Set(MODELS.filter(m=>!m.experimental).map(m=>m.id||m.file));
 for(const m of EXPERIMENTAL_MODELS)for(const lang of ['en','de']){
  const data=await loadModelLesson(m,lang,{fetcher});
  assert.ok(data.what.length>65&&data.why.length>100&&data.try.length>=3&&data.further.length>=2,lessonId(m));
  assert.equal(typeof data.formula,'string',lessonId(m));
  assert.ok(data.question.length>20&&data.answer.length>35,lessonId(m));
  assert.ok(data.related.every(k=>established.has(k)),lessonId(m));
 }
});
