#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {FOREVER_REGISTRATION_SOURCE} from '../test/fixtures/arcade-forever-registration.mjs';
const imported=arcadeToPseudocode(FOREVER_REGISTRATION_SOURCE);assert.deepEqual(imported.unsupported,[]);
const out=process.env.BW_FOREVER_REGISTRATION_REPORT || 'test-results/arcade-forever-registration-browser.json';
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
 const project=makeCodeProjectFile({'main.ts':FOREVER_REGISTRATION_SOURCE,'pxt.json':JSON.stringify({name:'Forever registration',dependencies:{device:'*','color-coded-tilemap':'*'},files:['main.ts']})},{target:'arcade',name:'Forever registration'});
 await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({name:'forever-registration.mkcd',mimeType:'application/json',buffer:Buffer.from(project)});
 await page.getByText(/Imported the Arcade game.*forever-registration/).first().waitFor({state:'visible'});
 await page.getByRole('button',{name:'⇦ To blocks',exact:true}).click();
 await page.getByText('Blocks loaded.',{exact:true}).waitFor({state:'visible',timeout:30000});
 await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.extensionManager.isExtensionLoaded('arcade'));
 await page.getByRole('tab',{name:'Blocks',exact:true}).click();await editor.waitFor({state:'hidden'});
 await page.getByTitle('Game Console',{exact:true}).click();
 await page.locator('[class*="green-flag_green-flag"]').first().click();
 for(const hits of [1,2]){
  if(hits===2)await page.getByTestId('bw-arcade-a').click();
  await page.waitForFunction(n=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='runs' && v.value===n),hits,{timeout:30000});
  const state=await page.evaluate(()=>Object.fromEntries(window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value])));
  report.samples.push(state);assert.equal(state.trace,hits===1?'S12E13':'S12E13S14E15');assert.equal(state.runs,hits);
 }
 await page.getByRole('tab',{name:'Code',exact:true}).click();
 await page.getByRole('button',{name:/From blocks/}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid="bw-code-editor"] .cm-content')?.textContent?.includes('arcade register forever'));
 report.decompiled=await editor.innerText();assert.match(report.decompiled,/arcade register forever/);
 report.blockErrors=await page.evaluate(()=>window.__bwCallbackErrors);assert.deepEqual(report.blockErrors,[]);assert.deepEqual(report.errors,[]);
 await page.screenshot({path:out.replace(/\.json$/,'.png')});report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;throw e;}
finally{await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,samples:report.samples}));}
