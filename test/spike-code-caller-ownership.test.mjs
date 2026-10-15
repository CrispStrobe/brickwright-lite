// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Authored caller scheduling controls; no installed app, native RPC or guest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const sourceRoot=fileURLToPath(new URL('..',import.meta.url));
const original=readFileSync(resolve(sourceRoot,'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'),'utf8');
const body=original.slice(original.indexOf('    async runOnNuttxPython () {'),original.indexOf('    // New MicroPython execution glue:',original.indexOf('    async runOnNuttxPython () {')));
const {createCodeRunFeedback}=await import(pathToFileURL(resolve(sourceRoot,'overlay/scratch-gui/src/lib/spike-arena/code-run-feedback.js')));
const stopBody=original.slice(original.indexOf('    stopSpike3 () {'),original.indexOf('    _onMicrobitRunRequest (event) {'));
const Dispatcher=new Function('createCodeRunFeedback',`return class {${body}${stopBody}}`)(createCodeRunFeedback);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const calls=[];const pane={bridge:{},state:{},firmwareSession:{},setState(patch,done){Object.assign(this.state,patch);done?.();},stopCalls:0,async stopProgram(){this.stopCalls++;},
 startFirmware(program,options){const gate=deferred();calls.push({options,gate});options.onStarting('uploading');return gate.promise;}};
 globalThis.window={__bwSpikeArena:{bridge:pane.bridge,_pane:pane}};
 const editor=new Dispatcher();Object.assign(editor,{state:{spike3Log:[]},L:{spike3Stopped:'Stopped.'},openSpikeArena(){},source:'print(1)',activeCode(){return this.source;},setState(patch){Object.assign(this.state,patch);}});
 return {calls,editor,pane};
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('earlier caller completion must not clear a newer pending Code run busy flag',async()=>{
 const f=fixture();const old=f.editor.runOnNuttxPython();await turn();const current=f.editor.runOnNuttxPython();await turn();
 assert.equal(f.calls.length,2);assert.equal(f.editor.state.busy,true);
 f.calls[0].gate.resolve();await old;
 const whilePending=f.editor.state.busy;
 f.calls[1].gate.resolve();await current;
 assert.equal(whilePending,true,'Old finally must not clear current caller busy state');
});
test('earlier caller catch must not replace the newer Code run feedback',async()=>{
 const f=fixture();const old=f.editor.runOnNuttxPython();await turn();const current=f.editor.runOnNuttxPython();await turn();
 // Rejection belongs to the earlier caller; no guest status is synthesized.
 f.calls[0].gate.resolve(Promise.reject(new Error('old caller upload rejected')));await old;
 const afterOld=f.editor.state.status;
 f.calls[1].gate.resolve();await current;
 assert.equal(afterOld,'uploading','Old catch must not overwrite current Code feedback');
});

