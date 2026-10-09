// Execute authored synchronous-top-level fixtures in the complete pinned
// Arcade simulator, including its own class dispatch and fiber scheduler.
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {compile,STATIC} from '../../scripts/lib/pxt-node.mjs';

export async function runPxtArcade(source, {waitForGlobals = null, dependencies = {device: '*'}, inspectDisplay = false} = {}) {
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
        await page.goto(`http://127.0.0.1:${server.address().port}/simulator.html`);
        await page.evaluate(async code=>{
            const msg={type:'run',id:'bw-oracle',code,options:{},mute:true};
            pxsim.AudioContextManager.mute(true);
            const runtime=new pxsim.Runtime(msg);window.__bwPxtRuntime=runtime;
            await runtime.board.initAsync(msg);
            runtime.run(()=>{window.__bwPxtDone=true;});
        },built.outfiles['binary.js']);
        try {
            await page.waitForFunction(()=>window.__bwPxtDone,null,{timeout:20000});
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
        const values=await page.evaluate(inspectDisplay=>{
            const runtime=window.__bwPxtRuntime;
            const result=Object.fromEntries(Object.entries(runtime.globals).filter(([,v])=>v===null || ['number','string','boolean','undefined'].includes(typeof v)).map(([k,v])=>[k.replace(/___\d+$/,''),v]));
            if(inspectDisplay)result.$display={palette:Array.from(runtime.board.screenState.palette),
                screen:Array.from(runtime.board.screenState.screen)};
            runtime.kill();runtime.board.kill();return result;
        },inspectDisplay);
        if(errors.length)throw new Error(JSON.stringify(errors));
        return values;
    } finally {await browser?.close();await new Promise(done=>server.close(done));}
}
