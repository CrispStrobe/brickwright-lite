import {readFileSync} from 'node:fs';import {REPO,guiDependencyFile} from './helpers/bw-integrated.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {createServer} from 'node:http';import {createRequire} from 'node:module';
import {compile,STATIC} from '../scripts/lib/pxt-node.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {createArcadeDiscreteTimers} from './helpers/arcade-discrete-timers.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const setup='let resumed=-1;let resumedScene=-1;let updates=0;let firstUpdate=-1;let first=-1;let hero:Sprite=null;';
const authoringImage=Array.from({length:16},()=>Array(16).fill('1').join(' ')).join('\n');
const finish='first+=0;resumed=control.millis();resumedScene=game.runtime();hero=sprites.create(img`1`,SpriteKind.Player);game.onUpdate(function(){updates+=1;if(firstUpdate<0)firstUpdate=control.millis()});';
const globals=['resumed','resumedScene','updates','firstUpdate','first'];
async function originalSeries(source,{end=220,edges=[[100,true],[140,false]]}={}) {
 const built=await compile('arcade',typeof source==='string'?{'main.ts':source,'pxt.json':JSON.stringify({name:'owned-splash-resume',dependencies:{device:'*'},files:['main.ts']})}:source);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
 const sim=path.join(STATIC,'arcade/sim');const server=createServer(async(req,res)=>{try{const file=path.resolve(sim,'.'+new URL(req.url,'http://localhost').pathname);assert.ok(file.startsWith(sim+'/'));res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream'});res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try {
  browser=await chromium.launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:0});await page.clock.pauseAt(0);await page.goto(`http://127.0.0.1:${server.address().port}/simulator.html`);
  await page.evaluate(async code=>{const msg={type:'run',id:'owned-splash-resume',code,options:{},mute:true};pxsim.AudioContextManager.mute(true);const r=new pxsim.Runtime(msg);window.phaseRuntime=r;await r.board.initAsync(msg);r.run(()=>{});},built.outfiles['binary.js']);
  const read=()=>page.evaluate(names=>{const r=window.phaseRuntime,g=Object.fromEntries(Object.entries(r.globals).map(([k,v])=>[k.replace(/___\d+$/,'').replace(/^Game_/,''),v]));return {time:r.runningTime(),sceneMillis:g._scene?.fields?._millis,...Object.fromEntries(names.map(n=>[n,g[n]])),hero:!!g.hero};},globals);
  const rows=[];await page.clock.runFor(0);rows.push(await read());for(let time=0;time<end;time+=20){for(const[at,held]of edges)if(at===time)await page.evaluate(held=>phaseRuntime.board.setButton(5,held),held);await page.clock.runFor(20);rows.push(await read());}assert.deepEqual(errors,[]);await page.evaluate(()=>{phaseRuntime.kill();phaseRuntime.board.kill();});return rows;
 } finally {await browser?.close();await new Promise(r=>server.close(r));}
}
async function start(imported,{code=imported.code,archive}={}) {
 assert.equal(readFileSync(guiDependencyFile('scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8'),readFileSync(path.join(REPO,'overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8'),'actual installed phase driver must match the owned source');
 const run=await runProgram(archive?'SPRITE Placeholder:\nWHEN flag clicked:\n  hide':code,{frames:0,frameAuthority:'timed',storage:true,uploads:archive?[]:imported.costumes});
 if(archive){run.vm.stopAll();await run.vm.loadProject(archive);}
 const clock=createArcadeDiscreteTimers();run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock=clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=clock.now();};run.vm.greenFlag();assert.ok(readFileSync(path.join(REPO,'overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js'),'utf8').includes(run.vm.runtime._arcadeFramePhase.constructor.toString()),'actual loaded phase class must match source, including module cache');
 run.clock=clock;run.read=()=>{const g=Object.fromEntries(run.vm.runtime.targets.filter(t=>t.isOriginal).flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));const state=run.vm.runtime.bwArcadeDeviceState;return {time:run.clock.now(),sceneMillis:state?.elapsedMs,...Object.fromEntries(globals.map(n=>[n,g[n]])),hero:!!state?.sprites?.[g.hero]};};return run;
}
async function series(run,{end=220,edges=[[100,true],[140,false]]}={}) {
 const rows=[];await stepFrames(run.vm,1,0);await run.clock.advanceTo(0);rows.push(run.read());for(let time=0;time<end;time+=20){for(const[at,held]of edges)if(at===time)run.vm.postIOData('keyboard',{key:' ',isDown:held});await run.clock.advanceTo(time+20);await stepFrames(run.vm,1,20);rows.push(run.read());}assert.deepEqual(run.errors,[]);return rows;
}
const close=run=>{run?.vm.stopAll();run?.vm.quit();clearStrayTimers();};
for(const call of ['game.splash("RESUME PHASE")','game.showLongText("RESUME PHASE",DialogLayout.Bottom)'])test(call+' resumes on actual shared poll timer before the next frame',async()=>{
 const source=setup+call+';'+finish,expected=await originalSeries(source),imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await start(imported);assert.deepEqual(await series(run),expected);assert.equal(expected.find(r=>r.time===140).hero,false);assert.equal(expected.find(r=>r.time===160).resumed,150);assert.equal(expected.find(r=>r.time===160).resumedScene,20);assert.equal(expected.find(r=>r.time===160).firstUpdate,160);}finally{close(run);}
});
for(const duration of [0,20,30])test('source pause '+duration+' uses its actual deadline before scene frames',async()=>{
 const source=setup+'scene.setBackgroundColor(1);pause('+duration+');'+finish,expected=await originalSeries(source,{edges:[]});
 const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await start(imported);assert.deepEqual(await series(run,{edges:[]}),expected);assert.equal(expected.at(-1).resumed,duration);}finally{close(run);}
});
test('sequential dialogs retain the shared polling phase through the empty final sleep',async()=>{
 const source=setup+'game.splash("FIRST");first=control.millis();game.splash("SECOND");'+finish,options={end:300,edges:[[100,true],[140,false],[180,true],[220,false]]};
 const expected=await originalSeries(source,options),imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);let run;try{run=await start(imported);assert.deepEqual(await series(run,options),expected);assert.equal(expected.at(-1).first,150);assert.equal(expected.at(-1).resumed,200);}finally{close(run);}
});
test('concurrent dialog waiters share one poll queue and preserve nested scene ownership',async()=>{
 const source=setup+'control.runInParallel(function(){pause(20);game.splash("CHILD");first=control.millis()});game.splash("PARENT");'+finish,options={end:300,edges:[[100,true],[140,false],[180,true],[220,false]]};
 const expected=await originalSeries(source,options),imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);let run;try{run=await start(imported);assert.deepEqual(await series(run,options),expected);assert.equal(expected.at(-1).first,150);assert.equal(expected.at(-1).resumed,150);}finally{close(run);}
});
test('poll resume timing survives Code, same/fresh saved SB3, original export and reimport',async()=>{
 const source=setup+'game.splash("ROUNDTRIP");'+finish.replace('img`1`',`img\`${authoringImage}\``),expected=await originalSeries(source),imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);let run;let code,archive,exported;
 try{run=await start(imported);assert.deepEqual(await series(run),expected);code=run.creator.decompile();archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());exported=projectToArcade(run.creator.project,{costumeSvg:(target,costume)=>run.creator.assets.get(costume.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 run.vm.stopAll();await run.vm.loadProject(archive);run.clock=createArcadeDiscreteTimers();run.vm.runtime.bwArcadeProgramClock=run.clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=run.clock.now();};run.vm.greenFlag();assert.deepEqual(await series(run),expected);
 }finally{close(run);}
 for(const variant of [{imported:{...imported,code}},{imported,archive},{imported:arcadeToPseudocode(exported.files)}]){try{run=await start(variant.imported,{archive:variant.archive});assert.deepEqual(await series(run),expected);}finally{close(run);}}
 assert.deepEqual(await originalSeries(exported.files),expected);
});
test('Stop cancels real poll timers and cached project reload starts a new polling generation',async()=>{
 const source=setup+'game.splash("CANCEL");'+finish,imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);let run;
 try{run=await start(imported);await stepFrames(run.vm,1,0);await run.clock.advanceTo(100);await stepFrames(run.vm,1,100);assert.ok(run.clock.pending);
 const oldClock=run.clock;run.vm.stopAll();assert.equal(oldClock.pending,0);await oldClock.advanceTo(500);assert.equal(run.read().resumed,-1);
 const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());await run.vm.loadProject(archive);run.clock=createArcadeDiscreteTimers();run.vm.runtime.bwArcadeProgramClock=run.clock;run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=run.clock.now();};run.vm.greenFlag();const rows=await series(run);assert.equal(rows.at(-1).resumed,150);assert.deepEqual(run.errors,[]);
 }finally{close(run);}
});