for(const event of ['onCompleted','onStopped','onError','onProgramState'])test(`old captured ${event} cannot publish over current Code feedback`,async()=>{
 const f=fixture();const old=f.editor.runOnNuttxPython();await turn();const current=f.editor.runOnNuttxPython();await turn();
 const before={...f.editor.state};
 if(event==='onError')f.calls[0].options[event](new Error('old consumer error'));
 else if(event==='onProgramState')f.calls[0].options[event](3,true,0);
 else f.calls[0].options[event]();
 const observed={...f.editor.state};
 f.calls[0].gate.resolve();f.calls[1].gate.resolve();await Promise.all([old,current]);
 assert.deepEqual(observed,before,'Older callback has lost caller ownership');
});
test('old captured output cannot replace current Code output',async()=>{
 const f=fixture();const old=f.editor.runOnNuttxPython();await turn();const current=f.editor.runOnNuttxPython();await turn();
 f.calls[1].options.onOutput({text:'current',truncated:false});
 const before=f.editor.state.spike3Log;
 f.calls[0].options.onOutput({text:'old',truncated:false});const observed=f.editor.state.spike3Log;
 f.calls[0].gate.resolve();f.calls[1].gate.resolve();await Promise.all([old,current]);
 assert.deepEqual(observed,before);
});
test('old captured Stop cannot stop the current Code owner',async()=>{
 const f=fixture();const old=f.editor.runOnNuttxPython();await turn();const oldStop=f.editor._spike3Stop;
 const current=f.editor.runOnNuttxPython();await turn();const before={...f.editor.state};
 await oldStop();const observed={...f.editor.state};const stops=f.pane.stopCalls;
 f.calls[0].gate.resolve();f.calls[1].gate.resolve();await Promise.all([old,current]);
 assert.equal(stops,0);assert.deepEqual(observed,before);
});
test('current caller still publishes output and completion',async()=>{
 const f=fixture();const running=f.editor.runOnNuttxPython();await turn();
 f.calls[0].gate.resolve();await running;
 assert.equal(f.editor.state.busy,false);assert.equal(f.editor.state.spike3Running,true);
 f.calls[0].options.onOutput({text:'current',truncated:true});
 assert.deepEqual(f.editor.state.spike3Log,[{kind:'out',text:'current\n… output truncated'}]);
 f.calls[0].options.onCompleted();assert.equal(f.editor.state.spike3Running,false);
 assert.equal(f.editor.state.status,'Python firmware program completed.');
});
test('current Stop still reaches the pane and shows stopped feedback',async()=>{
 const f=fixture();const running=f.editor.runOnNuttxPython();await turn();
 await f.editor._spike3Stop();assert.equal(f.pane.stopCalls,1);
 f.calls[0].gate.resolve();await running;
 assert.equal(f.editor.state.spike3Running,false);assert.equal(f.editor.state.status,'Stopped.');assert.equal(f.editor.state.busy,false);
});

test('older caller resumed after pane state must not dispatch over the newer source',async()=>{
 const f=fixture(),states=[];f.pane.setState=(patch,done)=>{Object.assign(f.pane.state,patch);states.push(done);};
 f.editor.source='print("old")';const old=f.editor.runOnNuttxPython();await turn();
 f.editor.source='print("new")';const current=f.editor.runOnNuttxPython();await turn();
 assert.equal(states.length,2);states[1]();await turn();
 const currentStop=f.editor._spike3Stop;states[0]();await turn();
 const sources=f.calls.map(c=>c.options.source);const stopWasPreserved=f.editor._spike3Stop===currentStop;
 for(const c of f.calls)c.gate.resolve();await Promise.all([old,current]);
 assert.deepEqual(sources,['print("new")'],'An earlier state callback cannot start the old source');
 assert.equal(stopWasPreserved,true,'The old caller cannot replace the current Stop action');
});
test('older caller resumed from arena wait must not dispatch over a newer run',async()=>{
 const f=fixture(),stateUpdates=[];f.pane.setState=(patch,done)=>{stateUpdates.push(patch);Object.assign(f.pane.state,patch);done?.();};delete window.__bwSpikeArena.bridge;
 f.editor.source='print("old")';const old=f.editor.runOnNuttxPython();
 window.__bwSpikeArena.bridge=f.pane.bridge;f.editor.source='print("new")';
 const current=f.editor.runOnNuttxPython();await turn();f.calls[0].gate.resolve();await current;
 await new Promise(resolve=>setTimeout(resolve,80));
 const sources=f.calls.map(c=>c.options.source);for(const c of f.calls)c.gate.resolve();await old;
 assert.deepEqual(sources,['print("new")'],'An old arena waiter cannot submit a stale program');
 assert.equal(stateUpdates.length,1,'An old arena waiter cannot change current pane configuration');
});

