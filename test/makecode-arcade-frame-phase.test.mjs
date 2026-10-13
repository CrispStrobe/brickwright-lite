import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const code=`SPRITE Game:
WHEN arcade source starts:
  arcade set background color to 0
  set loops to 0
  forever:
    change loops by 1
    arcade set background color to 0`;
async function setup(options={},source=code) {
    const run=await runProgram(source,{frames:0});
    const {default:dispatch}=await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js');
    const adapter=Object.values(dispatch.services).findLast(s=>s?._inst&&s.getInfo?.().id==='arcade');
    let now=0;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};
    run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.runtime.currentMSecs=now;
    run.vm.setCompatibilityMode(true);run.vm.start();run.vm.quit();run.vm.greenFlag();
    const driver=run.vm.runtime._arcadeFramePhase;
    assert.ok(driver,'actual applied kernel must attach its phase driver');
    if(options.workNow)driver.workNow=options.workNow;
    if(options.budgetMs!==undefined)driver.budgetMs=options.budgetMs;
    const value=()=>Number(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name==='loops')?.value);
    return {...run,ext:adapter._inst,driver,value,time:t=>{now=t;}};
}
function close(r) {r.driver.detach();r.vm.quit();clearStrayTimers();}
async function pulse(r,delta) {
    let result;for(let tries=0;tries<16;tries++){result=await r.vm.runtime._step(delta);if(!result?.exhausted)return result;}
    throw Error('bounded phase work exhausted');
}
test('existing authored forever tick is eligible once across pre/frame/post phases',async()=>{
    const r=await setup();try {
        const counts=[];
        for(let i=0;i<4;i++){r.time(i*20);await pulse(r,i?20:0);counts.push(r.value());}
        assert.deepEqual(counts,[1,2,3,4]);assert.deepEqual(r.errors,[]);
    }finally{close(r);}
});
test('actual-VM control rejects a mutant that releases consumed tick yields between phases',async()=>{
    const r=await setup();try {
        const work=r.driver._work.bind(r.driver);
        r.driver._work=async(held,...rest)=>{
            const outcome=await work(held,...rest);
            for(const t of held)if(t.status===t.constructor.STATUS_YIELD_TICK||t.peekStackFrame()?.isLoop){t.status=t.constructor.STATUS_RUNNING;held.delete(t);}
            return outcome;
        };
        await pulse(r,0);
        assert.notEqual(r.value(),1,'mutant must fail the one-authored-turn assertion');
    }finally{close(r);}
});
test('exhausted source work preserves pending phase and consumed yield rather than duplicating it on retry',async()=>{
    let work=0;const r=await setup({workNow:()=>work,budgetMs:3});
    const sequencer=r.vm.runtime.sequencer,step=sequencer.stepThread;
    sequencer.stepThread=function(thread){const value=step.call(this,thread);work+=3;return value;};
    try {
        const result=await r.driver.step(0);
        assert.equal(result.exhausted,true);assert.equal(r.value(),1);
        assert.ok(r.driver.pending);assert.ok(r.vm.runtime.threads.length);
        r.driver.budgetMs=100;
        await pulse(r,0);
        assert.equal(r.value(),1,'same pending frame must not execute its yielded source again');
        assert.equal(r.driver.pending,null);
        r.time(20);await pulse(r,20);assert.equal(r.value(),2);
    }finally{close(r);}
});
test('Stop during frame does not restore a source thread temporarily held by the phase',async()=>{
    const r=await setup();try {
        r.vm.runtime.once('ARCADE_FRAME',()=>r.vm.stopAll());
        const result=await pulse(r,0);
        assert.equal(result.cancelled,true);
        assert.equal(r.vm.runtime.threads.length,0);
        assert.equal(r.driver.pending,null);
    }finally{close(r);}
});
test('disposal cancels phase work and rejects later pulses',async()=>{
    const r=await setup();try {
        r.vm.runtime.once('ARCADE_FRAME',()=>r.vm.runtime.dispose());
        const result=await pulse(r,0);assert.equal(result.cancelled,true);
        assert.equal(r.vm.runtime.threads.length,0);
        await assert.rejects(r.driver.step(20),/disposed/);
    }finally{close(r);}
});
test('overlapping caller pulses are refused instead of double-executing source',async()=>{
    const r=await setup();try {
        const first=r.driver.step(0);
        await assert.rejects(r.driver.step(0),/Overlapping/);
        await first;assert.equal(r.value(),1);
    }finally{close(r);}
});
test('replacement run is not executed inside a cancelled predecessor frame',async()=>{
    const r=await setup();try {
        let replacement;
        r.vm.runtime.once('ARCADE_FRAME',()=>{r.vm.greenFlag();replacement=[...r.vm.runtime.threads];});
        const result=await pulse(r,0);assert.equal(result.cancelled,true);
        assert.ok(replacement.length>0);
        assert.ok(replacement.every(t=>t.status===t.constructor.STATUS_RUNNING&&t.stack.length>0),
            'new run source must retain its first eligible turn');
    }finally{close(r);}
});

