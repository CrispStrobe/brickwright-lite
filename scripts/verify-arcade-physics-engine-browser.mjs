#!/usr/bin/env node
// Author actual engines/settings and verify distinct memberships through visible Code/Blocks/controller controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {PHYSICS_ENGINE_CONTROLLER_SOURCE} from '../test/fixtures/arcade-physics-engine.mjs';
// Let the game run N Arcade frames (about 33 ms each): a wait on the VM's own
// clock, not a wall-clock sleep, so a slow runner cannot cut it short.
const settleFrames=(page,n)=>page.evaluate(n=>new Promise((done,fail)=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const stop=setTimeout(()=>{rt.removeListener('ARCADE_FRAME',f);fail(new Error('no Arcade frames'));},10000);const f=()=>{if(++c>=n){clearTimeout(stop);rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);

const source=PHYSICS_ENGINE_CONTROLLER_SOURCE;
const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
const build=path.resolve(import.meta.dirname,'../packages/scratch-gui/build');
const server=createServer(async(req,res)=>{
    try{
        const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const name=path.resolve(build,'.'+(url.endsWith('/')?url+'index.html':url));assert.ok(name.startsWith(build+path.sep));
        const bytes=await fs.promises.readFile(name);
        res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'})[path.extname(name)]||'application/octet-stream'});res.end(bytes);
    }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;
try{
    browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('bw-starter-v1-complete','1');localStorage.setItem('bw-right-pane-hidden','0');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>!!window.__brickwrightStore?.getState()?.scratchGui?.vm,null,{timeout:60000});
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    const editor=page.locator('[data-testid="bw-code-editor"] .cm-content');
    await editor.waitFor({state:'visible',timeout:30000});await editor.fill(imported.code);
    await page.getByRole('button',{name:'⇦ To blocks',exact:true}).click();
    await page.waitForFunction(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_setScenePhysicsEngine'));
    },null,{timeout:30000});
    await page.evaluate(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        vm.runtime.on('BLOCKS_ERROR',m=>{window.__bwTerrainErrors??=[];window.__bwTerrainErrors.push(String(m));});
        vm.runtime.on('ARCADE_RUNTIME_DIAGNOSTIC',issue=>{window.__bwEngineDiagnostic=issue;});
        vm.runtime.on('PROJECT_START',()=>{window.__bwEngineDiagnostic=null;});
        vm.runtime.bwDeviceId='arcade';vm.start();
        localStorage.setItem('bw-debug-dock','arcade');window.dispatchEvent(new CustomEvent('bw-settings-change',{detail:{key:'bw-debug-dock',value:'arcade'}}));
    });
    // Use the app's visible green flag, not an injected program or test scheduler.
    await page.locator('[class*="green-flag_green-flag"]').first().click();
    await page.getByTestId('bw-arcade-a').waitFor({state:'visible',timeout:30000});
    const state=()=>page.evaluate(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const v=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
        const world=vm.runtime.bwArcadeDeviceState;
        const oldActor=world?.sprites[v.oldActor],newActor=world?.sprites[v.newActor];
        return {oldX:oldActor?.x,oldVx:oldActor?.vx,newX:newActor?.x??null,newVx:newActor?.vx??null,phase:v.phase,phaseTicks:v.phaseTicks,freezeX:v.freezeX,capObserved:v.capObserved,replacementObserved:v.replacementObserved,restoredObserved:v.restoredObserved,diagnostic:window.__bwEngineDiagnostic??null,errors:window.__bwTerrainErrors||[]};
    });
    const waitValue=(name,value)=>page.waitForFunction(({name,value})=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')===name && v.value===value),{name,value},{timeout:30000});
    const pixels=()=>page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        return Object.fromEntries([['oldActor',5],['newActor',9]].map(([name,color])=>{
            const rgb=palette[color].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let count=0;
            for(let i=0;i<data.length;i+=4)if(rgb.every((v,j)=>data[i+j]===v))count++;
            return [name,count];
        }));
    },ARCADE_PALETTE);
    await settleFrames(page,5);
    const initial=await state(),initialPixels=await pixels();assert.equal(initial.oldX,20);assert.equal(initial.oldVx,0);assert.equal(initial.newX,null);
    assert.deepEqual(initialPixels,{oldActor:324,newActor:0});
    const cycles=[];
    for(let cycle=0;cycle<2;cycle++){
        await page.getByTestId('bw-arcade-a').click();await waitValue('capObserved',40);
        const capped=await state();assert.equal(capped.phase,1);assert.equal(capped.capObserved,40);assert.ok(capped.oldX>20);assert.ok(capped.oldX<65);
        await page.getByTestId('bw-arcade-b').click();await waitValue('replacementObserved',true);
        const replaced=await state();assert.equal(replaced.phase,2);assert.equal(replaced.oldX,replaced.freezeX);assert.ok(replaced.newX>82);
        await settleFrames(page,5);const heldOld=await state();assert.equal(heldOld.oldX,replaced.oldX);
        assert.deepEqual(await pixels(),{oldActor:324,newActor:324});
        await page.getByTestId('bw-arcade-up').click();await waitValue('restoredObserved',true);
        const restored=await state();assert.equal(restored.phase,3);assert.equal(restored.newX,restored.freezeX);assert.ok(restored.oldX>20);
        await settleFrames(page,5);const heldNew=await state();assert.equal(heldNew.newX,restored.newX);
        assert.deepEqual(await pixels(),{oldActor:324,newActor:324});
        await page.getByTestId('bw-arcade-down').click();await waitValue('phase',0);
        const reset=await state();assert.equal(reset.oldX,20);assert.equal(reset.oldVx,0);assert.equal(reset.newX,80);assert.equal(reset.newVx,0);
        assert.equal(reset.capObserved,0);assert.equal(reset.replacementObserved,false);assert.equal(reset.restoredObserved,false);
        assert.deepEqual(await pixels(),{oldActor:324,newActor:324});
        cycles.push({capped,replaced,heldOld,restored,heldNew,reset});
    }
    await page.getByTestId('bw-arcade-right').click();await waitValue('phase',4);
    const diagnosticElement=page.getByTestId('bw-arcade-runtime-diagnostic');await diagnosticElement.waitFor({state:'visible',timeout:30000});
    const diagnosed=await state(),diagnosticText=await diagnosticElement.innerText();
    assert.equal(diagnosed.diagnostic.code,'physics-step-no-progress');assert.equal(diagnosed.diagnostic.minStep,4);assert.equal(diagnosed.diagnostic.maxStep,2);
    assert.match(diagnosticText,/minimum step 4 and maximum step 2/);assert.equal(diagnosed.oldX,20);
    await page.getByTestId('bw-arcade-down').click();await waitValue('phase',0);
    await page.locator('[class*="green-flag_green-flag"]').first().click();
    await page.waitForFunction(()=>!document.querySelector('[data-testid="bw-arcade-runtime-diagnostic"]'),null,{timeout:30000});
    await settleFrames(page,5);const restarted=await state();assert.equal(restarted.oldX,20);assert.equal(restarted.newX,null);assert.equal(restarted.diagnostic,null);assert.deepEqual(await pixels(),initialPixels);
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.getByText('Read the current project into all languages. Edit any of them, then “To blocks”.',{exact:true}).waitFor({state:'visible',timeout:30000});
    const decompiled=await editor.evaluate(el=>el.cmTile?.root?.view?.state?.doc?.toString());assert.equal(typeof decompiled,'string');
    assert.match(decompiled,/arcade current scene/);assert.match(decompiled,/arcade create physics engine max speed/);assert.match(decompiled,/arcade set physics engine of scene/);assert.match(decompiled,/arcade set physics engine property maxSpeed/);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller engine cap/replace/restore/reset → actual runtime diagnostic → restart → From blocks',unsupported:imported.unsupported,initial,initialPixels,cycles,diagnosed,diagnosticText,restarted,errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-physics-engine-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