test('visible Stop during the current pane callback prevents a later native dispatch',async()=>{
 const f=fixture();let release;f.pane.setState=(patch,done)=>{Object.assign(f.pane.state,patch);release=done;};
 const run=f.editor.runOnNuttxPython();await turn();assert.equal(typeof release,'function');
 f.editor.stopSpike3();release();await turn();const dispatches=f.calls.length;
 for(const call of f.calls)call.gate.resolve();await run;
 assert.equal(dispatches,0,'Stop must cancel the not-yet-started caller');assert.equal(f.editor.state.spike3Running,false);assert.equal(f.editor.state.busy,false);
});
test('visible Stop during the current arena wait prevents a later native dispatch',async()=>{
 const f=fixture();delete window.__bwSpikeArena.bridge;const run=f.editor.runOnNuttxPython();
 f.editor.stopSpike3();window.__bwSpikeArena.bridge=f.pane.bridge;
 await new Promise(done=>setTimeout(done,80));const dispatches=f.calls.length;
 for(const call of f.calls)call.gate.resolve();await run;
 assert.equal(dispatches,0,'A stopped cold waiter must never dispatch when the arena arrives');assert.equal(f.editor.state.spike3Running,false);
});
test('earlier asynchronous visible Stop failure cannot replace a newer caller status',async()=>{
 const f=fixture(),stop=deferred();f.pane.stopProgram=()=>stop.promise;
 const old=f.editor.runOnNuttxPython();await turn();f.editor.stopSpike3();f.calls[0].gate.resolve();await old;
 const current=f.editor.runOnNuttxPython();await turn();const before=f.editor.state.status;
 stop.reject(new Error('old Stop failed'));await turn();const after=f.editor.state.status;
 f.calls[1].gate.resolve();await current;
 assert.equal(after,before,'The visible Stop catch belongs to its earlier caller');
});
test('current asynchronous visible Stop failure remains visible',async()=>{
 const f=fixture(),stop=deferred();f.pane.stopProgram=()=>stop.promise;
 const run=f.editor.runOnNuttxPython();await turn();f.editor.stopSpike3();stop.reject(new Error('current Stop failed'));await turn();
 const status=f.editor.state.status;f.calls[0].gate.resolve();await run;
 assert.equal(status,'current Stop failed');
});

test('canonical importer and its tracked generated twin stay synchronized',()=>{
 const twin=readFileSync(resolve(sourceRoot,'packages/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'),'utf8');
 assert.equal(twin,original);
});

test('current cancellation keeps captured late output and callbacks out of stopped feedback',async()=>{
 const f=fixture(),running=f.editor.runOnNuttxPython();await turn();f.editor.stopSpike3();
 const before={running:f.editor.state.spike3Running,status:f.editor.state.status,log:f.editor.state.spike3Log};
 f.calls[0].options.onOutput({text:'late',truncated:false});
 f.calls[0].options.onProgramState(2,true,0);f.calls[0].options.onError(new Error('late error'));f.calls[0].options.onCompleted();
 f.calls[0].gate.resolve();await running;
 assert.deepEqual({running:f.editor.state.spike3Running,status:f.editor.state.status,log:f.editor.state.spike3Log},before);
 assert.equal(f.editor.state.busy,false);
});
test('queued Stop cannot stop the pane after another caller takes ownership',async()=>{
 const f=fixture();let handedOver=false,stopsAfterHandover=0;
 f.pane.stopProgram=async()=>{if(handedOver)stopsAfterHandover++;};
 const old=f.editor.runOnNuttxPython();await turn();const stopping=f.editor._spike3Stop();
 handedOver=true;const current=f.editor.runOnNuttxPython();await turn();await stopping;
 for(const call of f.calls)call.gate.resolve();await Promise.all([old,current]);
 assert.equal(stopsAfterHandover,0);
});
test('current pane error and rejection keep error feedback and release busy',async()=>{
 const f=fixture(),running=f.editor.runOnNuttxPython();await turn();const error=new Error('current upload failed');
 f.calls[0].options.onError(error);f.calls[0].gate.reject(error);await running;
 assert.equal(f.editor.state.status,error.message);assert.equal(f.editor.state.spike3Running,false);assert.equal(f.editor.state.busy,false);
});
