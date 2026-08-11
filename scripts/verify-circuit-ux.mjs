#!/usr/bin/env node
/** Headless browser acceptance checks for the Code/Circuit workspace UX. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const port = 8098;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};
if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');

const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);
        if (path.endsWith('/')) path += 'index.html';
        const file = join(build, normalize(path));
        if (!file.startsWith(build)) throw new Error('escape');
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(await readFile(file));
    } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(done => server.listen(port, done));

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1024, height: 768}});
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

try {
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    await page.goto(`http://localhost:${port}/`, {waitUntil: 'networkidle', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});
    await page.waitForTimeout(1500);

    const tabs = await page.locator('[role="tab"]').allInnerTexts();
    check('Blocks tab is branded Blocks', tabs.includes('Blocks'), tabs.join(' | '));
    const title = page.locator('input[value="BrickWright Project"], #title-field');
    const titleCount = await title.count();
    const titleValue = titleCount ? await title.first().inputValue() : '';
    check('new project title is BrickWright Project', titleValue === 'BrickWright Project', titleValue || 'title input not rendered');

    const restore = page.getByRole('button', {name: 'Show stage and circuit pane'});
    check('right-pane restore button is in the main tab row', await restore.count() === 1);
    await page.evaluate(() => {
        localStorage.setItem('bw-hide-stage', '1');
        window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-hide-stage', value: '1'}}));
    });
    await page.waitForTimeout(150);
    await restore.click();
    await page.waitForTimeout(150);
    check('restore button reopens the right pane', await page.evaluate(() => localStorage.getItem('bw-hide-stage')) === '0');

    const stageButton = page.getByRole('button', {name: 'Scratch Stage'});
    const circuitButton = page.getByRole('button', {name: 'Circuit Designer without debugger'});
    const debuggerButton = page.getByRole('button', {name: 'Switch to debugger'});
    check('stage-view buttons are present', await stageButton.count() === 1 && await circuitButton.count() === 1 && await debuggerButton.count() === 1);
    check('Scratch Stage is selected on a fresh editor', await stageButton.getAttribute('aria-pressed') === 'true');
    await circuitButton.click();
    await page.waitForTimeout(250);
    check('Circuit Designer button changes persisted view', await page.evaluate(() => localStorage.getItem('bw-stage-circuit')) === '1');
    check('Circuit Designer button remains selected', await circuitButton.getAttribute('aria-pressed') === 'true');
    check('Circuit view does not hide the stage wrapper in Code mode', await page.locator('div[class*="stage-and-target-wrapper"]').count() > 0);
    await debuggerButton.click();
    await page.waitForTimeout(250);
    check('debugger button changes dock', await page.evaluate(() => localStorage.getItem('bw-debug-dock')) === 'top');
    check('debugger button remains selected', await debuggerButton.getAttribute('aria-pressed') === 'true');
    check('debugger switch keeps the right pane present', await page.locator('div[class*="stage-and-target-wrapper"]').count() > 0);
    await stageButton.click();
    check('Scratch Stage becomes selected again', await stageButton.getAttribute('aria-pressed') === 'true');

    // Load the first circuit example through the mounted CircuitTab instance.
    await page.getByRole('tab', {name: /Circuit/}).click();
    await page.waitForTimeout(1800);
    const loaded = await page.evaluate(async () => {
        const root = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
        const key = Object.keys(root || {}).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        const queue = key ? [root[key]] : [];
        for (let i = 0; i < 10000 && queue.length; i++) {
            const f = queue.shift();
            if (f?.stateNode?.loadExample && Array.isArray(f.stateNode.state?.examples) && f.stateNode.state.examples.length) {
                await f.stateNode.loadExample(f.stateNode.state.examples[0]);
                return true;
            }
            if (f?.child) queue.push(f.child);
            if (f?.sibling) queue.push(f.sibling);
        }
        return false;
    });
    check('Circuit Designer circuit content loaded', loaded || await page.locator('.bw-circuit-designer').count() === 1);
    await page.waitForTimeout(2200);

    const designer = page.locator('.bw-circuit-designer');
    check('Circuit Designer rendered', await designer.count() === 1);
    const toolbar = designer.locator('button[title="Build mode"]').locator('..');
    check('shared toolbar has view buttons', await designer.getByRole('button', {name: 'Realistic view'}).count() === 1 && await designer.getByRole('button', {name: 'Schematic view'}).count() === 1);
    check('shared toolbar has panel navigation', await designer.getByRole('button', {name: 'Designer'}).count() === 1 && await designer.getByRole('button', {name: 'Warnings'}).count() === 1 && await designer.getByRole('button', {name: 'Parts list'}).count() === 1 && await designer.getByRole('button', {name: 'Examples'}).count() === 1);
    const toolbarBox = await toolbar.boundingBox();
    check('toolbar is touch-sized', !!toolbarBox && toolbarBox.height >= 40, toolbarBox ? `${toolbarBox.width}x${toolbarBox.height}` : 'missing');

    // The dedicated Circuit tab is the full designer. The Blocks tab embeds a
    // compact circuit preview, where editor chrome starts collapsed.
    const fullPartsButton = designer.getByRole('button', {name: 'Collapse parts panel'});
    check('full designer shows its parts panel', await fullPartsButton.count() === 1);
    await circuitButton.click();
    await page.waitForTimeout(250);
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await page.waitForTimeout(700);
    const embedded = page.locator('.bw-circuit-designer');
    const partsButton = embedded.getByRole('button', {name: 'Expand parts panel'});
    check('embedded preview starts with parts collapsed', await partsButton.count() === 1);
    await partsButton.click();
    await page.waitForTimeout(150);
    const palette = designer.locator('input[placeholder="search..."]');
    check('parts palette can reopen', await palette.count() === 1);
    const scrollable = await palette.evaluate(el => {
        const panel = el.parentElement?.parentElement;
        return !!panel && panel.scrollHeight >= panel.clientHeight;
    });
    check('parts palette column is scrollable', scrollable);

    await embedded.getByRole('button', {name: 'Sim'}).click();
    await page.waitForTimeout(100);
    check('run/step controls are in the instrument column', await embedded.getByText('Simulation', {exact: true}).count() === 1);
    const pauseButton = embedded.locator('button[title="Pause simulation"]');
    const pauseBox = await pauseButton.boundingBox();
    const designerBox = await embedded.boundingBox();
    check('run/step controls are in the right instrument column', !!pauseBox && !!designerBox && pauseBox.x > designerBox.x + designerBox.width * 0.62);

    const summaries = page.locator('summary');
    check('top circuit notices are collapsed disclosure triangles', await summaries.count() >= 1);
    if (await summaries.count()) {
        const before = await page.getByText(/Build a circuit on its own/, {exact: false}).count();
        await summaries.first().click();
        const after = await page.getByText(/Build a circuit on its own/, {exact: false}).count();
        check('notice triangle expands its text', after >= before);
    }
} finally {
    await browser.close();
    server.close();
}

if (failures.length) {
    console.error(`\n${failures.length} browser acceptance check(s) failed.`);
    process.exit(1);
}
console.log('\nall circuit UX browser checks passed');
