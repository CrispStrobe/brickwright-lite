#!/usr/bin/env node
// Keep the original private app in the corpus. Verify startup and directional
// controls and A-button removal/refill at the upper-left boundary.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from '../test/helpers/bw-vm.mjs';
import {compile} from './lib/pxt-node.mjs';
const args=process.argv.slice(2);
const option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const corpus=option('--corpus-dir',process.env.BW_ARCADE_CORPUS||path.resolve(import.meta.dirname,'../../brickwright-firmware-private/compat-corpora/makecode/arcade'));
const out=option('--out',path.resolve(import.meta.dirname,'../test-results/arcade-nested-array-corpus-current.json'));
const file='arcade-70452f7d81ebb459.ts';
const imported=arcadeToPseudocode(fs.readFileSync(path.join(corpus,file),'utf8'));
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(value){
    assert.deepEqual(value.unsupported,[]);
    const run=await runProgram(value.code,{frames:80,uploads:value.costumes,storage:true});
    assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);return run;
}
async function settle(run, ready){
    const deadline=Date.now()+15000;
    while(!ready() && Date.now()<deadline){await stepFrames(run.vm,5);await new Promise(done=>setTimeout(done,10));}
    assert.ok(ready(),JSON.stringify({reason:'game procedure did not finish within the verification deadline',values:values(run),score:run.vm.runtime.bwArcadeDeviceState.score,threads:run.vm.runtime.threads.map(t=>({status:t.status,blocks:t.stack.map(id=>{const b=t.target.blocks.getBlock(id);return {opcode:b?.opcode,fields:b?.fields};}),params:t.stackFrames.map(f=>f.params)})),errors:run.errors}));
}
async function check(run){
    await settle(run,()=>{
        const value=values(run),p=run.vm.runtime._primitives;
        if(value.board?.bwReference?.kind!=='array')return false;
        if(p.arrays_referenceLength({ARRAY:value.board})!==11)return false;
        for(let i=0;i<11;i++){
            if(!p.arrays_referenceTruthy({ARRAY:value.board,INDEX:i}))return false;
            const row=p.arrays_referenceItem({ARRAY:value.board,INDEX:i});
            if(row?.bwReference?.kind!=='array' || p.arrays_referenceLength({ARRAY:row})!==11)return false;
        }
        return !!run.vm.runtime.bwArcadeDeviceState.sprites[value.boardSprite];
    });
    const state=values(run),p=run.vm.runtime._primitives;
    assert.equal(Number(p.arrays_referenceLength({ARRAY:state.board})),11);
    for(let x=0;x<11;x++){
        const row=p.arrays_referenceItem({ARRAY:state.board,INDEX:x});
        assert.equal(Number(p.arrays_referenceLength({ARRAY:row})),11);
        for(let y=0;y<11;y++)assert.ok([0,1,2,3,4].includes(p.arrays_referenceItem({ARRAY:row,INDEX:y})));
    }
    const board=run.vm.runtime.bwArcadeDeviceState.sprites[state.boardSprite];
    assert.equal(board.width,160);assert.equal(board.height,120);
    assert.ok([...board.image.pixels].some(pixel=>pixel!==0),'board drawing must paint actual tiles');
    for(const key of ['ArrowRight','ArrowDown']){
        run.vm.postIOData('keyboard',{key,isDown:true});await stepFrames(run.vm,5);
        run.vm.postIOData('keyboard',{key,isDown:false});await stepFrames(run.vm,5);
    }
    await settle(run,()=>{
        const state=values(run),cursor=run.vm.runtime.bwArcadeDeviceState.sprites[state.cursorSprite];
        return cursor && Math.abs((cursor.x-cursor.width/2)-160/9)<0.5 && Math.abs((cursor.y-cursor.height/2)-120/7)<0.5;
    });
    const after=values(run),cursor=run.vm.runtime.bwArcadeDeviceState.sprites[after.cursorSprite];
    assert.equal(Number(after.curX),1);assert.equal(Number(after.curY),1);
    assert.ok(Math.abs((cursor.x-cursor.width/2)-160/9)<0.5);
    assert.ok(Math.abs((cursor.y-cursor.height/2)-120/7)<0.5);
    // A controlled board makes the matching group and score deterministic.
    // Two tiles touch the upper-left boundary: traversal must short circuit
    // before reading board[-1], and collapse reads undefined then writes -2.
    const row0=p.arrays_referenceItem({ARRAY:after.board,INDEX:0});
    for(let x=0;x<11;x++){
        const row=p.arrays_referenceItem({ARRAY:after.board,INDEX:x});
        for(let y=0;y<11;y++)p.arrays_mutateReference({ARRAY:row,OP:'set',INDEX:y,VALUE:(x+y)%5});
    }
    p.arrays_mutateReference({ARRAY:row0,OP:'set',INDEX:1,VALUE:0});
    for(const target of run.vm.runtime.targets)for(const variable of Object.values(target.variables)){
        if(variable.name.replace(/^Game_/,'')==='curX' || variable.name.replace(/^Game_/,'')==='curY')variable.value=0;
    }
    run.vm.postIOData('keyboard',{key:' ',isDown:true});await stepFrames(run.vm,5);
    run.vm.postIOData('keyboard',{key:' ',isDown:false});
    await settle(run,()=>Number(run.vm.runtime.bwArcadeDeviceState.score)===20);
    for(let x=0;x<11;x++){
        const row=p.arrays_referenceItem({ARRAY:values(run).board,INDEX:x});
        for(let y=0;y<11;y++){
            const value=p.arrays_referenceItem({ARRAY:row,INDEX:y});
            assert.ok([0,1,2,3,4].includes(value),'refill must restore numeric tiles');
            if(x!==0 || y>1)assert.equal(value,(x+y)%5,'unmatched tiles must stay unchanged');
        }
    }
    assert.deepEqual(run.errors,[]);
    return {rows:11,columns:11,numericCells:121,boardImage:[160,120],painted:true,directionalCursor:[1,1],aButton:{cursor:[0,0],matchedTiles:2,score:20,refilled:true,unmatchedPreserved:true}};
}
const run=await execute(imported),native=await check(run);
await check(await execute({...imported,code:run.creator.decompile()}));
const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));await check(await execute(arcadeToPseudocode(exported.ts)));
await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,80);await check(run);
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
            vm.runtime.on('BLOCKS_ERROR',message=>{window.__bwNestedErrors??=[];window.__bwNestedErrors.push(String(message));});
            await vm.loadProject(Uint8Array.from(bytes));vm.runtime.bwDeviceId='arcade';vm.start();vm.greenFlag();
            localStorage.setItem('bw-debug-dock','arcade');
            window.dispatchEvent(new CustomEvent('bw-settings-change',{detail:{key:'bw-debug-dock',value:'arcade'}}));
        },bytes);
        await page.getByTestId('bw-arcade-right').waitFor({state:'visible',timeout:30000});
        await page.waitForFunction(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
            return vm.runtime.bwArcadeDeviceState?.sprites[values.boardSprite]?.image.pixels.some(v=>v!==0);
        },null,{timeout:30000});
        await page.getByTestId('bw-arcade-right').click();await page.getByTestId('bw-arcade-down').click();
        await page.waitForFunction(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
            const cursor=vm.runtime.bwArcadeDeviceState.sprites[values.cursorSprite];
            return Number(values.curX)===1 && Number(values.curY)===1 && Math.abs(cursor.x-cursor.width/2-160/9)<0.5 && Math.abs(cursor.y-cursor.height/2-120/7)<0.5;
        },null,{timeout:30000});
        await page.getByTestId('bw-arcade-left').click();await page.getByTestId('bw-arcade-up').click();
        await page.waitForFunction(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
            return Number(values.curX)===0 && Number(values.curY)===0;
        });
        await page.evaluate(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm,p=vm.runtime._primitives;
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
            for(let x=0;x<11;x++){
                const row=p.arrays_referenceItem({ARRAY:values.board,INDEX:x});
                for(let y=0;y<11;y++)p.arrays_mutateReference({ARRAY:row,OP:'set',INDEX:y,VALUE:x===0 && y===1?0:(x+y)%5});
            }
        });
        await page.getByTestId('bw-arcade-a').click();
        try {
        await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.score===20,null,{timeout:30000});
        } catch(error) {
            const state=await page.evaluate(()=>{
                const vm=window.__brickwrightStore.getState().scratchGui.vm,p=vm.runtime._primitives;
                const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
                return {score:vm.runtime.bwArcadeDeviceState.score,cursor:[values.curX,values.curY],
                    cells:[0,1,2].map(x=>{const row=p.arrays_referenceItem({ARRAY:values.board,INDEX:x});return [0,1,2].map(y=>p.arrays_referenceItem({ARRAY:row,INDEX:y}));}),
                    threads:vm.runtime.threads.map(t=>({status:t.status,top:t.target.blocks.getBlock(t.topBlock)?.opcode,stack:t.stack.map(id=>t.target.blocks.getBlock(id)?.opcode)})),errors:window.__bwNestedErrors||[]};
            });
            console.error('A-button timeout state',JSON.stringify(state));throw error;
        }
        // Score changes precede board redraw. Let the pressed-button callback
        // finish before freezing the VM for pixel capture.
        await page.waitForFunction(()=>!window.__brickwrightStore.getState().scratchGui.vm.runtime.threads.some(t=>t.target.blocks.getBlock(t.topBlock)?.opcode==='event_whenkeypressed'),null,{timeout:30000});
        // The update callback redraws the board across VM ticks. Capture a
        // complete image, then freeze in the same browser evaluation so the
        // next update cannot clear it between readiness and pixel inspection.
        await page.waitForFunction(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm,p=vm.runtime._primitives;
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,'') ,v.value]));
            const board=vm.runtime.bwArcadeDeviceState.sprites[values.boardSprite];
            if(!window.__bwExpectedBoard){
                const expected=new Uint8Array(160*120);
                for(let x=0;x<11;x++){
                    const row=p.arrays_referenceItem({ARRAY:values.board,INDEX:x});
                    for(let y=0;y<11;y++){
                        const value=p.arrays_referenceItem({ARRAY:row,INDEX:y});
                        if(![0,1,2,3,4].includes(value))return false;
                        if((x!==0 || y>1) && value!==(x+y)%5)return false;
                        const image=p.arrays_referenceItem({ARRAY:values.list,INDEX:value});
                        const width=p.arcade_imageProperty({IMAGE:image,PROPERTY:'width'}),height=p.arcade_imageProperty({IMAGE:image,PROPERTY:'height'});
                        for(let j=0;j<height;j++)for(let i=0;i<width;i++){
                            const tx=Math.trunc(x*160/9)+i,ty=Math.trunc(y*120/7)+j;
                            if(tx>=160 || ty>=120)continue;
                            const color=p.arcade_imagePixel({IMAGE:image,X:i,Y:j});
                            if(color)expected[ty*160+tx]=color;
                        }
                    }
                }
                window.__bwExpectedBoard=expected;
            }
            if(!board?.image || !board.image.pixels.every((value,i)=>value===window.__bwExpectedBoard[i]))return false;
            vm.quit();return true;
        },null,{timeout:30000});
        browserResult=await page.evaluate(async palette=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;vm.quit();
            const deadline=performance.now()+5000;
            while(Object.values(vm.runtime.bwArcadeDeviceState.spriteTargets).some(t=>vm.runtime.renderer._allDrawables[t.drawableID]?.skin?._svgImageLoaded===false) && performance.now()<deadline)
                await new Promise(done=>requestAnimationFrame(done));
            vm.runtime.renderer.draw();
            const canvas=vm.runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
            const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
            const colors=new Set(palette.filter((_,i)=>![0,8,13].includes(i)).map(rgb=>rgb.join(',')));let tilePixels=0;
            for(let i=0;i<pixels.length;i+=4)if(colors.has(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`))tilePixels++;
            const values=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
                        const p=vm.runtime._primitives;let numericCells=0,unmatchedPreserved=true;
            for(let x=0;x<11;x++){
                const row=p.arrays_referenceItem({ARRAY:values.board,INDEX:x});
                for(let y=0;y<11;y++){
                    const cell=p.arrays_referenceItem({ARRAY:row,INDEX:y});
                    if([0,1,2,3,4].includes(cell))numericCells++;
                    if((x!==0 || y>1) && cell!==(x+y)%5)unmatchedPreserved=false;
                }
            }
            return {directionalCursor:[1,1],cursor:[Number(values.curX),Number(values.curY)],score:vm.runtime.bwArcadeDeviceState.score,numericCells,unmatchedPreserved,tilePixels,completeBoardImage:true,canvasSize:[canvas.width,canvas.height],devicePixelRatio:window.devicePixelRatio,errors:window.__bwNestedErrors||[]};
        },ARCADE_PALETTE.map(hex=>{const rgb=hex?parseInt(hex.slice(1),16):0;return [rgb>>16,(rgb>>8)&255,rgb&255];}));
        assert.deepEqual(browserResult.cursor,[0,0]);assert.equal(browserResult.score,20);assert.equal(browserResult.numericCells,121);assert.equal(browserResult.unmatchedPreserved,true);assert.ok(browserResult.tilePixels>1000,JSON.stringify(browserResult));
        assert.deepEqual(browserResult.errors,[]);assert.deepEqual(errors,[]);
    }finally{await browser?.close();await new Promise(done=>server.close(done));}
}
const report={generatedAt:new Date().toISOString(),browser:browserResult,cases:[{file,native,code:'pass',sb3:'pass',compile:'pass',makecodeReimport:'pass',scope:'startup, board drawing, directional controls and A-button removal/refill at a boundary'}]};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
