#!/usr/bin/env node
/** Production GUI journey. Observations read the real VM; all actions use UI controls. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import JSZip from 'jszip';
import {makeCodeProjectFile} from '../overlay/scratch-gui/src/lib/bw-makecode/project-file.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {shareOfBudget} from './lib/gate-budget.mjs';

const source = 'info.player1.setScore(9)\ncarnival.startCountdownGame(2,carnival.WinTypes.Multi,effects.none)';
assert.deepEqual(arcadeToPseudocode(source).unsupported, []);
const out = process.env.BW_CARNIVAL_REPORT_DIR || 'test-results/arcade-carnival-browser';
const timeout = shareOfBudget(0.3, 60000);
const report = {status: 'running', testedSource: process.env.GITHUB_SHA || null, checks: [], errors: []};
const browser = await chromium.launch();
let page;
const check = (name, actual) => { assert.ok(actual, name); report.checks.push({name, passed: true}); };
const state = () => page.evaluate(() => {
    const vm = window.__brickwrightStore.getState().scratchGui.vm;
    const device = vm.runtime.bwArcadeDeviceState;
    return {settings: vm.runtime.getTargetForStage()?.bwArcadeSettings,
        elapsed: device?.elapsedMs, background: Boolean(device?.backgroundImage),
        pixels: device?.sceneFrame?.pixels ? Array.from(device.sceneFrame.pixels) : [],
        blockErrors: window.__bwCarnivalErrors};
});
const newSession = async () => {
    const context = await browser.newContext({viewport: {width: 1600, height: 1000}, acceptDownloads: true});
    const fresh = await context.newPage();
    fresh.on('pageerror', error => report.errors.push(error.message));
    fresh.on('dialog', dialog => dialog.accept());
    await fresh.addInitScript(() => {
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        localStorage.setItem('bw-debug-dock', 'arcade');
    });
    await fresh.goto(process.env.BW_BASE_URL || 'http://127.0.0.1:8617/',
        {waitUntil: 'domcontentloaded', timeout});
    await fresh.waitForFunction(() => Boolean(window.__brickwrightStore?.getState()?.scratchGui?.vm), null, {timeout});
    await fresh.evaluate(() => {
        window.__bwCarnivalErrors = [];
        window.__brickwrightStore.getState().scratchGui.vm.runtime.on('BLOCKS_ERROR', error => window.__bwCarnivalErrors.push(String(error)));
    });
    await fresh.getByRole('tab', {name: 'Code', exact: true}).click();
    await fresh.getByTestId('bw-device-select').selectOption('arcade');
    await fresh.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.bwDeviceId === 'arcade', null, {timeout});
    return fresh;
};
const awaitDialog = async () => {
    await page.waitForFunction(() => {
        const device = window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState;
        return device?.backgroundImage && device.elapsedMs > 1100 && device.sceneFrame?.pixels?.some(c => c !== 0 && c !== 15);
    }, null, {timeout});
    const sample = await state();
    assert.deepEqual(sample.blockErrors, []);
    check('native game-over scene renders a dialog and retains the multiplayer score',
        sample.settings?.values['high-score'] === 9 && sample.pixels.length === 160 * 120);
    return sample;
};
try {
    await fs.mkdir(out, {recursive: true});
    page = await newSession();
    report.pageScripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.getAttribute('src')));
    if (process.env.BW_EXPECT_GUI_BUNDLE) check('expected production bundle loaded',
        report.pageScripts.some(s => s.endsWith(process.env.BW_EXPECT_GUI_BUNDLE)));
    const project = makeCodeProjectFile({'main.ts': source, 'pxt.json': JSON.stringify({
        name: 'Carnival browser control', dependencies: {device: '*', 'arcade-carnival': 'github:microsoft/arcade-carnival#v0.0.7'}, files: ['main.ts']
    })}, {target: 'arcade', name: 'Carnival browser control'});
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles({
        name: 'carnival-control.mkcd', mimeType: 'application/json', buffer: Buffer.from(project)
    });
    await page.getByText(/Imported the Arcade game.*carnival-control/).first().waitFor({state: 'visible', timeout});
    const editor = page.locator('[data-testid="bw-code-editor"] .cm-content');
    check('import exposes the carnival pseudocode command', (await editor.innerText()).includes('arcade carnival countdown'));
    await page.getByRole('button', {name: '⇦ To blocks', exact: true}).click();
    await page.getByText('Blocks loaded.', {exact: true}).waitFor({state: 'visible', timeout});
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await page.locator('.blocklyWorkspace .blocklyText').filter({hasText: /Arcade carnival countdown/}).first().waitFor({state: 'visible', timeout});
    check('the carnival command is visible in the Blocks workspace', true);
    await page.getByTitle('Game Console', {exact: true}).click();
    await page.locator('[class*="green-flag_green-flag"]').first().click();
    const first = await awaitDialog();
    report.firstSettings = first.settings;
    await page.screenshot({path: path.join(out, 'dialog.png')});
    await page.getByTestId('bw-arcade-a').click();
    await page.waitForFunction(() => {
        const device = window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState;
        return device && !device.backgroundImage;
    }, null, {timeout});
    const restarted = await state();
    check('controller A restarts the program with the same record identity', restarted.settings.id === first.settings.id);
    await awaitDialog();
    await page.getByText('File', {exact: true}).click();
    const downloadEvent = page.waitForEvent('download', {timeout});
    await page.getByText('Save to your computer', {exact: true}).click();
    const download = await downloadEvent;
    const archivePath = path.join(out, 'carnival-records.sb3');
    await download.saveAs(archivePath);
    const archive = await fs.readFile(archivePath);
    const json = JSON.parse(await (await JSZip.loadAsync(archive)).file('project.json').async('string'));
    const saved = json.targets.find(t => t.isStage).bwArcadeSettings;
    assert.deepEqual(saved, first.settings);
    check('File Save writes the exact program identity and scores into a real SB3', /\.sb3$/i.test(download.suggestedFilename()));
    report.sb3 = {bytes: archive.length, sha256: createHash('sha256').update(archive).digest('hex')};
    assert.deepEqual((await state()).blockErrors, []);
    await page.context().close();
    page = await newSession();
    check('a fresh browser context has no prior carnival device records', await page.evaluate(() =>
        !Object.keys(localStorage).some(key => key.startsWith('brickwright.arcade.settings.v1.'))));
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type=file][accept*=".sb3"]').setInputFiles(archivePath);
    await page.waitForFunction(id => window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetForStage()?.bwArcadeSettings?.id === id,
        first.settings.id, {timeout});
    assert.deepEqual((await state()).settings, saved);
    check('GUI reopen restores records without the first device backend', true);
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await page.locator('.blocklyWorkspace .blocklyText').filter({hasText: /Arcade carnival countdown/}).first().waitFor({state: 'visible', timeout});
    await page.getByTitle('Game Console', {exact: true}).click();
    await page.locator('[class*="green-flag_green-flag"]').first().click();
    const reopened = await awaitDialog();
    assert.deepEqual(reopened.settings, saved);
    check('reopened carnival blocks run with the preserved records', true);
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.failure = error.stack; process.exitCode = 1;
    await page?.screenshot({path: path.join(out, 'failure.png')}).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
    console.log(JSON.stringify({status: report.status, checks: report.checks.length, failure: report.failure}));
}
