// Execute authored synchronous-top-level fixtures in the complete pinned
// Arcade simulator, including its own class dispatch and fiber scheduler.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {compile,STATIC} from '../../scripts/lib/pxt-node.mjs';

// Self-contained for browser serialization. Observe actual presentation, not
// requested pixels or main/global completion, which can precede the first frame.
export function observePxtDisplay(sim = globalThis.pxsim) {
    const api = sim?.pxtcore, original = api?.updateScreen;
    if (typeof original !== 'function' || typeof sim.getScreenState !== 'function') {
        throw new Error('Original PXT screen-update boundary is unavailable');
    }
    const observer = {updates: 0, restore() {
        if (api.updateScreen !== observed) throw new Error('Original PXT display observer was replaced');
        api.updateScreen = original;
    }};
    function observed(...args) {
        const result = Reflect.apply(original, this, args);
        const state = sim.getScreenState(), image = args[0];
        if (image && state?.lastImage === image && state.width > 0 && state.height > 0
            && state.screen?.length === state.width * state.height) observer.updates++;
        return result;
    }
    api.updateScreen = observed;
    globalThis.__bwPxtDisplayObserver = observer;
    return observer;
}

export async function runPxtArcade(source, {waitForGlobals = null, dependencies = {device: '*'}, inspectDisplay = false, waitForDisplay = false, buttonActions = null, recordSound = false, recordSongSound = false, waitForMain = true, fakeClock = false, inspectImageGlobals = []} = {}) {
    if (waitForDisplay && !inspectDisplay) throw new Error('Display readiness requires display inspection');
    const files=typeof source === 'string' ? {'main.ts':source,'pxt.json':JSON.stringify({name:'bw-arcade-oracle',dependencies,files:['main.ts']})} : {...source};
    const built=await compile('arcade',files);
    if(!built.success)throw new Error(JSON.stringify(built.diagnostics));
    const root=path.join(STATIC,'arcade/sim');
    const server=createServer(async(req,res)=>{
        try {
            const name=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
            if(!name.startsWith(root+path.sep))throw new Error('outside simulator root');
            const bytes=await fs.promises.readFile(name);
            res.writeHead(200,{'content-type':path.extname(name)==='.js'?'text/javascript':path.extname(name)==='.html'?'text/html':'application/octet-stream'});res.end(bytes);
        } catch {res.writeHead(404);res.end();}
    });
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    let browser;
    try {
        browser=await chromium.launch();const page=await browser.newPage();
        const errors=[],messages=[];page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{if(['error','warning'].includes(message.type()))messages.push(message.text().slice(0,1000));});
        // A fake clock makes the original's frame times deterministic: its
        // frame loop pauses max(1, 20 - callback time) ms, so frames are 20 ms.
        // Installed alone, Playwright's fake clock still flows with real time
        // and runFor only adds to it, so a slow host stretched the frames (a
        // fast mover reached the wall inside its first frame). Paused, time
        // moves only by runFor.
        if(fakeClock){await page.clock.install({time:0});await page.clock.pauseAt(0);}
        await page.goto(`http://127.0.0.1:${server.address().port}/simulator.html`);
        if (waitForDisplay) await page.evaluate(observePxtDisplay);
        await page.evaluate(async ({code,recordSound,recordSongSound})=>{
            const msg={type:'run',id:'bw-oracle',code,options:{},mute:true};
            pxsim.AudioContextManager.mute(true);
            if(recordSound || recordSongSound){
                // Record every queued play-instruction buffer with the simulator clock.
                window.__bwSound=[];
                if (recordSongSound) {
                    // Songs bypass queuePlayInstructions in the real simulator.
                    // Observe the final instruction sink without replacing playback.
                    const play=pxsim.AudioContextManager.playInstructionsAsync;
                    pxsim.AudioContextManager.playInstructionsAsync=(bytes,...args)=>{
                        window.__bwSound.push({time:pxsim.runtime?.runningTime?.() ?? null,delay:0,bytes:Array.from(bytes)});
                        return play.call(pxsim.AudioContextManager,bytes,...args);
                    };
                }
                const queue=pxsim.AudioContextManager.queuePlayInstructions;
                pxsim.AudioContextManager.queuePlayInstructions=(when,buffer)=>{
                    window.__bwSound.push({time:pxsim.runtime?.runningTime?.() ?? null,delay:when,bytes:Array.from(buffer.data)});
                    return queue(when,buffer);
                };
            }
            const runtime=new pxsim.Runtime(msg);window.__bwPxtRuntime=runtime;
            await runtime.board.initAsync(msg);
            runtime.run(()=>{window.__bwPxtDone=true;});
        },{code:built.outfiles['binary.js'],recordSound,recordSongSound});
        if(buttonActions){
            if(buttonActions.afterGlobals)await page.waitForFunction(expected=>{
                const values=Object.fromEntries(Object.entries(window.__bwPxtRuntime.globals).map(([key,value])=>[key.replace(/___\d+$/,''),value]));
                return Object.entries(expected).every(([key,value])=>values[key]===value);
            },buttonActions.afterGlobals,{timeout:20000});
            for(const action of buttonActions.steps){
                if(action.delay)await page.waitForTimeout(action.delay);
                if(action.button!==undefined)await page.evaluate(({button,held})=>{
                    const board=window.__bwPxtRuntime.board;
                    if(typeof board.setButton!=='function')throw new Error('Original PXT board button input unavailable');
                    board.setButton(button,held);
                },action);
            }
        }
        if(fakeClock){
            // Faked timers also stop waitForFunction polling: advance and check.
            const ready=()=>page.evaluate(({waitForMain,expected})=>{
                const values=Object.fromEntries(Object.entries(window.__bwPxtRuntime.globals).map(([key,value])=>[key.replace(/___\d+$/,''),value]));
                return (!waitForMain || window.__bwPxtDone) && Object.entries(expected || {}).every(([key,value])=>values[key]===value);
            },{waitForMain,expected:waitForGlobals});
            let elapsed=0;
            while(!await ready()){
                if(elapsed>=120000||errors.length)throw new Error('Original Arcade simulator did not complete under the fake clock: '+JSON.stringify({errors,messages,elapsed}));
                await page.clock.runFor(100);elapsed+=100;
            }
        } else try {
            // Main may never return (game over waits for a button); then only the globals mark completion.
            if (waitForMain) await page.waitForFunction(()=>window.__bwPxtDone,null,{timeout:20000});
            // Exported Scratch hats can continue in real PXT fibers after main
            // returns. Authored fixtures may name an explicit completion marker;
            // do not read unfinished state or change the scheduler to force it.
            if (waitForGlobals) await page.waitForFunction(expected => {
                const values=Object.fromEntries(Object.entries(window.__bwPxtRuntime.globals)
                    .map(([key,value])=>[key.replace(/___\d+$/,''),value]));
                return Object.entries(expected).every(([key,value])=>values[key]===value);
            }, waitForGlobals, {timeout:20000});
        }
        catch(error) {
            const state=await page.evaluate(()=>{const r=window.__bwPxtRuntime;return {dead:r?.dead,running:r?.running,globals:Object.fromEntries(Object.entries(r?.globals || {}).filter(([,v])=>v===null || ['number','string','boolean','undefined'].includes(typeof v))) };});
            throw new Error('Original Arcade simulator did not complete: '+JSON.stringify({errors,messages,state}),{cause:error});
        }
        let displayBaseline;
        if (waitForDisplay) {
            displayBaseline = await page.evaluate(() => window.__bwPxtDisplayObserver.updates);
            if (fakeClock) {
                let elapsed = 0;
                while (await page.evaluate(() => window.__bwPxtDisplayObserver.updates) <= displayBaseline) {
                    if (elapsed >= 20000 || errors.length) throw new Error('Original PXT did not present a frame after completion');
                    await page.clock.runFor(20); elapsed += 20;
                }
            } else await page.waitForFunction(baseline => window.__bwPxtDisplayObserver.updates > baseline,
                displayBaseline, {timeout: 20000});
        }
        const values=await page.evaluate(({inspectDisplay,recordSound,recordSongSound,waitForDisplay,displayBaseline,inspectImageGlobals})=>{
            const runtime=window.__bwPxtRuntime;
            const result=Object.fromEntries(Object.entries(runtime.globals).filter(([,v])=>v===null || ['number','string','boolean','undefined'].includes(typeof v)).map(([k,v])=>[k.replace(/___\d+$/,''),v]));
            if(inspectImageGlobals.length){
                result.$images={};
                for(const name of inspectImageGlobals){
                    const matches=Object.entries(runtime.globals).filter(([key])=>key.replace(/___\d+$/,'')===name);
                    if(matches.length!==1)throw new Error('Original image global is missing or ambiguous: '+name);
                    const value=matches[0][1];
                    if(typeof value?._width!=='number' || typeof value?._height!=='number' || !value?.data)throw new Error('Original image global unavailable: '+name);
                    const pixels=Array.from(value.data);
                    if(pixels.length!==value._width*value._height)throw new Error('Original image global has incomplete pixels: '+name);
                    result.$images[name]={width:value._width,height:value._height,pixels};
                }
            }
            if(inspectDisplay)result.$display={palette:Array.from(runtime.board.screenState.palette),
                screen:Array.from(runtime.board.screenState.screen)};
            if(waitForDisplay){
                result.$display.updatesAfterReady=window.__bwPxtDisplayObserver.updates-displayBaseline;
                window.__bwPxtDisplayObserver.restore();delete window.__bwPxtDisplayObserver;
            }
            if(recordSound || recordSongSound)result.$sound=window.__bwSound;
            runtime.kill();runtime.board.kill();return result;
        },{inspectDisplay,recordSound,recordSongSound,waitForDisplay,displayBaseline,inspectImageGlobals});
        if(errors.length)throw new Error(JSON.stringify(errors));
        return values;
    } finally {await browser?.close();await new Promise(done=>server.close(done));}
}
