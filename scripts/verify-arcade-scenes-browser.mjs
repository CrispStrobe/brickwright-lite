#!/usr/bin/env node
// Author scene transitions through Code and exercise the visible controller and rendered worlds.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SCENES_CONTROLLER_SOURCE} from '../test/fixtures/arcade-scenes.mjs';
// Let the game run N Arcade frames (about 33 ms each): a wait on the VM's own
// clock, not a wall-clock sleep, so a slow runner cannot cut it short.
const settleFrames=(page,n)=>page.evaluate(n=>new Promise((done,fail)=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const stop=setTimeout(()=>{rt.removeListener('ARCADE_FRAME',f);fail(new Error('no Arcade frames'));},10000);const f=()=>{if(++c>=n){clearTimeout(stop);rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);

const source=SCENES_CONTROLLER_SOURCE;
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
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_pushScene'));
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
        const world=vm.runtime.bwArcadeDeviceState;
        return {depth:v.depth,pushEvents:v.pushEvents,parentTicks:v.parentTicks,childTicks:v.childTicks,parentX:world?.sprites[v.parent]?.x,score:world?.score,life:world?.players?.[0]?.life,parentWorldCurrent:world===window.__bwParentWorld,physicalButtonsShared:world?.buttons===window.__bwPhysicalButtons,ids:Object.keys(world?.sprites||{}),errors:window.__bwTerrainErrors||[]};
    });
    const waitDepth=depth=>page.waitForFunction(depth=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='depth' && v.value===depth),depth,{timeout:30000});
    const pixels=()=>page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        return Object.fromEntries([['parent',5],['child',9]].map(([name,color])=>{
            const rgb=palette[color].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let count=0;
            for(let i=0;i<data.length;i+=4)if(rgb.every((v,j)=>data[i+j]===v))count++;
            return [name,count];
        }));
    },ARCADE_PALETTE);
    await waitDepth(0);await settleFrames(page,8);
    await page.evaluate(()=>{window.__bwParentWorld=window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState;window.__bwPhysicalButtons=window.__bwParentWorld.buttons;});
    const initial=await state(),initialPixels=await pixels();assert.equal(initial.parentX,200);assert.equal(initial.score,11);assert.equal(initial.life,7);assert.equal(initialPixels.parent,144);assert.equal(initialPixels.child,0);
    const transitions=[];
    for(let cycle=0;cycle<2;cycle++){
        await page.getByTestId('bw-arcade-a').click();await waitDepth(1);await settleFrames(page,5);
        const child=await state(),childPixels=await pixels();assert.equal(child.parentWorldCurrent,false);assert.equal(child.physicalButtonsShared,true);assert.equal(child.pushEvents,(cycle+1)*2);assert.equal(child.score,33);assert.equal(child.life,4);assert.equal(childPixels.parent,0);assert.equal(childPixels.child,36);
        await page.getByTestId('bw-arcade-a').click();await page.getByTestId('bw-arcade-right').click();await settleFrames(page,8);
        const paused=await state();assert.equal(paused.depth,1);assert.equal(paused.parentTicks,child.parentTicks);assert.ok(paused.childTicks>child.childTicks);assert.deepEqual(paused.ids,child.ids);
        await page.getByTestId('bw-arcade-b').click();await waitDepth(0);await settleFrames(page,5);
        const resumed=await state(),resumedPixels=await pixels();assert.equal(resumed.parentWorldCurrent,true);assert.equal(resumed.physicalButtonsShared,true);assert.equal(resumed.parentX,200+cycle*20);assert.equal(resumed.score,11);assert.equal(resumed.life,7);assert.ok(resumed.parentTicks>paused.parentTicks);assert.deepEqual(resumedPixels,initialPixels);
        await page.getByTestId('bw-arcade-b').click();await settleFrames(page,4);const noExtraPop=await state();assert.equal(noExtraPop.depth,0);assert.equal(noExtraPop.childTicks,resumed.childTicks);assert.deepEqual(noExtraPop.ids,resumed.ids);
        await page.getByTestId('bw-arcade-right').click();await settleFrames(page,5);assert.equal((await state()).parentX,220+cycle*20);
        transitions.push({child,childPixels,paused,resumed,resumedPixels});
    }
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.getByText('Read into all languages — 1 unsupported diagnostic(s) retained in Code.',{exact:true}).waitFor({state:'visible',timeout:30000}).catch(async error=>{console.error(JSON.stringify({editor:await editor.innerText(),errors,body:(await page.locator('body').first().innerText()).slice(-3000)}));throw error;});
    // CodeMirror renders only its viewport; read the document behind the visible editor.
    const decompiled=await editor.evaluate(el=>el.cmTile?.root?.view?.state?.doc?.toString());
    assert.equal(typeof decompiled,'string','full CodeMirror document available');
    assert.match(decompiled,/arcade push scene/);assert.match(decompiled,/arcade pop scene/);assert.match(decompiled,/arcade register button/);assert.match(decompiled,/arcade set life player/);
    if (!(await page.getByTestId('bw-conversion-unsupported').isVisible())) await page.getByTestId('bw-conversion-report').locator('div').first().click();
    const retainedDiagnostics=await page.getByTestId('bw-conversion-unsupported').innerText();
    assert.ok(retainedDiagnostics.includes(imported.unsupported[0]),'UI lists the retained named gap');
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → repeated controller scene push/pop → From blocks',unsupported:imported.unsupported,initial,initialPixels,transitions,retainedDiagnostics,errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-scenes-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
