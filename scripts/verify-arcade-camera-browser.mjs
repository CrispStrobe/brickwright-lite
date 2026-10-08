#!/usr/bin/env node
// Author camera controls through Code and verify real sprite/tile/HUD drawing offsets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {CAMERA_CONTROLLER_SOURCE} from '../test/fixtures/arcade-camera.mjs';
const source=CAMERA_CONTROLLER_SOURCE;
const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,['full terrain collision physics and scene lifecycle are not yet supported']);
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
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_cameraFollowSprite'));
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
        const hero=vm.runtime.bwArcadeDeviceState?.sprites[v.hero],hud=vm.runtime.bwArcadeDeviceState?.sprites[v.hud];
        return hero?{worldX:hero.x,worldY:hero.y,cameraX:v.cameraX,cameraY:v.cameraY,hudX:hud?.x,hudY:hud?.y,errors:window.__bwTerrainErrors||[]}:null;
    });
    await page.waitForFunction(()=>Object.keys(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState?.sprites||{}).length>0,null,{timeout:30000});
    const pixels=()=>page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        const result={};
        for(const [name,color] of [['hero',5],['hud',9],['tile',2]]){
            const rgb=palette[color].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let count=0,left=Infinity,top=Infinity,right=-1,bottom=-1;
            for(let i=0;i<data.length;i+=4)if(rgb.every((v,j)=>data[i+j]===v)){
                const x=(i/4)%copy.width,y=Math.floor(i/4/copy.width);count++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
            }
            result[name]={count,left,top,right,bottom};
        }
        return result;
    },ARCADE_PALETTE);
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='cameraX' && v.value===200),null,{timeout:30000});
    // A click's hat runs on the next VM step and the Arcade frame draws on the
    // one after: wait for both before reading what the click changed.
    const settle=(n=3)=>page.evaluate(n=>new Promise(done=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const f=()=>{if(++c>=n){rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);
    await settle();
    const initial=await state(),initialPixels=await pixels();
    assert.equal(initial.worldX,200);assert.equal(initial.worldY,100);assert.equal(initial.cameraX,200);assert.equal(initial.cameraY,98);
    assert.equal(initialPixels.hero.count,288);assert.equal(initialPixels.hud.count,36);assert.equal(initialPixels.tile.count,432);
    assert.equal(initialPixels.hero.left,234);assert.equal(initialPixels.hero.top,174);
    await page.getByTestId('bw-arcade-right').click();
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='cameraX' && v.value===240),null,{timeout:30000});
    await settle();
    const followed=await state(),followedPixels=await pixels();assert.equal(followed.worldX,240);assert.deepEqual(followedPixels.hero,initialPixels.hero);assert.deepEqual(followedPixels.hud,initialPixels.hud);assert.equal(followedPixels.tile.count,576);assert.equal(followedPixels.tile.left,120);
    await page.getByTestId('bw-arcade-a').click();
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='cameraX' && v.value===180),null,{timeout:30000});
    await settle();
    const centered=await state(),centeredPixels=await pixels();assert.equal(centered.worldX,240);assert.equal(centered.cameraY,100);assert.equal(centeredPixels.hero.left,414);assert.equal(centeredPixels.hero.top,168);assert.deepEqual(centeredPixels.hud,initialPixels.hud);
    await page.getByTestId('bw-arcade-b').click();
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='cameraX' && v.value===200),null,{timeout:30000});
    await settle();
    const reset=await state(),resetPixels=await pixels();assert.equal(reset.worldX,200);assert.deepEqual(resetPixels,initialPixels);
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.getByText('Read into all languages — 1 unsupported diagnostic(s) retained in Code.',{exact:true}).waitFor({state:'visible',timeout:30000});
    // CodeMirror renders only the visible viewport. The large tilemap line can
    // leave callback bodies outside the DOM even though they remain in Code.
    const decompiled=await editor.evaluate(el=>el.cmTile?.root?.view?.state?.doc?.toString());
    assert.equal(typeof decompiled,'string');
    assert.match(decompiled,/arcade center camera x/);assert.match(decompiled,/arcade camera follow sprite/);assert.match(decompiled,/arcade camera property/);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller follow/center/reset → From blocks',unsupported:imported.unsupported,initial,initialPixels,followed,followedPixels,centered,centeredPixels,reset,resetPixels,errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-camera-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
