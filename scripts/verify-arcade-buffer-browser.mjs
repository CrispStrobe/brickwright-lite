#!/usr/bin/env node
// Visible authoring and field edits only. VM/Blockly access observes; no injected programs or heap mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import JSZip from 'jszip';
import {BUFFER_CONTROLLER_CODE} from '../test/fixtures/arcade-buffer-controller.mjs';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {runPxtArcade} from '../test/helpers/pxt-arcade-runtime.mjs';
const option=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:undefined;
const out=path.resolve(option('--out')||'test-results/arcade-buffer-browser/current.json');
await fs.mkdir(path.dirname(out),{recursive:true});
const report={status:'running',generatedAt:new Date().toISOString(),journey:[],edits:[],cycles:[],pageErrors:[],blockErrors:[],
  boundary:'Native authored Buffer Code/Blocks/controller/SB3/export proof. Namespace Buffer import and a byte inspector are separate gaps.'};
const browser=await chromium.launch(process.env.BW_BROWSER?{executablePath:process.env.BW_BROWSER}:{});
const deadline=setTimeout(()=>{report.timedOut=true;void browser.close();},170000);
let page;
try {
  page=await browser.newPage({viewport:{width:1600,height:1200},acceptDownloads:true});page.setDefaultTimeout(20000);
  page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{localStorage.setItem('bw-starter-v1-complete','1');localStorage.setItem('bw-right-pane-hidden','0');localStorage.setItem('bw-debug-dock','arcade');});
  await page.goto(process.env.PROOF_URL||'http://127.0.0.1:8617/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__brickwrightStore?.getState()?.scratchGui?.vm);
  await page.evaluate(()=>{window.__bwBufferErrors=[];window.__brickwrightStore.getState().scratchGui.vm.runtime.on('BLOCKS_ERROR',message=>window.__bwBufferErrors.push(String(message)));});
  const editor=page.getByTestId('bw-code-editor').locator('.cm-content');
  const codeTab=()=>page.getByRole('tab',{name:'Code',exact:true}).click();
  const blocksTab=async()=>{await page.getByRole('tab',{name:'Blocks',exact:true}).click();await editor.waitFor({state:'hidden'});await page.waitForFunction(()=>window.Blockly?.getMainWorkspace()?.getAllBlocks(false).some(b=>b.type==='arcade_bufferGetNumber'));};
  const apply=async()=>{
    const before=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
    await page.getByRole('button',{name:'⇦ To blocks',exact:true}).click();
    await page.waitForFunction(before=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id!==before,before);
    await page.getByText('Blocks loaded.',{exact:true}).waitFor();
    await page.waitForFunction(()=>typeof window.__brickwrightStore.getState().scratchGui.vm.runtime._primitives.arcade_bufferSetNumber==='function');
    await blocksTab();
  };
  await codeTab();await editor.waitFor({state:'visible'});
  await page.getByTestId('bw-device-select').selectOption('arcade');
  await editor.fill(BUFFER_CONTROLLER_CODE);await apply();
  // Locate fields by the authored opcode and input. Read their coordinates;
  // Playwright clicks the SVG and the real dropdown/text input performs the edit.
  const observedField=async kind=>page.evaluate(kind=>{
    const blocks=window.Blockly.getMainWorkspace().getAllBlocks(false);
    const outer=blocks.find(b=>b.type===(kind==='format'?'arcade_bufferGetNumber':'arcade_bufferSetNumber') &&
      (kind!=='format'||b.getInputTargetBlock('FORMAT')?.getFieldValue('bufferFormats')==='UInt16LE'));
    const inner=outer?.getInputTargetBlock(kind==='format'?'FORMAT':'VALUE');
    const name=kind==='format'?'bufferFormats':'NUM',field=inner?.getField(name);
    if(!field)throw new Error('Missing authored Buffer '+kind+' field');
    const rect=field.getSvgRoot().getBoundingClientRect();
    const workspace=window.Blockly.getMainWorkspace(),svg=workspace.getParentSvg().getBoundingClientRect(),metrics=workspace.getMetrics();
    return {id:inner.id,name,before:field.getValue(),x:rect.x+rect.width/2,y:rect.y+rect.height/2,
      workspace:{left:svg.left+metrics.absoluteLeft,right:svg.right,top:svg.top,bottom:svg.bottom}};
  },kind);
  const reachableField=async kind=>{
    const before=await observedField(kind),w=before.workspace;
    // Wide authored stacks may place a field beyond the clipped workspace even
    // while its SVG coordinates are inside the browser viewport. Pan through
    // the actual user's wheel event; Blockly access above only observes.
    const target={x:(w.left+w.right)/2,y:w.top+Math.min(200,(w.bottom-w.top)/2)};
    await page.mouse.move(target.x,target.y);
    await page.mouse.wheel(before.x-target.x,before.y-target.y);
    await page.waitForFunction(({id,name})=>{
      const workspace=window.Blockly.getMainWorkspace(),field=workspace.getBlockById(id)?.getField(name);
      if(!field)return false;
      const rect=field.getSvgRoot().getBoundingClientRect(),svg=workspace.getParentSvg().getBoundingClientRect();
      const x=rect.x+rect.width/2,y=rect.y+rect.height/2,left=svg.left+workspace.getMetrics().absoluteLeft;
      return x>left+5&&x<svg.right-30&&y>svg.top+5&&y<svg.bottom-30&&
        workspace.getBlockById(id).getSvgRoot().contains(document.elementFromPoint(x,y));
    },before);
    const after=await observedField(kind);
    (report.fieldPans ||= []).push({kind,before,after});return after;
  };
  const format=await reachableField('format');
  report.formatField=format;
  const escapedFormatId=await page.evaluate(id=>CSS.escape(id),format.id);
  // A coordinate can lie under a flyout or a workspace overlay. Let Playwright
  // wait for the actual authored SVG field to receive the user's click.
  await page.locator(`g[data-id=${escapedFormatId}][data-argument-type="dropdown"]`).click();
  const choices=page.getByRole('menuitemcheckbox');await choices.first().waitFor({state:'visible'});
  const labels=await choices.allTextContents();assert.equal(labels.length,16,'all original formats are selectable');
  await page.getByRole('menuitemcheckbox',{name:'UInt16BE',exact:true}).click();
  await page.waitForFunction(({id,name})=>window.Blockly.getMainWorkspace().getBlockById(id)?.getFieldValue(name)==='UInt16BE',format);
  report.edits.push({field:'NumberFormat',before:format.before,after:'UInt16BE',choices:labels});
  const number=await reachableField('number');assert.equal(Number(number.before),4660);assert.ok(number.x>0&&number.x<1600&&number.y>0&&number.y<1200);
  await page.mouse.click(number.x,number.y);
  const input=page.locator('input.blocklyHtmlInput');await input.waitFor({state:'visible'});await input.fill('43981');await input.press('Enter');
  await page.waitForFunction(({id,name})=>Number(window.Blockly.getMainWorkspace().getBlockById(id)?.getFieldValue(name))===43981,number);
  report.edits.push({field:'setNumber value',before:4660,after:43981});
  report.journey.push('visible Code → To blocks → native 16-format dropdown and numeric shadow edits');
  const flag=()=>page.locator('[class*="green-flag_green-flag"]').first();
  const observe=()=>page.evaluate(()=>{
    const vm=window.__brickwrightStore.getState().scratchGui.vm;
    const v=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
    return {hex:v.hex,copyHex:v.copyHex,currentNumber:v.currentNumber,phase:Number(v.phase),errors:window.__bwBufferErrors};
  });
  const wait=expected=>page.waitForFunction(expected=>{
    const values=Object.fromEntries(window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
    return Object.entries(expected).every(([name,value])=>typeof value==='number'?Number(values[name])===value:values[name]===value);
  },expected);
  const cycle=async label=>{
    await page.getByTitle('Game Console',{exact:true}).click();
    await flag().click();await page.getByTestId('bw-arcade-a').waitFor({state:'visible'});
    await wait({hex:'01020304',currentNumber:258,phase:0});const initial=await observe();
    await page.getByTestId('bw-arcade-a').click();await wait({hex:'cdab0304',currentNumber:43981,phase:1});const numeric=await observe();
    await page.getByTestId('bw-arcade-b').click();await wait({hex:'cdab0304',copyHex:'63ab0304',phase:2});const detached=await observe();
    await page.getByTestId('bw-arcade-down').click();await wait({hex:'cdab0309',phase:3});const alias=await observe();
    for(const sample of [initial,numeric,detached,alias])assert.deepEqual(sample.errors,[]);
    report.cycles.push({label,initial,numeric,detached,alias});
  };
  await cycle('edited-native-blocks');
  await codeTab();await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
  await page.getByText('Read the current project into all languages. Edit any of them, then “To blocks”.',{exact:true}).waitFor();
  const decompiled=await editor.evaluate(el=>el.cmTile.root.view.state.doc.toString());
  assert.match(decompiled,/number UInt16BE at 0/);assert.match(decompiled,/number \(format\) at 0 to 43981/);
  report.decompiled=decompiled;await apply();await cycle('code-blocks-reconstruction');
  await page.getByText('File',{exact:true}).first().click();
  const saved=page.waitForEvent('download');await page.getByText('Save to your computer',{exact:true}).click();
  const archive=path.join(path.dirname(out),'buffer-edits.sb3');await(await saved).saveAs(archive);
  const zip=await JSZip.loadAsync(await fs.readFile(archive));const project=JSON.parse(await zip.file('project.json').async('text'));
  const blocks=project.targets.flatMap(t=>Object.values(t.blocks));
  assert.ok(blocks.some(b=>b.opcode==='arcade_menu_bufferFormats'&&b.fields.bufferFormats[0]==='UInt16BE'));
  // Replace with the unedited source before loading, so the reopened edit cannot
  // pass by reading the already edited workspace or retained mutable heap.
  await codeTab();await editor.fill(BUFFER_CONTROLLER_CODE);await apply();
  await page.getByText('File',{exact:true}).first().click();const chooser=page.waitForEvent('filechooser');
  await page.getByText('Load from your computer',{exact:true}).click();await(await chooser).setFiles(archive);
  const replace=page.getByRole('button',{name:'Replace',exact:true});if(await replace.isVisible().catch(()=>false))await replace.click();
  await page.waitForFunction(()=>window.Blockly.getMainWorkspace().getAllBlocks(false).some(b=>b.type==='arcade_menu_bufferFormats'&&b.getFieldValue('bufferFormats')==='UInt16BE'));
  await cycle('saved-and-reopened');report.journey.push('real controller A/B/down → Code/Blocks reconstruction → File save/replacement/reopen → controller repeat');
  await page.screenshot({path:path.join(path.dirname(out),'buffer-native-blocks.png')});
  await codeTab();const exported=page.waitForEvent('download');await page.getByTestId('bw-makecode-arcade-export').click();
  const download=await exported;assert.match(download.suggestedFilename(),/\.mkcd$/);
  const mkcd=path.join(path.dirname(out),'buffer-export.mkcd');await download.saveAs(mkcd);
  const embedded=await unpackMakeCodeSource(await fs.readFile(mkcd));assert.ok(embedded.files?.['main.ts']);
  await fs.writeFile(path.join(path.dirname(out),'buffer-export.ts'),embedded.files['main.ts']);
  assert.match(embedded.files['main.ts'],/NumberFormat.UInt16BE/);assert.match(embedded.files['main.ts'],/43981/);
  const original=await runPxtArcade(embedded.files,{buttonActions:{afterGlobals:{hex_:'01020304'},steps:[{button:5,held:true,delay:80},{button:5,held:false,delay:80},{button:6,held:true,delay:80},{button:6,held:false,delay:80},{button:4,held:true,delay:80},{button:4,held:false,delay:80}]},waitForGlobals:{hex_:'cdab0309'}});
  assert.equal(original.currentNumber,43981);assert.equal(original.copyHex,'63ab0304');assert.equal(original.hex_,'cdab0309');
  report.originalPxt={compiledAndRun:true,controllerButtons:['A','B','down'],hex:original.hex_,copyHex:original.copyHex,currentNumber:original.currentNumber};
  report.journey.push('actual GUI MakeCode download compiles/runs in original Arcade with real controller buttons and matching bytes');
  report.blockErrors=await page.evaluate(()=>window.__bwBufferErrors);assert.deepEqual(report.blockErrors,[]);assert.deepEqual(report.pageErrors,[]);
  report.status='passed';
} catch(error){
  report.status='failed';report.error=String(error?.stack||error);
  if(page)report.failureState=await page.evaluate(()=>{
    const vm=window.__brickwrightStore?.getState()?.scratchGui?.vm;
    const values=Object.fromEntries((vm?.runtime.targets || []).flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
    return {hex:values.hex,copyHex:values.copyHex,currentNumber:values.currentNumber,phase:values.phase,errors:window.__bwBufferErrors || []};
  }).catch(error=>({observationError:String(error)}));
  if(page)await page.screenshot({path:path.join(path.dirname(out),'failure.png')}).catch(()=>{});
  throw error;
}
finally {clearTimeout(deadline);await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();}
