#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
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
 await editor.fill(imported.code);await page.getByRole('button',{name:'⇦ To blocks',exact:true}).click();
 await page.getByText('Blocks loaded.',{exact:true}).waitFor({state:'visible',timeout:30000});
 await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.extensionManager.isExtensionLoaded('arcade'));
 await page.getByRole('tab',{name:'Blocks',exact:true}).click();await editor.waitFor({state:'hidden'});
 await page.getByTitle('Game Console',{exact:true}).click();
 await page.locator('[class*="green-flag_green-flag"]').first().click();
 for(const completed of [1,2]){
  if(completed===2)await page.getByTestId('bw-arcade-a').click();
  await page.waitForFunction(n=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).some(v=>v.name.replace(/^Game_/,'')==='completed' && v.value===n),completed,{timeout:30000});
  const values=await page.evaluate(()=>Object.fromEntries(window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value])));
  assert.ok(values.after<values.before,'motion continues during pause');for(const key of ['inB','inC','finalX'])assert.equal(values[key],values.after,key);
  report.samples.push({completed,before:values.before,after:values.after,inB:values.inB,inC:values.inC,finalX:values.finalX});
 }
 report.blockErrors=await page.evaluate(()=>window.__bwCallbackErrors);assert.deepEqual(report.blockErrors,[]);assert.deepEqual(report.errors,[]);
 await page.screenshot({path:out.replace(/\.json$/,'.png')});report.status='passed';
}catch(e){report.status='failed';report.failure=e.stack;throw e;}
finally{await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,samples:report.samples}));}
