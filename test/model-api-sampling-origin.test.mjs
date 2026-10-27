// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const modelText=readFileSync(new URL('./fixtures/bw-sim/machines/gears-idler-24-24-24.ldr',import.meta.url),'utf8');
const measureSubmission=async input=>(await import('../tools/model-api/native-runner.mjs')).measureSubmission(input);
const input=(settings,extra={})=>({
 model:{name:'idler.ldr',text:modelText},
 settings,
 measurements:[{id:'input',kind:'jointAngle',port:'A'}],
 ...extra
});
const assertObservedTimes=report=>{
 assert.ok(report.samples.length>0);
 for(const sample of report.samples)assert.equal(sample.elapsedMs,sample.timeMs,'sparse elapsed label is the observed scene time');
 assert.equal(report.samples.at(-1).timeMs,report.completion.sceneTimeMs,'terminal observation is retained');
};

test('cold-zero sparse samples label post-tick native observations, including final partial interval and poses',async()=>{
 const report=await measureSubmission(input({programMs:250,coldMs:0,afterMs:0,sampleMs:50,poseParts:['frame']}));
 assert.equal(report.status,'completed');
 assert.equal(report.runtime.vmFrameMs,25);
 assert.equal(report.runtime.physicsStepMs,5);
 assert.equal(report.runtime.actualSampleMs,50);
 assert.deepEqual(report.samples.map(sample=>sample.timeMs),[25,75,125,175,225,250]);
 assertObservedTimes(report);
 assert.ok(report.samples.every(sample=>sample.phase==='program'));
 assert.deepEqual(report.poseRecording.frames.map(frame=>[frame.elapsedMs,frame.timeMs]),report.samples.map(sample=>[sample.elapsedMs,sample.timeMs]));
});

test('nonzero cold interval retains its initial snapshot and the actual cold-to-program phase boundary',async()=>{
 const report=await measureSubmission(input({programMs:250,coldMs:25,afterMs:0,sampleMs:25}));
 assert.equal(report.status,'completed');
 assert.deepEqual(report.samples.map(sample=>sample.timeMs),Array.from({length:12},(_,i)=>i*25));
 assertObservedTimes(report);
 assert.deepEqual(report.samples.slice(0,3).map(sample=>sample.phase),['cold','cold','program']);
 assert.ok(report.samples.slice(2).every(sample=>sample.phase==='program'));
});

test('early program completion and after tail keep phase attached to the observed snapshot',async()=>{
 const program={name:'short.bw',text:'DEVICE SPIKE\nWHEN flag clicked:\n  wait 0.1 seconds\n'};
 const report=await measureSubmission(input({programMs:500,coldMs:0,afterMs:25,sampleMs:25},{program}));
 assert.equal(report.status,'completed');
 assert.equal(report.completion.programFinished,true);
 assertObservedTimes(report);
 const finished=report.completion.finishedAtMs;
 assert.ok(finished>=175&&finished<500);
 assert.equal(report.samples.find(sample=>sample.timeMs===finished)?.phase,'program');
 assert.equal(report.samples.find(sample=>sample.timeMs===finished+25)?.phase,'after');
 assert.equal(report.completion.sceneTimeMs,finished+25);
});
