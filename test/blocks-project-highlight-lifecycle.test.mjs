import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';
const source=readFileSync(new URL('../overlay/scratch-gui/src/containers/blocks.jsx',import.meta.url),'utf8');
const events=[['onScriptGlowOn','glowStack',true],['onScriptGlowOff','glowStack',false],
    ['onBlockGlowOn','glowBlock',true],['onBlockGlowOff','glowBlock',false]];
const handlers=new Map(events.map(([name])=>[name,new Function('data',scopeAfter(source,`${name} (data) {`))]));

test('project replacement highlight events cannot reference absent or not-yet-rendered blocks',()=>{
    const calls=[],blocks=new Map([['current',{rendered:true}],['loading',{rendered:false}]]);
    const workspace={getBlockById:id=>blocks.get(id),glowStack:(...args)=>calls.push(['stack',...args]),glowBlock:(...args)=>calls.push(['block',...args])};
    const container={workspace};
    for(const [name] of events){
        handlers.get(name).call(container,{id:'previous-project'});
        handlers.get(name).call(container,{id:'loading'});
    }
    assert.deepEqual(calls,[]);
    blocks.get('loading').rendered=true;
    for(const [name,method,on] of events){
        handlers.get(name).call(container,{id:'loading'});
        assert.deepEqual(calls.at(-1),[method==='glowStack'?'stack':'block','loading',on]);
    }
    assert.equal(calls.length,4,'real rendered events still reach the visual API');
    blocks.clear();
    for(const [name] of events)handlers.get(name).call(container,{id:'loading'});
    assert.equal(calls.length,4,'removed blocks do not receive stale off events');
});

test('highlight events during editor teardown are harmless without masking visual API failures',()=>{
    for(const [name] of events)handlers.get(name).call({workspace:null},{id:'closing'});
    const workspace={getBlockById:()=>({rendered:true}),glowStack(){throw new Error('real rendering failure');},glowBlock(){throw new Error('real rendering failure');}};
    for(const [name] of events)assert.throws(()=>handlers.get(name).call({workspace},{id:'current'}),/real rendering failure/);
});
