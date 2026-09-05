#!/usr/bin/env node
/**
 * A large Scratch list stays virtualized and editable in the production GUI.
 *
 * The source policy pins the narrow react-virtualized/List import, but only a
 * browser can prove that its scroll calculations and the monitor's editing
 * handlers still agree. This gate loads a real SB3 containing 1,000 rows,
 * checks that the DOM renders only a bounded window, reaches the last row by
 * scrolling, then edits, adds and removes through the visible controls.
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

const requireFromGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const JSZip = requireFromGui('jszip');
const url = process.env.PROOF_URL || 'http://localhost:8617/';
const artifacts = resolve('artifacts/list-monitor-virtualization');
const fixturePath = resolve(artifacts, 'large-list.sb3');
const LIST_ID = 'brickwright_large_list';
const LIST_NAME = 'performance rows';
const ROW_COUNT = 1000;
const values = Array.from({length: ROW_COUNT}, (_, index) => `row-${String(index + 1).padStart(4, '0')}`);

await mkdir(artifacts, {recursive: true});

// Reuse a known-valid Scratch archive so assets and target metadata are real;
// only the list and its serialized monitor are synthetic inputs to this proof.
const zip = await JSZip.loadAsync(await readFile(resolve(
    'packages/scratch-gui/test/fixtures/project1.sb3')));
const project = JSON.parse(await zip.file('project.json').async('text'));
const stage = project.targets.find(target => target.isStage);
stage.lists[LIST_ID] = [LIST_NAME, values];
project.monitors = [{
    id: LIST_ID,
    mode: 'list',
    opcode: 'data_listcontents',
    params: {LIST: LIST_NAME},
    spriteName: null,
    value: values,
    width: 300,
    height: 300,
    x: 8,
    y: 8,
    visible: true
}];
zip.file('project.json', JSON.stringify(project));
await writeFile(fixturePath, await zip.generateAsync({type: 'nodebuffer'}));

const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('dialog', dialog => dialog.accept());

let receipt = {url, rows: ROW_COUNT};
try {
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        if (!vm?.runtime) return false;
        window.__vm = vm;
        return true;
    }, null, {timeout: 60000});

    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept=".sb,.sb2,.sb3"]').setInputFiles(fixturePath);
    await page.waitForFunction(({id, count}) => {
        const stageTarget = window.__vm?.runtime?.getTargetForStage?.();
        return stageTarget?.variables?.[id]?.value?.length === count;
    }, {id: LIST_ID, count: ROW_COUNT}, {timeout: 45000});

    const grid = page.locator('.ReactVirtualized__List').filter({has: page.locator('[dataindex]')});
    await grid.waitFor({state: 'visible', timeout: 30000});
    if (await grid.count() !== 1) throw new Error(`expected one virtualized list, found ${await grid.count()}`);
    const monitor = grid.locator('xpath=../..');
    await monitor.getByText(LIST_NAME, {exact: true}).waitFor();
    await monitor.getByText(`length ${ROW_COUNT}`, {exact: true}).waitFor();

    const initialRows = await monitor.locator('[dataindex]').count();
    const lastInitiallyPresent = await monitor.locator(`[dataindex="${ROW_COUNT - 1}"]`).count();
    if (initialRows < 2 || initialRows >= 100 || lastInitiallyPresent !== 0) {
        throw new Error(`list did not render a bounded first window: ${JSON.stringify({
            initialRows, lastInitiallyPresent
        })}`);
    }

    const scroll = await grid.evaluate(element => {
        const before = {clientHeight: element.clientHeight, scrollHeight: element.scrollHeight};
        element.scrollTop = element.scrollHeight;
        element.dispatchEvent(new Event('scroll', {bubbles: true}));
        return {...before, scrollTop: element.scrollTop};
    });
    if (scroll.scrollHeight <= scroll.clientHeight || scroll.scrollTop <= 0) {
        throw new Error(`large list has no working scroll range: ${JSON.stringify(scroll)}`);
    }

    const lastValue = monitor.locator(`[dataindex="${ROW_COUNT - 1}"]`);
    await lastValue.waitFor({state: 'visible', timeout: 15000});
    if ((await lastValue.textContent()) !== values.at(-1)) {
        throw new Error(`scroll reached the wrong last row: ${await lastValue.textContent()}`);
    }

    // Editing row 1000 and pressing Enter commits it, then exercises the
    // monitor's add-below path and focuses the new row 1001.
    await lastValue.click();
    let input = monitor.locator(`[dataindex="${ROW_COUNT - 1}"] input`);
    await input.waitFor({state: 'visible'});
    await input.fill('edited-row-1000');
    await input.press('Enter');
    await monitor.getByText(`length ${ROW_COUNT + 1}`, {exact: true}).waitFor({timeout: 15000});
    input = monitor.locator(`[dataindex="${ROW_COUNT}"] input`);
    await input.waitFor({state: 'visible', timeout: 15000});
    await input.fill('temporary-row-1001');

    // The X uses mousedown intentionally so it wins the race with input blur;
    // drive that same event rather than mutating VM state behind the component.
    await input.locator('xpath=following-sibling::div').dispatchEvent('mousedown');
    await monitor.getByText(`length ${ROW_COUNT}`, {exact: true}).waitFor({timeout: 15000});
    await monitor.getByText(LIST_NAME, {exact: true}).click(); // commit/close the remaining editor

    const model = await page.evaluate(id => {
        const value = window.__vm.runtime.getTargetForStage().variables[id].value;
        return {length: value.length, last: value[value.length - 1]};
    }, LIST_ID);
    if (model.length !== ROW_COUNT || model.last !== 'edited-row-1000') {
        throw new Error(`edit/add/remove did not round-trip to the VM: ${JSON.stringify(model)}`);
    }
    if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(' | ')}`);

    receipt = {...receipt, initialRows, scroll, model, pageErrors};
    await page.screenshot({path: resolve(artifacts, 'last-row-edited.png'), fullPage: true});
    await writeFile(resolve(artifacts, 'result.json'), JSON.stringify(receipt, null, 2));
    console.log(`List monitor virtualization: ${ROW_COUNT} rows, ${initialRows} initially rendered; ` +
        'row 1000 reached and edit/add/remove passed.');
} catch (error) {
    receipt = {...receipt, error: error.message, pageErrors};
    await page.screenshot({path: resolve(artifacts, 'failure.png'), fullPage: true}).catch(() => {});
    await writeFile(resolve(artifacts, 'result.json'), JSON.stringify(receipt, null, 2)).catch(() => {});
    throw error;
} finally {
    await browser.close();
}
