#!/usr/bin/env node
// The original Pong app stays in the private corpus. Reports contain checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from '../test/helpers/bw-vm.mjs';
import {compile} from './lib/pxt-node.mjs';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const corpus=option('--corpus-dir','/mnt/storage/brickwright-corpora/collected/arcade');
const out=option('--out',path.resolve(import.meta.dirname,'../test-results/arcade-lazy-value-corpus-current.json'));
const file='arcade-6eb701864c2422b8.ts';
const imported=arcadeToPseudocode(fs.readFileSync(path.join(corpus,file),'utf8'));
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(value){
    assert.deepEqual(value.unsupported,[]);
    const run=await runProgram(value.code,{frames:20,uploads:value.costumes,storage:true});
    const deadline=Date.now()+6000;
    const started=()=>!run.vm.runtime.threads.some(t=>t.target.blocks.getBlock(t.topBlock)?.opcode==='event_whenflagclicked');
    while(!started() && Date.now()<deadline){await stepFrames(run.vm,3);await new Promise(done=>setTimeout(done,10));}
    assert.ok(started(),'Pong startup did not complete');assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
async function check(run){
    const val=values(run),state=run.vm.runtime.bwArcadeDeviceState;
    const [player,bot,ball]=[state.sprites[val.player],state.sprites[val.botPlayer],state.sprites[val.ball]];
    assert.ok(player && bot && ball);assert.equal(Object.keys(state.sprites).length,3);
    assert.equal(player.width,32);assert.equal(player.height,32);assert.equal(ball.width,8);
    const set=(id,property,value)=>run.vm.runtime._primitives.arcade_setSpriteProperty({ID:id,PROPERTY:property,VALUE:value});
    const press=async key=>{run.vm.postIOData('keyboard',{key,isDown:true});await stepFrames(run.vm,3);run.vm.postIOData('keyboard',{key,isDown:false});await stepFrames(run.vm,1);};
    set(val.ball,'vy',0);set(val.ball,'vx',0);set(val.ball,'y',60);set(val.player,'x',80);
    await press('ArrowRight');assert.ok(player.x>80);const movedRight=player.x;
    await press('ArrowLeft');assert.ok(player.x<movedRight);
    set(val.player,'x',144);await press('ArrowRight');assert.equal(player.x,144);
    set(val.player,'x',16);await press('ArrowLeft');assert.equal(player.x,16);
    // Force real collisions with each paddle's painted band, rather than
    // changing the game or replacing the overlap/collision implementation.
    set(val.player,'x',80);set(val.ball,'x',80);set(val.ball,'y',112);set(val.ball,'vy',10);
    await stepFrames(run.vm,1);assert.ok(ball.vy<0,JSON.stringify({reason:'player collision must reverse the ball upward',player:{x:player.x,y:player.y,width:player.width,height:player.height},ball:{x:ball.x,y:ball.y,vx:ball.vx,vy:ball.vy},values:values(run),overlap:run.vm.runtime._primitives.arcade_spriteOverlaps({A:val.ball,B:val.player}),threads:run.vm.runtime.threads.map(t=>({status:t.status,stack:t.stack.map(id=>t.target.blocks.getBlock(id)?.opcode)}))}));
    assert.equal(values(run).collisionPaddle,val.player);
    set(val.botPlayer,'x',80);set(val.ball,'x',80);set(val.ball,'y',6);set(val.ball,'vx',0);set(val.ball,'vy',-10);
    await stepFrames(run.vm,1);assert.ok(ball.vy>0,'bot collision must reverse the ball downward');
    assert.equal(values(run).collisionPaddle,val.botPlayer);
    set(val.ball,'y',-8);set(val.ball,'vy',0);await stepFrames(run.vm,1);
    assert.equal(state.score,1);assert.equal(ball.y,30);assert.equal(ball.vy,150);
    assert.deepEqual(run.errors,[]);
    return {sprites:3,controllerMovement:true,leftBoundary:16,rightBoundary:144,playerBounce:'up',botBounce:'down',selectedPaddleIdentity:true,score:1,resetBall:[80,30,0,150]};
}
const run=await execute(imported),native=await check(run);
await check(await execute({...imported,code:run.creator.decompile()}));
const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
await check(await execute(arcadeToPseudocode(exported.ts)));
await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();
const deadline=Date.now()+6000;while(run.vm.runtime.threads.some(t=>t.target.blocks.getBlock(t.topBlock)?.opcode==='event_whenflagclicked') && Date.now()<deadline){await stepFrames(run.vm,3);await new Promise(done=>setTimeout(done,10));}
await check(run);
let browserResult;
if(args.includes('--browser')){
    const {chromium}=await import('playwright');
    const build=path.resolve(import.meta.dirname,'../packages/scratch-gui/build');
    const server=createServer(async(req,res)=>{
        try{
            const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
            const name=path.resolve(build,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
            assert.ok(name.startsWith(build+path.sep));
            const bytes=await fs.promises.readFile(name);
            const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'};
            res.writeHead(200,{'content-type':types[path.extname(name)]||'application/octet-stream'});res.end(bytes);
        }catch{res.writeHead(404);res.end();}
    });
    await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser;
    try{
        browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000}});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.addInitScript(()=>{localStorage.setItem('bw-starter-v1-complete','1');localStorage.setItem('bw-right-pane-hidden','0');});
        await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});
        await page.waitForFunction(()=>!!window.__brickwrightStore?.getState()?.scratchGui?.vm,null,{timeout:60000});
        const bytes=[...new Uint8Array(await(await run.creator.generateSB3()).arrayBuffer())];
        await page.evaluate(async bytes=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            vm.runtime.on('BLOCKS_ERROR',message=>{window.__bwPongErrors??=[];window.__bwPongErrors.push(String(message));});
            await vm.loadProject(Uint8Array.from(bytes));vm.runtime.bwDeviceId='arcade';vm.start();vm.greenFlag();
            localStorage.setItem('bw-debug-dock','arcade');
            window.dispatchEvent(new CustomEvent('bw-settings-change',{detail:{key:'bw-debug-dock',value:'arcade'}}));
        },bytes);
        await page.getByTestId('bw-arcade-right').waitFor({state:'visible',timeout:30000});
        await page.waitForFunction(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            return Object.keys(vm.runtime.bwArcadeDeviceState?.sprites||{}).length===3 && !vm.runtime.threads.some(t=>t.target.blocks.getBlock(t.topBlock)?.opcode==='event_whenflagclicked');
        },null,{timeout:15000});
        const configure=async values=>page.evaluate(values=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            const vars=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,'') ,v.value]));
            for(const [name,property,value] of values)vm.runtime._primitives.arcade_setSpriteProperty({ID:vars[name],PROPERTY:property,VALUE:value});
        },values);
        const playerX=()=>page.evaluate(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            const variable=vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name.replace(/^Game_/,'')==='player');
            return vm.runtime.bwArcadeDeviceState.sprites[variable.value].x;
        });
        await configure([['ball','vx',0],['ball','vy',0],['ball','y',60],['player','x',80]]);
        const hold=async (button,ready)=>{
            const box=await page.getByTestId('bw-arcade-'+button).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
            try{await page.waitForFunction(ready);}finally{await page.mouse.up();}
        };
        await hold('right',()=>Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites).some(s=>s.width===32 && s.y>60 && s.x>80));
        const right=await playerX();assert.ok(right>80);
        await hold('left',()=>Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites).some(s=>s.width===32 && s.y>60 && s.x<=80));assert.ok(await playerX()<right);
        await configure([['player','x',144]]);await page.getByTestId('bw-arcade-right').click();assert.equal(await playerX(),144);
        await configure([['player','x',16]]);await page.getByTestId('bw-arcade-left').click();assert.equal(await playerX(),16);
        await configure([['player','x',80],['ball','x',80],['ball','y',112],['ball','vy',10]]);
        await page.waitForFunction(()=>Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites).some(s=>s.width===8 && s.vy<0));
        await configure([['botPlayer','x',80],['ball','x',80],['ball','y',6],['ball','vx',0],['ball','vy',-10]]);
        await page.waitForFunction(()=>Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites).some(s=>s.width===8 && s.vy>0));
        await configure([['ball','y',-8],['ball','vy',0]]);
        await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.score===1);
        browserResult=await page.evaluate(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;vm.quit();vm.runtime.renderer.draw();
            const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
            let whitePixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>240 && pixels[i+1]>240 && pixels[i+2]>240)whitePixels++;
            return {controllerMovement:true,boundaries:[16,144],paddleBounces:['up','down'],score:vm.runtime.bwArcadeDeviceState.score,whitePixels,errors:window.__bwPongErrors||[]};
        });
        assert.equal(browserResult.score,1);assert.ok(browserResult.whitePixels>100);assert.deepEqual(browserResult.errors,[]);assert.deepEqual(errors,[]);
    }finally{await browser?.close();await new Promise(done=>server.close(done));}
}
const report={generatedAt:new Date().toISOString(),browser:browserResult,cases:[{file,native,code:'pass',sb3:'pass',compile:'pass',makecodeReimport:'pass',scope:'startup, controller steering/bounds, actual collisions with both paddles, scoring and reset'}]};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
