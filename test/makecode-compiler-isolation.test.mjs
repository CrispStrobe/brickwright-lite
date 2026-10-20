import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {compile,resolveProjectInputs,STATIC} from '../scripts/lib/pxt-node.mjs';
const lib=path.resolve(import.meta.dirname,'../overlay/scratch-gui/src/lib');
const project=main=>({'main.ts':main,'pxt.json':JSON.stringify({name:'isolated-original',dependencies:{device:'*'},files:['main.ts']})});
const number=project('class Local {constructor(public value:number){}}\nlet answer=new Local(42).value');
const string=project('class Local {constructor(public value:string){}}\nlet answer=new Local("different").value');
const invalid=project('let answer:number="wrong"');

test('original compiler contexts isolate preparation, type failures and different class definitions',async()=>{
    const first=await compile('arcade',number);assert.equal(first.success,true);
    await resolveProjectInputs('arcade',string);
    const bad=await compile('arcade',invalid);assert.equal(bad.success,false);assert.ok(bad.diagnostics.length);
    const other=await compile('arcade',string);assert.equal(other.success,true);
    const again=await compile('arcade',number);assert.equal(again.success,true);
    assert.equal(again.outfiles['binary.js'],first.outfiles['binary.js']);
    assert.deepEqual(again.netAttempts,[]);assert.notEqual(other.outfiles['binary.js'],first.outfiles['binary.js']);
});

test('real browser compiler workers are released after success and failure and their programs execute independently',async()=>{
    const server=createServer(async(req,res)=>{
        try {
            const pathname=new URL(req.url,'http://localhost').pathname;
            const root=pathname.startsWith('/lib/')?lib:pathname.startsWith('/static/makecode/')?STATIC:null;
            if(!root)throw new Error('Unknown route');
            const relative=pathname.slice(root===lib?5:17),file=path.resolve(root,relative);
            if(!file.startsWith(root+path.sep))throw new Error('Outside source root');
            const data=await readFile(file);
            res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/octet-stream');
            res.end(data);
        }catch{res.writeHead(404);res.end();}
    });
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    let browser;
    try {
        browser=await chromium.launch();const page=await browser.newPage();
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        const origin=`http://127.0.0.1:${server.address().port}`;
        await page.goto(origin+'/static/makecode/arcade/sim/simulator.html');
        const result=await page.evaluate(async({number,string,invalid,origin})=>{
            const NativeWorker=window.Worker;let created=0,terminated=0;
            window.Worker=class extends NativeWorker {
                constructor(...args){super(...args);created++;}
                terminate(){terminated++;return super.terminate();}
            };
            const {compileMakeCode}=await import('/lib/bw-makecode/pxt-runtime.js');
            const build=files=>compileMakeCode({target:'arcade',files,baseUrl:origin+'/',fetchExtensions:false});
            const first=await build(number),bad=await build(invalid),other=await build(string),again=await build(number);
            const execute=async code=>{
                const message={type:'run',id:'isolation-original',code,options:{},mute:true};
                const runtime=new pxsim.Runtime(message);await runtime.board.initAsync(message);
                await new Promise(done=>runtime.run(done));
                const globals=Object.fromEntries(Object.entries(runtime.globals).map(([name,value])=>[name.replace(/___\d+$/,''),value]));
                runtime.kill();runtime.board.kill();return globals.answer;
            };
            return {success:[first.success,bad.success,other.success,again.success],created,terminated,
                stable:first.outfiles['binary.js']===again.outfiles['binary.js'],badDiagnostics:bad.diagnostics.length,
                first:await execute(first.outfiles['binary.js']),other:await execute(other.outfiles['binary.js'])};
        },{number,string,invalid,origin});
        assert.deepEqual(result.success,[true,false,true,true]);assert.equal(result.badDiagnostics>0,true);
        assert.equal(result.created,4);assert.equal(result.terminated,4);assert.equal(result.stable,true);
        assert.equal(result.first,42);assert.equal(result.other,'different');assert.deepEqual(errors,[]);
    }finally{await browser?.close();await new Promise(done=>server.close(done));}
});
