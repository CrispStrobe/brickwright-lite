#!/usr/bin/env node
// Author terrain callbacks through Code and steer them with the visible controller.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {TERRAIN_EVENTS_CONTROLLER_SOURCE} from '../test/fixtures/arcade-terrain-events.mjs';
// Let the game run N Arcade frames (about 33 ms each): a wait on the VM's own
// clock, not a wall-clock sleep, so a slow runner cannot cut it short.
const settleFrames=(page,n)=>page.evaluate(n=>new Promise((done,fail)=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const stop=setTimeout(()=>{rt.removeListener('ARCADE_FRAME',f);fail(new Error('no Arcade frames'));},10000);const f=()=>{if(++c>=n){clearTimeout(stop);rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);

const source=TERRAIN_EVENTS_CONTROLLER_SOURCE;
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
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_whenRegisteredWall'));
    },null,{timeout:30000});
    await page.evaluate(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        vm.runtime.on('BLOCKS_ERROR',m=>{window.__bwTerrainErrors??=[];window.__bwTerrainErrors.push(String(m));});
        vm.runtime.bwDeviceId='arcade';vm.start();
        localStorage.setItem('bw-debug-dock','arcade');window.dispatchEvent(new CustomEvent('bw-settings-change',{detail:{key:'bw-debug-dock',value:'arcade'}}));
    });
    // Use the app's visible green flag, not an injected program or test scheduler.
    await page.locator('[class*="green-flag_green-flag"]').first().click();
    await page.getByTestId('bw-arcade-a').waitFor({state:'visible',timeout:30000});
    const state=()=>page.evaluate(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const v=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
        const p=vm.runtime._primitives,hero=vm.runtime.bwArcadeDeviceState?.sprites[v.hero];
        return hero?{x:hero.x,wallOrder:v.wallOrder,wallCount:v.wallCount,wallColumn:v.wallColumn,wallRow:v.wallRow,sawContact:v.sawContact,afterPause:v.afterPause,secondSawVelocity:v.secondSawVelocity,tileOrder:v.tileOrder,tileColumn:v.tileColumn,tileRow:v.tileRow,sameLocation:v.sameLocation,pixel:p.arcade_imagePixel({IMAGE:p.arcade_spriteImage({ID:v.hero}),X:0,Y:0}),errors:window.__bwTerrainErrors||[]}:null;
    });
    await page.waitForFunction(()=>Object.keys(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState?.sprites||{}).length>0,null,{timeout:30000});
    const initial=await state();assert.equal(initial.x,20);
    await page.getByTestId('bw-arcade-right').click();
    await page.waitForFunction(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const hero=Object.values(vm.runtime.bwArcadeDeviceState?.sprites||{}).find(s=>s.id && s.kind==='Player');
        const variables=vm.runtime.targets.flatMap(t=>Object.values(t.variables));
        return hero?.x===31 && hero?.vx===0 && variables.some(v=>v.name.replace(/^Game_/,'')==='wallOrder' && v.value==='AB');
    },null,{timeout:30000});
    const blocked=await state();assert.equal(blocked.wallOrder,'AB');assert.equal(blocked.wallCount,1);assert.equal(blocked.wallColumn,4);assert.equal(blocked.wallRow,1);assert.equal(blocked.sawContact,true);assert.equal(blocked.afterPause,true);assert.equal(blocked.secondSawVelocity,true);assert.equal(blocked.tileOrder,'');
    const contact=await page.evaluate(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const hero=Object.values(vm.runtime.bwArcadeDeviceState.sprites).find(s=>s.id && s.kind==='Player');
        return vm.runtime._primitives.arcade_isHittingTile({ID:hero.id,DIRECTION:2});
    });assert.equal(contact,true);
    await page.getByTestId('bw-arcade-a').click();
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='tileOrder' && v.value==='CD'),null,{timeout:30000});
    const overlap=await state();assert.equal(overlap.x,30);assert.equal(overlap.tileOrder,'CD');assert.equal(overlap.tileColumn,3);assert.equal(overlap.tileRow,1);assert.equal(overlap.sameLocation,true);
    await page.getByTestId('bw-arcade-b').click();await settleFrames(page,4);assert.equal((await state()).x,20);
    const rendered=await page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
        const rgb=palette[5].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let count=0;
        for(let i=0;i<pixels.length;i+=4)if(rgb.every((v,j)=>pixels[i+j]===v))count++;
        return {spritePixels:count,controllerViewport:!!document.querySelector('[data-testid="bw-arcade-device"] canvas')};
    },ARCADE_PALETTE);
    assert.equal(rendered.spritePixels,36);assert.equal(rendered.controllerViewport,true);
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="bw-code-editor"] .cm-content')?.textContent.includes('arcade set tilemap data'),null,{timeout:30000});
    assert.match(await editor.innerText(),/arcade register wall kind/);assert.match(await editor.innerText(),/arcade register tile kind/);assert.match(await editor.innerText(),/WHEN arcade wall handler/);assert.match(await editor.innerText(),/WHEN arcade tile handler/);assert.match(await editor.innerText(),/arcade event location/);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller wall callbacks/tile callbacks/reset → From blocks',unsupported:imported.unsupported,initial,blocked,contact,overlap,rendered,final:await state(),errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-terrain-events-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
