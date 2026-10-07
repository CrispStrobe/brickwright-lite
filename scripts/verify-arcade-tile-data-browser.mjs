#!/usr/bin/env node
// Authored source only: test the built GUI's tile rendering and controller path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {TILE_DATA_SOURCE} from '../test/fixtures/arcade-tile-data.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator} from '../test/helpers/bw-vm.mjs';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
const source=TILE_DATA_SOURCE+`
scene.setBackgroundColor(9)
scene.setBackgroundImage(img\`9\`)
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){tiles.placeOnTile(actor,tiles.getTileLocation(2,1))})
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){tiles.setTileAt(tiles.getTileLocation(2,1),red)})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){tiles.setTilemap(null)})`;
const imported=arcadeToPseudocode(source);
const expectedUnsupported=['full terrain collision physics and scene lifecycle are not yet supported'];
assert.deepEqual(imported.unsupported,expectedUnsupported);
const creator=new SB3Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
for(const costume of imported.costumes){
    if(costume.mode==='add')creator.addCustomSVGCostume(costume.sprite,costume.svg,costume.name);
    else creator.applyCustomSVG(costume.sprite,costume.svg);
}
const bytes=[...new Uint8Array(await(await creator.generateSB3()).arrayBuffer())];
const build=path.resolve(import.meta.dirname,'../packages/scratch-gui/build');
const server=createServer(async(req,res)=>{
    try{
        const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const name=path.resolve(build,'.'+(url.endsWith('/')?url+'index.html':url));assert.ok(name.startsWith(build+path.sep));
        const contents=await fs.promises.readFile(name);
        res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'})[path.extname(name)]||'application/octet-stream'});res.end(contents);
    }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;
try{
    browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('bw-starter-v1-complete','1');localStorage.setItem('bw-right-pane-hidden','0');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>!!window.__brickwrightStore?.getState()?.scratchGui?.vm,null,{timeout:60000});
    await page.evaluate(async bytes=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        vm.runtime.on('BLOCKS_ERROR',m=>{window.__bwTileErrors??=[];window.__bwTileErrors.push(String(m));});
        await vm.loadProject(Uint8Array.from(bytes));vm.runtime.bwDeviceId='arcade';vm.start();vm.greenFlag();
        localStorage.setItem('bw-debug-dock','arcade');window.dispatchEvent(new CustomEvent('bw-settings-change',{detail:{key:'bw-debug-dock',value:'arcade'}}));
    },bytes);
    await page.getByTestId('bw-arcade-right').waitFor({state:'visible',timeout:30000});
    await page.waitForFunction(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const v=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(x=>[x.name.replace(/^Game_/,''),x.value]));
        return Number(v.retainedX)===24 && Number(v.snapshotX)===40;
    },null,{timeout:30000});
    await page.getByTestId('bw-arcade-right').click();
    await page.waitForFunction(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const v=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(x=>[x.name.replace(/^Game_/,''),x.value]));
        const actor=vm.runtime.bwArcadeDeviceState?.sprites[v.actor];return actor?.x===40 && actor?.y===24;
    },null,{timeout:30000});
    await page.getByTestId('bw-arcade-a').click();
    await page.waitForFunction(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        return vm.runtime.bwArcadeDeviceState?.tilemap?.indices?.[5]===1;
    },null,{timeout:30000});
    const result=await page.evaluate(async palette=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        await new Promise(r=>setTimeout(r,200));vm.runtime.renderer.draw();
        const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        const rgb=index=>palette[index].match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16));
        const count=index=>{const color=rgb(index);let n=0;for(let i=0;i<data.length;i+=4)if(color.every((v,j)=>v===data[i+j]))n++;return n;};
        const v=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(x=>[x.name.replace(/^Game_/,''),x.value]));
        const actor=vm.runtime.bwArcadeDeviceState.sprites[v.actor],map=vm.runtime.bwArcadeDeviceState.tilemap;
        const pane=document.querySelector('[data-testid="bw-arcade-device"] canvas');
        return {actor:[actor.x,actor.y],tileIndices:[...map.indices],redPixels:count(2),bluePixels:count(7),tileImageSize:[map.image.width,map.image.height],controllerViewport:!!pane,errors:window.__bwTileErrors||[]};
    },ARCADE_PALETTE);
    assert.deepEqual(result.actor,[40,24]);assert.equal(result.tileIndices[5],1);assert.equal(result.redPixels,9,JSON.stringify(result));assert.equal(result.bluePixels,45,JSON.stringify(result));assert.equal(result.controllerViewport,true);assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);
    await page.getByTestId('bw-arcade-b').click();
    await page.waitForFunction(()=>!window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.tilemap,null,{timeout:30000});
    const cleared=await page.evaluate(async palette=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        await new Promise(r=>setTimeout(r,200));vm.runtime.renderer.draw();
        const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        const count=index=>{const color=palette[index].match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16));let n=0;for(let i=0;i<data.length;i+=4)if(color.every((v,j)=>v===data[i+j]))n++;return n;};
        return {tilemapPresent:!!vm.runtime.bwArcadeDeviceState.tilemap,redPixels:count(2),bluePixels:count(7),backgroundPixels:count(9),errors:window.__bwTileErrors||[]};
    },ARCADE_PALETTE);
    assert.equal(cleared.tilemapPresent,false);assert.equal(cleared.redPixels,0);assert.equal(cleared.bluePixels,0);assert.ok(cleared.backgroundPixels>170000,JSON.stringify(cleared));assert.deepEqual(cleared.errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),source:'authored arcade-tile-data fixture',unsupported:imported.unsupported,browser:result,cleared};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-tile-data-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
