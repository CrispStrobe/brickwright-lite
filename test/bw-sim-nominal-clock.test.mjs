// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {SimLabClock} from '../overlay/scratch-gui/src/lib/bw-sim/sim-clock.js';

// Quantized browser timers, a real asynchronous worker boundary, and an
// unchanged 30 Hz program/physics interval. No wall-clock sleeps in this test.
async function quantizedRun(paceNominal) {
    let now=0,serial=0,nativeEnabled=true,steps=0;
    const jobs=[];
    const schedule=(fn,delay)=>{const id=++serial;jobs.push({fn,due:now+delay,id});return id;};
    const timer=(fn,ms=0,...args)=>schedule(()=>fn(...args),Math.ceil(Math.max(4,ms)/4)*4);
    const originalTimeout=globalThis.setTimeout;
    const seen=[],intervals=[];
    let clock;
    const runtime={currentStepTime:1000/30,_step(){steps++;seen.push({program:clock.programMs,world:session.time});}};
    let pending=0;
    const session={time:0,tick(ms){pending=ms;intervals.push(ms);},idle(){const ms=pending;return new Promise(resolve=>schedule(()=>{this.time+=ms;resolve();},6));}};
    const drain=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
    const next=async()=>{jobs.sort((a,b)=>a.due-b.due||a.id-b.id);const job=jobs.shift();now=job.due;job.fn();await drain();};
    globalThis.setTimeout=timer;
    try{
        clock=new SimLabClock({paceNominal,defer:fn=>timer(fn),wallNow:()=>now});
        clock.install(runtime,session);
        const nativeTick=()=>{if(!nativeEnabled)return;runtime._step();schedule(nativeTick,36);};
        schedule(nativeTick,36);
        for(;;){jobs.sort((a,b)=>a.due-b.due||a.id-b.id);if(!jobs.length||jobs[0].due>10000)break;await next();}
        now=10000;
        const rate=clock.programMs/now;
        assert.ok(seen.length>200);
        for(const sample of seen)assert.ok(Math.abs(sample.program-sample.world)<1e-8,'program and physical time agree at every actual VM step');
        assert.ok(intervals.every(ms=>ms===1000/30),'pacing never changes a physics interval');
        nativeEnabled=false;
        clock.uninstall();
        const stopped=steps;
        while(jobs.length)await next();
        assert.equal(steps,stopped,'queued cooperative work cannot restart an uninstalled clock');
        return rate;
    }finally{nativeEnabled=false;clock?.uninstall();globalThis.setTimeout=originalTimeout;}
}

test('browser nominal pacing removes quantized-interval drift without changing default callers',async()=>{
    const legacy=await quantizedRun(false),browser=await quantizedRun(true);
    assert.ok(legacy>.91&&legacy<.94,`the original interval demonstrably runs at ${legacy}`);
    assert.ok(browser>.98&&browser<1.02,`the exact-1× browser clock must meet elapsed-wall deadlines, got ${browser}`);
});
