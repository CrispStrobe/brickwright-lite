#!/usr/bin/env node
/** Real GUI rename/pixel edit → File SB3 save/fresh load → MakeCode export/reimport.
 * VM access observes block data only; every change uses the user's controls.
 */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {openCodeActions} from './lib-code-actions.mjs';
import {makeCodeProjectFile, readMakeCodeProjectText} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {parseTileAssets} from '../overlay/scratch-gui/src/lib/bw-makecode/tile-assets.js';

const url = process.env.PROOF_URL;
if (!url) throw new Error('Set PROOF_URL to the freshly built GUI.');
const out = resolve(process.env.BW_TILE_IDENTITY_REPORT_DIR || 'test-results/arcade-tile-identity');
await mkdir(out, {recursive: true});
const report = {source: process.env.GITHUB_SHA || null, checks: [], errors: []};
const check = (name, ok, detail = null) => {
    report.checks.push({name, ok: Boolean(ok), detail});
    assert.ok(ok, name);
    console.log(`ok ${name}`);
};
const source = 'namespace myTiles {\n export const empty = img`0 0\n0 0`\n export const floor = img`7 7\n7 7`\n}\n' +
    'tiles.setTilemap(tiles.createTilemap(hex`020001000100`, img`2 .`, [myTiles.empty, myTiles.floor], TileScale.Four))\n' +
    'tiles.setTilemap(tiles.createTilemap(hex`010002000001`, img`.\n2`, [myTiles.empty, myTiles.floor], TileScale.Four))\n';
const fixture = join(out, 'named-level.mkcd');
await writeFile(fixture, makeCodeProjectFile({'main.ts': source, 'pxt.json': JSON.stringify({name: 'Named level', dependencies: {device: '*'}, files: ['main.ts'], preferredEditor: 'tsprj'})}, {target: 'arcade'}));
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
const readMaps = () => page.evaluate(() => {
    const maps = [];
    for (const target of window.__brickwrightStore.getState().scratchGui.vm.runtime.targets) {
        if (!target.isOriginal) continue;
        const blocks = target.blocks._blocks;
        for (const block of Object.values(blocks)) if (block.opcode === 'arcade_setTilemap') {
            maps.push(JSON.parse(blocks[block.inputs.DATA.shadow].fields.TEXT.value));
        }
    }
    return maps;
});
const importFile = async file => {
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await openCodeActions(page);
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles(file);
    await page.getByText(/Imported the Arcade game/).first().waitFor({timeout: 60000});
    await page.getByRole('button', {name: /To blocks|Zu Blöcken/i}).first().click();
    await page.waitForFunction(() => window.__brickwrightStore?.getState().scratchGui.vm.runtime.targets.reduce((count, target) => count +
        (target.isOriginal ? Object.values(target.blocks._blocks).filter(block => block.opcode === 'arcade_setTilemap').length : 0), 0) === 2, null, {timeout: 60000});
};
const painter = async () => {
    await page.locator('[role="tab"]', {hasText: /Costumes|Kostüme/}).first().click();
    await page.getByTestId('bw-tilemap-toggle').click();
    await page.getByTestId('bw-tilemap-editor').waitFor();
    await page.getByTestId('bw-tilemap-tile-1').click();
};
const editedTile = tile => tile.tileId === 'myTiles.floor' && tile.displayName === 'Cracked floor' && tile.pixels[0] === 3;
try {
    page = await fresh();
    await importFile(fixture);
    check('import keeps qualified tile identity', (await readMaps())[0].images[1].tileId === 'myTiles.floor');
    await painter();
    const name = page.getByTestId('bw-tilemap-tile-name');
    check('painter displays the imported tile name', await name.inputValue() === 'floor');
    await name.fill('Cracked floor');
    await name.press('Enter');
    await page.getByTestId('bw-tilemap-colour-3').click();
    const box = await page.getByTestId('bw-tilemap-tile-canvas').boundingBox();
    await page.mouse.click(box.x + 2, box.y + 2);
    await page.getByTestId('bw-tilemap-save').click();
    const shared = await readMaps();
    check('real rename and pixel edit update both uses of the source ID', shared.length === 2 && shared.every(map => editedTile(map.images[1])));
    await page.screenshot({path: join(out, 'named-painter.png')});
    await page.getByText('File', {exact: true}).first().click();
    const saved = page.waitForEvent('download');
    await page.getByText('Save to your computer', {exact: true}).click();
    const sb3 = join(out, 'named-level.sb3');
    await (await saved).saveAs(sb3);
    report.sb3Sha256 = createHash('sha256').update(await readFile(sb3)).digest('hex');
    await page.context().close();
    page = await fresh();
    check('fresh context starts without imported maps', (await readMaps()).length === 0);
    await page.getByText('File', {exact: true}).first().click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(sb3);
    await page.waitForFunction(() => window.__brickwrightStore?.getState().scratchGui.vm.runtime.targets.reduce((count, target) => count +
        (target.isOriginal ? Object.values(target.blocks._blocks).filter(block => block.opcode === 'arcade_setTilemap').length : 0), 0) === 2, null, {timeout: 60000});
    const reopened = await readMaps();
    check('File reload keeps shared IDs, labels and edited pixels', reopened.length === 2 && reopened.every(map => editedTile(map.images[1])));
    await painter();
    check('reopened painter shows the saved name', await page.getByTestId('bw-tilemap-tile-name').inputValue() === 'Cracked floor');
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await page.getByRole('button', {name: /From blocks|Von Blöcken/i}).first().click();
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-code-editor"] .cm-content')?.cmTile?.root?.view?.state?.doc?.toString()?.includes('arcade set tilemap'), null, {timeout: 30000});
    await openCodeActions(page);
    const exported = page.waitForEvent('download');
    await page.getByTestId('bw-makecode-arcade-export').click();
    const mkcd = join(out, 'edited-level.mkcd');
    await (await exported).saveAs(mkcd);
    const files = readMakeCodeProjectText(await readFile(mkcd, 'utf8'), 'mkcd').files;
    const assets = parseTileAssets(files['tilemap.g.jres']);
    check('download carries a real named tile resource', editedTile(assets['myTiles.floor']));
    check('shared edits export one resource per asset ID', Object.keys(JSON.parse(files['tilemap.g.jres'])).length === 2);
    check('project lists generated resource and declaration files', ['tilemap.g.jres', 'tilemap.g.ts'].every(file => JSON.parse(files['pxt.json']).files.includes(file)));
    await page.context().close();
    page = await fresh();
    await importFile(mkcd);
    const reimported = await readMaps();
    check('actual MakeCode download reimports both shared uses', reimported.length === 2 && reimported.every(map => editedTile(map.images[1])));
    check('no browser exceptions', report.errors.length === 0, report.errors);
} catch (error) {
    report.fatal = String(error.stack || error);
    throw error;
} finally {
    await writeFile(join(out, 'current.json'), JSON.stringify(report, null, 2));
    await browser.close();
}
