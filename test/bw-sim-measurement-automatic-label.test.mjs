// SPDX-License-Identifier: BSD-3-Clause
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const gui=createRequire(process.env.BW_INTEGRATED_ROOT?pathToFileURL(resolve(process.env.BW_INTEGRATED_ROOT,'package.json')):new URL('../packages/scratch-gui/package.json',import.meta.url));
const React=gui('react'),babel=gui('@babel/core'),jsdom=gui('jsdom');
const document=jsdom.JSDOM?new jsdom.JSDOM('<!doctype html><body></body>').window.document:jsdom.jsdom('<!doctype html><body></body>');
globalThis.window=document.defaultView;globalThis.document=document;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
window.requestAnimationFrame=callback=>setTimeout(callback,0);window.cancelAnimationFrame=clearTimeout;
const channel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
const ReactDOM=gui('react-dom'),{act,Simulate}=gui('react-dom/test-utils');
after(()=>{window.close();globalThis.MessageChannel=channel;});
import * as schema from '../overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js';
import * as readings from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import * as targetContext from '../overlay/scratch-gui/src/lib/bw-sim/measurements/target-context.js';
import * as history from '../overlay/scratch-gui/src/lib/bw-sim/measurements/history.js';
import * as experiments from '../overlay/scratch-gui/src/lib/bw-sim/measurements/experiments.js';
import * as inspection from '../overlay/scratch-gui/src/lib/bw-sim/measurements/inspection.js';
import * as recording from '../overlay/scratch-gui/src/lib/bw-sim/measurements/recording.js';
import * as controlPairs from '../overlay/scratch-gui/src/lib/bw-sim/measurements/control-pairs.js';
import * as rolePresets from '../overlay/scratch-gui/src/lib/bw-sim/measurements/role-presets.js';

const loadJSX = name => {
    const source = readFileSync(new URL(`../overlay/scratch-gui/src/components/tw-pseudocode/${name}`, import.meta.url), 'utf8');
    const code = babel.transformSync(source, {filename: name, babelrc: false, configFile: false,
        presets: [gui.resolve('@babel/preset-react')], plugins: [gui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
    const module = {exports: {}};
    new Function('require', 'module', 'exports', code)(name => name.endsWith('/measurements/schema.js') ? schema :
        name.endsWith('/measurements/readings.js') ? readings : name.endsWith('/measurements/target-context.js') ? targetContext :
            name.endsWith('/measurements/history.js') ? history : name.endsWith('/measurements/recording.js') ? recording :
                name.endsWith('/measurements/experiments.js') ? experiments : name.endsWith('/measurements/inspection.js') ? inspection :
                name.endsWith('/measurements/control-pairs.js') ? controlPairs : name.endsWith('/measurements/role-presets.js') ? rolePresets :
                ['./sim-lab-measurement-plot.jsx', './sim-lab-measurement-recorder.jsx', './sim-lab-physics-inspector.jsx',
                    './sim-lab-control-pair.jsx', './sim-lab-measurement-precision.jsx'].includes(name) ? loadJSX(name.slice(2)) : gui(name), module, module.exports);
    return module.exports;
};
const Panel = loadJSX('sim-lab-measurements.jsx').default;

const words=loadJSX('sim-lab-measurements.jsx').measurementWords;
const flush=fn=>act(async()=>{fn?.();await Promise.resolve();});
async function mount(locale='en') {
 const container=document.createElement('div');document.body.appendChild(container);
 let props={locale,definitions:[],rows:[],parts:[{id:'a',label:'Axle'},{id:'b',label:'Wheel'}],mechanism:{joints:[],couplings:[]},
 shown:false,replaying:false,onControlPair(){},onClearControlPair(){},modelKey:'0 Test model',onShown(){},onPresets(){},onClose(){},
 onChange:definitions=>{props={...props,definitions};render();}};
 const render=()=>{ReactDOM.render(React.createElement(Panel,props),container);};
 await flush(render);
 const form=()=>container.querySelector('form');
 return{container,get definitions(){return props.definitions;},
 locale:value=>flush(()=>{props={...props,locale:value};render();}),
 submit:()=>flush(()=>Simulate.submit(form())),
 name:()=>form().querySelector('input[maxlength]'),
 label:value=>flush(()=>Simulate.change(form().querySelector('input[maxlength]'),{target:{value}})),
 kind:value=>flush(()=>Simulate.change(container.querySelector('[data-testid="bw-sim-lab-measurement-kind"]'),{target:{value}})),
 edit:()=>flush(()=>Simulate.click(container.querySelector('[data-testid^="bw-sim-lab-measurement-edit-"]'))),
 row:()=>container.querySelector('[data-testid="bw-sim-lab-measurement-custom-1"]'),
 close:()=>flush(()=>{ReactDOM.unmountComponentAtNode(container);container.remove();})};
}

test('new blank names keep automatic identity and follow English/German display locales',async()=>{
 for(const initial of ['en','de']) {
  const v=await mount(initial);
  try {
   await v.submit();assert.equal(v.definitions[0].label,'distance');assert.equal(v.definitions[0].id,'custom-1');
   assert.deepEqual(schema.measurementDefinitions(JSON.parse(JSON.stringify(v.definitions))),v.definitions);
   assert.equal(v.row().querySelector('label').textContent,words(initial).kinds.distance);
   const other=initial==='en'?'de':'en';await v.locale(other);
   assert.equal(v.row().querySelector('label').textContent,words(other).kinds.distance);
   await v.edit();assert.equal(v.name().value,words(other).kinds.distance);
   await v.locale(initial);assert.equal(v.name().value,words(initial).kinds.distance);
   await v.submit();assert.equal(v.definitions.length,1);assert.equal(v.definitions[0].label,'distance');
  }finally{await v.close();}
 }
});
test('automatic names follow a changed measurement kind when edited and saved',async()=>{
 const v=await mount();
 try {
  await v.submit();await v.edit();await v.kind('mass');assert.equal(v.name().value,words('en').kinds.mass);
  await v.locale('de');assert.equal(v.name().value,words('de').kinds.mass);
  await v.submit();assert.equal(v.definitions[0].kind,'mass');assert.equal(v.definitions[0].label,'mass');
  assert.equal(v.row().querySelector('label').textContent,words('de').kinds.mass);
 }finally{await v.close();}
});
test('typed names, including text matching a translated default, remain authored across locales and edits',async()=>{
 for(const label of ['My axle span',words('en').kinds.distance]) {
  const v=await mount();
  try {
   await v.label(label);await v.submit();assert.equal(v.definitions[0].label,label);
   await v.locale('de');assert.equal(v.row().querySelector('label').textContent,label);
   await v.edit();assert.equal(v.name().value,label);await v.kind('mass');assert.equal(v.name().value,label);
   await v.submit();assert.equal(v.definitions[0].label,label);assert.equal(v.definitions[0].kind,'mass');
  }finally{await v.close();}
 }
});
test('whitespace-only new names use the automatic token while typed names are trimmed',async()=>{
 const v=await mount('de');
 try{await v.label('   ');await v.submit();assert.equal(v.definitions[0].label,'distance');
  await v.label('  My distance  ');await v.submit();assert.equal(v.definitions[1].label,'My distance');
 }finally{await v.close();}
});
