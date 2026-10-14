import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const createEvents=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/control-events.js');
function harness() {
 const tasks=[],errors=[];let paused=false;
 const bus=createEvents({dispatch:(fn,payload)=>fn(payload),enqueue:work=>tasks.push(work),paused:()=>paused,onError:e=>errors.push(e)});
 return {bus,tasks,errors,pause:value=>{paused=value;},flush:async()=>{while(tasks.length)await tasks.shift()();assert.deepEqual(errors,[]);}};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
test('raise returns before delivery; wildcard order and fractional identity match retained original ABH/ABCD/F',async()=>{
 const h=harness(),trace=[];h.bus.register(782.5,6.5,()=>trace.push('H'));
 trace.push('A');h.bus.raise(782.5,6.5);trace.push('B');assert.equal(trace.join(''),'AB');await h.flush();assert.equal(trace.join(''),'ABH');
 trace.length=0;
 for(const [s,v,label]of [[0,0,'A'],[0,7,'B'],[8,0,'C'],[8,7,'D']])h.bus.register(s,v,()=>trace.push(label));
 h.bus.raise(8,7);await h.flush();assert.equal(trace.join(''),'ABCD');
 trace.length=0;h.bus.register(782,6,()=>trace.push('I'));h.bus.register(782.5,6.5,()=>trace.push('F'));
 h.bus.raise(782.5,6.5);await h.flush();assert.equal(trace.join(''),'AF');
});
test('waiter resumes before handler and zero/zero queue is delivered once',async()=>{
 const h=harness(),trace=[];
 h.bus.register(8,7,()=>trace.push('H'));const waited=h.bus.wait(8,7).then(()=>trace.push('W'));
 h.bus.raise(8,7);await h.flush();await waited;assert.equal(trace.join(''),'WH');
 trace.length=0;h.bus.register(0,0,()=>trace.push('Z'));h.bus.raise(0,0);await h.flush();assert.equal(trace.join(''),'Z');
});
test('context replacement snapshots old invocation, then serializes new handler even with flags32',async()=>{
 const h=harness(),trace=[],held=deferred(),started=deferred();h.bus.activate(h.bus.createContext());
 h.bus.register(7,9,async()=>{trace.push('O');started.resolve();await held.promise;trace.push('o');});h.bus.raise(7,9);
 const running=h.tasks.shift()();await started.promise;assert.equal(trace.join(''),'O');
 let flagsCalls=0;h.bus.register(7,9,()=>trace.push('N'),(()=>{flagsCalls++;return 32;})());h.bus.raise(7,9);
 await h.tasks.shift()();assert.equal(trace.join(''),'O');held.resolve();await running;assert.equal(trace.join(''),'OoN');assert.equal(flagsCalls,1);
});
test('raw bus replacement is deferred until busy queue drains, unlike stable context wrappers',async()=>{
 const h=harness(),trace=[],held=deferred(),started=deferred();
 h.bus.register(7,9,async()=>{trace.push('O');started.resolve();await held.promise;trace.push('o');});h.bus.raise(7,9);
 const running=h.tasks.shift()();await started.promise;
 h.bus.register(7,9,()=>trace.push('N'));h.bus.raise(7,9);await h.tasks.shift()();held.resolve();await running;
 assert.equal(trace.join(''),'OoOo');h.bus.raise(7,9);await h.flush();assert.equal(trace.join(''),'OoOoN');
});
test('scene context unregister/restore retains parent handler and does not stop running old callback',async()=>{
 const h=harness(),trace=[],parent=h.bus.createContext(),child=h.bus.createContext(),held=deferred(),started=deferred();
 h.bus.activate(parent);h.bus.register(2,3,async()=>{trace.push('P');started.resolve();await held.promise;trace.push('p');});h.bus.raise(2,3);
 const running=h.tasks.shift()();await started.promise;h.bus.activate(child);h.bus.register(2,3,()=>trace.push('C'));
 held.resolve();await running;assert.equal(trace.join(''),'Pp');h.bus.raise(2,3);await h.flush();assert.equal(trace.join(''),'PpC');
 h.bus.activate(parent);h.bus.raise(2,3);await h.flush();assert.equal(trace.join(''),'PpCPp');
});
test('selected pending queue admits six before dropping the seventh; busy first invocation remains distinct',async()=>{
 const h=harness(),held=deferred(),started=deferred();let hits=0;
 h.bus.register(8,9,async()=>{hits++;started.resolve();await held.promise;});h.bus.raise(8,9);const running=h.tasks.shift()();await started.promise;
 for(let i=0;i<7;i++){h.bus.raise(8,9);await h.tasks.shift()();}
 held.resolve();await running;assert.equal(hits,7);
});
test('Stop settles waiters, invalidates queued/inflight deliveries, refuses stale contexts and supports clean restart',async()=>{
 const h=harness(),context=h.bus.createContext(),held=deferred(),started=deferred();let hits=0;
 h.bus.activate(context);h.bus.register(8,9,async()=>{hits++;started.resolve();await held.promise;});h.bus.raise(8,9);const running=h.tasks.shift()();await started.promise;
 const waiter=h.bus.wait(1,2);h.bus.raise(8,9);h.bus.cancel();assert.equal(await waiter,undefined);held.resolve();await running;await h.flush();assert.equal(hits,1);
 assert.throws(()=>h.bus.activate(context),/Foreign/);h.bus.activate(h.bus.createContext());h.bus.register(8,9,()=>hits++);h.bus.raise(8,9);await h.flush();assert.equal(hits,2);
});
test('debugger-paused raise is discarded, two buses do not share handlers or generation',async()=>{
 const a=harness(),b=harness();let hits=0;a.bus.register(1,2,()=>hits++);a.pause(true);a.bus.raise(1,2);await a.flush();assert.equal(hits,0);
 b.bus.raise(1,2);await b.flush();assert.equal(hits,0);a.pause(false);a.bus.raise(1,2);await a.flush();assert.equal(hits,1);
});