test('held source remains visible to callback waiting and buffer ownership during ordinary frame',async()=>{
    const r=await setup();try {
        const original=[...r.vm.runtime.threads];let visible=false;
        r.vm.runtime.once('ARCADE_FRAME',()=>{visible=original.every(t=>r.vm.runtime.threads.includes(t));});
        await pulse(r,0);assert.equal(visible,true);
    }finally{close(r);}
});
test('phase completion never reintroduces a thread removed by the ordinary runtime',async()=>{
    const r=await setup();try {
        const removed=[...r.vm.runtime.threads];
        r.vm.runtime.once('ARCADE_FRAME',()=>{r.vm.runtime.threads=r.vm.runtime.threads.filter(t=>!removed.includes(t));});
        await pulse(r,0);assert.ok(removed.every(t=>!r.vm.runtime.threads.includes(t)));
    }finally{close(r);}
});
test('replacement keeps its first source turn for its own subsequent frame',async()=>{
    const r=await setup();try {
        r.vm.runtime.once('ARCADE_FRAME',()=>r.vm.greenFlag());
        assert.equal((await pulse(r,0)).cancelled,true);
        r.time(20);await pulse(r,20);assert.equal(r.value(),1);
        r.time(40);await pulse(r,20);assert.equal(r.value(),2);
    }finally{close(r);}
});

test('authored timer retains visible source membership while future and resumes at its exact due time',async()=>{
    const imported=arcadeToPseudocode('let loops=0;scene.setBackgroundColor(0);pause(40);loops=1');
    assert.deepEqual(imported.unsupported,[]);
    imported.code=imported.code.replace(/WHEN flag clicked:/g,'WHEN arcade source starts:');
    const r=await setup({},imported.code);try {
        const frames=[];
        r.vm.runtime.on('ARCADE_FRAME',()=>frames.push({value:r.value(),timerThreads:r.vm.runtime.threads.filter(t=>r.driver._waitingTimer(t)).length}));
        await pulse(r,0);assert.equal(r.value(),0);
        assert.ok(frames[0].timerThreads>0,'waiting original source must stay in the real runtime thread list');
        r.time(20);await pulse(r,20);assert.equal(r.value(),0);
        r.time(40);await pulse(r,20);assert.equal(r.value(),1);
        assert.deepEqual(frames.map(v=>v.value),[0,0,1]);
    }finally{close(r);}
});

test('ordinary Scratch finite graphics loop preserves its per-frame boundary in mixed Arcade project',async()=>{
 const r=await setup({},`SPRITE Game:
WHEN flag clicked:
  set loops to 0
  REPEAT UNTIL (loops > 2):
    change loops by 1
    arcade set background color to 0`);
 try{const values=[];for(let i=0;i<3;i++){r.time(i*20);await pulse(r,i?20:0);values.push(r.value());}assert.deepEqual(values,[1,2,3]);}finally{close(r);}
});
test('explicit source loop completes inside each ordinary outer forever turn',async()=>{
 const r=await setup({},`SPRITE Game:
WHEN flag clicked:
  set loops to 0
  FOREVER:
    set limit to (loops + 5)
    arcade repeat while (loops < limit):
      change loops by 1
      arcade set background color to 0`);
 try{const values=[];for(let i=0;i<3;i++){r.time(i*20);await pulse(r,i?20:0);values.push(r.value());}assert.deepEqual(values,[5,10,15]);}finally{close(r);}
});

test('ordinary nongraphics forever thread does not starve the Arcade physical frame',async()=>{
 let work=0;const r=await setup({workNow:()=>++work,budgetMs:12},`SPRITE Game:
WHEN flag clicked:
  set loops to 0
  FOREVER:
    change loops by 1
WHEN flag clicked:
  arcade set background color to 0`);
 try{let frames=0;r.vm.runtime.on('ARCADE_FRAME',()=>frames++);
  const result=await r.driver.step(0);assert.equal(frames,1,'ordinary Scratch loop must preserve frame availability under shared deadline');
  assert.equal(result.cancelled,false);
 }finally{close(r);}
});

test('mixed initial frame preserves ordinary flag setup baseline while explicit source initializes',async()=>{
 const source=`GLOBAL ordinaryValue
GLOBAL sourceValue
SPRITE Game:
WHEN arcade source starts:
  set sourceValue to 5
  arcade set background color to 0
WHEN flag clicked:
  set ordinaryValue to 7`;
 const value=(r,name)=>r.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name)?.value;
 const baseline=await setup({},source);let oldFrame;
 try{baseline.vm.runtime.once('ARCADE_FRAME',()=>oldFrame={ordinary:value(baseline,'ordinaryValue'),source:value(baseline,'sourceValue')});baseline.vm.runtime._stepArcadeKernel(0);}finally{close(baseline);}
 const r=await setup({},source);let frame;
 try{r.vm.runtime.once('ARCADE_FRAME',()=>frame={ordinary:value(r,'ordinaryValue'),source:value(r,'sourceValue')});await pulse(r,0);
 assert.equal(frame.ordinary,oldFrame.ordinary,'ordinary flag script stays after the same physical frame boundary');
 assert.equal(Number(frame.source),5);assert.equal(Number(oldFrame.source),0);
 assert.equal(Number(value(r,'ordinaryValue')),7);
 }finally{close(r);}
});

