#!/usr/bin/env node
// Author a huge sprite and verify bounded viewport rendering under panning and camera changes through visible Code/Blocks/controller controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {VIEWPORT_CONTROLLER_SOURCE} from '../test/fixtures/arcade-viewport-controller.mjs';
// Let the game run N Arcade frames (about 33 ms each): a wait on the VM's own
// clock, not a wall-clock sleep, so a slow runner cannot cut it short.
const settleFrames=(page,n)=>page.evaluate(n=>new Promise((done,fail)=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const stop=setTimeout(()=>{rt.removeListener('ARCADE_FRAME',f);fail(new Error('no Arcade frames'));},10000);const f=()=>{if(++c>=n){clearTimeout(stop);rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);

const source=VIEWPORT_CONTROLLER_SOURCE;
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
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_setSpriteScale'));
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
        const actor=world?.sprites[v.actor];
        const target=world?.spriteTargets[v.actor];
        const drawable=vm.runtime.renderer._allDrawables[target?.drawableID];
        const skin=drawable?.skin||drawable?._skin;
        return {skin:skin?.size?Array.from(skin.size):null,left:actor?._fx/256,top:actor?._fy/256,x:actor?.x,y:actor?.y,width:actor?.width,height:actor?.height,sx:actor?.sx,sy:actor?.sy,phase:v.phase,errors:window.__bwTerrainErrors||[]};
    });
    const waitValue=(name,value)=>page.waitForFunction(({name,value})=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')===name && v.value===value),{name,value},{timeout:30000});
    const pixels=()=>page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        return Object.fromEntries([['yellow',5],['blue',9],['red',2],['white',1]].map(([name,color])=>{
            const rgb=palette[color].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let count=0;
            for(let i=0;i<data.length;i+=4)if(rgb.every((v,j)=>data[i+j]===v))count++;
            return [name,count];
        }));
    },ARCADE_PALETTE);
    const expectState=async(expected,count)=>{
        await settleFrames(page,5);
        const actual=await state();
        for(const [key,value] of Object.entries(expected))assert.equal(actual[key],value,key);
        assert.deepEqual(actual.errors,[]);
        assert.deepEqual(actual.skin,[640,480],'actual renderer texture covers only viewport');
        const rendered=await pixels();assert.deepEqual(rendered,count);
        return {state:actual,pixels:rendered};
    };
    const histogram=boundary=>({yellow:boundary*60*9,blue:(160-boundary)*60*9,red:boundary*60*9,white:(160-boundary)*60*9});
    const dimensions={width:32768,height:32768,sx:16384,sy:16384};
    const initial=await expectState({left:-16304,top:-16324,...dimensions,phase:0},histogram(80));
    const cycles=[];
    for(let cycle=0;cycle<2;cycle++){
        const samples={};
        for(const [button,phase,x,boundary] of [
            ['a',1,112,112],['b',2,48,48],['up',3,80,32],
            ['right',4,80,80],['left',5,80,32],['down',0,80,80]
        ]){
            await page.getByTestId('bw-arcade-'+button).click();await waitValue('phase',phase);
            samples[button]=await expectState({left:x-16384,top:-16324,...dimensions,phase},histogram(boundary));
        }
        cycles.push(samples);
    }
    await page.locator('[class*="green-flag_green-flag"]').first().click();
    const restarted=await expectState({left:-16304,top:-16324,...dimensions,phase:0},histogram(80));
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.getByText('Read the current project into all languages. Edit any of them, then “To blocks”.',{exact:true}).waitFor({state:'visible',timeout:30000});
    const decompiled=await editor.evaluate(el=>el.cmTile?.root?.view?.state?.doc?.toString());assert.equal(typeof decompiled,'string');
    assert.match(decompiled,/arcade set scale of/);assert.match(decompiled,/16384/);
    assert.match(decompiled,/arcade center camera x/);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller huge sprite pan/camera/relative/reset → restart → From blocks',unsupported:imported.unsupported,initial,cycles,restarted,errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-viewport-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
