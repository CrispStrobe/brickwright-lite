#!/usr/bin/env node
// Run the six pinned corpus sources newly covered by literal-projectile routing.
// Sources stay in the private corpus; the report contains only checks and metrics.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from '../test/helpers/bw-vm.mjs';
import {compile} from './lib/pxt-node.mjs';
const root=path.resolve(import.meta.dirname,'..');
const argv=process.argv.slice(2);
const option=(name,fallback)=>argv.includes(name)?argv[argv.indexOf(name)+1]:fallback;
const corpus=option('--corpus-dir','/mnt/storage/brickwright-corpora/collected/arcade');
const out=option('--out',path.join(root,'test-results/arcade-projectile-corpus-current.json'));
const browserOnly=argv.includes('--browser-only');
const browserMode=argv.includes('--browser')||browserOnly;
const knownIds=['0d9c499cd21d7962','6c81ceceea0c68e3','72d5af269d2426f7','97907e6ffd87ec68','eb2f435cf82b55e2','ed684a4cfd3026bf'];
const ids=[...new Set(option('--ids',knownIds.join(',')).split(','))];
assert.ok(ids.length && ids.every(id=>knownIds.includes(id)),'--ids must select known pinned corpus IDs');
const sprites=run=>Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
const projectileCalls=run=>(run.calls.get('arcade_spawnProjectile')||0)+(run.calls.get('arcade_spawnImageProjectile')||0);
const press=async(run,key,frames=3)=>{run.vm.postIOData('keyboard',{key,isDown:true});await stepFrames(run.vm,frames);run.vm.postIOData('keyboard',{key,isDown:false});};
async function execute(imported){
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
async function check(run,id){
    const controlled=sprites(run).find(s=>s.controller);
    if(controlled){
        const before={x:controlled.x,y:controlled.y};
        run.vm.postIOData('keyboard',{key:'ArrowDown',isDown:true});await press(run,'ArrowRight',3);run.vm.postIOData('keyboard',{key:'ArrowDown',isDown:false});
        assert.ok(controlled.x>before.x);if(id==='eb2f435cf82b55e2')assert.equal(controlled.y,before.y);
        await stepFrames(run.vm,1);assert.equal(controlled.vx,0);if(controlled.controller.vy)assert.equal(controlled.vy,0);
    }
    if(id==='0d9c499cd21d7962'){
        await press(run,'z');const balloon=sprites(run).find(s=>s.kind==='Balloon'),enemy=sprites(run).find(s=>s.kind==='Enemy');assert.ok(balloon&&enemy);
        balloon.x=enemy.x;balloon.y=enemy.y;await stepFrames(run.vm,4);
        assert.ok(projectileCalls(run)>0);assert.ok(sprites(run).some(s=>s.kind==='Projectile'&&(s.flags&7168)===7168));
    }else{
        await stepFrames(run.vm,id==='72d5af269d2426f7'||id==='ed684a4cfd3026bf'?65:35);
        assert.ok(projectileCalls(run)>0,`${id}: projectile creation never executed`);
        if(id==='eb2f435cf82b55e2')assert.ok(sprites(run).some(s=>s.kind==='Ball'));
        if(id==='97907e6ffd87ec68')assert.ok(sprites(run).some(s=>s.kind==='Projectile'&&s.lifespan>2000));
        if(id==='72d5af269d2426f7')assert.ok(projectileCalls(run)>=5);
    }
    return {sprites:sprites(run).length,projectileCalls:projectileCalls(run),controller:!!controlled};
}
const cases=[];const archives=new Map();
if(!browserOnly) for(const id of ids){
    const file=`arcade-${id}.ts`,source=fs.readFileSync(path.join(corpus,file),'utf8');
    const imported=arcadeToPseudocode(source),run=await execute(imported);const native=await check(run,id);
    const textRun=await runProgram(run.creator.decompile(),{frames:3,uploads:imported.costumes,storage:true});assert.deepEqual(textRun.creator.warnings,[]);await check(textRun,id);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const result=await compile('arcade',exported.files);assert.equal(result.success,true,JSON.stringify({file,diagnostics:result.diagnostics}));await check(await execute(arcadeToPseudocode(exported.ts)),id);
    const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());archives.set(id,[...bytes]);
    await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,3);await check(run,id);
    const row={file,importGaps:0,compile:'pass',code:'pass',sb3:'pass',makecodeReimport:'pass',native};cases.push(row);console.log(JSON.stringify(row));
}
if(browserOnly){
    const previous=JSON.parse(fs.readFileSync(out,'utf8'));
    assert.equal(previous.cases?.length,ids.length,'--browser-only requires a completed native verification report');
    assert.deepEqual(previous.cases.map(row=>row.file).sort(),ids.map(id=>`arcade-${id}.ts`).sort(),'the report must match the selected corpus IDs');
    for(const row of previous.cases){assert.equal(row.compile,'pass');assert.equal(row.makecodeReimport,'pass');}
    cases.push(...previous.cases);
    for(const id of ['eb2f435cf82b55e2','ed684a4cfd3026bf'].filter(id=>ids.includes(id))){
        const imported=arcadeToPseudocode(fs.readFileSync(path.join(corpus,`arcade-${id}.ts`),'utf8')),run=await execute(imported);
        archives.set(id,[...new Uint8Array(await(await run.creator.generateSB3()).arrayBuffer())]);
    }
}
let browserCases=[];
if(browserMode){
    const {chromium}=await import('playwright');const build=path.join(root,'packages/scratch-gui/build');
    const server=createServer(async(req,res)=>{
        try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(build,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));assert.ok(file.startsWith(build+path.sep));
            const bytes=await fs.promises.readFile(file);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'};res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);
        }catch{res.writeHead(404);res.end();}
    });await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;
    try{
        browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000},hasTouch:true});const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.addInitScript(()=>{localStorage.setItem('bw-starter-v1-complete','1');localStorage.setItem('bw-right-pane-hidden','0');});
        await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>!!window.__brickwrightStore?.getState()?.scratchGui?.vm,null,{timeout:60000});
        const cdp=await page.context().newCDPSession(page);
        for(const id of ['eb2f435cf82b55e2','ed684a4cfd3026bf'].filter(id=>ids.includes(id))){
            await page.evaluate(async bytes=>{const vm=window.__brickwrightStore.getState().scratchGui.vm;await vm.loadProject(Uint8Array.from(bytes));vm.runtime.bwDeviceId='arcade';vm.start();vm.greenFlag();localStorage.setItem('bw-debug-dock','arcade');window.dispatchEvent(new CustomEvent('bw-settings-change',{detail:{key:'bw-debug-dock',value:'arcade'}}));},archives.get(id));
            await page.getByTestId('bw-arcade-right').waitFor({state:'visible',timeout:30000});
            await page.waitForFunction(()=>Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState?.sprites||{}).some(s=>s.controller),null,{timeout:15000});
            const before=await page.evaluate(()=>{const vm=window.__brickwrightStore.getState().scratchGui.vm;vm.quit();const s=Object.values(vm.runtime.bwArcadeDeviceState.sprites).find(s=>s.controller);return{x:s.x,y:s.y};});
            // Exercise the actual controller pane buttons, then advance fixed frames.
            const right=await page.getByTestId('bw-arcade-right').boundingBox(),down=await page.getByTestId('bw-arcade-down').boundingBox();assert.ok(right&&down);
            await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:right.x+right.width/2,y:right.y+right.height/2,id:1},{x:down.x+down.width/2,y:down.y+down.height/2,id:2}]});
            const after=await page.evaluate(async()=>{const vm=window.__brickwrightStore.getState().scratchGui.vm;for(let i=0;i<3;i++){vm.runtime._step();await new Promise(done=>setTimeout(done,0));}const s=Object.values(vm.runtime.bwArcadeDeviceState.sprites).find(s=>s.controller);return{x:s.x,y:s.y,vx:s.vx,vy:s.vy};});
            await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
            assert.ok(after.x>before.x);if(id==='eb2f435cf82b55e2')assert.equal(after.y,before.y);else assert.ok(after.y>before.y);
            const rendered=await page.evaluate(async()=>{const vm=window.__brickwrightStore.getState().scratchGui.vm;for(let i=0;i<70;i++){vm.runtime._step();await new Promise(done=>setTimeout(done,0));}
                const deadline=performance.now()+5000;while(Object.values(vm.runtime.bwArcadeDeviceState.spriteTargets).some(t=>vm.runtime.renderer._allDrawables[t.drawableID]?.skin?._svgImageLoaded===false)&&performance.now()<deadline)await new Promise(done=>requestAnimationFrame(done));vm.runtime.renderer.draw();
                const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const p=ctx.getImageData(0,0,copy.width,copy.height).data;let colored=0;for(let i=0;i<p.length;i+=4)if(p[i]||p[i+1]||p[i+2])colored++;
                const all=Object.values(vm.runtime.bwArcadeDeviceState.sprites);return{colored,sprites:all.length,projectile:all.some(s=>s.kind==='Ball'||s.kind==='Enemy'),palette:vm.runtime.getBlocksXML().some(c=>c.xml?.includes('arcade_controlSprite'))};});
            assert.ok(rendered.colored>100);assert.equal(rendered.projectile,true);assert.equal(rendered.palette,true);browserCases.push({file:`arcade-${id}.ts`,before,after,...rendered});
        }
        assert.deepEqual(errors,[]);
    }finally{await browser?.close();await new Promise(done=>server.close(done));}
}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({schema:'brickwright/arcade-projectile-verification/v1',generatedAt:new Date().toISOString(),cases,browserCases},null,2)+'\n');console.log(JSON.stringify({cases:cases.length,browserCases,report:out}));