test('source authority rejects a retained source thread after actual Stop/replacement',async()=>{
 const r=await setup({},`SPRITE Game:
WHEN arcade source starts:
  set loops to 0
  FOREVER:
    change loops by 1
    arcade set background color to 0`);
 try{const old=[...r.vm.runtime.threads];assert.ok(old.some(t=>r.driver._sourceOwned(t)));
  r.vm.greenFlag();assert.ok(old.every(t=>!r.driver._sourceOwned(t)));
  assert.ok(r.vm.runtime.threads.some(t=>r.driver._sourceOwned(t)));
 }finally{close(r);}
});

test('source-managed function does not elevate an ordinary graphics loop into source-loop eligibility',async()=>{
 const source=`SPRITE Game:
DEFINE paint:
  REPEAT UNTIL loops = 3:
    change loops by 1
    arcade set background color to loops
  arcade return value loops
WHEN arcade source starts:
  set loops to 0
  set returned to (arcade call function "paint" arguments ("[]"))`;
 const r=await setup({},source);
 try {
  const observed=[];for(let i=0;i<3;i++){r.time(i*20);await pulse(r,i?20:0);observed.push(r.value());}
  assert.deepEqual(observed,[1,2,3]);assert.deepEqual(r.errors,[]);
 }finally{close(r);}
});

test('retired managed caller cannot authorize a due child side effect before cancellation pump',async()=>{
 const source=`SPRITE Game:
DEFINE delayed:
  wait 0.02 seconds
  set loops to 9
  arcade return value 0
WHEN arcade source starts:
  set loops to 0
  set returned to (arcade call function "delayed" arguments ("[]"))`;
 const r=await setup({},source);try {
  await pulse(r,0);assert.equal(r.value(),0);
  const call=[...r.ext._functionCalls][0];assert.ok(call?.caller);
  r.vm.runtime.sequencer.retireThread(call.caller);
  r.time(20);await pulse(r,20);
  assert.equal(r.value(),0,'orphan child must retire before executing its ready side effect');
 }finally{close(r);}
});

test('actual request retains one physical frame across browser-turn budget continuations',async()=>{
 let work=0;const r=await setup({workNow:()=>work,budgetMs:3});
 const seq=r.vm.runtime.sequencer,step=seq.stepThread;
 seq.stepThread=function(t){const result=step.call(this,t);work+=3;return result;};
 let frames=0;r.vm.runtime.on('ARCADE_FRAME',()=>frames++);
 try{
  const first=r.vm.runtime._step(0),overlap=r.vm.runtime._step();
  assert.equal(first,overlap,'host tick shares the actual pending physical request');
  const result=await first;
  assert.equal(result.exhausted,false);assert.equal(frames,1);assert.equal(r.value(),1);
  assert.ok(r.driver.notes.some(note=>note.includes('exhausted')));
  assert.equal(r.driver.pending,null);
 }finally{close(r);}
});


test('explicit concurrent physical deltas survive pending owner completion',async()=>{
 const r=await setup();const elapsed=[];r.vm.runtime.on('ARCADE_FRAME',ms=>elapsed.push(ms));
 try{const first=r.vm.runtime._step(0);assert.equal(r.vm.runtime._step(7),first);assert.equal(r.vm.runtime._step(13),first);await first;
 assert.deepEqual(elapsed,[0,20]);assert.equal(r.value(),2);assert.equal(r.driver.queuedDelta,null);
 }finally{close(r);}
});

for(const action of ['stop','load'])test('actual '+action+' cancels an owned browser-turn continuation without a physical frame',async()=>{
 const r=await setup({budgetMs:1},`SPRITE Game:
WHEN arcade source starts:
  set loops to 0
  arcade repeat while (1 = 1):
    change loops by 1`);
 let frames=0;r.vm.runtime.on('ARCADE_FRAME',()=>frames++);
 let cancel,resolveCancel;cancel=new Promise(resolve=>{resolveCancel=resolve;});
 let pendingSeen=false;
 try{
  const request=r.vm.runtime._step(0);
  setTimeout(async()=>{
   try{pendingSeen=!!r.driver.pending;if(action==='load')await r.vm.loadProject(r.buffer);else r.vm.stopAll();resolveCancel();}
   catch(error){resolveCancel(error);}
  },0);
  const outcome=await request,error=await cancel;if(error)throw error;
  assert.equal(pendingSeen,true,'actual host timer observes the pending physical owner');
  assert.equal(outcome.cancelled,true);assert.equal(frames,0);
  assert.equal(r.driver.pending,null);assert.equal(r.driver.queuedDelta,null);
  assert.equal(r.vm.runtime.threads.length,0);
 }finally{close(r);}
});
