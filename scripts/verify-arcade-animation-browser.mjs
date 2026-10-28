#!/usr/bin/env node
// Author through the visible Code editor, then run actual Blocks/controller input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
// Let the game run N Arcade frames (about 33 ms each): a wait on the VM's own
// clock, not a wall-clock sleep, so a slow runner cannot cut it short.
const settleFrames=(page,n)=>page.evaluate(n=>new Promise((done,fail)=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const stop=setTimeout(()=>{rt.removeListener('ARCADE_FRAME',f);fail(new Error('no Arcade frames'));},10000);const f=()=>{if(++c>=n){clearTimeout(stop);rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);

const source=`let red=image.create(4,4)
red.fill(2)
let blue=image.create(4,4)
blue.fill(7)
let hero=sprites.create(red,SpriteKind.Player)
let frames=[red,blue]
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){animation.runImageAnimation(hero,frames,100,true)})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){animation.stopAnimation(animation.AnimationTypes.ImageAnimation,hero)})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){hero.x+=10})`;
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
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_runImageAnimation'));
    },null,{timeout:30000});
    await page.evaluate(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        vm.runtime.on('BLOCKS_ERROR',m=>{window.__bwAnimationErrors??=[];window.__bwAnimationErrors.push(String(m));});
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
        return hero?{x:hero.x,pixel:p.arcade_imagePixel({IMAGE:p.arcade_spriteImage({ID:v.hero}),X:0,Y:0}),errors:window.__bwAnimationErrors||[]}:null;
    });
    await page.waitForFunction(()=>Object.keys(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState?.sprites||{}).length>0,null,{timeout:30000});
    // A click's hat runs on the next VM step and the Arcade frame draws on the
    // one after: wait for both before reading what the click changed.
    const settle=(n=3)=>page.evaluate(n=>new Promise(done=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const f=()=>{if(++c>=n){rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);
    const initial=await state();assert.equal(initial.pixel,2);
    await page.getByTestId('bw-arcade-a').click();
    const seen=new Set();for(let i=0;i<20;i++){const s=await state();seen.add(s.pixel);await settleFrames(page,2);}
    assert.ok(seen.has(2)&&seen.has(7),'controller A advances both actual frame images: '+JSON.stringify([...seen]));
    await page.getByTestId('bw-arcade-b').click();await settle();const stopped=await state();
    await settleFrames(page,11);assert.equal((await state()).pixel,stopped.pixel,'controller B stops image playback');
    await page.getByTestId('bw-arcade-right').click();await settle();assert.equal((await state()).x,initial.x+10);
    const rendered=await page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
        const count=index=>{const rgb=palette[index].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let n=0;for(let i=0;i<pixels.length;i+=4)if(rgb.every((v,j)=>pixels[i+j]===v))n++;return n;};
        return {redPixels:count(2),bluePixels:count(7),controllerViewport:!!document.querySelector('[data-testid="bw-arcade-device"] canvas')};
    },ARCADE_PALETTE);
    assert.equal(rendered.redPixels+rendered.bluePixels,144,'actual renderer paints the 4×4 frame at Arcade scale');assert.equal(rendered.controllerViewport,true);
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="bw-code-editor"] .cm-content')?.textContent.includes('arcade animate sprite'),null,{timeout:30000});
    assert.match(await editor.innerText(),/arcade stop animations/);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller pane → From blocks',initial,frameColors:[...seen].sort(),stoppedPixel:stopped.pixel,rendered,final:await state(),errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-animation-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
