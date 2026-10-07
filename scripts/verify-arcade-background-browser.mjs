#!/usr/bin/env node
/** Visible Stage PNG → Pixel preset/painting → Code/Blocks → SB3 → original Arcade.
 * Product VM access observes only. Original PXT execution uses its normal simulator helper.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import {chromium} from 'playwright';
import {ARCADE_PALETTE,svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {sourceLayers,composeLayers} from '../overlay/scratch-gui/src/lib/bw-pixel-layers.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {compile} from './lib/pxt-node.mjs';
import {runArcadeSim} from './lib/makecode-arcade-sim.mjs';
import {BACKGROUND_CORNERS,AUTHORED_CORNERS,backgroundPixels,backgroundPng,UNMARKED_BACKGROUND_SVG} from '../test/fixtures/arcade-background-artwork.mjs';

const argument = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : undefined;
const out = path.resolve(argument('--out') || process.env.BW_BACKGROUND_REPORT || 'test-results/arcade-background-browser/current.json');
await fs.mkdir(path.dirname(out),{recursive:true});
const base = process.env.BW_BASE_URL || process.env.PROOF_URL || 'http://localhost:8617/';
const report={status:'running',generatedAt:new Date().toISOString(),journey:[],pageErrors:[],consoleMessages:[],
    boundary:'Synthetic PNG via actual file chooser; visible Pixel tools; exact source/assets and original PXT screen. Not arbitrary PNG formats or all game semantics.'};
const browser=await chromium.launch(process.env.BW_BROWSER?{executablePath:process.env.BW_BROWSER}:{});
const page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true});
page.on('dialog',dialog=>dialog.accept());
page.on('pageerror',error=>report.pageErrors.push(error.message));
page.on('console',message=>{if(['error','warning'].includes(message.type()))report.consoleMessages.push(message.text());});
const editor=()=>page.getByTestId('bw-code-editor').locator('.cm-content');
const readCode=()=>editor().evaluate(element=>element.cmTile.root.view.state.doc.toString());
const stageState=()=>page.evaluate(()=>{
    const stage=window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage();
    const costume=stage.getCostumes()[stage.currentCostume];
    return {id:stage.id,name:costume.name,assetId:costume.asset.assetId,format:costume.asset.dataFormat,currentCostume:stage.currentCostume};
});
const panel=async name=>{
    const toggle=page.getByTestId(`bw-pixel-${name}-toggle`);
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
};
const openCode=async()=>{
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByTestId('bw-pixel-canvas').waitFor({state:'hidden'});
    await editor().waitFor({state:'visible'});
};
const openStagePixels=async()=>{
    await page.getByRole('tab',{name:/Costumes|Backdrops/,exact:true}).click();
    if(!(await page.getByTestId('bw-pixel-canvas').isVisible()))await page.getByTestId('bw-pixel-toggle').click();
    await page.getByTestId('bw-pixel-canvas').waitFor({state:'visible'});
    const choices=page.getByTestId('bw-image-target');
    if(await choices.isVisible())await choices.selectOption({label:'Backdrops'});
    else {
        await panel('more');
        await page.getByTestId('bw-image-target-pixel').selectOption({label:'Backdrops'});
    }
    await page.getByRole('tab',{name:'Backdrops',exact:true}).waitFor({state:'visible'});
    if(!(await page.getByTestId('bw-pixel-canvas').isVisible()))await page.getByTestId('bw-pixel-toggle').click();
    await page.getByTestId('bw-pixel-canvas').waitFor({state:'visible'});
};
const savePixels=async()=>{
    const prior=await stageState();
    await page.getByTestId('bw-pixel-save').click();
    await page.waitForFunction(id=>{
        const stage=window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage();
        return stage.getCostumes()[stage.currentCostume].asset.assetId!==id;
    },prior.assetId);
};
const canvasCorners=()=>page.getByTestId('bw-pixel-canvas').evaluate((canvas,corners)=>{
    const cell=canvas.width/160,context=canvas.getContext('2d');
    return corners.map(([x,y])=>Array.from(context.getImageData(Math.floor((x+.5)*cell),Math.floor((y+.5)*cell),1,1).data));
},BACKGROUND_CORNERS);
const expectedColours=corners=>corners.map(([, ,colour])=>[...ARCADE_PALETTE[colour].slice(1).match(/../g).map(value=>parseInt(value,16)),255]);
const archive=async label=>{
    await page.getByText('File',{exact:true}).click();
    const pending=page.waitForEvent('download');
    await page.getByText('Save to your computer',{exact:true}).click();
    const file=path.join(path.dirname(out),`arcade-background-${label}.sb3`);
    await (await pending).saveAs(file);
    const zip=await JSZip.loadAsync(await fs.readFile(file));
    const project=JSON.parse(await zip.file('project.json').async('text'));
    const stage=project.targets.find(target=>target.isStage);
    const costume=stage.costumes[stage.currentCostume];
    const asset=await zip.file(costume.md5ext).async('nodebuffer');
    const artwork=JSON.parse(await zip.file('brickwright/artwork/v1.json').async('text'));
    assert.equal(artwork.version,4,'full-screen source advertises extended bounds to older readers');
    const stageAssets={};
    for(const item of stage.costumes)stageAssets[item.name]=crypto.createHash('sha256').update(await zip.file(item.md5ext).async('nodebuffer')).digest('hex');
    const record=artwork.costumes.find(row=>row.targetIndex===project.targets.indexOf(stage)&&row.costumeIndex===stage.currentCostume);
    assert.ok(record,'selected backdrop has editable source');
    const document=record.document;
    assert.equal(document.pixelScale,3);assert.equal(document.layers.length,2);
    const pixels=composeLayers(sourceLayers(document,160,120),160,120).pixels;
    assert.deepEqual(pixels,backgroundPixels(AUTHORED_CORNERS),'all19200 authored indexed pixels survive source persistence');
    const svg=svgToPixels(asset.toString(),document.palette);
    assert.equal(svg.width,160);assert.equal(svg.height,120);assert.equal(svg.scale,3);
    assert.deepEqual(svg.pixels,pixels,'flattened render and editable source agree');
    return {file,costume,document,stageAssets,sha256:crypto.createHash('sha256').update(asset).digest('hex')};
};
const sameArtwork=(actual,expected)=>{
    assert.deepEqual(actual.costume,expected.costume,'descriptor including name/centers remains exact');
    assert.deepEqual(actual.document,expected.document,'all layers/palette/source remain exact');
    assert.equal(actual.sha256,expected.sha256,'raw SVG bytes remain exact');
    assert.deepEqual(actual.stageAssets,expected.stageAssets,'all backgrounds including uniform SVG retain exact assets');
};
try {
    await page.addInitScript(()=>{
        localStorage.clear();sessionStorage.clear();localStorage.setItem('bw-starter-v1-complete','1');
    });
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
    await openCode();
    await page.getByTestId('bw-device-select').selectOption('arcade');
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwDeviceId==='arcade');
    await page.getByRole('button',{name:/To blocks/}).first().waitFor({state:'visible'});
    await openStagePixels();
    await panel('more');
    const svgChooser=page.waitForEvent('filechooser');
    await page.getByTestId('bw-costume-import-pixel').click();
    await (await svgChooser).setFiles({name:'uniform-background.svg',mimeType:'image/svg+xml',buffer:Buffer.from(UNMARKED_BACKGROUND_SVG)});
    await page.waitForFunction(()=>{
        const stage=window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage();
        return stage.getCostumes()[stage.currentCostume]?.name.includes('uniform-background');
    });
    await page.getByTestId('bw-pixel-canvas').waitFor({state:'visible'});await panel('more');
    await page.waitForFunction(()=>document.querySelector('[data-testid="bw-pixel-w"]')?.value==='160'&&
        document.querySelector('[data-testid="bw-pixel-h"]')?.value==='120');
    await page.getByTestId('bw-pixel-arcade-background').click();
    await page.getByTestId('bw-pixel-w').fill('159');
    await page.getByTestId('bw-pixel-primary-toolbar').getByRole('button',{name:'Undo',exact:true}).click();
    assert.equal(await page.getByTestId('bw-pixel-w').inputValue(),'160');
    assert.deepEqual(await canvasCorners(),expectedColours(BACKGROUND_CORNERS.map(([x,y])=>[x,y,2])));
    await savePixels();
    const uniformSvg=await page.evaluate(()=>{
        const stage=window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage();
        return stage.getCostumes()[stage.currentCostume].asset.decodeText();
    });
    const uniform=svgToPixels(uniformSvg);assert.equal(uniform.width,160);assert.equal(uniform.height,120);assert.equal(uniform.scale,3);
    assert.deepEqual(uniform.pixels,new Uint8Array(19200).fill(2),'unmarked full-screen SVG remains fully filled after preset/undo/save');
    report.journey.push('unmarked480×360 Stage SVG opens160×120; preset, resize/undo and save preserve all19200filledpixels');
    await panel('more');
    const chooser=page.waitForEvent('filechooser');
    await page.getByTestId('bw-costume-import-pixel').click();
    await (await chooser).setFiles({name:'arcade-background.png',mimeType:'image/png',buffer:backgroundPng(ARCADE_PALETTE)});
    await page.waitForFunction(()=>{
        const stage=window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage();
        return stage.getCostumes()[stage.currentCostume]?.name.includes('arcade-background');
    });
    await page.getByTestId('bw-pixel-canvas').waitFor({state:'visible'});
    await panel('more');
    await page.waitForFunction(()=>document.querySelector('[data-testid="bw-pixel-w"]')?.value==='160'&&
        document.querySelector('[data-testid="bw-pixel-h"]')?.value==='120');
    assert.equal((await stageState()).format,'png','actual upload remains native PNG before Pixel save');
    assert.deepEqual(await canvasCorners(),expectedColours(BACKGROUND_CORNERS),'browser PNG decode and initial Pixel display preserve corners');
    report.journey.push('native160×120 PNG uploaded through visible Stage file chooser and decoded at full logical size');
    await page.getByTestId('bw-pixel-arcade-background').click();
    assert.equal(await page.getByTestId('bw-pixel-w').inputValue(),'160');
    assert.equal(await page.getByTestId('bw-pixel-h').inputValue(),'120');
    await panel('layers');
    await page.getByTestId('bw-pixel-add-layer').click();
    for(const [x,y,colour] of AUTHORED_CORNERS){
        await page.getByTestId(`bw-pixel-colour-${colour}`).click();
        await page.getByTestId('bw-pixel-tool-pencil').click();
        const canvas=page.getByTestId('bw-pixel-canvas');await canvas.scrollIntoViewIfNeeded();
        const box=await canvas.boundingBox();
        await page.mouse.click(box.x+box.width*(x+.5)/160,box.y+box.height*(y+.5)/120);
    }
    assert.deepEqual(await canvasCorners(),expectedColours(AUTHORED_CORNERS));
    await savePixels();
    const before=await archive('authored');
    report.journey.push('visible160×120 background preset, new layer and four distinct corner strokes save exact19200pixels');
    await openCode();
    await page.getByRole('button',{name:/From blocks/}).first().click();
    await page.getByText('Read the current project into all languages.',{exact:false}).first().waitFor({state:'visible'});
    const generated=await readCode();assert.match(generated,/STAGE:/);assert.match(generated,/SPRITE /);
    // Add ordinary authored hats: show this backdrop and hide the default sprite
    // so a full-screen comparison measures only the user's background.
    const backdrop=(await stageState()).name;
    const program=generated.replace(/^SPRITE /m,`  WHEN flag clicked:\n    switch backdrop to ${JSON.stringify(backdrop)}\nSPRITE `)
        .trimEnd()+'\n  WHEN flag clicked:\n    hide\n';
    await editor().fill(program);
    const prior=(await stageState()).id;
    await page.getByRole('button',{name:/To blocks/}).first().click();
    await page.waitForFunction(id=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const button=document.querySelector('button[title^="Compile this"]');
        return vm.runtime.getTargetForStage()?.id!==id&&button&&!button.disabled;
    },prior,{timeout:30000});
    await page.getByText('Blocks loaded.',{exact:true}).waitFor({state:'visible'});
    await page.getByRole('tab',{name:'Blocks',exact:true}).click();
    await editor().waitFor({state:'hidden'});
    const after=await archive('code-blocks');sameArtwork(after,before);
    report.journey.push('actual Code apply and return to Blocks retain full-screen background layers and bytes');
    await page.getByText('File',{exact:true}).click();
    await page.getByText('Load from your computer',{exact:true}).click();
    const oldStageId=(await stageState()).id;
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(after.file);
    await page.waitForFunction(id=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id!==id,oldStageId);
    await openStagePixels();await panel('more');
    assert.equal(await page.getByTestId('bw-pixel-w').inputValue(),'160');
    assert.equal(await page.getByTestId('bw-pixel-h').inputValue(),'120');
    assert.deepEqual(await canvasCorners(),expectedColours(AUTHORED_CORNERS));
    const reopened=await archive('reopened');sameArtwork(reopened,before);
    report.journey.push('actual SB3 reopen retains160×120 editable source and exactrender');
    await openCode();
    const actions=page.getByTestId('bw-code-actions');
    if(!(await actions.getAttribute('open')))await actions.locator('summary').click();
    const downloaded=page.waitForEvent('download');
    await page.getByTestId('bw-makecode-arcade-export').click();
    const download=await downloaded;assert.match(download.suggestedFilename(),/\.hex$/);
    const filename=path.join(path.dirname(out),'arcade-background-export.hex');await download.saveAs(filename);
    const embedded=await unpackMakeCodeSource(await fs.readFile(filename));assert.ok(embedded.files?.['main.ts']);
    await fs.writeFile(path.join(path.dirname(out),'arcade-background-export.ts'),embedded.files['main.ts']);
    const compiled=await compile('arcade',embedded.files);assert.equal(compiled.success,true,JSON.stringify(compiled.diagnostics));
    const original=await runArcadeSim(compiled.outfiles['binary.js'],{ms:1000});assert.equal(original.error,null);
    const screen=original.screen();assert.equal(screen.length,19200);
    assert.deepEqual(screen,backgroundPixels(AUTHORED_CORNERS),'all19200pixels of actual downloaded export render identically in original PXT');
    report.originalPxt={compiled:true,pixelsCompared:screen.length,screenSha256:crypto.createHash('sha256').update(screen).digest('hex'),compilerNetworkAttempts:compiled.netAttempts};
    report.artwork={name:before.costume.name,sha256:before.sha256,width:160,height:120,layers:2,scale:3};
    report.journey.push('actual Arcade download compiles and renders all19200pixels exactly in original PXT');
    assert.deepEqual(report.pageErrors,[]);
    assert.deepEqual(report.consoleMessages.filter(message=>/Workspace Update Error|could not attach artwork|could not repack artwork/.test(message)),[]);
    report.status='passed';
} catch(error) {
    report.status='failed';report.failure=error.stack||String(error);
    report.body=(await page.locator('body').first().innerText().catch(()=>'' )).slice(-12000);
    report.stage=await stageState().catch(error=>({error:String(error)}));
    await page.screenshot({path:out.replace(/\.json$/,'')+'-failure.png'}).catch(()=>{});
    throw error;
} finally {
    await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');
    await browser.close();console.log(JSON.stringify({status:report.status,journeys:report.journey.length}));
}
