#!/usr/bin/env node
// Author actual sprite scaling and verify dimensions, anchors and rendering through visible Code/Blocks/controller controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SCALING_CONTROLLER_SOURCE} from '../test/fixtures/arcade-scaling-controller.mjs';
// Let the game run N Arcade frames (about 33 ms each): a wait on the VM's own
// clock, not a wall-clock sleep, so a slow runner cannot cut it short.
const settleFrames=(page,n)=>page.evaluate(n=>new Promise((done,fail)=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const stop=setTimeout(()=>{rt.removeListener('ARCADE_FRAME',f);fail(new Error('no Arcade frames'));},10000);const f=()=>{if(++c>=n){clearTimeout(stop);rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);

const source=SCALING_CONTROLLER_SOURCE;
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
        return {x:actor?.x,y:actor?.y,width:actor?.width,height:actor?.height,sx:actor?.sx,sy:actor?.sy,phase:v.phase,errors:window.__bwTerrainErrors||[]};
    });
    const waitValue=(name,value)=>page.waitForFunction(({name,value})=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')===name && v.value===value),{name,value},{timeout:30000});
    const pixels=()=>page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const data=ctx.getImageData(0,0,copy.width,copy.height).data;
        return Object.fromEntries([['actor',5]].map(([name,color])=>{
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
        const rendered=await pixels();assert.deepEqual(rendered,{actor:count});
        return {state:actual,pixels:rendered};
    };
    const initial=await expectState({x:32,y:32,width:4,height:4,sx:1,sy:1,phase:0},144);
    const cycles=[];
    for(let cycle=0;cycle<2;cycle++){
        const samples={};
        for(const [button,phase,expected,count] of [
            ['a',1,{x:32,y:32,width:8,height:8,sx:2,sy:2},576],
            ['b',2,{x:32,y:32,width:8,height:4,sx:2,sy:1},288],
            ['up',3,{x:34,y:34,width:8,height:8,sx:2,sy:2},576],
            ['right',4,{x:31,y:31,width:6,height:6,sx:1.5,sy:1.5},324],
            ['left',5,{x:32,y:32,width:0,height:4,sx:0,sy:1},0],
            ['down',0,{x:32,y:32,width:4,height:4,sx:1,sy:1},144]
        ]){
            await page.getByTestId('bw-arcade-'+button).click();await waitValue('phase',phase);
            samples[button]=await expectState({...expected,phase},count);
        }
        cycles.push(samples);
    }
    await page.locator('[class*="green-flag_green-flag"]').first().click();
    const restarted=await expectState({x:32,y:32,width:4,height:4,sx:1,sy:1,phase:0},144);
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.getByText('Read the current project into all languages. Edit any of them, then “To blocks”.',{exact:true}).waitFor({state:'visible',timeout:30000});
    const decompiled=await editor.evaluate(el=>el.cmTile?.root?.view?.state?.doc?.toString());assert.equal(typeof decompiled,'string');
    assert.match(decompiled,/arcade set scale of/);assert.match(decompiled,/arcade change scale of/);
    assert.match(decompiled,/arcade set sx of/);assert.match(decompiled,/arcade set sy of/);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller uniform/axis/anchor/zero/reset scaling → restart → From blocks',unsupported:imported.unsupported,initial,cycles,restarted,errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-scaling-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
