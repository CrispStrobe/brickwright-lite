#!/usr/bin/env node
/** Visible Pixel publication → persistent resource picker → editable Blocks → playback/export.
 * VM/Blockly access observes only. MakeCode interchange proves behaviour, not rich timeline/UUID retention.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import JSZip from 'jszip';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {makeCodeSourceHex} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {decodeAnimationJres} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js';
import {ANIMATION_COMPANION_PATH, recoverAnimationCompanion} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-companion.js';
import {compile} from './lib/pxt-node.mjs';
import {runArcadeSim} from './lib/makecode-arcade-sim.mjs';
const option=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:undefined;
const out=path.resolve(option('--out')||process.env.BW_ANIMATION_REPORT||'test-results/arcade-animation-resource-browser/current.json');
await fs.mkdir(path.dirname(out),{recursive:true});
const publicationOnly=process.argv.includes('--publication-only');
const report={status:'running',mode:publicationOnly?'publication-only':'full',generatedAt:new Date().toISOString(),journey:[],samples:[],pageErrors:[],consoleMessages:[],
    boundary:'Uniform100ms synthetic3×2 timeline; default palette. LocalSB3/Code↔Blocks preserve rich resource identity. Original MakeCode export/reimport verifies behaviour only; editable timeline/UUID interchange is unqualified.'};
const browser=await chromium.launch(process.env.BW_BROWSER?{executablePath:process.env.BW_BROWSER}:{});
const deadline=setTimeout(()=>{report.timedOut=true;void browser.close().catch(()=>{});},180000);
const page=await browser.newPage({viewport:{width:1600,height:1100},acceptDownloads:true});
page.setDefaultTimeout(15000);
page.on('dialog',dialog=>dialog.accept());
page.on('pageerror',error=>report.pageErrors.push(error.message));
page.on('console',message=>{if(['warning','error'].includes(message.type()))report.consoleMessages.push(message.text());});
const editor=()=>page.getByTestId('bw-code-editor').locator('.cm-content');
const openCode=async()=>{
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByTestId('bw-pixel-canvas').waitFor({state:'hidden'});
    await editor().waitFor({state:'visible'});
};
const panel=async name=>{
    const button=page.getByTestId(`bw-pixel-${name}-toggle`);
    if(await button.getAttribute('aria-expanded')!=='true')await button.click();
};
const pixels=async(targetLabel)=>{
    await page.getByRole('tab',{name:/Costumes|Backdrops/,exact:true}).click();
    if(!(await page.getByTestId('bw-pixel-canvas').isVisible()))await page.getByTestId('bw-pixel-toggle').click();
    await page.getByTestId('bw-pixel-canvas').waitFor({state:'visible'});
    if(targetLabel){
        const choices=page.getByTestId('bw-image-target');
        if(await choices.isVisible())await choices.selectOption({label:targetLabel});
        else {await panel('more');await page.getByTestId('bw-image-target-pixel').selectOption({label:targetLabel});}
    }
};
const resource=()=>page.evaluate(()=>{
    const rows=[...(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeAnimationResources?.values()||[])];
    return rows.map(row=>({...row,frames:row.frames.map(frame=>({...frame,pixels:Array.from(frame.pixels)}))}));
});
const paintFrame=async colour=>{
    await page.getByTestId(`bw-pixel-colour-${colour}`).click();
    await page.getByTestId('bw-pixel-tool-filledRect').click();
    const canvas=page.getByTestId('bw-pixel-canvas');await canvas.scrollIntoViewIfNeeded();
    const box=await canvas.boundingBox();assert.ok(box&&box.width>0&&box.height>0);
    await page.mouse.move(box.x+box.width/6,box.y+box.height/4);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*5/6,box.y+box.height*3/4,{steps:3});
    await page.mouse.up();
};
const snapshot=async (label,{bundleVersion=5,documentVersion=4,frameCount=3}={})=>{
    await page.getByText('File',{exact:true}).first().click();
    const downloaded=page.waitForEvent('download');
    await page.getByText('Save to your computer',{exact:true}).click();
    const file=path.join(path.dirname(out),`animation-${label}.sb3`);await (await downloaded).saveAs(file);
    const zip=await JSZip.loadAsync(await fs.readFile(file));
    const artwork=JSON.parse(await zip.file('brickwright/artwork/v1.json').async('text'));
    assert.equal(artwork.version,bundleVersion);
    const records=artwork.costumes.filter(row=>row.document.animation?.resource);assert.equal(records.length,1);
    const record=records[0];assert.equal(record.document.version,documentVersion);
    assert.equal(record.document.animation.frames.length,frameCount);assert.equal(record.document.layers.length,2);
    const render=await zip.file(record.renderedMd5ext).async('nodebuffer');
    return {file,document:record.document,assetHash:crypto.createHash('sha256').update(render).digest('hex')};
};
const apply=async()=>{
    const prior=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
    await page.getByRole('button',{name:/To blocks/}).first().click();
    await page.waitForFunction(id=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const button=document.querySelector('button[title^="Compile this"]');
        return vm.runtime.getTargetForStage()?.id!==id&&button&&!button.disabled;
    },prior);
    await page.getByText('Blocks loaded.',{exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        return vm.extensionManager.isExtensionLoaded('arcade')&&typeof vm.runtime._primitives.arcade_runImageAnimation==='function';
    });
    await page.getByRole('tab',{name:'Blocks',exact:true}).click();
    await editor().waitFor({state:'hidden'});
};
const sequence=values=>values.filter((value,index)=>index===0||value!==values[index-1]);
const cycle=(actual,expected,label)=>{
    assert.ok(actual.length>=expected.length,`${label}: enough distinct frames (${actual})`);
    assert.ok(actual.slice(0,-expected.length+1).some((_,index)=>expected.every((value,offset)=>actual[index+offset]===value)),`${label}: expected ordered cycle ${expected}, observed ${actual}`);
};
const observePlayback=async(label,expected,ms=1100)=>{
    const samples=await page.evaluate(async({ms,palette})=>{
        const rows=[],start=performance.now();
        while(performance.now()-start<ms){
            await new Promise(resolve=>requestAnimationFrame(resolve));
            const runtime=window.__brickwrightStore.getState().scratchGui.vm.runtime;
            const variables=runtime.targets.flatMap(target=>Object.values(target.variables));
            const actor=variables.find(variable=>variable.name==='actor'||variable.name.endsWith('_actor'))?.value;
            const sprite=runtime.bwArcadeDeviceState?.sprites?.[actor];
            const image=sprite?.image;
            runtime.renderer.draw();
            const canvas=runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
            const context=copy.getContext('2d');context.drawImage(canvas,0,0);
            const rgb=Array.from(context.getImageData(Math.floor(copy.width/2),Math.floor(copy.height/2),1,1).data);
            const visible=palette.findIndex(colour=>colour&&colour.slice(1).match(/../g).map(v=>parseInt(v,16)).every((channel,index)=>channel===rgb[index]));
            rows.push({t:Math.round(performance.now()-start),pixels:image?Array.from(image.pixels):null,width:image?.width,height:image?.height,visible});
        }
        return rows;
    },{ms,palette:ARCADE_PALETTE});
    report.playbackDiagnostics={label,samples};
    const firstReady=samples.findIndex(row=>row.pixels?.length===6&&expected.includes(row.pixels[0])&&expected.includes(row.visible));
    assert.ok(firstReady>=0,`${label}: actual sprite and visible renderer become ready`);
    const ready=samples.slice(firstReady);
    const invalid=ready.filter(row=>row.width!==3||row.height!==2||row.pixels?.length!==6||
        !row.pixels.every(pixel=>pixel===row.pixels[0])||!expected.includes(row.pixels[0])||!expected.includes(row.visible));
    assert.deepEqual(invalid,[],`${label}: no missing or unexpected frame after readiness`);
    const images=sequence(ready.map(row=>row.pixels[0])),visible=sequence(ready.map(row=>row.visible));
    cycle(images,expected,`${label} image`);cycle(visible,expected,`${label} visible RGB`);
    report.samples.push({label,imageSequence:images,visibleSequence:visible,observedFrames:samples.length,readinessFrames:firstReady,invalidFrames:invalid.length});
};
const flag=()=>page.locator('[class*="green-flag_green-flag"]').first();
const stop=()=>page.locator('[class*="stop-all_stop-all"]').first();
const phase=expected=>page.waitForFunction(value=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
    .flatMap(target=>Object.values(target.variables)).some(variable=>(variable.name==='phase'||variable.name.endsWith('_phase'))&&Number(variable.value)===value),expected);
try{
    await page.addInitScript(()=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('bw-starter-v1-complete','1');});
    await page.goto(process.env.BW_BASE_URL||process.env.PROOF_URL||'http://localhost:8617/',{waitUntil:'domcontentloaded',timeout:45000});
    report.pageScripts=await page.locator('script[src]').evaluateAll(elements=>elements.map(element=>element.getAttribute('src')));
    if(process.env.BW_EXPECT_GUI_BUNDLE)assert.ok(report.pageScripts.some(src=>src.endsWith(process.env.BW_EXPECT_GUI_BUNDLE)),
        'browser must load the expected qualified production GUI bundle');

    await openCode();await page.getByTestId('bw-device-select').selectOption('arcade');
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwDeviceId==='arcade');
    await pixels();await panel('more');
    await page.getByTestId('bw-pixel-w').fill('3');await page.getByTestId('bw-pixel-h').fill('2');
    await panel('layers');await page.getByTestId('bw-pixel-add-layer').click();
    await paintFrame(2);await panel('frames');
    await page.getByTestId('bw-pixel-animation-name').fill('Single');
    let singleId;
    for(const duration of [1,65535]){
        const input=page.getByTestId('bw-pixel-frame-duration');
        assert.equal(await input.getAttribute('min'),'1');assert.equal(await input.getAttribute('max'),'65535');
        await input.fill(String(duration));await page.getByTestId('bw-pixel-publish-animation').click();
        await page.waitForFunction(ms=>{
            const rows=[...(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeAnimationResources?.values()||[])];
            return rows.length===1&&rows[0].frames.length===1&&rows[0].frames[0].durationMs===ms;
        },duration);
        const single=(await resource())[0];
        if(singleId)assert.equal(single.id,singleId);else singleId=single.id;
        const saved=await snapshot(`single-${duration}`,{bundleVersion:6,documentVersion:5,frameCount:1});
        assert.equal(saved.document.animation.frames[0].durationMs,duration);
        const previous=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
        await page.getByText('File',{exact:true}).first().click();const load=page.waitForEvent('filechooser');
        await page.getByText('Load from your computer',{exact:true}).click();await (await load).setFiles(saved.file);
        await page.waitForFunction(id=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id!==id,previous);
        await pixels();await panel('frames');
        assert.equal(await page.getByTestId('bw-pixel-frame-duration').inputValue(),String(duration));
        assert.deepEqual((await resource())[0],single);
    }
    report.nativeEditorBounds={singleResourceId:singleId,intervalEndpoints:[1,65535],sb3Reopened:true};
    report.journey.push('actual Pixel publishes one frame at both native duration endpoints and SB3 reopen preserves timing and UUID');
    await page.getByTestId('bw-pixel-remove-animation').click();
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeAnimationResources?.size===0);
    for(const [index,colour] of [2,5,9].entries()){
        if(index){await panel('frames');await page.getByTestId('bw-pixel-add-frame').click();}
        await paintFrame(colour);await panel('frames');
        await page.getByTestId('bw-pixel-frame-duration').fill('100');
        if(index)await page.getByTestId('bw-pixel-frame-name').fill(`Step ${index+1}`);
    }
    await page.getByTestId('bw-pixel-animation-name').fill('Walk');
    await page.getByTestId('bw-pixel-publish-animation').click();
    await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeAnimationResources?.size===1);
    const published=(await resource())[0];assert.equal(published.name,'Walk');assert.deepEqual(published.palette,ARCADE_PALETTE);
    assert.deepEqual(published.frames.map(frame=>frame.pixels),[2,5,9].map(colour=>Array(6).fill(colour)));
    assert.ok(published.frames.every(frame=>frame.durationMs===100));report.resourceId=published.id;
    const authored=await snapshot('published');
    report.journey.push('three actual Pixel frames, layers and uniform timing publish a stable named animation');
    await panel('frames');await page.getByTestId('bw-pixel-frame-duration').fill('240');
    await page.getByTestId('bw-pixel-publish-animation').click();
    await page.getByTestId('bw-pixel-animation-error').waitFor({state:'visible'});
    assert.match(await page.getByTestId('bw-pixel-animation-error').innerText(),/equal durations/);
    assert.deepEqual((await resource())[0],published,'failed publication preserves prior registry');
    await page.getByTestId('bw-pixel-frame-duration').fill('100');await page.getByTestId('bw-pixel-publish-animation').click();
    const prior=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
    await page.getByText('File',{exact:true}).first().click();const chooser=page.waitForEvent('filechooser');
    await page.getByText('Load from your computer',{exact:true}).click();await (await chooser).setFiles(authored.file);
    await page.waitForFunction(id=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id!==id,prior);
    await pixels();await panel('frames');
    assert.equal(await page.getByTestId('bw-pixel-animation-name').inputValue(),'Walk');
    const reopened=await snapshot('reopened');assert.deepEqual(reopened.document,authored.document);assert.equal(reopened.assetHash,authored.assetHash);
    assert.deepEqual((await resource())[0],published);
    report.journey.push('unequal publication preserves prior art/resource; actual SB3 reopen retains UUID, frames, palette and layers');
    if(publicationOnly){
        await openCode();await page.getByTestId('bw-device-select').selectOption('arcade');
        await page.getByRole('tab',{name:'Blocks',exact:true}).click();
        await page.getByTitle('Add Extension',{exact:true}).click();await page.getByText('Arcade',{exact:true}).click();
        await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.extensionManager.isExtensionLoaded('arcade'));
        for(const opcode of ['arcade_animationAssetFrames','arcade_animationAssetFreshFrames','arcade_animationAssetInterval']){
            let fieldRect=null;
            for(let attempt=0;attempt<24;attempt++){
                fieldRect=await page.evaluate(opcode=>{
                    const block=window.Blockly.getMainWorkspace().getFlyout().getWorkspace().getAllBlocks(false).find(block=>block.type===opcode);
                    const field=block?.getInputTargetBlock('RESOURCE')?.getField('animationAssets');
                    if(!field)return null;
                    const rect=field.getSvgRoot().getBoundingClientRect();
                    return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,options:field.getOptions()};
                },opcode);
                assert.ok(fieldRect,`${opcode}: native resource menu exists`);
                if(fieldRect.y>120&&fieldRect.y<900)break;
                await page.mouse.move(230,500);await page.mouse.wheel(0,fieldRect.y>900?400:-400);
                await page.waitForFunction(({opcode,previousY})=>{
                    const block=window.Blockly.getMainWorkspace().getFlyout().getWorkspace().getAllBlocks(false).find(block=>block.type===opcode);
                    const field=block?.getInputTargetBlock('RESOURCE')?.getField('animationAssets');
                    const rect=field?.getSvgRoot()?.getBoundingClientRect();
                    const y=rect&&rect.y+rect.height/2;
                    return Number.isFinite(y)&&(y!==previousY||(y>120&&y<900));
                },{opcode,previousY:fieldRect.y});
            }
            assert.ok(fieldRect.y>120&&fieldRect.y<900,`${opcode}: resource block is reachable by toolbox scrolling`);
            assert.ok(fieldRect.options.some(([name,id])=>name==='Walk'&&id===published.id));
            // Drag the real reporter out of the flyout before editing its
            // menu; flyout defaults can be rebuilt as the palette scrolls.
            await page.evaluate(async opcode=>{
                const deadline=performance.now()+2000;
                let previous='',stable=0;
                while(performance.now()<deadline){
                    await new Promise(resolve=>requestAnimationFrame(resolve));
                    const block=window.Blockly.getMainWorkspace().getFlyout().getWorkspace().getAllBlocks(false).find(block=>block.type===opcode);
                    const rect=block?.getSvgRoot()?.getBoundingClientRect();
                    const key=rect&&rect.width>0&&rect.height>0?JSON.stringify([rect.x,rect.y,rect.width,rect.height]):'';
                    stable=key&&key===previous?stable+1:0;previous=key;
                    if(stable>=3)return;
                }
                throw new Error(opcode+': flyout bounds did not settle before dragging');
            },opcode);
            const source=await page.evaluate(opcode=>{
                const block=window.Blockly.getMainWorkspace().getFlyout().getWorkspace().getAllBlocks(false).find(block=>block.type===opcode);
                const rect=block.getSvgRoot().getBoundingClientRect();return {x:rect.x+45,y:rect.y+rect.height/2};
            },opcode);
            await page.mouse.move(source.x,source.y);await page.mouse.down();
            await page.mouse.move(650,{arcade_animationAssetFrames:260,arcade_animationAssetFreshFrames:360,arcade_animationAssetInterval:460}[opcode],{steps:15});await page.mouse.up();
            await page.waitForFunction(opcode=>window.Blockly.getMainWorkspace().getAllBlocks(false).some(block=>block.type===opcode),opcode);
            const selected=await page.evaluate(opcode=>{
                const block=window.Blockly.getMainWorkspace().getAllBlocks(false).find(block=>block.type===opcode);
                const menu=block.getInputTargetBlock('RESOURCE'),field=menu.getField('animationAssets'),rect=field.getSvgRoot().getBoundingClientRect();
                return {id:menu.id,x:rect.x+rect.width/2,y:rect.y+rect.height/2};
            },opcode);
            await page.mouse.click(selected.x,selected.y);
            await page.getByRole('menuitemcheckbox',{name:'Walk',exact:true}).click();
            await page.waitForFunction(({id,uuid})=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.some(target=>
                target.blocks._blocks[id]?.fields?.animationAssets?.value===uuid),{id:selected.id,uuid:published.id});
        }
        report.journey.push('Add Extension → Arcade exposes reachable native shared/fresh-frame and interval pickers with published name and UUID');
    }
    if(!publicationOnly){
        await openCode();await page.getByRole('button',{name:/From blocks/}).first().click();
        await page.getByText('Read the current project into all languages.',{exact:false}).first().waitFor({state:'visible'});
        const generated=await editor().evaluate(element=>element.cmTile.root.view.state.doc.toString());
        const device=/^DEVICE[^\n]*/m.exec(generated)?.[0]||'DEVICE ARCADE';
        await editor().fill(`${device}\nGLOBAL actor\nGLOBAL frames\nGLOBAL interval\nGLOBAL phase\nGLOBAL freshFirst\nGLOBAL freshSecond\nGLOBAL freshPixel\nGLOBAL sharedPixel\nGLOBAL freshSame\n${generated.replace(/^DEVICE[^\n]*\n?/m,'').trimEnd()}\nSPRITE Game:\nWHEN flag clicked:\n  hide\n  arcade set background color to 1\n  set actor to arcade create image (arcade new image width 3 height 2) template "" kind "Player"\n  arcade set position of actor x 80 y 60\n  arcade set scale of actor to 8 anchor 0\n  set frames to `);
        await editor().click();await page.keyboard.press('Control+End');
        await page.getByTestId('bw-code-animation-picker').selectOption(published.id);
        await page.getByTestId('bw-code-animation-insert-frames').click();
        await editor().click();await page.keyboard.press('Control+End');await page.keyboard.insertText('\n  set interval to ');
        await page.getByTestId('bw-code-animation-insert-interval').click();
        for(const variable of ['freshFirst','freshSecond']){
            await editor().click();await page.keyboard.press('Control+End');await page.keyboard.insertText(`\n  set ${variable} to `);
            await page.getByTestId('bw-code-animation-insert-fresh').click();
        }
        await editor().click();await page.keyboard.press('Control+End');await page.keyboard.insertText(`\n  arcade set image pixel (item 0 of array reference (freshFirst)) x 0 y 0 color 7\n  set freshPixel to arcade image pixel (item 0 of array reference (freshSecond)) x 0 y 0\n  set sharedPixel to arcade image pixel (item 0 of array reference (frames)) x 0 y 0\n  set freshSame to compare value (freshFirst) op "===" with (freshSecond)`);

        await editor().click();await page.keyboard.press('Control+End');await page.keyboard.insertText(`\n  arcade animate sprite actor frames frames interval interval loop (1 = 1)\n  set phase to 1\nWHEN space key pressed:\n  arcade animate sprite actor frames frames interval interval loop (1 = 1)\n  set phase to 1\nWHEN z key pressed:\n  arcade stop animations of actor type 1\n  set phase to 2\nWHEN arcade every 20 ms:\n  arcade log (arcade pixel of actor x 0 y 0)\n`);
        const inserted=await editor().evaluate(element=>element.cmTile.root.view.state.doc.toString());
        assert.ok(inserted.includes(`arcade animation frames resource "${published.id}"`));assert.ok(inserted.includes(`arcade animation fresh frames resource "${published.id}"`));assert.ok(inserted.includes(`arcade animation interval resource "${published.id}"`));
        await apply();
        // Wait for the visible workspace render, not only VM deserialization.
        await page.waitForFunction(()=>{
            const block=window.Blockly.getMainWorkspace().getAllBlocks(false).find(block=>block.type==='arcade_animationAssetFrames');
            return block?.getInputTargetBlock('RESOURCE')?.getField('animationAssets')?.getSvgRoot()?.isConnected;
        });
        // The generated reporter owns a real dynamic native menu shadow.
        const dropdown=await page.evaluate(()=>{
            const block=window.Blockly.getMainWorkspace().getAllBlocks(false).find(block=>block.type==='arcade_animationAssetFrames');
            const menu=block?.getInputTargetBlock('RESOURCE'),field=menu?.getField('animationAssets');
            if(!field)throw new Error('Missing animation asset dropdown');
            const rect=field.getSvgRoot().getBoundingClientRect();return {id:menu.id,x:rect.x+rect.width/2,y:rect.y+rect.height/2,value:field.getValue()};
        });
        assert.equal(dropdown.value,published.id);assert.ok(dropdown.x>0&&dropdown.y>0&&dropdown.y<1100);
        await page.mouse.click(dropdown.x,dropdown.y);
        await page.getByRole('menuitemcheckbox',{name:'Walk',exact:true}).click();
        await page.waitForFunction(({id,uuid})=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.some(target=>
            target.blocks._blocks[id]?.fields?.animationAssets?.value===uuid),{id:dropdown.id,uuid:published.id});
        report.journey.push('actual Code picker inserts typed frames/interval; real Blocks dropdown displays name and stores UUID');
        const roundtrip=await snapshot('code-blocks');assert.deepEqual(roundtrip.document,authored.document);assert.equal(roundtrip.assetHash,authored.assetHash);
        const pane=page.locator('[data-right-pane-toggle]');if(await pane.getAttribute('aria-pressed')!=='true')await pane.click();
        await page.getByTitle('Game Console',{exact:true}).click();await flag().click();await phase(1);
        await observePlayback('initial',[2,5,9]);
        await page.getByTestId('bw-arcade-b').click();await phase(2);
        const stopped=await page.evaluate(async()=>{
            const rows=[];for(let index=0;index<12;index++){await new Promise(resolve=>requestAnimationFrame(resolve));
                const runtime=window.__brickwrightStore.getState().scratchGui.vm.runtime;
                const actor=runtime.targets.flatMap(target=>Object.values(target.variables)).find(v=>v.name==='actor'||v.name.endsWith('_actor'))?.value;
                rows.push(Array.from(runtime.bwArcadeDeviceState.sprites[actor].image.pixels));}
            return rows;
        });assert.ok(stopped.every(pixels=>JSON.stringify(pixels)===JSON.stringify(stopped[0])),'B stops actual image animation');
        await page.getByTestId('bw-arcade-a').click();await phase(1);await observePlayback('controller-restart',[2,5,9]);
        await stop().click();await flag().click();await phase(1);await observePlayback('green-flag-restart',[2,5,9]);await stop().click();
        report.journey.push('actual controller B stops, A restarts, Stop/green flag resets; authored pixels and visible colours cycle in order');
        const freshState=await page.evaluate(()=>{
            const variables=window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
            return Object.fromEntries(['freshPixel','sharedPixel','freshSame'].map(name=>[name,variables.find(variable=>variable.name===name)?.value]));
        });
        assert.deepEqual(freshState,{freshPixel:2,sharedPixel:2,freshSame:false});
        report.freshLookup={codePicker:true,mutationIsolated:true,observed:freshState};
        report.journey.push('actual fresh-frame Code picker builds distinct arrays/images; mutating one lookup preserves another and shared playback');

        // The authored resource belongs to Stage; Code apply selects the Game script host.
        await pixels('Backdrops');await panel('frames');await page.getByTestId('bw-pixel-frame-2').click();
        await page.getByRole('button',{name:'Earlier frame',exact:true}).click();
        await page.getByTestId('bw-pixel-animation-name').fill('Run');await page.getByTestId('bw-pixel-publish-animation').click();
        await page.waitForFunction(uuid=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeAnimationResources?.get(uuid)?.name==='Run',published.id);
        const reordered=(await resource())[0];assert.equal(reordered.id,published.id);assert.deepEqual(reordered.frames.map(frame=>frame.pixels[0]),[2,9,5]);
        await page.getByRole('tab',{name:'Blocks',exact:true}).click();await page.getByTestId('bw-pixel-canvas').waitFor({state:'hidden'});
        await flag().click();await phase(1);await observePlayback('renamed-reordered',[2,9,5]);await stop().click();
        const nativeScreen=await page.evaluate(palette=>{
            const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
            const canvas=document.createElement('canvas');canvas.width=renderer.canvas.width;canvas.height=renderer.canvas.height;
            const context=canvas.getContext('2d');context.drawImage(renderer.canvas,0,0);
            const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
            const colours=palette.map(value=>value?value.slice(1).match(/../g).map(channel=>parseInt(channel,16)):[0,0,0]);
            return Array.from({length:19200},(_,index)=>{
                const x=index%160,y=Math.floor(index/160);
                const offset=(Math.floor((y+.5)*canvas.height/120)*canvas.width+Math.floor((x+.5)*canvas.width/160))*4;
                return colours.findIndex(rgb=>rgb.every((channel,c)=>channel===rgba[offset+c]));
            });
        },ARCADE_PALETTE);
        const nativeColour=nativeScreen[60*160+80];assert.ok([2,9,5].includes(nativeColour));
        const expectedNative=Array.from({length:19200},(_,index)=>{
            const x=index%160,y=Math.floor(index/160);return x>=68&&x<92&&y>=52&&y<68?nativeColour:1;
        });
        assert.deepEqual(nativeScreen,expectedNative,'all19200actual Brickwright pixels match authored footprint');
        report.nativeScreen={colour:nativeColour,pixelsCompared:nativeScreen.length};
        const renamedSource=await snapshot('renamed-reordered');report.journey.push('Pixel rename/reorder preserves UUID and updates bound playback without rewriting code');
        await openCode();const actions=page.getByTestId('bw-code-actions');if(await actions.getAttribute('open')===null)await actions.locator('summary').click();
        const exported=page.waitForEvent('download');await page.getByTestId('bw-makecode-arcade-export').click();
        const download=await exported;assert.match(download.suggestedFilename(),/\.hex$/);
        const hex=path.join(path.dirname(out),'animation-export.hex');await download.saveAs(hex);const bytes=await fs.readFile(hex);
        const embedded=await unpackMakeCodeSource(bytes);assert.ok(embedded.files?.['main.ts']);await fs.writeFile(path.join(path.dirname(out),'animation-export.ts'),embedded.files['main.ts']);
        const nativeConfig=JSON.parse(embedded.files['pxt.json']);
        for(const file of ['images.g.jres','images.g.ts'])assert.ok(nativeConfig.files.includes(file),`native asset file ${file} is included`);
        const nativeEntries=Object.values(JSON.parse(embedded.files['images.g.jres']));
        assert.equal(nativeEntries.length,1);
        const nativeAnimation=decodeAnimationJres(nativeEntries[0]);
        assert.equal(nativeAnimation.name,'Run');assert.equal(nativeAnimation.intervalMs,100);
        assert.deepEqual([nativeAnimation.width,nativeAnimation.height],[3,2]);
        assert.deepEqual(nativeAnimation.frames.map(frame=>Array.from(frame.pixels)),
            [2,9,5].map(colour=>Array(6).fill(colour)),'download retains renamed native gallery frames, order, pixels and interval');
        report.nativeGallery={name:nativeAnimation.name,intervalMs:nativeAnimation.intervalMs,frames:nativeAnimation.frames.length};
        assert.ok(nativeConfig.files.includes(ANIMATION_COMPANION_PATH));
        const recoveredSource=recoverAnimationCompanion(embedded.files[ANIMATION_COMPANION_PATH],[nativeAnimation],ARCADE_PALETTE);
        assert.deepEqual(recoveredSource.warnings,[]);
        assert.deepEqual(recoveredSource.resources[0].document,renamedSource.document,
            'actual downloaded companion validates and recovers exact UUID, frame IDs, palette and layers');
        report.richCompanion={validated:true,resourceId:recoveredSource.resources[0].document.animation.resource.id,
            guiTimelineRestored:false};
        const compiled=await compile('arcade',embedded.files);assert.equal(compiled.success,true,JSON.stringify(compiled.diagnostics));
        const original=await runArcadeSim(compiled.outfiles['binary.js'],{ms:1000});assert.equal(original.error,null);
        const originalSequence=sequence(original.serial.map(row=>Number(row.text)).filter(value=>[2,9,5].includes(value)));cycle(originalSequence,[2,9,5],'original PXT');
        const screen=original.screen(),colour=screen[60*160+80];assert.ok([2,9,5].includes(colour));
        const expected=Uint8Array.from({length:19200},(_,index)=>{const x=index%160,y=Math.floor(index/160);return x>=68&&x<92&&y>=52&&y<68?colour:1;});
        assert.deepEqual(screen,expected,'all19200original screen pixels match authored scaled frame footprint');
        let matchingScreen=null;
        for(const ms of [75,175,275,375]){
            const sample=await runArcadeSim(compiled.outfiles['binary.js'],{ms});assert.equal(sample.error,null);
            if(sample.screen()[60*160+80]===nativeColour){matchingScreen=Array.from(sample.screen());break;}
        }
        assert.ok(matchingScreen,'original simulation reaches the same authored frame');
        assert.deepEqual(matchingScreen,nativeScreen,'all19200actual Brickwright and original PXT pixels agree at the same frame');
        report.originalPxt={compiled:true,sequence:originalSequence,pixelsCompared:screen.length,actualNativePixelsCompared:matchingScreen.length,compilerNetworkAttempts:compiled.netAttempts};
        if(await actions.getAttribute('open')===null)await actions.locator('summary').click();
        const priorIds=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.map(target=>target.id));
        const priorCode=await editor().innerText(),priorResources=await resource();
        const malformed=Buffer.from(makeCodeSourceHex({...embedded.files,[ANIMATION_COMPANION_PATH]:'{broken'},
            {name:'invalid-animation-source',target:'arcade'}));
        await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
            name:'invalid-animation-source.hex',mimeType:'application/octet-stream',buffer:malformed});
        await page.getByText('Could not read invalid-animation-source.hex: Animation companion JSON is malformed',{exact:true}).waitFor({state:'visible'});
        assert.deepEqual(await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.map(target=>target.id)),priorIds);
        assert.equal(await editor().innerText(),priorCode);assert.deepEqual(await resource(),priorResources);
        report.journey.push('malformed companion file import names the error and preserves the loaded VM, Code and published resources');
        await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({name:'animation-export.hex',mimeType:'application/octet-stream',buffer:bytes});
        await page.getByText(/Imported the Arcade game.*animation-export\.hex/).first().waitFor({state:'visible'});
        if(await actions.getAttribute('open')!==null)await actions.locator('summary').click();
        assert.ok((await editor().innerText()).includes(`arcade animation fresh frames resource "${published.id}"`));
        await apply();
        const automaticLibrary=await page.evaluate(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            const target=vm.runtime.targets.find(t=>t.bwAssetLibrary);
            return target&&{name:target.getName(),visible:target.visible,role:target.bwAssetLibrary,
                scripts:target.blocks.getScripts().length,costumes:target.sprite.costumes.length};
        });
        assert.deepEqual(automaticLibrary,{name:'Arcade artwork',visible:false,
            role:{version:1,kind:'arcade-animation'},scripts:0,costumes:1});
        assert.equal((await resource())[0].id,published.id);
        report.nativeImport={automatic:true,library:automaticLibrary,companionIdentityPreserved:true};
        await flag().click();await phase(1);await observePlayback('original-export-reimport',[2,9,5]);
        await page.getByTestId('bw-arcade-b').click();await phase(2);
        const importedStopped=await page.evaluate(async()=>{
            const rows=[];for(let index=0;index<12;index++){await new Promise(resolve=>requestAnimationFrame(resolve));
                const runtime=window.__brickwrightStore.getState().scratchGui.vm.runtime;
                const actor=runtime.targets.flatMap(target=>Object.values(target.variables)).find(v=>v.name==='actor'||v.name.endsWith('_actor'))?.value;
                rows.push(Array.from(runtime.bwArcadeDeviceState.sprites[actor].image.pixels));}
            return rows;
        });assert.ok(importedStopped.every(pixels=>JSON.stringify(pixels)===JSON.stringify(importedStopped[0])),'reimported B stops actual animation');
        await page.getByTestId('bw-arcade-a').click();await phase(1);await observePlayback('reimported-controller-restart',[2,9,5]);await stop().click();
        report.journey.push('actual Arcade download compiles/runs in original PXT; frame order/fullscreen pixels and file-reimport behaviour match');
        await pixels('Arcade artwork');await panel('frames');
        await page.getByTestId('bw-pixel-frame-0').click();
        await page.getByTestId('bw-pixel-frames-toggle').click();await paintFrame(4);await panel('frames');
        await page.getByTestId('bw-pixel-publish-animation').click();
        await flag().click();await phase(1);await observePlayback('automatic-library-pixel-edit',[4,9,5]);await stop().click();
        const autoSaved=await snapshot('automatic-library-edited',{bundleVersion:7});
        const autoStage=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
        await page.getByText('File',{exact:true}).first().click();const autoChooser=page.waitForEvent('filechooser');
        await page.getByText('Load from your computer',{exact:true}).click();await(await autoChooser).setFiles(autoSaved.file);
        await page.waitForFunction(id=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id!==id,autoStage);
        await openCode();await page.getByRole('button',{name:/From blocks/}).first().click();
        await page.getByText('Read the current project into all languages.',{exact:false}).first().waitFor({state:'visible'});
        assert.doesNotMatch(await editor().innerText(),/^SPRITE Arcade artwork/m);
        await apply();await flag().click();await phase(1);await observePlayback('automatic-library-reopen-code-blocks',[4,9,5]);await stop().click();
        report.nativeImport.pixelEdited=true;report.nativeImport.sb3Reopened=true;report.nativeImport.codeBlocksRetained=true;
        report.journey.push('automatic native import preserves companion UUID, installs a hidden library and survives Pixel edit/save/reopen/Code/Blocks/controller playback');
        for(const duration of [1,65535]){
            const oldStage=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
            await page.getByText('File',{exact:true}).first().click();const chooser=page.waitForEvent('filechooser');
            await page.getByText('Load from your computer',{exact:true}).click();
            await (await chooser).setFiles(path.join(path.dirname(out),`animation-single-${duration}.sb3`));
            await page.waitForFunction(id=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id!==id,oldStage);
            await openCode();await page.getByRole('button',{name:/From blocks/}).first().click();
            await page.getByText('Read the current project into all languages.',{exact:false}).first().waitFor({state:'visible'});
            const baseline=await editor().evaluate(element=>element.cmTile.root.view.state.doc.toString());
            await editor().fill(`DEVICE ARCADE\nGLOBAL nativeActor\nGLOBAL nativeFrames\nGLOBAL nativeInterval\n${baseline.replace(/^DEVICE[^\n]*\n?/m,'').trimEnd()}\nSPRITE NativeEndpoint:\nWHEN flag clicked:\n  hide\n  arcade set background color to 1\n  set nativeActor to arcade create image (arcade new image width 3 height 2) template "" kind "Player"\n  arcade set position of nativeActor x 80 y 60\n  arcade set scale of nativeActor to 8 anchor 0\n  set nativeFrames to arcade animation frames resource "${singleId}"\n  set nativeInterval to arcade animation interval resource "${singleId}"\n  arcade animate sprite nativeActor frames nativeFrames interval nativeInterval loop (1 = 1)\n`);
            await apply();await flag().click();
            await page.waitForFunction(({duration,palette})=>{
                const runtime=window.__brickwrightStore.getState().scratchGui.vm.runtime;
                const variables=runtime.targets.flatMap(target=>Object.values(target.variables));
                const actor=variables.find(variable=>variable.name==='nativeActor')?.value;
                const interval=variables.find(variable=>variable.name==='nativeInterval')?.value;
                const image=runtime.bwArcadeDeviceState?.sprites?.[actor]?.image;
                if(Number(interval)!==duration||image?.pixels.length!==6||!Array.from(image.pixels).every(pixel=>pixel===2))return false;
                const canvas=runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
                const context=copy.getContext('2d');context.drawImage(canvas,0,0);
                const rgb=context.getImageData(Math.floor(copy.width/2),Math.floor(copy.height/2),1,1).data;
                return palette[2].slice(1).match(/../g).every((value,index)=>parseInt(value,16)===rgb[index]);
            },{duration,palette:ARCADE_PALETTE});
            await stop().click();
        }
        report.nativeEditorBounds.runtimeAndVisibleEndpoints=true;
        report.journey.push('actual Code-to-Blocks reporters run one-frame resources at both native interval endpoints with exact visible pixels');

        // An explicit owned SB3 fixture qualifies the library foundation. This
        // does not claim automatic native MakeCode library reconstruction.
        const libraryZip=await JSZip.loadAsync(await fs.readFile(path.join(path.dirname(out),'animation-code-blocks.sb3')));
        const libraryProject=JSON.parse(await libraryZip.file('project.json').async('text'));
        const source=JSON.parse(await libraryZip.file('brickwright/artwork/v1.json').async('text'));
        const sourceRow=source.costumes.find(row=>row.document.animation?.resource);
        assert.ok(sourceRow);
        const libraryDocument=JSON.parse(JSON.stringify(sourceRow.document));
        const carrier=JSON.parse(JSON.stringify(libraryProject.targets[sourceRow.targetIndex].costumes[sourceRow.costumeIndex]));
        sourceRow.document={version:1,layers:[{id:'base',type:'vector',name:'Artwork',visible:true,locked:false,opacity:1,
            content:{kind:'asset',value:sourceRow.renderedMd5ext}}]};
        const libraryName='Arcade artwork';
        assert.ok(!libraryProject.targets.some(target=>target.name===libraryName));
        const libraryIndex=libraryProject.targets.length;
        libraryProject.targets.push({isStage:false,name:libraryName,variables:{},lists:{},broadcasts:{},blocks:{},comments:{},
            currentCostume:0,costumes:[carrier],sounds:[],volume:100,visible:false,x:0,y:0,size:100,direction:90,
            draggable:false,rotationStyle:'all around',layerOrder:libraryIndex});
        source.version=7;source.libraries=[{targetIndex:libraryIndex,role:{version:1,kind:'arcade-animation'}}];
        source.costumes.push({targetIndex:libraryIndex,costumeIndex:0,renderedMd5ext:carrier.md5ext,document:libraryDocument});
        libraryZip.file('project.json',JSON.stringify(libraryProject));
        libraryZip.file('brickwright/artwork/v1.json',JSON.stringify(source));
        const libraryFile=path.join(path.dirname(out),'animation-library-fixture.sb3');
        await fs.writeFile(libraryFile,await libraryZip.generateAsync({type:'nodebuffer'}));
        const loadLibrary=async file=>{
            const old=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
            await page.getByText('File',{exact:true}).first().click();const chosen=page.waitForEvent('filechooser');
            await page.getByText('Load from your computer',{exact:true}).click();await(await chosen).setFiles(file);
            await page.waitForFunction(id=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id!==id,old);
        };
        await loadLibrary(libraryFile);await pixels(libraryName);await panel('frames');
        assert.equal(await page.getByTestId('bw-pixel-animation-name').inputValue(),'Walk');
        await page.getByTestId('bw-pixel-frame-0').click();
        await page.getByTestId('bw-pixel-frames-toggle').click();
        await page.getByTestId('bw-pixel-frame-duration').waitFor({state:'hidden'});
        await paintFrame(4);await panel('frames');await page.getByTestId('bw-pixel-publish-animation').click();
        await page.waitForFunction(id=>window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeAnimationResources?.get(id)?.frames[0].pixels[0]===4,published.id);
        const editedLibrary=await snapshot('library-edited',{bundleVersion:7});
        await loadLibrary(editedLibrary.file);
        await openCode();await page.getByRole('button',{name:/From blocks/}).first().click();
        await page.getByText('Read the current project into all languages.',{exact:false}).first().waitFor({state:'visible'});
        const libraryCode=await editor().evaluate(element=>element.cmTile.root.view.state.doc.toString());
        assert.ok(!libraryCode.includes(`SPRITE ${libraryName}:`),'resource library has no program declaration');
        await apply();await flag().click();await phase(1);await observePlayback('library-source-edited',[4,5,9]);await stop().click();
        const libraryState=await page.evaluate(name=>{
            const runtime=window.__brickwrightStore.getState().scratchGui.vm.runtime;
            const library=runtime.targets.find(target=>target.getName()===name);
            const vars=runtime.targets.flatMap(target=>Object.values(target.variables));
            return {role:library?.bwAssetLibrary,visible:library?.visible,
                freshPixel:vars.find(variable=>variable.name==='freshPixel')?.value,
                sharedPixel:vars.find(variable=>variable.name==='sharedPixel')?.value};
        },libraryName);
        assert.deepEqual(libraryState,{role:{version:1,kind:'arcade-animation'},visible:false,freshPixel:4,sharedPixel:4});
        const retainedLibrary=await snapshot('library-code-blocks',{bundleVersion:7});
        assert.deepEqual(retainedLibrary.document,editedLibrary.document);
        report.assetLibrary={fixture:true,automaticNativeImport:false,pixelEdited:true,codeBlocksRetained:true,sb3Reopened:true,observed:libraryState};
        report.journey.push('explicit hidden library fixture opens in Pixel, edits and SB3 reopen retain role, UUID and rich source');
        report.journey.push('Code excludes library declarations and preserves hidden carriers; fresh/shared runtime lookups play edited source');

        await openCode();if(await actions.getAttribute('open')===null)await actions.locator('summary').click();
        const libraryDownload=page.waitForEvent('download');await page.getByTestId('bw-makecode-arcade-export').click();
        const libraryHex=path.join(path.dirname(out),'animation-library-export.hex');await(await libraryDownload).saveAs(libraryHex);
        const cliHex=path.join(path.dirname(out),'animation-library-cli.hex');
        await promisify(execFile)(process.execPath,['scripts/makecode.mjs','to-hex',retainedLibrary.file,
            '--target','arcade','--source','-o',cliHex],{timeout:30000});
        for(const [route,file] of [['GUI',libraryHex],['CLI',cliHex]]){
            const returned=await unpackMakeCodeSource(await fs.readFile(file));
            assert.ok(!returned.files['main.ts'].includes('Arcade_artworkSprite'),`${route}: library has no gameplay actor`);
            const entries=Object.values(JSON.parse(returned.files['images.g.jres']));assert.equal(entries.length,1);
            const native=decodeAnimationJres(entries[0]);
            assert.deepEqual(native.frames.map(frame=>Array.from(frame.pixels)),[4,5,9].map(colour=>Array(6).fill(colour)));
            const rich=recoverAnimationCompanion(returned.files[ANIMATION_COMPANION_PATH],[native],ARCADE_PALETTE);
            assert.deepEqual(rich.warnings,[]);assert.deepEqual(rich.resources[0].document,retainedLibrary.document);
            const built=await compile('arcade',returned.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
            assert.deepEqual(built.netAttempts,[]);
            const run=await runArcadeSim(built.outfiles['binary.js'],{ms:75});assert.equal(run.error,null);
            assert.ok(run.serial.some(row=>String(row.text).trim()==='4'),`${route}: original PXT plays the edited library frame`);
        }
        report.assetLibrary.guiAndCliOriginalExport=true;
        report.journey.push('GUI and CLI export omit the library actor, retain edited native/rich resources and run in original PXT');
        await pixels('Arcade artwork');
        await page.getByRole('button',{name:'Scratch Stage',exact:true}).click();
        assert.deepEqual(await page.getByTestId('bw-image-target').locator('optgroup[label="Artwork libraries"] option').allTextContents(),['Arcade artwork']);
        await page.getByTestId('bw-library-sprite-label').waitFor({state:'visible'});
        const info=page.getByTestId('bw-sprite-info');
        assert.equal(await info.getByRole('button',{name:'Show sprite',exact:true}).isDisabled(),true);
        assert.equal(await info.getByPlaceholder('x',{exact:true}).isDisabled(),true);
        const nameInput=info.getByPlaceholder('Name',{exact:true});
        assert.equal(await nameInput.isDisabled(),false);
        await nameInput.fill('Robot artwork');await nameInput.press('Enter');
        await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getName()==='Robot artwork');
        assert.equal((await resource())[0].id,published.id);
        const renamedLibrary=await snapshot('library-renamed',{bundleVersion:7});
        assert.deepEqual(renamedLibrary.document,retainedLibrary.document);
        await page.getByRole('tab',{name:'Blocks',exact:true}).click();
        await page.locator('[data-testid="bw-library-notice"]:visible').waitFor({state:'visible'});
        assert.equal(await page.locator('.blocklySvg:visible').count(),0);
        await page.screenshot({path:path.join(path.dirname(out),'library-blocks-notice.png')});
        await page.getByRole('tab',{name:'Sounds',exact:true}).click();
        await page.locator('[data-testid="bw-library-notice"]:visible').waitFor({state:'visible'});
        await page.locator('[data-testid="bw-library-edit-artwork"]:visible').click();
        await pixels('Robot artwork');
        const tile=page.locator('[class*="sprite-selector-item_sprite-selector-item"]').filter({has:page.getByText('Robot artwork',{exact:true})});
        await tile.click({button:'right'});
        await page.locator('.react-contextmenu--visible').getByText('duplicate',{exact:true}).click();
        await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.filter(t=>t.bwAssetLibrary).length===2);
        const lifecycle=await page.evaluate(()=>{
            const vm=window.__brickwrightStore.getState().scratchGui.vm;
            return vm.runtime.targets.filter(t=>t.bwAssetLibrary).map(t=>({name:t.getName(),visible:t.visible,
                scripts:t.blocks.getScripts().length,role:t.bwAssetLibrary}));
        });
        assert.equal(lifecycle.length,2);assert.ok(lifecycle.every(t=>!t.visible&&!t.scripts));
        const duplicatedResources=await resource();assert.equal(duplicatedResources.length,2);
        const copyId=duplicatedResources.find(row=>row.id!==published.id).id;assert.notEqual(copyId,published.id);
        const a={...duplicatedResources[0],id:null,revision:null},b={...duplicatedResources[1],id:null,revision:null};assert.deepEqual(a,b);
        await pixels('Robot artwork');await tile.getByRole('button',{name:'Delete',exact:true}).click();
        await page.getByRole('dialog',{name:'Confirm Asset Deletion'}).getByRole('button',{name:'yes',exact:true}).click();
        await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.filter(t=>t.bwAssetLibrary).length===1);
        assert.deepEqual((await resource()).map(row=>row.id),[copyId]);
        await page.getByText('Edit',{exact:true}).first().click();
        await page.getByText('Restore Sprite',{exact:true}).click();
        await page.waitForFunction(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.targets.filter(t=>t.bwAssetLibrary).length===2);
        assert.deepEqual((await resource()).map(row=>row.id).sort(),[published.id,copyId].sort());
        await page.getByText('File',{exact:true}).first().click();const lifeDownload=page.waitForEvent('download');
        await page.getByText('Save to your computer',{exact:true}).click();
        const lifeFile=path.join(path.dirname(out),'animation-library-lifecycle.sb3');await(await lifeDownload).saveAs(lifeFile);
        const lifeZip=await JSZip.loadAsync(await fs.readFile(lifeFile));
        const lifeSource=JSON.parse(await lifeZip.file('brickwright/artwork/v1.json').async('text'));
        assert.equal(lifeSource.libraries.length,2);
        assert.deepEqual(lifeSource.costumes.filter(r=>r.document.animation?.resource).map(r=>r.document.animation.resource.id).sort(),[published.id,copyId].sort());
        const lifeStage=await page.evaluate(()=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
        await page.getByText('File',{exact:true}).first().click();const lifeChooser=page.waitForEvent('filechooser');
        await page.getByText('Load from your computer',{exact:true}).click();await(await lifeChooser).setFiles(lifeFile);
        await page.waitForFunction(id=>window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id!==id,lifeStage);
        await flag().click();await phase(1);await observePlayback('library-lifecycle-reopened',[4,5,9]);await stop().click();
        report.librarySafeguards={artworkGroup:true,renamePreservesSource:true,visibilityDisabled:true,
            blocksUnavailable:true,soundsUnavailable:true,duplicateRenewsIdentity:true,deleteAndUndoRestoresIdentity:true,
            libraries:lifecycle,sb3Reopened:true};
        report.journey.push('library navigation/rename/disabled gameplay controls and Blocks/Sounds notices protect artwork');
        report.journey.push('actual duplicate/delete/Restore Sprite/save/reopen retains both hidden roles, renews copy UUID and restores bound playback');

        await openCode();if(await actions.getAttribute('open')===null)await actions.locator('summary').click();
        const [duplicateDownload]=await Promise.all([page.waitForEvent('download'),page.getByTestId('bw-makecode-arcade-export').click()]);
        const duplicateHex=path.join(path.dirname(out),'animation-duplicate-libraries.hex');await duplicateDownload.saveAs(duplicateHex);
        const duplicateCliHex=path.join(path.dirname(out),'animation-duplicate-libraries-cli.hex');
        await promisify(execFile)(process.execPath,['scripts/makecode.mjs','to-hex',lifeFile,
            '--target','arcade','--source','-o',duplicateCliHex],{timeout:30000});
        const expectedDocuments=lifeSource.costumes.filter(row=>row.document.animation?.resource).map(row=>row.document);
        const ordered=documents=>[...documents].sort((a,b)=>a.animation.resource.id.localeCompare(b.animation.resource.id));
        for(const [route,file] of [['GUI',duplicateHex],['CLI',duplicateCliHex]]){
            const returned=await unpackMakeCodeSource(await fs.readFile(file));
            const entries=Object.values(JSON.parse(returned.files['images.g.jres']));assert.equal(entries.length,2);
            assert.equal(new Set(entries.map(entry=>entry.displayName)).size,2);
            const rich=recoverAnimationCompanion(returned.files[ANIMATION_COMPANION_PATH],entries.map(entry=>decodeAnimationJres(entry)),ARCADE_PALETTE);
            assert.deepEqual(rich.warnings,[]);assert.deepEqual(ordered(rich.resources.map(row=>row.document)),ordered(expectedDocuments));
            const built=await compile('arcade',returned.files);assert.equal(built.success,true,JSON.stringify(built.diagnostics));
            assert.deepEqual(built.netAttempts,[]);
            const run=await runArcadeSim(built.outfiles['binary.js'],{ms:75});assert.equal(run.error,null);
            assert.ok(run.serial.some(row=>String(row.text).trim()==='4'),`${route}: duplicated library bindings run in original PXT`);
        }
        await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles(duplicateHex);
        await page.getByText(/Imported the Arcade game.*animation-duplicate-libraries\.hex/).first().waitFor({state:'visible'});
        if(await actions.getAttribute('open')!==null)await actions.locator('summary').click();
        await apply();
        assert.deepEqual((await resource()).map(row=>row.id).sort(),[published.id,copyId].sort());
        await flag().click();await phase(1);await observePlayback('duplicate-native-reimported',[4,5,9]);await stop().click();
        report.duplicateNativeExport={gui:true,cli:true,uniqueNativeNames:true,authoredNamesAndUuidsPreserved:true,
            originalPxtCompiledAndRun:true,guiReimported:true};
        report.journey.push('duplicated library GUI/CLI exports use unique native names, recover exact authored documents and UUIDs, run in original PXT and reimport with playback');




    }
    assert.deepEqual(report.pageErrors,[]);
    assert.deepEqual(report.consoleMessages.filter(message=>/Workspace Update Error|Connection checks failed|could not attach artwork|could not repack artwork|Built-in extension arcade failed/.test(message)),[]);
    assert.ok(!report.timedOut);report.status='passed';
}catch(error){
    report.status='failed';report.failure=error.stack||String(error);
    report.body=await page.locator('body').innerText().then(text=>text.slice(-12000)).catch(()=>null);
    report.resources=await resource().catch(()=>null);
    report.runtimeDiagnostics=await page.evaluate(()=>{
        const runtime=window.__brickwrightStore.getState().scratchGui.vm.runtime;
        const variables=runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>({name:variable.name,value:variable.value}));
        const canvas=runtime.renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const context=copy.getContext('2d');context.drawImage(canvas,0,0);
        return {device:runtime.bwDeviceId,variables,sprites:runtime.bwArcadeDeviceState?.sprites,
            centreRgba:Array.from(context.getImageData(Math.floor(copy.width/2),Math.floor(copy.height/2),1,1).data)};
    }).catch(()=>null);

    await page.screenshot({path:out.replace(/\.json$/,'')+'-failure.png'}).catch(()=>{});throw error;
}finally{
    clearTimeout(deadline);await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();
    console.log(JSON.stringify({status:report.status,mode:report.mode,journeys:report.journey.length}));
}
