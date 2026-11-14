// SPDX-License-Identifier: BSD-3-Clause
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {INSTRUCTIONS_TEXT} from '../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-instructions-text.js';
const gui=createRequire(process.env.BW_INTEGRATED_ROOT?pathToFileURL(resolve(process.env.BW_INTEGRATED_ROOT,'package.json')):new URL('../packages/scratch-gui/package.json',import.meta.url));
const React=gui('react'),babel=gui('@babel/core'),jsdom=gui('jsdom');
const document=jsdom.JSDOM?new jsdom.JSDOM('<!doctype html><body></body>').window.document:jsdom.jsdom('<!doctype html><body></body>');
globalThis.window=document.defaultView;globalThis.document=document;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
window.requestAnimationFrame=callback=>setTimeout(callback,0);window.cancelAnimationFrame=clearTimeout;
const channel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
const ReactDOM=gui('react-dom'),{act,Simulate}=gui('react-dom/test-utils');
after(()=>{window.close();globalThis.MessageChannel=channel;});
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-instructions.jsx',import.meta.url),'utf8');
const code=babel.transformSync(source,{filename:'sim-lab-instructions.jsx',babelrc:false,configFile:false,presets:[gui.resolve('@babel/preset-react')],plugins:[gui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const module={exports:{}};
new Function('require','module','exports',code)(name=>name==='./sim-lab-instructions-text.js'?{INSTRUCTIONS_TEXT}:gui(name),module,module.exports);
const Panel=module.exports.default;
const flush=fn=>act(async()=>{fn?.();await Promise.resolve();await Promise.resolve();});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

async function mount(status='ready') {
 const launcher=document.createElement('button');launcher.textContent='Building instructions';document.body.appendChild(launcher);launcher.focus();
 const container=document.createElement('div');document.body.appendChild(container);
 const drawing=deferred(),canvas=document.createElement('canvas');let closes=0;
 const lib={CATALOG:{},buildSteps:()=>({source:'meta',groups:[],steps:[0,1].map(()=>({parts:[],attach:[]}))}),
 fetchModelDrawing:()=>drawing.promise,parseLDConfig:()=>({}),createInstructionsView:()=>({canvas,resize(){},show(){},dispose(){}}),
 createPartThumbnails:()=>null,partsList:()=>[]};
 await flush(()=>{ReactDOM.render(React.createElement(Panel,{lib,model:{parts:[]},locale:'en',onClose:()=>{closes++;}}),container);});
 if(status==='ready')await flush(()=>drawing.resolve({read:()=>''}));
 if(status==='failed')await flush(()=>drawing.reject(Error('drawing failed')));
 const byId=id=>container.querySelector(`[data-testid="bw-sim-instructions${id?'-'+id:''}"]`);
 const key=(key,shiftKey=false)=>{const event=new window.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true});document.activeElement.dispatchEvent(event);return event;};
 return{container,launcher,byId,key,get closes(){return closes;},close:()=>flush(()=>{ReactDOM.unmountComponentAtNode(container);container.remove();}),cleanup:()=>launcher.remove()};
}

test('dialog receives initial focus and Tab wraps enabled controls in both directions',async()=>{
 const v=await mount();
 try {
  assert.equal(document.activeElement,v.byId(''));assert.equal(v.byId('prev').disabled,true);
  let event=v.key('Tab');assert.equal(event.defaultPrevented,true);assert.equal(document.activeElement,v.byId('close'));
  event=v.key('Tab',true);assert.equal(event.defaultPrevented,true);assert.equal(document.activeElement,v.byId('print'));
  event=v.key('Tab');assert.equal(event.defaultPrevented,true);assert.equal(document.activeElement,v.byId('close'));
  event=v.key('Tab');assert.equal(event.defaultPrevented,false,'browser retains ordinary interior tab order');
  v.byId('next').focus();event=v.key('Tab',true);assert.equal(event.defaultPrevented,false,'disabled Previous is skipped by native tab order');
 }finally{await v.close();v.cleanup();}
});
test('loading and failed dialogs keep keyboard focus on their only enabled Close button',async()=>{
 for(const status of ['loading','failed']) {
  const v=await mount(status);
  try {
   assert.equal(v.byId('print').disabled,true);assert.equal(v.byId('next').disabled,true);
   v.byId('close').focus();assert.equal(v.key('Tab').defaultPrevented,true);assert.equal(document.activeElement,v.byId('close'));
   assert.equal(v.key('Tab',true).defaultPrevented,true);assert.equal(document.activeElement,v.byId('close'));
  }finally{await v.close();v.cleanup();}
 }
});
test('when no button can be focused, Tab remains on the dialog',async()=>{
 const v=await mount();
 try {
  for(const button of v.container.querySelectorAll('button'))button.disabled=true;
  assert.equal(v.key('Tab').defaultPrevented,true);assert.equal(document.activeElement,v.byId(''));
  assert.equal(v.key('Tab',true).defaultPrevented,true);assert.equal(document.activeElement,v.byId(''));
 }finally{await v.close();v.cleanup();}
});
test('closing returns owned focus to the still-mounted launcher',async()=>{
 const v=await mount();v.byId('print').focus();await v.close();assert.equal(document.activeElement,v.launcher);v.cleanup();
});
test('closing does not steal focus moved elsewhere or try to focus a removed launcher',async()=>{
 const v=await mount(),outside=document.createElement('button');document.body.appendChild(outside);outside.focus();
 try{await v.close();assert.equal(document.activeElement,outside);}finally{outside.remove();v.cleanup();}
 const w=await mount();w.launcher.remove();await w.close();assert.equal(document.activeElement,document.body);
});
test('arrow, Home, End and Escape shortcuts still work with focus inside controls',async()=>{
 const v=await mount();
 try {
  v.byId('close').focus();await flush(()=>{assert.equal(v.key('ArrowRight').defaultPrevented,true);});assert.equal(v.byId('').getAttribute('data-page'),'1');
  await flush(()=>{v.key('End');});assert.equal(v.byId('').getAttribute('data-page'),'2');
  await flush(()=>{v.key('Home');});assert.equal(v.byId('').getAttribute('data-page'),'0');
  await flush(()=>{v.key('ArrowRight');});await flush(()=>{v.key('ArrowLeft');});assert.equal(v.byId('').getAttribute('data-page'),'0');
  assert.equal(v.key('Escape').defaultPrevented,true);assert.equal(v.closes,1);
 }finally{await v.close();v.cleanup();}
});

test('Tab recovers focus from a disabled button or outside the modal',async()=>{
 const v=await mount();
 try {
  v.byId('print').focus();v.byId('print').disabled=true;
  assert.equal(v.key('Tab').defaultPrevented,true);assert.equal(document.activeElement,v.byId('close'));
  v.launcher.focus();assert.equal(v.key('Tab',true).defaultPrevented,true);assert.equal(document.activeElement,v.byId('next'));
 }finally{await v.close();v.cleanup();}
});
test('a different focused window keeps its focus on Tab and when the modal closes',async()=>{
 const v=await mount(),hasFocus=document.hasFocus;let focused=0;
 try {
  const original=v.launcher.focus;v.launcher.focus=function(){focused++;original.call(this);};
  document.hasFocus=()=>false;
  assert.equal(v.key('Tab').defaultPrevented,false);assert.equal(document.activeElement,v.byId(''));
  await v.close();assert.equal(focused,0,'closing must not focus the launcher behind a print window');
 }finally{document.hasFocus=hasFocus;v.cleanup();}
});
