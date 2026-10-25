import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {extendableControls,extendableLifecycleControls} from './fixtures/arcade-extendable-source-controls.mjs';
function retain(name,value){const root=process.env.BW_EXTENDABLE_EVIDENCE_DIR;if(!root)return;fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify(value));}
for(const[name,source]of Object.entries(extendableControls))test('selected ExtendableSprite original '+name,async()=>{
    retain(name+'-source',{source});
    const result=await runPxtArcade(source,{fakeClock:true,waitForGlobals:{ready:1},onCompilation:record=>retain(name+'-compilation',record)});
    retain(name+'-result',result);
    const value=key=>result[key]??result['Game_'+key];
    if(name==='destroyedUpdate'){
        assert.equal(value('remaining'),0);assert.equal(value('same'),true);
        assert.equal(value('kind'),1000);assert.ok(value('destroyedCalls')>0);
    }else{assert.equal(value('completed'),7);assert.ok(value('before')>0);assert.ok(value('total')>=value('before'));}
});
for(const[name,source]of Object.entries(extendableLifecycleControls))test('selected ExtendableSprite lifecycle '+name,async()=>{
    retain(name+'-source',{source});
    const result=await runPxtArcade(source,{fakeClock:true,waitForGlobals:{ready:1},onCompilation:record=>retain(name+'-compilation',record)});
    retain(name+'-result',result);
    const value=key=>result[key]??result['Game_'+key];
    if(name==='plainRemoval'){assert.equal(value('indefinite'),true);assert.equal(value('plainIndefinite'),true);assert.equal(value('first'),0);assert.equal(value('total'),1);assert.equal(value('remaining'),0);return;}
    if(name==='destroyedScene'){assert.equal(value('sequence'),'UDU');assert.equal(value('total'),2);assert.equal(value('delta'),0);return;}
    assert.ok(value('sequence').startsWith('AB'));assert.ok(value('total')>0);
    if(name==='scenePause'){assert.ok(value('sequence').includes('C'));assert.ok(value('children')>0);}
});
