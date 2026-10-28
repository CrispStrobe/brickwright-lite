#!/usr/bin/env node
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};
let server = null;
let url = process.env.PROOF_URL || null;
if (!url) {
    if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: scratch-gui/build is missing');
    server = createServer(async (req, res) => {
        try {
            let requestPath = decodeURIComponent(req.url.split('?')[0]);
            if (requestPath.endsWith('/')) requestPath += 'index.html';
            const file = join(build, normalize(requestPath));
            if (!file.startsWith(build)) throw new Error('path escape');
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
            res.end(await readFile(file));
        } catch {
            if (!res.headersSent) res.writeHead(404);
            res.end('not found');
        }
    });
    await new Promise((done, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', done);
    });
    url = `http://127.0.0.1:${server.address().port}/`;
}

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1024, height: 768}, locale: 'de-DE'});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
    localStorage.setItem('bw-starter-v1-complete', '1');
    localStorage.setItem('bw-right-pane-hidden', '0');
    localStorage.setItem('bw-debug-dock', 'controller');
});

try {
    await page.goto(`${url}?locale=de`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.__brickwrightStore?.getState()?.scratchGui?.vm, null, {timeout: 60000});
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-settings-change', {
        detail: {key: 'bw-debug-dock', value: 'controller'}
    })));

    const edit = page.getByTestId('bw-ctl-mode-edit');
    const play = page.getByTestId('bw-ctl-mode-play');
    await edit.waitFor({state: 'visible', timeout: 30000});
    if (await edit.textContent() !== '✎' || await play.textContent() !== '▶') {
        throw new Error('Edit/Play mode controls are not icon-only');
    }
    if (await edit.getAttribute('aria-label') !== 'Bearbeiten' || await play.getAttribute('aria-label') !== 'Spielen') {
        throw new Error('icon controls lost their German accessible names');
    }
    const [editBox, playBox] = await Promise.all([edit.boundingBox(), play.boundingBox()]);
    if (!editBox || !playBox || editBox.width > 36 || playBox.width > 36 || playBox.x + playBox.width > 1024) {
        throw new Error(`mode controls do not fit the iPad viewport: ${JSON.stringify({editBox, playBox})}`);
    }

    // The controller is a stage dock. At tablet widths the stage's resize veil
    // can overlap it in headless Chromium even though the control is visible;
    // force targets the actual button while still exercising its React handler.
    await edit.click({force: true});
    const before = await page.locator('[data-testid^="bw-ctl-remove-"]').count();
    await page.getByText('+ Widget hinzufügen', {exact: true}).click({force: true});
    await page.getByRole('button', {name: 'Taste', exact: true}).click({force: true});
    const after = await page.locator('[data-testid^="bw-ctl-remove-"]').count();
    if (after !== before + 1) throw new Error(`widget was not added (${before} -> ${after})`);

    const undo = page.getByTestId('bw-global-undo');
    if (await undo.isDisabled()) throw new Error('global undo stayed disabled after a widget edit');
    await undo.click();
    await page.waitForFunction(expected =>
        document.querySelectorAll('[data-testid^="bw-ctl-remove-"]').length === expected, before);
    if (!(await undo.isDisabled())) throw new Error('global undo did not disable after exhausting widget history');

    // The same menu control must hand off to CodeMirror's native history when
    // the Code tab becomes active; it must not consume Widget history again.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-activate-tab', {detail: {index: 3}})));
    const code = page.locator('[data-testid="bw-codemirror"] .cm-content');
    await code.waitFor({state: 'visible', timeout: 30000});
    const originalCode = await code.textContent();
    await code.click();
    await page.keyboard.type('undo_probe');
    await page.waitForFunction(() => {
        const button = document.querySelector('[data-testid="bw-global-undo"]');
        return button && !button.disabled && /\(Code\)$/.test(button.title);
    });
    await undo.click();
    await page.waitForFunction(expected =>
        document.querySelector('[data-testid="bw-codemirror"] .cm-content')?.textContent === expected,
    originalCode);

    // Structural project edits: deleting a costume is one step on the shared
    // project history, undone and redone from the menu bar like any edit.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-activate-tab', {detail: {index: 1}})));
    await page.waitForFunction(() => window.__bwGlobalUndo && document.querySelector('[data-testid="bw-global-redo"]'));
    const costumeNames = () => page.evaluate(() =>
        window.__brickwrightStore.getState().scratchGui.vm.editingTarget.sprite.costumes.map(costume => costume.name));
    // The project history is installed after the first paint (lazy chunk).
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.bwProjectHistory === true,
        null, {timeout: 30000});
    const costumes = await costumeNames();
    if (costumes.length < 2) throw new Error(`the default sprite needs two costumes, has ${costumes.length}`);
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.deleteCostume(0));
    await page.waitForFunction(count => window.__brickwrightStore.getState().scratchGui.vm.editingTarget
        .sprite.costumes.length === count, costumes.length - 1);
    await undo.click();
    await page.waitForFunction(expected => JSON.stringify(window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.sprite.costumes.map(costume => costume.name)) === expected, JSON.stringify(costumes));
    const redo = page.getByTestId('bw-global-redo');
    await redo.click();
    await page.waitForFunction(count => window.__brickwrightStore.getState().scratchGui.vm.editingTarget
        .sprite.costumes.length === count, costumes.length - 1);

    // History panel: the project step is listed and one click goes back to it.
    await page.getByTestId('bw-global-history').click();
    const panel = page.getByTestId('bw-history-panel');
    await panel.waitFor({state: 'visible', timeout: 30000});
    await page.getByTestId('bw-history-step--1').click();
    await page.waitForFunction(expected => JSON.stringify(window.__brickwrightStore.getState().scratchGui.vm
        .editingTarget.sprite.costumes.map(costume => costume.name)) === expected, JSON.stringify(costumes));
    // The keyboard walks the list too: End/Home, then Enter redoes the step.
    const focused = () => page.evaluate(() => document.activeElement.getAttribute('data-testid'));
    await page.getByTestId('bw-history-step-1').focus();
    await page.keyboard.press('End');
    const last = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="bw-history-list"] button'))
        .pop().getAttribute('data-testid'));
    if (await focused() !== last) throw new Error(`End focused ${await focused()}, not ${last}`);
    await page.keyboard.press('Home');
    if (await focused() !== 'bw-history-step-1') throw new Error(`Home focused ${await focused()}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(count => window.__brickwrightStore.getState().scratchGui.vm.editingTarget
        .sprite.costumes.length === count, costumes.length - 1);

    // Several real project steps: arrows move one entry and Enter on the
    // second entry undoes exactly two, rather than the old single-row probe.
    await page.getByTestId('bw-history-close').click();
    await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        for (let i = 1; i <= 3; i++) vm.renameSprite(vm.editingTarget.id, `Keyboard-${i}`);
    });
    await page.getByTestId('bw-global-history').click();
    await page.getByTestId('bw-history-step--1').focus();
    await page.keyboard.press('ArrowDown');
    if (await focused() !== 'bw-history-step--2') throw new Error('ArrowDown did not move one History step');
    await page.keyboard.press('ArrowUp');
    if (await focused() !== 'bw-history-step--1') throw new Error('ArrowUp did not move one History step');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getName() === 'Keyboard-1');
    await page.getByTestId('bw-history-close').click();
    await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        for (let i = 1; i <= 35; i++) vm.renameSprite(vm.editingTarget.id, `Scroll-${i}`);
    });
    await page.getByTestId('bw-global-history').click();
    await page.getByTestId('bw-history-step--32').click();
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.editingTarget.getName() === 'Scroll-3');
    await page.getByTestId('bw-history-close').click();
    await page.getByTestId('bw-global-history').click();
    await page.waitForFunction(() => {
        const list = document.querySelector('[data-testid="bw-history-list"]');
        const now = list?.querySelector('[aria-selected="true"]');
        if (!now) return false;
        const a = list.getBoundingClientRect(), b = now.getBoundingClientRect();
        return b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    });

    // User title edits and scripts shared to another sprite use the same
    // public menu controls; Undo must not delete the earlier duplicate instead.
    await page.getByTestId('bw-history-close').click();
    const originalTitle = await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.projectTitle);
    const title = page.locator('input[class*="project-title-input"]');
    await title.fill('History title probe');
    await title.press('Enter');
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.projectTitle === 'History title probe');
    await undo.click();
    await page.waitForFunction(expected => window.__brickwrightStore.getState().scratchGui.projectTitle === expected, originalTitle);
    await redo.click();
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.projectTitle === 'History title probe');
    const shared = await page.evaluate(async () => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        const source = vm.editingTarget, before = new Set(vm.runtime.targets);
        await vm.duplicateSprite(source.id);
        const target = vm.runtime.targets.find(t => t.isOriginal && !before.has(t));
        const count = Object.keys(target.blocks._blocks).length;
        await vm.shareBlocksToTarget([{id: 'history-share-probe', opcode: 'event_whenflagclicked',
            next: null, parent: null, inputs: {}, fields: {}, topLevel: true, shadow: false, x: 0, y: 0}],
        target.id, source.id);
        return {id: target.id, before: count};
    });
    await undo.click();
    await page.waitForFunction(({id, before}) => {
        const target = window.__brickwrightStore.getState().scratchGui.vm.runtime.getTargetById(id);
        return target && Object.keys(target.blocks._blocks).length === before;
    }, shared);
    await redo.click();
    await page.waitForFunction(({id, before}) => Object.keys(window.__brickwrightStore.getState().scratchGui.vm.runtime
        .getTargetById(id).blocks._blocks).length === before + 1, shared);
    await page.getByTestId('bw-global-history').click();

    // Autosave: a version of the whole project is stored and listed.
    await page.getByTestId('bw-history-tab-autosave').click();
    await page.getByTestId('bw-autosave-save-now').click();
    await page.getByTestId('bw-autosave-versions').waitFor({state: 'visible', timeout: 60000});
    await page.getByTestId('bw-history-close').click();

    // Crash recovery: a session that ends with unsaved changes offers its last
    // autosave at the next start, and Reopen restores it.
    await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        vm.renameSprite(vm.editingTarget.id, 'Recovered');
    });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('bw-open-history-panel', {detail: {view: 'autosave'}})));
    await page.getByTestId('bw-autosave-save-now').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="bw-autosave-versions"] > div').length >= 2);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.getByTestId('bw-autosave-recovery-open').click({timeout: 90000});
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
        .some(target => !target.isStage && target.getName() === 'Recovered'), null, {timeout: 60000});
    if (errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
} finally {
    await browser.close();
    if (server) server.close();
}

console.log('ok iPad-width Widget icons fit; global undo/redo restores Widget, Code and costume edits; History, autosave and crash recovery work');
