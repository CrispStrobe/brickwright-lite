#!/usr/bin/env node
// Author friction through the visible Code/Blocks editor and real controller buttons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {FRICTION_CONTROLLER_SOURCE} from '../test/fixtures/arcade-friction.mjs';
// Let the game run N Arcade frames (about 33 ms each): a wait on the VM's own
// clock, not a wall-clock sleep, so a slow runner cannot cut it short.
const settleFrames=(page,n)=>page.evaluate(n=>new Promise((done,fail)=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const stop=setTimeout(()=>{rt.removeListener('ARCADE_FRAME',f);fail(new Error('no Arcade frames'));},10000);const f=()=>{if(++c>=n){clearTimeout(stop);rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);

const source=FRICTION_CONTROLLER_SOURCE;
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
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_setSpriteProperty' && ['fx','fy'].includes(b.fields?.PROPERTY?.value)));
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
        const h=world?.sprites[v.horizontal],vertical=world?.sprites[v.vertical];
        return {horizontalX:h?.x,horizontalVx:h?.vx,fx:h?.fx,verticalY:vertical?.y,verticalVy:vertical?.vy,fy:vertical?.fy,horizontalDone:v.horizontalDone,verticalDone:v.verticalDone,horizontalLaunches:v.horizontalLaunches,verticalLaunches:v.verticalLaunches,errors:window.__bwTerrainErrors||[]};
    });
    const waitValue=(name,value)=>page.waitForFunction(({name,value})=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')===name && v.value===value),{name,value},{timeout:30000});
    const pixels=()=>page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        return Object.fromEntries([['horizontal',5],['vertical',9]].map(([name,color])=>{
            const rgb=palette[color].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let count=0;
            for(let i=0;i<data.length;i+=4)if(rgb.every((v,j)=>data[i+j]===v))count++;
            return [name,count];
        }));
    },ARCADE_PALETTE);
    await settleFrames(page,5);
    const initial=await state(),initialPixels=await pixels();
    assert.equal(initial.horizontalX,40);assert.equal(initial.verticalY,90);
    assert.equal(initial.fx,200);assert.equal(initial.fy,200);
    assert.deepEqual(initialPixels,{horizontal:36,vertical:36});
    const cycles=[];
    for(let cycle=0;cycle<2;cycle++){
        await page.getByTestId('bw-arcade-a').click();
        await waitValue('horizontalLaunches',1);await waitValue('horizontalDone',true);
        const stoppedHorizontal=await state();assert.equal(stoppedHorizontal.horizontalVx,0);
        assert.ok(stoppedHorizontal.horizontalX>63 && stoppedHorizontal.horizontalX<67,JSON.stringify(stoppedHorizontal));
        assert.deepEqual(await pixels(),initialPixels);
        await page.getByTestId('bw-arcade-b').click();await waitValue('horizontalDone',false);
        const resetHorizontal=await state();assert.equal(resetHorizontal.horizontalX,40);assert.equal(resetHorizontal.horizontalVx,0);assert.equal(resetHorizontal.horizontalLaunches,0);
        await page.getByTestId('bw-arcade-up').click();
        await waitValue('verticalLaunches',1);await waitValue('verticalDone',true);
        const stoppedVertical=await state();assert.equal(stoppedVertical.verticalVy,0);
        assert.ok(stoppedVertical.verticalY>63 && stoppedVertical.verticalY<67,JSON.stringify(stoppedVertical));
        assert.deepEqual(await pixels(),initialPixels);
        await page.getByTestId('bw-arcade-down').click();await waitValue('verticalDone',false);
        const resetVertical=await state();assert.equal(resetVertical.verticalY,90);assert.equal(resetVertical.verticalVy,0);assert.equal(resetVertical.verticalLaunches,0);
        cycles.push({stoppedHorizontal,resetHorizontal,stoppedVertical,resetVertical});
    }
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.getByText('Read the current project into all languages. Edit any of them, then “To blocks”.',{exact:true}).waitFor({state:'visible',timeout:30000});
    const decompiled=await editor.evaluate(el=>el.cmTile?.root?.view?.state?.doc?.toString());assert.equal(typeof decompiled,'string');
    assert.match(decompiled,/arcade set fx of /);assert.match(decompiled,/arcade set fy of /);assert.match(decompiled,/arcade property vx of /);assert.match(decompiled,/arcade property vy of /);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller horizontal/vertical friction stop/reset → From blocks',unsupported:imported.unsupported,initial,initialPixels,cycles,errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-friction-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
