#!/usr/bin/env node
/** Opt-in, networked qualification against the actual MakeCode Assets editor.
 * Requires the two-resource synthetic game from verify-arcade-animation-resource-browser.
 * Uses real file import, asset controls and Save; editor/VM state is observed only.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {unpackMakeCodeSource} from '../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js';
import {importArtefact, importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {animationResourceFromDocument} from '../overlay/scratch-gui/src/lib/bw-animation-resources.js';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
const option = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const input = option('--input');
if (!input) throw new Error('Use --input <animation-duplicate-libraries.mkcd> [--out report.json] [--bw-url URL]');
const out = path.resolve(option('--out') || 'test-results/makecode-assets-roundtrip/current.json');
const directory = path.dirname(out);await fs.mkdir(directory, {recursive: true});
const inputBytes = await fs.readFile(input);
const initial = await unpackMakeCodeSource(inputBytes, {name: path.basename(input)});
const before = importProjectFiles(initial.files, {target: 'arcade', animationResources: true});
assert.equal(before.animationResources.length, 2, 'fixture contains a used and a duplicated animation');
const ordered = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));
const documentRows = imported => ordered(imported.animationResources).map(row => ({id: row.id, document: row.document}));
const report = {status: 'running', startedAt: new Date().toISOString(), editorUrl: option('--editor-url') || 'https://arcade.makecode.com/',
    inputSha256: createHash('sha256').update(inputBytes).digest('hex'), journeys: [], originalPageErrors: [], brickwrightPageErrors: [],
    boundary: 'Live original editor, synthetic duplicate animation game. No account/share publishing. Original editor exceptions are retained, not reclassified as a clean run.'};
const browser = await chromium.launch();
const deadline = setTimeout(() => {report.timedOut = true;void browser.close();}, 240000);
const context = await browser.newContext({viewport: {width: 1600, height: 1100}, acceptDownloads: true});
const page = await context.newPage();page.setDefaultTimeout(25000);
page.on('pageerror', error => report.originalPageErrors.push(error.stack || error.message));
const save = async name => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: 'Save the project', exact: true}).click()]);
    const file = path.join(directory, name);await download.saveAs(file);
    await page.getByText('Got it!', {exact: true}).waitFor({state: 'visible'});
    await page.getByText('Got it!', {exact: true}).click();
    return {file, imported: await importArtefact(await fs.readFile(file), {name, animationResources: true})};
};
try {
    await page.goto(report.editorUrl, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.getByRole('button', {name: 'Import', exact: true}).click();
    await page.getByText('Import File...', {exact: true}).click();
    await page.locator('input[type=file]').setInputFiles(path.resolve(input));
    await page.getByRole('button', {name: 'Go ahead!', exact: true}).click();
    await page.getByRole('button', {name: 'View project assets', exact: true}).waitFor({timeout: 60000});
    report.originalVersions = await page.evaluate(() => pxt.appTarget.versions);
    await page.getByRole('button', {name: 'View project assets', exact: true}).click();
    await page.locator('.asset-editor-card').first().click();
    report.originalAssets = await page.evaluate(() => pxt.react.getTilemapProject().getAssets('animation').map(asset =>
        ({id: asset.id, name: asset.meta.displayName, interval: asset.interval, frameCount: asset.frames.length})));
    assert.equal(report.originalAssets.length, 2);
    await page.screenshot({path: path.join(directory, 'original-assets-imported.png')});
    report.journeys.push('Actual original editor imports the GUI native project and exposes both animations in Assets');
    const noEdit = await save('original-assets-unmodified.png');
    assert.deepEqual(documentRows(noEdit.imported), documentRows(before));
    assert.deepEqual(noEdit.imported.unsupported, []);
    report.journeys.push('Original Save downloads a PNG retaining both exact rich-source documents and UUIDs');
    // The duplicate fixture's game deliberately plays its second animation.
    // Select that actual native card; the first resource remains the identity control.
    await page.locator('.asset-editor-card').nth(1).click();
    await page.getByText('Edit', {exact: true}).click();
    report.editedOriginalName = await page.getByTitle('Asset Name', {exact: true}).inputValue();
    await page.getByTitle('Interval Between Frames (ms)', {exact: true}).fill('250');
    await page.getByTitle('Asset Name', {exact: true}).fill('Native Edited');
    await page.getByTitle('Color 7 (green)', {exact: true}).click();
    await page.getByTitle('Fill Tool', {exact: true}).click();
    const canvas = await page.locator('canvas.paint-surface.main').boundingBox();assert.ok(canvas);
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.screenshot({path: path.join(directory, 'original-assets-edited.png')});
    await page.getByText('Done', {exact: true}).click();
    const edited = await save('original-assets-edited-download.png');
    assert.deepEqual(edited.imported.unsupported, []);
    const changed = edited.imported.animationResources.find(row => row.name === 'Native Edited');assert.ok(changed);
    const previous = before.animationResources.find(row => row.id === changed.id);assert.ok(previous);
    const resource = animationResourceFromDocument(changed.document);
    assert.equal(resource.frames[0].durationMs, 250);
    assert.deepEqual(Array.from(resource.frames[0].pixels), [7, 7, 7, 7, 7, 7]);
    assert.notEqual(changed.document.animation.resource.id, previous.document.animation.resource.id);
    const untouched = edited.imported.animationResources.find(row => row !== changed);
    assert.deepEqual(untouched.document, before.animationResources.find(row => row.id === untouched.id).document);
    assert.ok(edited.imported.warnings.some(message => message.includes('stale-projection')));
    report.changed = {nativeId: changed.id, oldUuid: previous.document.animation.resource.id,
        newUuid: resource.id, interval: 250, firstFrame: Array.from(resource.frames[0].pixels)};
    report.journeys.push('Actual native rename, timing and paint controls survive PNG download; only stale companion source is replaced');
    await fs.writeFile(path.join(directory, 'edited-import.json'), JSON.stringify(edited.imported, null, 2));

    const bwUrl = option('--bw-url');
    if (bwUrl) {
        const bw = await context.newPage();bw.setDefaultTimeout(25000);
        bw.on('pageerror', error => report.brickwrightPageErrors.push(error.stack || error.message));
        await bw.addInitScript(() => localStorage.setItem('bw-starter-v1-complete', '1'));
        await bw.goto(bwUrl, {waitUntil: 'domcontentloaded', timeout: 45000});
        report.brickwrightScripts = await bw.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
        if (process.env.BW_EXPECT_GUI_BUNDLE) assert.ok(report.brickwrightScripts.some(src => src.endsWith(process.env.BW_EXPECT_GUI_BUNDLE)));
        await bw.getByRole('tab', {name: 'Code', exact: true}).click();
        await bw.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles(edited.file);
        await bw.getByText(/Imported the Arcade game.*original-assets-edited-download/).first().waitFor({state: 'visible'});
        const stage = await bw.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id);
        await bw.getByRole('button', {name: /To blocks/}).first().click();
        await bw.waitForFunction(id => window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.id && window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage().id !== id, stage);
        await bw.getByText('Blocks loaded.', {exact: true}).waitFor({state: 'visible'});
        const installed = await bw.evaluate(() => [...window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeAnimationResources.values()]
            .map(row => ({id: row.id, name: row.name, interval: row.frames[0].durationMs, pixels: Array.from(row.frames[0].pixels)})));
        const returned = installed.find(row => row.name === 'Native Edited');assert.ok(returned);
        assert.equal(returned.interval, 250);assert.deepEqual(returned.pixels, [7, 7, 7, 7, 7, 7]);
        const pane = bw.locator('[data-right-pane-toggle]');if (await pane.getAttribute('aria-pressed') !== 'true') await pane.click();
        await bw.getByTitle('Game Console', {exact: true}).click();
        await bw.locator('[class*="green-flag_green-flag"]').first().click();
        const pixels = await bw.evaluate(async palette => {
            const samples = [], start = performance.now();
            while (performance.now() - start < 2000) {
                await new Promise(resolve => requestAnimationFrame(resolve));
                const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
                runtime.renderer.draw();
                const canvas = runtime.renderer.canvas, copy = document.createElement('canvas');copy.width = canvas.width;copy.height = canvas.height;
                const ctx = copy.getContext('2d');ctx.drawImage(canvas, 0, 0);
                const rgba = ctx.getImageData(Math.floor(copy.width / 2), Math.floor(copy.height / 2), 1, 1).data;
                samples.push(palette.findIndex(colour => colour && colour.slice(1).match(/../g).map(c => parseInt(c, 16)).every((c, i) => c === rgba[i])));
            }
            return samples;
        }, ARCADE_PALETTE);
        const transitions = pixels.filter((value, index) => value !== pixels[index - 1]);
        assert.ok(transitions.some((value, i) => value === 7 && transitions[i + 1] === 5 && transitions[i + 2] === 9), `returned animation cycle: ${transitions}`);
        report.brickwrightPlayback = {installed, visibleSequence: transitions};
        await bw.screenshot({path: path.join(directory, 'brickwright-returned-game.png')});
        assert.deepEqual(report.brickwrightPageErrors, []);
        report.journeys.push('Actual Brickwright PNG file import, To Blocks and visible stage playback retain the native changes');
    }
    assert.ok(!report.timedOut);report.status = 'passed';
} catch (error) {
    report.status = 'failed';report.failure = error.stack || String(error);
    await page.screenshot({path: path.join(directory, 'original-editor-failure.png')}).catch(() => {});
    throw error;
} finally {
    clearTimeout(deadline);await fs.writeFile(out, JSON.stringify(report, null, 2) + '\n');await browser.close();
    console.log(JSON.stringify({status: report.status, journeys: report.journeys.length, originalPageErrors: report.originalPageErrors.length}));
}
