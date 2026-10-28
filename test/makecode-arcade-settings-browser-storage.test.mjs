import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const folder=new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/',import.meta.url);
const modules=Object.fromEntries(['program-settings','settings-codec','string-array-settings','settings-pxt','buffer','buffer-pxt','buffer-hash-pxt','buffer-helpers-pxt'].map(name=>[name,fs.readFileSync(new URL(name+'.js',folder),'utf8')]));
// Load the exact production CommonJS modules in Chromium. There is no alternate
// storage implementation; createProgramSettings uses the real localStorage.
const install=async page=>page.evaluate(modules=>{
    const cache={};const load=name=>{name=name.replace(/^\.\//,'');if(cache[name])return cache[name].exports;if(!modules[name])throw new Error('Unexpected production dependency '+name);const module={exports:{}};cache[name]=module;new Function('require','module','exports',modules[name])(load,module,module.exports);return module.exports;};
    window.settings=load('program-settings');
},modules);

test('real Chromium device settings survive page and browser-process reload with stable saved-project identity',async()=>{
    const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bw-settings-browser-'));
    const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Arcade Settings persistence control</title>');});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const url='http://127.0.0.1:'+server.address().port+'/';
    let context;
    try{
        context=await chromium.launchPersistentContext(profile,{headless:true});let page=context.pages()[0];await page.goto(url);await install(page);
        const snapshot=await page.evaluate(()=>{const stage={isStage:true},store=settings.createProgramSettings(stage);if(store.mode!=='device-and-project')throw new Error('Actual device storage unavailable');store.call('writeString','name','A€🙂');store.call('writeNumberArray','scores',[3,8,12]);store.call('writeNumber','counter',1);const saved=JSON.stringify(stage);store.call('writeNumber','counter',2);return saved;});
        await page.reload();await install(page);
        const after=await page.evaluate(snapshot=>{const stage=JSON.parse(snapshot),store=settings.createProgramSettings(stage),scores=store.call('readNumberArray','scores');scores[0]=99;return {id:store.id,mode:store.mode,name:store.call('readString','name'),scores:store.call('readNumberArray','scores'),counter:store.call('readNumber','counter')};},snapshot);
        assert.equal(after.id,JSON.parse(snapshot).bwArcadeSettings.id);assert.equal(after.mode,'device-and-project');assert.equal(after.name,'A€🙂');assert.deepEqual(after.scores,[3,8,12]);assert.equal(after.counter,2);
        await context.close();context=null;
        context=await chromium.launchPersistentContext(profile,{headless:true});page=context.pages()[0];await page.goto(url);await install(page);
        const reopened=await page.evaluate(snapshot=>{const stage=JSON.parse(snapshot),store=settings.createProgramSettings(stage);return {id:store.id,counter:store.call('readNumber','counter'),name:store.call('readString','name'),scores:store.call('readNumberArray','scores')};},snapshot);
        assert.equal(reopened.id,after.id);assert.equal(reopened.counter,2);assert.equal(reopened.name,'A€🙂');assert.deepEqual(reopened.scores,[3,8,12]);
    }finally{await context?.close();await new Promise(done=>server.close(done));fs.rmSync(profile,{recursive:true,force:true});}
});
