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
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function popup(options={}) {
 const calls=[];return {calls,closed:false,document:{images:[],open(){calls.push('open');},write(html){calls.push(html);},close(){calls.push('document.close');}},
 focus(){calls.push('focus');},print(){calls.push('print');},close(){this.closed=true;calls.push('close');},...options};
}
async function mount(locale='en') {
 const container=document.createElement('div');document.body.appendChild(container);
 const images=[],pages=[],canvas=document.createElement('canvas');let instance;
 const view={canvas,resize(){},show(){},dispose(){},image(i,w,h){images.push([i,w,h]);return 'image-'+i;}};
 const lib={CATALOG:{},DEFAULT_COLOR:0,buildSteps:()=>({source:'meta',groups:[],steps:[0,1].map(()=>({parts:[],attach:[]}))}),
 fetchModelDrawing:async()=>({read:()=>''}),parseLDConfig:()=>({}),createInstructionsView:()=>view,createPartThumbnails:()=>({dispose(){},render:()=>null}),
 partsList:()=>[{part:'pin.dat',color:0,count:2,name:{en:'Pin',de:'Pin'}}],instructionsPrintHtml:page=>{pages.push(page);return '<html>all pages</html>';}};
 await flush(()=>{ReactDOM.render(React.createElement(Panel,{ref:ref=>{instance=ref;},lib,model:{parts:[]},locale,onClose(){}}),container);});
 const button=()=>container.querySelector('[data-testid="bw-sim-instructions-print"]');
 assert.equal(button().disabled,false);
 return{container,view,lib,images,pages,instance,button,click:()=>flush(()=>Simulate.click(button())),
 message:()=>container.querySelector('[role="alert"]'),close:()=>flush(()=>{ReactDOM.unmountComponentAtNode(container);container.remove();})};
}

test('drawing failure is localized, closes failed popup, and retries complete pages and BOM',async()=>{
 for(const locale of ['en','de']) {
  const v=await mount(locale),bad=popup(),good=popup();let attempts=0;
  window.open=()=>++attempts===1?bad:good;
  const image=v.view.image;v.view.image=()=>{throw Error('lost renderer');};
  try {
   await v.click();assert.equal(bad.closed,true);assert.equal(v.button().disabled,false);
   assert.equal(v.message().textContent,INSTRUCTIONS_TEXT[locale].printFailed);
   assert.equal(v.container.querySelector('[data-testid="bw-sim-instructions"]').getAttribute('data-status'),'ready');
   v.view.image=image;await v.click();assert.equal(v.message(),null);assert.equal(good.closed,false);
   assert.deepEqual(v.images,[[0,1200,800],[1,1200,800]]);
   assert.deepEqual(v.pages[0].steps.map(s=>s.image),['image-0','image-1']);assert.equal(v.pages[0].bom[0].count,2);
   assert.equal(v.pages[0].lang,locale);assert.deepEqual(good.calls,['open','<html>all pages</html>','document.close','focus','print']);
  }finally{await v.close();}
 }
});
test('rendering and browser failures all permit another attempt, including non-Error throws',async()=>{
 for(const stage of ['open','rows','html','document.open','write','document.close','focus','print','cleanup']) {
  const v=await mount(),bad=popup();let restore=()=>{};
  if(stage==='open')window.open=()=>{throw null;};
  else {
   const fail=()=>{throw 'print failure';};
   if(stage==='rows'||stage==='html') {
    const key=stage==='rows'?'partsList':'instructionsPrintHtml',original=v.lib[key];
    v.lib[key]=fail;restore=()=>{v.lib[key]=original;};
   }else if(stage.startsWith('document.'))bad.document[stage.slice('document.'.length)]=fail;
   else if(stage==='write')bad.document.write=fail;
   else if(stage==='cleanup'){bad.document.write=fail;bad.close=fail;}
   else bad[stage]=fail;
   window.open=()=>bad;
  }
  try {
   await v.click();assert.equal(v.button().disabled,false);assert.match(v.message().textContent,/try Print again/);
   if(stage!=='open'&&stage!=='cleanup')assert.equal(bad.closed,true);
   restore();const good=popup();window.open=()=>good;await v.click();assert.ok(good.calls.includes('print'));assert.equal(v.message(),null);
  }finally{restore();await v.close();}
 }
});
test('blocked popup keeps its existing guidance and can be retried',async()=>{
 const v=await mount();window.open=()=>null;
 try{await v.click();assert.equal(v.message().textContent,INSTRUCTIONS_TEXT.en.printBlocked);assert.equal(v.button().disabled,false);
  const good=popup();window.open=()=>good;await v.click();assert.ok(good.calls.includes('print'));}finally{await v.close();}
});
test('image decoding waits, prevents duplicate calls, and tolerates rejected image decode',async()=>{
 const v=await mount(),pending=deferred(),win=popup();let opens=0;
 win.document.images=[{decode:()=>pending.promise},{decode:()=>Promise.reject(Error('image unavailable'))},{}];window.open=()=>{opens++;return win;};
 try {
  await v.click();assert.equal(v.button().disabled,true);assert.ok(!win.calls.includes('print'));
  const duplicate=v.instance.printAll();await duplicate;assert.equal(opens,1);
  await flush(()=>pending.resolve());assert.equal(v.button().disabled,false);assert.ok(win.calls.includes('print'));
 }finally{await v.close();}
});
test('unmount closes pending popup and late decoding cannot print or publish state',async()=>{
 const v=await mount(),pending=deferred(),win=popup(),errors=[],original=console.error;
 win.document.images=[{decode:()=>pending.promise}];window.open=()=>win;console.error=(...args)=>errors.push(args);
 try{await v.click();await v.close();assert.equal(win.closed,true);await flush(()=>pending.resolve());assert.ok(!win.calls.includes('print'));assert.deepEqual(errors,[]);}
 finally{console.error=original;}
});
test('user closing pending popup does not invoke browser print',async()=>{
 const v=await mount(),pending=deferred(),win=popup();win.document.images=[{decode:()=>pending.promise}];window.open=()=>win;
 try{await v.click();win.close();await flush(()=>pending.resolve());assert.equal(v.button().disabled,false);assert.ok(!win.calls.includes('print'));}
 finally{await v.close();}
});
