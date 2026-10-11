#!/usr/bin/env node
/** Real colour-index painter controls → artwork save → fresh File reload/export. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';
import {openCodeActions} from './lib-code-actions.mjs';
import {makeCodeProjectFile, readMakeCodeProjectText} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
const url = process.env.PROOF_URL;
if (!url) throw new Error('Set PROOF_URL to the fresh source build.');
const out = resolve('test-results/arcade-legacy-layout');
await mkdir(out, {recursive: true});
const report = {source: process.env.GITHUB_SHA || null, checks: [], errors: []};
const check = (name, ok) => { report.checks.push({name, ok: Boolean(ok)}); assert.ok(ok, name); console.log(`ok ${name}`); };
const fixture = join(out, 'legacy-layout.mkcd');
await writeFile(fixture, makeCodeProjectFile({'main.ts': 'scene.setTile(1,img`7`,true)\nscene.setTileMap(img`1 0\n0 1`,TileScale.Four)\n',
    'pxt.json': JSON.stringify({name: 'Legacy layout', dependencies: {device: '*', 'color-coded-tilemap': '*'}, files: ['main.ts']})}, {target: 'arcade'}));
const browser = await chromium.launch(process.env.BW_BROWSER ? {executablePath: process.env.BW_BROWSER} : {});
let page;
const fresh = async () => {
    const context = await browser.newContext({viewport: {width: 1600, height: 1000}});
    const tab = await context.newPage();
    tab.on('dialog', dialog => dialog.accept());
    tab.on('pageerror', error => report.errors.push(String(error)));
    await tab.addInitScript(() => {localStorage.clear(); localStorage.setItem('bw-starter-v1-complete', '1'); sessionStorage.clear();});
    await tab.goto(url, {waitUntil: 'networkidle', timeout: 90000});
    await tab.locator('[role="tab"]').first().waitFor({timeout: 60000});
    return tab;
};
const importFile = async file => {
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await openCodeActions(page);
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles(file);
    await page.getByText(/Imported the Arcade game/).first().waitFor({timeout: 60000});
    await page.getByRole('button', {name: /To blocks|Zu Blöcken/i}).first().click();
    await page.waitForFunction(() => window.__brickwrightStore?.getState().scratchGui.vm.runtime.targets.some(target =>
        target.isOriginal && Object.values(target.blocks._blocks).some(block => block.opcode === 'arcade_setLegacyTilemap')), null, {timeout: 60000});
};
const painter = async () => {
    await page.locator('[role="tab"]', {hasText: /Costumes|Kostüme/}).first().click();
    await page.getByTestId('bw-tilemap-toggle').click();
    await page.getByTestId('bw-tilemap-legacy-hint').waitFor();
};
const runEdited = async (wall = true, pixel = null) => {
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.greenFlag());
    await page.waitForFunction(([wall, pixel]) => {
        const map = window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState?.tilemap;
        return map && map.columns === 2 && map.rows === 2 && map.indices[1] === 2 && Boolean(map.walls[0]) === wall && Boolean(map.walls[3]) === wall &&
            (pixel === null || map.images[1]?.pixels[0] === pixel);
    }, [wall, pixel], {timeout: 30000});
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.stopAll());
};
try {
    page = await fresh();
    await importFile(fixture);
    await painter();
    check('all sixteen colour indexes are selectable', await page.locator('[data-testid^="bw-tilemap-tile-"]').filter({has: page.locator('canvas')}).count() === 16);
    check('legacy walls remain in their definition blocks', await page.getByTestId('bw-tilemap-tool-wall').count() === 0);
    await page.getByTestId('bw-tilemap-tile-2').click();
    const canvas = page.getByTestId('bw-tilemap-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25);
    await page.getByTestId('bw-tilemap-save').click();
    await runEdited();
    check('native game uses the painted layout and original walls', true);
    await page.getByTestId('bw-legacy-definition-colour-3').click();
    const definitionBox = await page.getByTestId('bw-legacy-definition-canvas').boundingBox();
    await page.mouse.click(definitionBox.x + definitionBox.width / 2, definitionBox.y + definitionBox.height / 2);
    await page.getByTestId('bw-legacy-definition-wall').uncheck();
    await page.getByTestId('bw-legacy-definition-save').click();
    await runEdited(false, 3);
    check('real definition controls edit artwork and all colour-matched walls', true);
    await page.screenshot({path: join(out, 'legacy-painter.png')});
    await page.getByText('File', {exact: true}).first().click();
    const save = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    const sb3 = join(out, 'legacy-painted.sb3'); await (await save).saveAs(sb3);
    await page.context().close(); page = await fresh();
    await page.getByText('File', {exact: true}).first().click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(sb3);
    await page.waitForFunction(() => window.__brickwrightStore?.getState().scratchGui.vm.runtime.targets.some(target =>
        target.isOriginal && Object.values(target.blocks._blocks).some(block => block.opcode === 'arcade_setLegacyTilemap')), null, {timeout: 60000});
    await runEdited(false, 3); check('fresh File reload preserves layout, definition pixels and wall flag', true);
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await page.getByRole('button', {name: /From blocks|Von Blöcken/i}).first().click();
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-code-editor"] .cm-content')?.cmTile?.root?.view?.state?.doc?.toString()?.includes('color-coded map'), null, {timeout: 30000});
    await openCodeActions(page);
    const exported = page.waitForEvent('download');
    await page.getByTestId('bw-makecode-arcade-export').click();
    const mkcd = join(out, 'legacy-exported.mkcd'); await (await exported).saveAs(mkcd);
    const files = readMakeCodeProjectText(await readFile(mkcd, 'utf8'), 'mkcd').files;
    check('export keeps legacy API and package', files['main.ts'].includes('scene.setTileMap(') &&
        JSON.parse(files['pxt.json']).dependencies['color-coded-tilemap'] === '*');
    await page.context().close(); page = await fresh(); await importFile(mkcd);
    await runEdited(false, 3); check('downloaded MakeCode reimport preserves layout and edited definitions', true);
    check('no browser exceptions', report.errors.length === 0);
} catch (error) { report.fatal = String(error.stack || error); throw error; }
finally { await writeFile(join(out, 'current.json'), JSON.stringify(report, null, 2)); await browser.close(); }
