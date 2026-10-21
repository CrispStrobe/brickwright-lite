// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {loadModelLesson,lessonId} from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
const GUI=new URL('../overlay/scratch-gui/',import.meta.url);
test('every example and preset has a complete EN/DE lesson with real related-model links',async()=>{
 const keys=new Set(MODELS.map(m=>m.id||m.file));
 for(const m of MODELS)for(const lang of ['en','de']){
  const data=await loadModelLesson(m,lang,{fetcher:async path=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL(path,GUI),'utf8'))})});
  assert.ok(data.what.length>65&&data.why.length>100&&data.try.length>=3&&data.further.length>=2,lessonId(m));
  assert.equal(typeof data.formula,'string');
  assert.ok(data.question.length>20&&data.answer.length>35);assert.ok(data.related.every(k=>keys.has(k)));
 }
});
test('lesson loading refuses bad identifiers, incomplete content and HTTP failures, and supports retry and cancellation',async()=>{
 assert.throws(()=>lessonId({file:'../outside.ldr'}));
 await assert.rejects(loadModelLesson(MODELS[0],'en',{fetcher:async()=>({ok:false,status:503})}),/HTTP 503/);
 await assert.rejects(loadModelLesson(MODELS[0],'en',{fetcher:async()=>({ok:true,json:async()=>({})})}),/Incomplete/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(loadModelLesson(MODELS[0],'en',{signal:controller.signal,fetcher:async(p,{signal})=>{signal.throwIfAborted();}}),/abort/i);
 const lesson=await loadModelLesson(MODELS[0],'en',{fetcher:async path=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL(path,GUI),'utf8'))})});
 assert.equal(lesson.id,lessonId(MODELS[0]));
});
