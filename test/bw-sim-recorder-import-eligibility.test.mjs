// SPDX-License-Identifier: BSD-3-Clause
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as recording from '../overlay/scratch-gui/src/lib/bw-sim/measurements/recording.js';
import * as experiments from '../overlay/scratch-gui/src/lib/bw-sim/measurements/experiments.js';
import {sha256Text} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/binding-digest.js';
const gui=createRequire(process.env.BW_INTEGRATED_ROOT?pathToFileURL(resolve(process.env.BW_INTEGRATED_ROOT,'package.json')):new URL('../packages/scratch-gui/package.json',import.meta.url));
const React=gui('react'),babel=gui('@babel/core'),jsdom=gui('jsdom');
const document=jsdom.JSDOM?new jsdom.JSDOM('<!doctype html><body></body>').window.document:jsdom.jsdom('<!doctype html><body></body>');
globalThis.window=document.defaultView;globalThis.document=document;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
window.requestAnimationFrame=callback=>setTimeout(callback,0);window.cancelAnimationFrame=clearTimeout;
const channel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
const ReactDOM=gui('react-dom'),{act,Simulate}=gui('react-dom/test-utils');
after(()=>{window.close();globalThis.MessageChannel=channel;});
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-measurement-recorder.jsx',import.meta.url),'utf8');
const code=babel.transformSync(source,{filename:'sim-lab-measurement-recorder.jsx',babelrc:false,configFile:false,presets:[gui.resolve('@babel/preset-react')],plugins:[gui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const module={exports:{}};
new Function('require','module','exports',code)(name=>name.endsWith('/measurements/recording.js')?recording:name.endsWith('/measurements/experiments.js')?experiments:gui(name),module,module.exports);
const Panel=module.exports.default;
const flush=fn=>act(async()=>{fn?.();await Promise.resolve();await Promise.resolve();});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const modelKey='0 Original Robot Lab model\n';
const definition={id:'mass',kind:'mass',label:'Mass',targets:['brick'],visible:true};
const context={modelSha256:'a'.repeat(64),rawModelSha256:sha256Text(modelKey)};
const defaults=()=>({locale:'en',session:{},modelKey,modelContext:context,recorderRevision:0,definitions:[definition],selected:['mass'],
 rows:[{id:'mass',unit:'g',value:3,source:'configured-mass',available:true}],sampleTime:0,paused:true,replaying:false,pairActive:false,recordingAllowed:true});
const csv=()=>{
 const recorder=recording.createMeasurementRecorder(),props=defaults();
 recorder.start({...props,canonicalModelSha256:context.modelSha256,rawModelSha256:context.rawModelSha256});
 recorder.update(props);recorder.stop();return recording.measurementRunsToCsv(recorder.snapshot().runs);
};
async function mount(overrides={}) {
 const container=document.createElement('div');document.body.appendChild(container);
 const recorder=recording.createMeasurementRecorder(),events=[];
 let props={...defaults(),recorder,onHistoryChanged:()=>events.push('history'),onRestoredSelection:ids=>events.push(ids),...overrides};
 const render=next=>flush(()=>{props={...props,...next};ReactDOM.render(React.createElement(Panel,props),container);});
 await render({});
 return{recorder,container,events,render,
  byId:id=>container.querySelector(`[data-testid="${id}"]`),
  select:read=>flush(()=>{const input=container.querySelector('input[type="file"]');Simulate.change(input,{target:{files:[{size:300,text:read}],value:'selected.csv'}});}),
  close:()=>flush(()=>{ReactDOM.unmountComponentAtNode(container);container.remove();})};
}
const gates=[['pairActive',true,false],['recordingAllowed',false,true],['replaying',true,false]];
test('pending imports cannot cross blocked import permissions, including a return to allowed state',async()=>{
 for(const [key,blocked,allowed] of gates)for(const restore of [false,true])for(const reject of [false,true]) {
  const v=await mount(),read=deferred();
  try {
   const before=v.recorder.snapshot();await v.select(()=>read.promise);
   await v.render({[key]:blocked});assert.equal(v.byId('bw-sim-measurement-record-import').disabled,true);
   if(restore)await v.render({[key]:allowed});
   await flush(()=>reject?read.reject(Error('obsolete read')):read.resolve(csv()));
   assert.deepEqual(v.recorder.snapshot(),before,`${key} must discard the old import`);
   assert.deepEqual(v.events,[],'no restored selection or history notification from discarded read');
   assert.equal(v.byId('bw-sim-measurement-record-import-status'),null,'stale success/errors stay hidden');
   if(!restore)await v.render({[key]:allowed});
   await v.select(async()=>csv());assert.equal(v.recorder.snapshot().runs.length,1,'new selection after reopening permission works');
   assert.deepEqual(v.events,[['mass'],'history']);assert.match(v.byId('bw-sim-measurement-record-import-status').textContent,/CSV runs imported/);
  }finally{await v.close();}
 }
});
test('unchanged permissions allow asynchronous import and preserve real recorder data',async()=>{
 const v=await mount(),read=deferred();
 try{await v.select(()=>read.promise);await v.render({locale:'de'});await flush(()=>read.resolve(csv()));
  const run=v.recorder.snapshot().runs[0];assert.equal(run.origin,'csv');assert.equal(run.samples[0].readings[0].value,3);
  assert.deepEqual(v.events,[['mass'],'history']);assert.match(v.byId('bw-sim-measurement-record-import-status').textContent,/CSV-Messreihen importiert/);
 }finally{await v.close();}
});
test('initial pair and capacity refusals retain their visible error and never read a file',async()=>{
 for(const [key,blocked] of gates.slice(0,2)) {
  const v=await mount({[key]:blocked});let reads=0;
  try{await v.select(async()=>{reads++;return csv();});assert.equal(reads,0);assert.match(v.byId('bw-sim-measurement-record-import-status').textContent,/CSV import refused/);assert.equal(v.recorder.snapshot().runs.length,0);}
  finally{await v.close();}
 }
});
test('unmounted panel ignores both file completion and file rejection',async()=>{
 for(const reject of [false,true]) {
  const v=await mount(),read=deferred(),errors=[],original=console.error;console.error=(...args)=>errors.push(args);
  try{await v.select(()=>read.promise);await v.close();await flush(()=>reject?read.reject(Error('late read')):read.resolve(csv()));
   assert.equal(v.recorder.snapshot().runs.length,0);assert.deepEqual(v.events,[]);assert.deepEqual(errors,[]);
  }finally{console.error=original;}
 }
});

test('a file chooser delivering during replay cannot begin a read that revives after replay',async()=>{
 const v=await mount();let reads=0;
 try {
  await v.render({replaying:true});
  await v.select(async()=>{reads++;return csv();});
  await v.render({replaying:false});
  assert.equal(reads,0);assert.equal(v.recorder.snapshot().runs.length,0);assert.deepEqual(v.events,[]);
  await v.select(async()=>csv());assert.equal(v.recorder.snapshot().runs.length,1);
 }finally{await v.close();}
});
