#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {CALLBACK_COMPLETION_SOURCE} from '../test/fixtures/arcade-callback-completion.mjs';
const imported=arcadeToPseudocode(CALLBACK_COMPLETION_SOURCE);assert.deepEqual(imported.unsupported,[]);
const out=process.env.BW_CALLBACK_REPORT || 'test-results/arcade-callback-completion-browser.json';
const browser=await chromium.launch();const report={errors:[],samples:[]};let page;
try{
 page=await browser.newPage({viewport:{width:1600,height:1000}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('bw-starter-v1-complete','1');localStorage.setItem('bw-right-pane-hidden','0');localStorage.setItem('bw-debug-dock','arcade');});
 await page.goto(process.env.BW_BASE_URL || 'http://127.0.0.1:8620/',{waitUntil:'domcontentloaded',timeout:90000});
 report.pageScripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
 if(process.env.BW_EXPECT_GUI_BUNDLE)assert.ok(report.pageScripts.some(s=>s.endsWith(process.env.BW_EXPECT_GUI_BUNDLE)));
 await page.waitForFunction(()=>Boolean(window.__brickwrightStore?.getState()?.scratchGui?.vm),null,{timeout:60000});
 await page.evaluate(()=>{const r=window.__brickwrightStore.getState().scratchGui.vm.runtime;window.__bwCallbackErrors=[];r.on('BLOCKS_ERROR',e=>window.__bwCallbackErrors.push(String(e)));});
 await page.getByRole('tab',{name:'Code',exact:true}).click();
 const editor=page.locator('[data-testid="bw-code-editor"] .cm-content');await editor.waitFor({state:'visible'});
 await page.getByTestId('bw-device-select').selectOption('arcade');
 await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwDeviceId==='arcade');
 const project=makeCodeProjectFile({'main.ts':CALLBACK_COMPLETION_SOURCE,'pxt.json':JSON.stringify({name:'Callback completion',dependencies:{device:'*','color-coded-tilemap':'*'},files:['main.ts']})},{target:'arcade',name:'Callback completion'});
 await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({name:'callback-completion.mkcd',mimeType:'application/json',buffer:Buffer.from(project)});
 await page.getByText(/Imported the Arcade game.*callback-completion/).first().waitFor({state:'visible'});
 await page.getByRole('button',{name:'⇦ To blocks',exact:true}).click();
 await page.getByText('Blocks loaded.',{exact:true}).waitFor({state:'visible',timeout:30000});
 await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.extensionManager.isExtensionLoaded('arcade'));
 await page.getByRole('tab',{name:'Blocks',exact:true}).click();await editor.waitFor({state:'hidden'});
 await page.getByTitle('Game Console',{exact:true}).click();
 await page.locator('[class*="green-flag_green-flag"]').first().click();
 for(const completed of [1,2]){
  if(completed===2)await page.getByTestId('bw-arcade-a').click();
  await page.waitForFunction(n=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='completed' && v.value===n),completed,{timeout:30000});
  const values=await page.evaluate(()=>Object.fromEntries(window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value])));
  report.samples.push({completed,before:values.before,after:values.after,inB:values.inB,inC:values.inC,finalX:values.finalX});
  assert.ok(values.after<values.before,'motion continues during pause');for(const key of ['inB','inC','finalX'])assert.equal(values[key],values.after,key);
 }
 await page.locator('[class*="stop-all_stop-all"]').first().click();await page.getByRole('tab',{name:'Code',exact:true}).click();
 const motionSource='let actor=sprites.create(img`5 5\n5 5`,SpriteKind.Player)\nactor.setPosition(40,60)\ncontroller.moveSprite(actor,30,0)';
 const motionProject=makeCodeProjectFile({'main.ts':motionSource,'pxt.json':JSON.stringify({name:'Elapsed clock',dependencies:{device:'*'},files:['main.ts']})},{target:'arcade',name:'Elapsed clock'});
 await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({name:'elapsed-clock.mkcd',mimeType:'application/json',buffer:Buffer.from(motionProject)});
 await page.getByText(/Imported the Arcade game.*elapsed-clock/).first().waitFor({state:'visible'});
 await page.getByRole('button',{name:'⇦ To blocks',exact:true}).click();await page.getByText('Blocks loaded.',{exact:true}).waitFor({state:'visible'});
 await page.getByRole('tab',{name:'Blocks',exact:true}).click();await page.locator('[class*="green-flag_green-flag"]').first().click();
 await page.waitForFunction(()=>Object.values(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.sprites).some(s=>s.kind==='Player'));
 const measure=()=>page.evaluate(()=>{const r=window.__brickwrightStore.getState().scratchGui.vm.runtime,s=Object.values(r.bwArcadeDeviceState.sprites).find(s=>s.kind==='Player');return {wall:r.currentMSecs,elapsed:r.bwArcadeDeviceState.elapsedMs,x:s.x};});
 const right=page.getByTestId('bw-arcade-right');await right.hover();await page.mouse.down();const before=await measure();
 await page.waitForFunction(start=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState.elapsedMs-start>=500,before.elapsed);
 const after=await measure();await page.mouse.up();
 const elapsed=after.elapsed-before.elapsed,wall=after.wall-before.wall,dx=after.x-before.x;
 report.frameClock={before,after,elapsed,wall,dx};assert.ok(Math.abs(elapsed-wall)<=50,'Arcade time tracks VM wall time');
 assert.ok(Math.abs(dx-elapsed*.03)<2,'visible controller motion matches elapsed time with fixed-point rounding');
 report.blockErrors=await page.evaluate(()=>window.__bwCallbackErrors);assert.deepEqual(report.blockErrors,[]);assert.deepEqual(report.errors,[]);
 await page.screenshot({path:out.replace(/\.json$/,'.png')});report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;throw e;}
finally{await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,samples:report.samples}));}
