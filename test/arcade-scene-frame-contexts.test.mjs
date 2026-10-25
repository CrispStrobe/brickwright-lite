import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
const require=createRequire(import.meta.url),createPoll=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/poll-events.js'),createFrames=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/scene-frame-contexts.js');
function setup(){const clock=createArcadeDiscreteTimers(),frames=[],errors=[];const polls=createPoll({...clock,onError:e=>errors.push(e)});const host=createFrames({...clock,polls:()=>polls,runFrame:(owner,delta)=>{frames.push({owner,time:clock.now(),delta});},onError:e=>errors.push(e)});return {clock,frames,errors,polls,host};}
test('a scene born at150 starts with delta0 and owns150/170/190 independently',async()=>{
 const {clock,host,frames,errors}=setup();await clock.advanceTo(150);host.register('scene');await clock.advanceTo(199);assert.deepEqual(frames,[{owner:'scene',time:150,delta:0},{owner:'scene',time:170,delta:20},{owner:'scene',time:190,delta:20}]);assert.deepEqual(errors,[]);host.cancel();assert.equal(clock.pending,0);
});
test('unregister sleeping worker and restore before its wake wait through actual shared poll queue',async()=>{
 const {clock,host,frames,polls}=setup();host.register('scene');await clock.advanceTo(10);host.unregister('scene');await clock.advanceTo(15);host.register('scene');await clock.advanceTo(20);assert.deepEqual(frames,[{owner:'scene',time:0,delta:0}]);assert.equal(polls.size,1);await clock.advanceTo(65);assert.deepEqual(frames,[{owner:'scene',time:0,delta:0},{owner:'scene',time:65,delta:0}]);host.cancel();polls.cancel();assert.equal(clock.pending,0);
});
test('paused frame body retains ownership; new scene proceeds while its promise is pending',async()=>{
 const clock=createArcadeDiscreteTimers(),frames=[],polls=createPoll({...clock});let resolveOld;
 const old=new Promise(resolve=>{resolveOld=resolve;});const host=createFrames({...clock,polls:()=>polls,runFrame:(owner,delta)=>{frames.push({owner,time:clock.now(),delta});return {completion:owner==='parent'?old:undefined};},onError:e=>{throw e;}});
 host.register('parent');await clock.advanceTo(10);host.unregister('parent');host.register('child');await clock.advanceTo(30);assert.deepEqual(frames,[{owner:'parent',time:0,delta:0},{owner:'child',time:10,delta:0},{owner:'child',time:30,delta:20}]);resolveOld();await new Promise(r=>setImmediate(r));await clock.advanceTo(31);host.cancel();polls.cancel();assert.equal(clock.pending,0);
});
test('Stop cancels all old worker and condition-wait callbacks; new registration has a new epoch',async()=>{
 const {clock,host,frames,polls}=setup();host.register('old');await clock.advanceTo(10);host.unregister('old');host.register('old');host.cancel();polls.cancel();await clock.advanceTo(150);assert.deepEqual(frames,[{owner:'old',time:0,delta:0}]);host.register('new');await clock.advanceTo(150);assert.deepEqual(frames.at(-1),{owner:'new',time:150,delta:0});host.cancel();assert.equal(clock.pending,0);
});
test('frame callback runtime reduces its next actual sleep and never runs an overlapping worker',async()=>{
 const clock=createArcadeDiscreteTimers(),frames=[],polls=createPoll({...clock});let active=false;
 const host=createFrames({...clock,polls:()=>polls,runFrame:async(owner,delta)=>{assert.equal(active,false);active=true;frames.push({time:clock.now(),delta});await clock.advanceTo(clock.now()+7);active=false;},onError:e=>{throw e;}});
 host.register('scene');await clock.advanceTo(40);assert.deepEqual(frames,[{time:0,delta:0},{time:20,delta:20},{time:40,delta:20}]);host.cancel();
});
