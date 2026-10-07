#!/usr/bin/env node
// Author fast crossings and pixel-mask tests through the visible Code/Blocks editor and controller.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {MULTI_PHYSICS_CONTROLLER_SOURCE} from '../test/fixtures/arcade-multi-physics.mjs';
const source=MULTI_PHYSICS_CONTROLLER_SOURCE;
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
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_spriteOverlaps'));
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
        return {moverX:world?.sprites[v.mover]?.x,moverVx:world?.sprites[v.mover]?.vx,targetX:world?.sprites[v.target]?.x,fastOverlapSeen:v.fastOverlapSeen,endFrameTouching:v.endFrameTouching,passes:v.passes,pixelMaskTouch:v.pixelMaskTouch,errors:window.__bwTerrainErrors||[]};
    });
    const waitValue=(name,value)=>page.waitForFunction(({name,value})=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')===name && v.value===value),{name,value},{timeout:30000});
    const pixels=()=>page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        return Object.fromEntries([['mover',5],['target',9],['diagonal',7],['antiDiagonal',2]].map(([name,color])=>{
            const rgb=palette[color].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let count=0;
            for(let i=0;i<data.length;i+=4)if(rgb.every((v,j)=>data[i+j]===v))count++;
            return [name,count];
        }));
    },ARCADE_PALETTE);
    await waitValue('pixelMaskTouch',false);await page.waitForTimeout(150);
    const initial=await state(),initialPixels=await pixels();assert.equal(initial.moverX,60);assert.equal(initial.targetX,68);assert.equal(initial.passes,0);
    assert.deepEqual(initialPixels,{mover:36,target:36,diagonal:18,antiDiagonal:18});
    const passes=[];
    for(let cycle=0;cycle<2;cycle++){
        await page.getByTestId('bw-arcade-a').click();await waitValue('passes',cycle+1);
        const passed=await state(),passedPixels=await pixels();assert.equal(passed.fastOverlapSeen,true);assert.equal(passed.endFrameTouching,false);assert.equal(passed.moverVx,0);assert.ok(passed.moverX>passed.targetX+2);assert.deepEqual(passedPixels,initialPixels);
        await page.getByTestId('bw-arcade-b').click();await waitValue('fastOverlapSeen',false);const reset=await state();assert.equal(reset.moverX,60);assert.equal(reset.moverVx,0);assert.deepEqual(await pixels(),initialPixels);
        passes.push({passed,passedPixels,reset});
    }
    await page.getByTestId('bw-arcade-up').click();await waitValue('pixelMaskTouch',true);const touching=await state(),touchingPixels=await pixels();assert.equal(touchingPixels.diagonal,9);assert.equal(touchingPixels.antiDiagonal,18);
    await page.getByTestId('bw-arcade-down').click();await waitValue('pixelMaskTouch',false);const disjoint=await state(),disjointPixels=await pixels();assert.deepEqual(disjointPixels,initialPixels);
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.getByText('Read the current project into all languages. Edit any of them, then “To blocks”.',{exact:true}).waitFor({state:'visible',timeout:30000});
    const decompiled=await editor.evaluate(el=>el.cmTile?.root?.view?.state?.doc?.toString());assert.equal(typeof decompiled,'string');
    assert.match(decompiled,/arcade event/);assert.match(decompiled,/arcade [^\n]* overlaps /);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller fast crossings/reset/pixel masks → From blocks',unsupported:imported.unsupported,initial,initialPixels,passes,touching,touchingPixels,disjoint,disjointPixels,errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-multi-physics-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
