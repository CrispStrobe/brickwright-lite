#!/usr/bin/env node
/** Live four-surface save/reopen and vanilla replacement acceptance. */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

const requireFromGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const JSZip = requireFromGui('jszip');
const url = process.env.PROOF_URL || 'http://localhost:8617/';
const artifacts = resolve('artifacts/project-bundle-integrity');
await mkdir(artifacts, {recursive: true});
const savedPath = resolve(artifacts, 'four-surface.sb3');
const vanillaPath = resolve(artifacts, 'vanilla-replacement.sb3');
const futurePath = resolve(artifacts, 'future-sidecar.sb3');
const invalidPath = resolve(artifacts, 'invalid-sidecar.sb3');
const source = 'SPRITE Cat:\n  WHEN flag clicked:\n    say "bundle integrity" for 2 seconds';
const errors = [];

const browser = await chromium.launch({headless: true});
const newContext = async () => {
    const context = await browser.newContext({viewport: {width: 1600, height: 1000},
        acceptDownloads: true});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    return {context, page};
};
const waitForVM = page => page.waitForFunction(() => {
    const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
    if (!vm?.runtime) return false;
    window.__vm = vm;
    return true;
}, null, {timeout: 60000});
const openProject = async (page, file) => {
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept=".sb,.sb2,.sb3"]').setInputFiles(file);
};
const projectKeys = page => page.evaluate(() => ({
    code: localStorage.getItem('bw-code-autosave'),
    circuit: localStorage.getItem('bw-circuit-autosave'),
    controller: localStorage.getItem('bw-ctl-widgets')
}));

try {
    let {context, page} = await newContext();
    await page.goto(`${url}${url.includes('?') ? '&' : '?'}journey=board`,
        {waitUntil: 'domcontentloaded', timeout: 60000});
    await waitForVM(page);
    await page.getByTestId('bw-starter-dialog').waitFor({timeout: 30000});
    await page.locator('[data-starter-id="board"]').click();
    await page.getByTestId('bw-starter-dialog').waitFor({state: 'detached', timeout: 45000});
    await page.waitForFunction(() => (window.__vm?.runtime?.circuitModel?.parts?.length || 0) > 0,
        null, {timeout: 30000});
    const lesson = page.getByTestId('bw-guided-lesson');
    if (await lesson.count()) await lesson.getByRole('button', {name: 'Close'}).click();

    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(source);
    await page.getByRole('button', {name: /To blocks/}).first().click();
    await page.waitForFunction(() => (window.__vm?.runtime?.targets || []).some(target =>
        Object.values(target.blocks?._blocks || {}).some(block => block.opcode === 'looks_sayforsecs')),
    null, {timeout: 30000});

    const showRight = page.getByRole('button', {name: 'Show right panel'});
    if (await showRight.count()) await showRight.click();
    await page.locator('button[title="Controller"]:visible').click();
    await page.getByTestId('bw-controller-canvas').waitFor({state: 'visible', timeout: 15000});
    await page.getByText('+ Add Widget', {exact: true}).click();
    await page.getByText('Slider', {exact: true}).click();
    await page.getByTestId('bw-ctl-widget-slider1').waitFor({state: 'visible'});

    await page.getByText('File', {exact: true}).click();
    const downloadPromise = page.waitForEvent('download', {timeout: 30000});
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await downloadPromise).saveAs(savedPath);
    const savedZip = await JSZip.loadAsync(await readFile(savedPath));
    const sidecarText = await savedZip.file('brickwright/state.json').async('text');
    const sidecar = JSON.parse(sidecarText);
    const sections = ['code', 'circuit', 'controller'].filter(name => sidecar.state?.[name]);
    if (sidecar.version !== 2 || sections.length !== 3) {
        throw new Error(`saved sidecar is not v2 with 3/3 sections: ${JSON.stringify(sections)}`);
    }
    savedZip.remove('brickwright/state.json');
    await writeFile(vanillaPath, await savedZip.generateAsync({type: 'nodebuffer'}));
    savedZip.file('brickwright/state.json', JSON.stringify({
        format: 'brickwright-state', version: 7, state: {futureOnly: {value: 99}}
    }));
    await writeFile(futurePath, await savedZip.generateAsync({type: 'nodebuffer'}));
    savedZip.file('brickwright/state.json', '{invalid');
    await writeFile(invalidPath, await savedZip.generateAsync({type: 'nodebuffer'}));
    await context.close();

    ({context, page} = await newContext());
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await waitForVM(page);
    await openProject(page, savedPath);
    await page.waitForFunction(() => ['bw-code-autosave', 'bw-circuit-autosave', 'bw-ctl-widgets']
        .every(key => localStorage.getItem(key)), null, {timeout: 45000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.waitForFunction(needle => (document.querySelector('.cm-content')?.textContent || '')
        .includes(needle), 'bundle integrity', {timeout: 15000});
    await page.getByRole('tab', {name: 'Circuit', exact: true}).click();
    await page.waitForFunction(() => (window.__vm?.runtime?.circuitModel?.parts?.length || 0) > 0,
        null, {timeout: 15000});
    const reopenRight = page.getByRole('button', {name: 'Show right panel'});
    if (await reopenRight.count()) await reopenRight.click();
    await page.locator('button[title="Controller"]:visible').click();
    await page.getByTestId('bw-ctl-widget-slider1').waitFor({state: 'visible', timeout: 15000});
    await page.screenshot({path: resolve(artifacts, 'four-surface-restored.png'), fullPage: true});

    const beforeRefusal = await projectKeys(page);
    await openProject(page, futurePath);
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByText(/Brickwright state v7 was not applied: preserved-not-applied/)
        .waitFor({timeout: 15000});
    if (JSON.stringify(await projectKeys(page)) !== JSON.stringify(beforeRefusal)) {
        throw new Error('future sidecar partially replaced known project state');
    }
    await openProject(page, invalidPath);
    await page.getByText(/Brickwright state was not applied: invalid JSON/).waitFor({timeout: 15000});
    if (JSON.stringify(await projectKeys(page)) !== JSON.stringify(beforeRefusal)) {
        throw new Error('invalid sidecar partially replaced known project state');
    }

    await openProject(page, vanillaPath);
    await page.waitForFunction(() => ['bw-code-autosave', 'bw-circuit-autosave', 'bw-ctl-widgets']
        .every(key => localStorage.getItem(key) === null), null, {timeout: 45000});
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.waitForFunction(() => !(document.querySelector('.cm-content')?.textContent || '').trim(),
        null, {timeout: 15000});
    const cleared = await page.evaluate(() => ({
        circuitParts: window.__vm?.runtime?.circuitModel?.parts?.length || 0,
        widgets: window.__vm?.runtime?.controllerPanel?.getWidgetNames?.().length || 0
    }));
    if (cleared.circuitParts !== 0 || cleared.widgets !== 0) {
        throw new Error(`vanilla replacement retained auxiliary state: ${JSON.stringify(cleared)}`);
    }
    const keys = await projectKeys(page);
    await page.screenshot({path: resolve(artifacts, 'vanilla-cleared.png'), fullPage: true});
    await writeFile(resolve(artifacts, 'result.json'), JSON.stringify({
        url, sidecarVersion: sidecar.version, restoredSections: sections,
        legacyCleared: cleared, keys, pageErrors: errors
    }, null, 2));
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
    console.log('Project bundle integrity: restored 4/4 surfaces; vanilla cleared 3/3 auxiliaries.');
    await context.close();
} catch (error) {
    await writeFile(resolve(artifacts, 'failure.txt'), `${error.stack || error}\n`);
    throw error;
} finally {
    await browser.close();
}
