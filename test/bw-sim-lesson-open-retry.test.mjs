// SPDX-License-Identifier: BSD-3-Clause
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadModelLesson} from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
const gui=createRequire(process.env.BW_INTEGRATED_ROOT?pathToFileURL(resolve(process.env.BW_INTEGRATED_ROOT,'package.json')):new URL('../packages/scratch-gui/package.json',import.meta.url));
const React=gui('react'),babel=gui('@babel/core'),jsdom=gui('jsdom');
const document=jsdom.JSDOM?new jsdom.JSDOM('<!doctype html><body></body>').window.document:jsdom.jsdom('<!doctype html><body></body>');
globalThis.window=document.defaultView;globalThis.document=document;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
window.requestAnimationFrame=callback=>setTimeout(callback,0);window.cancelAnimationFrame=clearTimeout;
const channel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
const ReactDOM=gui('react-dom'),{act,Simulate}=gui('react-dom/test-utils');
after(()=>{window.close();globalThis.MessageChannel=channel;});
let fetcher;
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-lesson.jsx',import.meta.url),'utf8');
const code=babel.transformSync(source,{filename:'sim-lab-lesson.jsx',babelrc:false,configFile:false,presets:[gui.resolve('@babel/preset-react')],plugins:[gui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const module={exports:{}};
new Function('require','module','exports',code)(name=>name.endsWith('/lesson-loader.js')?{loadModelLesson:(entry,locale,options)=>loadModelLesson(entry,locale,{...options,fetcher})}:gui(name),module,module.exports);
const Panel=module.exports.default,entry={file:'first-model.ldr',example:'first-model.bw',title:{en:'First model',de:'Erstes Modell'}};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const response=url=>{const [,id,language]=/\/([^/]+)\.(en|de)\.json$/.exec(url);return{ok:true,json:async()=>({version:1,id,language,what:'Visible lesson '+id,why:'Lesson explanation',matters:'Useful context',question:'What happens?',answer:'A useful answer',try:['Try it'],further:['Explore'],related:[]})};};
const flush=fn=>act(async()=>{fn?.();await Promise.resolve();await Promise.resolve();});
async function mount(overrides={},network=async url=>response(url)) {
 const calls=[];fetcher=(url,options)=>{calls.push({url,options});return network(url,options);};
 const container=document.createElement('div');document.body.appendChild(container);
 let props={entry,models:[entry],locale:'en',onLoad:async()=>{},onRelated:()=>{},onClose:()=>{},...overrides};
 const render=async next=>{props={...props,...next};await flush(()=>{ReactDOM.render(React.createElement(Panel,props),container);});};
 await render({});return {container,calls,render,
  primary:()=>[...container.querySelectorAll('button')].find(b=>/^(Open model|Modell öffnen|Modell \+ Programm öffnen)/.test(b.textContent)),
  byId:id=>container.querySelector(`[data-testid="${id}"]`),click:button=>flush(()=>Simulate.click(button)),
  close:async()=>{await flush(()=>{ReactDOM.unmountComponentAtNode(container);});container.remove();}};
}

test('model/program errors keep lesson content and retry the opening in both languages',async()=>{
 for(const locale of ['en','de']) {
  const opens=[],v=await mount({locale,onLoad:async(...args)=>{opens.push(args);if(opens.length===1)throw Error('engine unavailable');}});
  try {
   await v.click(v.primary());const error=v.byId('bw-sim-lesson-open-error');assert.match(error.textContent,/engine unavailable/);
   assert.match(error.textContent,locale==='de'?/Beispiel konnte nicht geöffnet/:/example could not be opened/);
   assert.doesNotMatch(error.textContent,/lesson could not be loaded|Lektion konnte nicht geladen/);
   assert.match(v.container.textContent,/Visible lesson first-model/);assert.equal(v.calls.length,1);
   await v.click(v.byId('bw-sim-lesson-retry-open'));
   assert.deepEqual(opens,[['first-model.ldr',true],['first-model.ldr',true]]);
   assert.equal(v.calls.length,1,'opening retry must not fetch the lesson again');
   assert.equal(v.byId('bw-sim-lesson-open-error'),null);assert.equal(v.primary().disabled,false);
  }finally{await v.close();}
 }
});
test('lesson fetch failure still retries only the lesson in both languages',async()=>{
 for(const locale of ['en','de']) {
  let requests=0,opens=0;const v=await mount({locale,onLoad:async()=>{opens++;}},async url=>++requests===1?{ok:false,status:503}:response(url));
  try {
   assert.match(v.container.textContent,locale==='de'?/Lektion konnte nicht geladen/:/lesson could not be loaded/);
   assert.equal(v.byId('bw-sim-lesson-retry-open'),null);await v.click(v.byId('bw-sim-lesson-retry'));
   assert.equal(requests,2);assert.equal(opens,0);assert.match(v.container.textContent,/Visible lesson first-model/);
  }finally{await v.close();}
 }
});
test('old open settlement cannot change a new entry or locale request',async()=>{
 for(const context of ['entry','locale'])for(const outcome of ['resolve','reject']) {
  const old=deferred(),current=deferred();let opens=0;const v=await mount({onLoad:()=>++opens===1?old.promise:current.promise});
  try {
   await v.click(v.primary());assert.equal(v.primary().disabled,true);
   await v.render(context==='entry'?{entry:{...entry,file:'second-model.ldr'}}:{locale:'de'});
   await v.click(v.primary());assert.equal(opens,2);assert.equal(v.primary().disabled,true);
   await flush(()=>outcome==='reject'?old.reject(Error('OLD OPEN FAILURE')):old.resolve());
   assert.equal(v.byId('bw-sim-lesson-open-error'),null);assert.equal(v.primary().disabled,true,'old finally cannot clear new busy state');
   await flush(()=>current.reject(Error('CURRENT OPEN FAILURE')));
   assert.match(v.byId('bw-sim-lesson-open-error').textContent,/CURRENT OPEN FAILURE/);
   assert.doesNotMatch(v.container.textContent,/OLD OPEN FAILURE/);assert.equal(v.primary().disabled,false);
  }finally{await v.close();}
 }
});
test('unmount aborts lesson fetch and ignores late fetch/open settlement',async()=>{
 const errors=[],original=console.error;console.error=(...args)=>errors.push(args);
 try {
  const pending=deferred(),v=await mount({},()=>pending.promise),signal=v.calls[0].options.signal;
  await v.close();assert.equal(signal.aborted,true);await flush(()=>pending.resolve(response(v.calls[0].url)));
  const opening=deferred(),w=await mount({onLoad:()=>opening.promise});await w.click(w.primary());
  await w.close();await flush(()=>opening.reject(Error('late open')));assert.equal(w.container.textContent,'');
  assert.deepEqual(errors,[],'no unmounted state-update warning');
 }finally{console.error=original;}
});
test('non-Error opening rejection remains informative and retryable',async()=>{
 for(const reason of [null,undefined,'decoder not ready']) {
  let count=0;const v=await mount({onLoad:async()=>{if(++count===1)throw reason;}});
  try {
   await v.click(v.primary());const text=v.byId('bw-sim-lesson-open-error').textContent;
   assert.match(text,/example could not be opened/);assert.match(text,typeof reason==='string'?/decoder not ready/:/No error details were provided/);
   await v.click(v.byId('bw-sim-lesson-retry-open'));assert.equal(count,2);assert.equal(v.byId('bw-sim-lesson-open-error'),null);
  }finally{await v.close();}
 }
});
test('successful model-only opening and blocked buttons keep their existing behavior',async()=>{
 const opened=[],v=await mount({entry:{...entry,example:undefined},onLoad:async(...args)=>opened.push(args)});
 try{await v.click(v.primary());assert.deepEqual(opened,[['first-model.ldr',false]]);assert.equal(v.calls.length,1);}finally{await v.close();}
 const w=await mount({entry:{...entry,blocked:true}});try{assert.equal(w.primary().disabled,true);}finally{await w.close();}
});
