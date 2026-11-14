// SPDX-License-Identifier: BSD-3-Clause
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const requireGui=createRequire(process.env.BW_INTEGRATED_ROOT?
    pathToFileURL(resolve(process.env.BW_INTEGRATED_ROOT,'package.json')):new URL('../packages/scratch-gui/package.json',import.meta.url));
const React=requireGui('react'),babel=requireGui('@babel/core'),jsdom=requireGui('jsdom');
const document=jsdom.JSDOM?new jsdom.JSDOM('<!doctype html><body></body>').window.document:jsdom.jsdom('<!doctype html><body></body>');
globalThis.window=document.defaultView;globalThis.document=document;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
window.requestAnimationFrame=callback=>setTimeout(callback,0);window.cancelAnimationFrame=clearTimeout;
// Node exposes MessageChannel, unlike this DOM fixture; use the scheduler's timer fallback.
const messageChannel=globalThis.MessageChannel;globalThis.MessageChannel=undefined;
const ReactDOM=requireGui('react-dom'),{act,Simulate}=requireGui('react-dom/test-utils');
globalThis.MessageChannel=messageChannel;
const source=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-measurement-precision.jsx',import.meta.url),'utf8');
const code=babel.transformSync(source,{filename:'sim-lab-measurement-precision.jsx',babelrc:false,configFile:false,
    presets:[requireGui.resolve('@babel/preset-react')],plugins:[requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const module={exports:{}};new Function('require','module','exports',code)(requireGui,module,module.exports);
const {PrecisionThresholdInput:Input,default:Panel}=module.exports;
after(()=>window.close());
function mounted(Component,initial) {
    const container=document.createElement('div');document.body.appendChild(container);
    let props=initial,instance;
    const render=next=>{props={...props,...next};act(()=>{instance=ReactDOM.render(React.createElement(Component,props),container);});};
    render({});
    return {container,get instance(){return instance;},get input(){return container.querySelector('input');},render,
        change(value){const input=container.querySelector('input');act(()=>{input.value=value;Simulate.change(input);});},
        blur(){act(()=>Simulate.blur(container.querySelector('input')));},
        close(){act(()=>{ReactDOM.unmountComponentAtNode(container);});container.remove();}};
}
function input(value=7) {
    const changes=[];const view=mounted(Input,{value,disabled:false,onCommit:v=>changes.push(v)});
    return {...view,get instance(){return view.instance;},get input(){return view.input;},changes};
}

test('clearing and incomplete numeric prefixes stay local instead of publishing zero',()=>{
    for(const prefix of ['', '-', '.', '1e']) {
        const v=input();try {
            v.change(prefix);assert.equal(v.instance.state.draft,v.input.value);
            assert.notEqual(v.input.value,'0','old jsdom retains prefixes while browsers may sanitize them to empty');
            assert.deepEqual(v.changes,[]);v.blur();assert.equal(v.input.value,'7');assert.deepEqual(v.changes,[]);
        }finally{v.close();}
    }
});

test('negative, fractional and exponent edits commit only after editing finishes',()=>{
    for(const [text,expected] of [['-0.5',-.5],['.5',.5],['-2.75',-2.75],['1e2',100],['0',0]]) {
        const v=input();try {
            v.change('');v.change(text);assert.deepEqual(v.changes,[]);
            v.blur();assert.deepEqual(v.changes,[expected]);assert.equal(Number(v.input.value),expected);
        }finally{v.close();}
    }
});

test('Enter blurs and commits once; Escape restores the existing value before blur',()=>{
    const v=input();try {
        act(()=>v.input.focus());v.change('-4.25');
        act(()=>Simulate.keyDown(v.input,{key:'Enter'}));assert.deepEqual(v.changes,[-4.25]);
        v.blur();act(()=>v.instance.commit());assert.deepEqual(v.changes,[-4.25],'no duplicate before parent prop refresh');
        v.render({value:-4.25});act(()=>v.input.focus());v.change('9');
        act(()=>Simulate.keyDown(v.input,{key:'Escape'}));
        assert.equal(v.input.value,'-4.25');assert.deepEqual(v.changes,[-4.25]);
    }finally{v.close();}
});

test('finite inclusive angle bounds stay unchanged and invalid edits restore the prior value',()=>{
    for(const [text,valid] of [['1000000000',true],['-1000000000',true],['1000000001',false],['-1000000001',false],['Infinity',false],['NaN',false]]) {
        const v=input();try {
            v.change(text);v.blur();assert.deepEqual(v.changes,valid?[Number(text)]:[]);
            assert.equal(Number(v.input.value),valid?Number(text):7);
        }finally{v.close();}
    }
});

test('external values and disabling replace a dirty draft without stale later commits',()=>{
    const v=input();try {
        v.change('-2.5');v.render({value:11});assert.equal(v.input.value,'11');v.blur();assert.deepEqual(v.changes,[]);
        v.change('8');v.render({disabled:true});assert.equal(v.input.value,'11');assert.equal(v.input.disabled,true);
        act(()=>Simulate.change(v.input,{target:{value:'-9'}}));assert.equal(v.instance.state.draft,'11');
        v.render({disabled:false});v.blur();assert.deepEqual(v.changes,[]);assert.equal(v.input.value,'11');
    }finally{v.close();}
});

test('Start commits an unblurred draft synchronously, preserves other options and does not double publish',()=>{
    let options={mode:'rotation',thresholdDegrees:4};const events=[];
    const v=mounted(Panel,{definitions:[],enabled:false,replaying:false,options,
        onOptions:next=>{options=next;events.push(['options',next]);},onToggle:()=>events.push(['start',options.thresholdDegrees])});
    try {
        act(()=>v.input.focus());v.change('-7.5');assert.deepEqual(events,[]);
        v.render({options:{...options,mode:'oscillation'}});assert.equal(v.input.value,'-7.5');
        // Simulated click intentionally does not blur first: Start must commit itself.
        act(()=>Simulate.click(v.container.querySelector('[data-testid="bw-sim-measurement-precision-toggle"]')));
        assert.deepEqual(events,[['options',{mode:'oscillation',thresholdDegrees:-7.5}],['start',-7.5]]);
        v.blur();assert.equal(events.length,2);
    }finally{v.close();}
});

test('analysis/replay disabled states, number semantics and bilingual labels remain',()=>{
    for(const locale of ['en','de'])for(const state of [{enabled:true,replaying:false},{enabled:false,replaying:true}]) {
        const changes=[],v=mounted(Panel,{locale,definitions:[],options:{mode:'oscillation',thresholdDegrees:0},...state,onOptions:x=>changes.push(x)});
        try {
            assert.equal(v.input.type,'number');assert.equal(v.input.step,'any');assert.equal(v.input.disabled,true);
            assert.equal(v.container.querySelector('select').disabled,true);
            assert.equal(v.container.querySelector('button').disabled,state.replaying);
            assert.match(v.container.textContent,locale==='de'?/Winkelschwelle/:/Angle threshold/);
            act(()=>Simulate.change(v.input,{target:{value:'-2'}}));assert.deepEqual(changes,[]);
        }finally{v.close();}
    }
});
