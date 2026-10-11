import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join, resolve, extname, normalize} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const build = resolve(import.meta.dirname, '../packages/scratch-gui/build');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml'};
const server = createServer(async (req, res) => {
    try {
        let name = decodeURIComponent(req.url.split('?')[0]);
        if (name.endsWith('/')) name += 'index.html';
        const file = join(build, normalize(name));
        if (!file.startsWith(build)) throw new Error('escape');
        const bytes = await readFile(file);
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(bytes);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch();
try {
    const creator = new SB3Creator();
    creator.parse(`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  set splashResult to 1
  arcade splash "Ready" subtitle "Press A"
  set splashResult to 2
  arcade long text "Long message" layout "Right"
  set splashResult to 3
`);
    assert.deepEqual(creator.warnings, []);
    const sb3 = [...new Uint8Array(await (await creator.generateSB3()).arrayBuffer())];
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '1');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => !!window.__brickwrightStore?.getState()?.scratchGui?.vm,
        null, {timeout: 30000});
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await page.evaluate(async bytes => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        await vm.loadProject(Uint8Array.from(bytes));
        window.__bwArcadeDialogs = [];
        vm.runtime.on('ARCADE_DIALOG', dialog => window.__bwArcadeDialogs.push(dialog && dialog.title));
        vm.start();
        vm.greenFlag();
    }, sb3);
    const dialog = page.getByRole('dialog', {name: 'Arcade splash screen'});
    try { await dialog.waitFor({state: 'visible', timeout: 15000}); }
    catch (error) {
        const state = await page.evaluate(() => ({dialogs: window.__bwArcadeDialogs,
            values: window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
                .flatMap(target => Object.values(target.variables || {})).map(variable => [variable.name, variable.value]),
            pageDialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => ({text: node.textContent,
                bounds: node.getBoundingClientRect().toJSON(), style: getComputedStyle(node).cssText,
                parent: node.parentElement?.getBoundingClientRect().toJSON(),
                ancestors: (() => { const a = []; for (let n = node; n && a.length < 8; n = n.parentElement)
                    a.push([n.tagName, n.className, getComputedStyle(n).display, getComputedStyle(n).visibility,
                        n.getBoundingClientRect().width]); return a; })()}))}));
        throw new Error(`${error.message}\n${JSON.stringify(state)}`);
    }
    await dialog.getByText('Ready').waitFor();
    await dialog.getByText('Press A').waitFor();
    const value = () => page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
        .flatMap(target => Object.values(target.variables || {}))
        .find(variable => variable.name === 'splashResult')?.value);
    assert.equal(Number(await value()), 1, 'script advanced before the splash was dismissed');
    await dialog.getByRole('button', {name: 'Continue'}).press('a');
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
        .flatMap(target => Object.values(target.variables || {}))
        .some(variable => variable.name === 'splashResult' && Number(variable.value) === 2), null, {timeout: 10000});
    assert.equal(await dialog.count(), 0);
    const longText = page.getByRole('dialog', {name: 'Arcade long text'});
    await longText.waitFor({state: 'visible', timeout: 10000});
    await longText.getByText('Long message').waitFor();
    assert.equal(Number(await value()), 2, 'script advanced before long text dismissal');
    await longText.getByRole('button', {name: 'Continue'}).click();
    await page.waitForFunction(() => window.__brickwrightStore.getState().scratchGui.vm.runtime.targets
        .flatMap(target => Object.values(target.variables || {}))
        .some(variable => variable.name === 'splashResult' && Number(variable.value) === 3), null, {timeout: 10000});
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({case: 'Arcade dialogs in built GUI', beforeDismiss: 1, afterDismiss: await value()}));
} finally {
    await browser.close();
    await new Promise(done => server.close(done));
}
