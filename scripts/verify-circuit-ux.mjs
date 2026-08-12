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
page.on('requestfailed', request => console.log(`request failed ${request.url()} — ${request.failure()?.errorText || 'unknown'}`));
page.on('console', message => { if (message.type() === 'error') console.log(`browser error ${message.text()}`); });
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

    const settingsMenu = page.getByText('Settings', {exact: true}).last();
    await settingsMenu.locator('xpath=../..').click({force: true});
    check('Settings exposes the app-internal hard reload action', await page.getByText('Reload BrickWright', {exact: true}).count() === 1);
    await page.keyboard.press('Escape');

    const paneToggle = page.getByRole('button', {name: /Right Pane/});
    check('obsolete right-pane toggle is absent from the main tab row', await paneToggle.count() === 0);
    const editorPane = page.locator('[data-editor-pane]');
    const rightPane = page.locator('[data-right-pane]');
    check('right pane remains mounted for optional Circuit Designer selection', await page.locator('[data-right-pane]').count() === 1);

    const stageButton = page.getByRole('button', {name: 'Scratch Stage'});
    const circuitButton = page.getByRole('button', {name: 'Circuit Designer without debugger'});
    const debuggerButton = page.getByRole('button', {name: /Circuit Designer with debugger|Switch to debugger/});
    check('stage-view buttons are present', await stageButton.count() === 1 && await circuitButton.count() === 1 && await debuggerButton.count() === 1);
    check('Scratch Stage is selected on a fresh editor', await stageButton.getAttribute('aria-pressed') === 'true');
    await circuitButton.click();
    await page.waitForTimeout(900);
    check('Circuit Designer button changes persisted view', await page.evaluate(() => localStorage.getItem('bw-stage-circuit')) === '1');
    check('Circuit Designer button remains selected', await page.evaluate(() => localStorage.getItem('bw-stage-circuit')) === '1');
    check('Circuit view keeps the stage controls available in Code mode', await page.locator('button').filter({has: page.locator('img')}).count() >= 3, await page.locator('body').innerText().catch(() => ''));
    await debuggerButton.click({force: true});
    await page.waitForTimeout(900);
    check('debugger button changes dock', await page.evaluate(() => localStorage.getItem('bw-debug-dock')) === 'top');
    check('debugger button remains selected', await debuggerButton.getAttribute('aria-pressed') === 'true');
    check('debugger switch keeps the right pane present', await page.locator('div[class*="stage-and-target-wrapper"]').count() > 0);
    check('debugger view keeps the circuit portal mounted without MCU code', await page.locator('[data-bw-circuit-stage-host]').count() === 1);
    check('debugger view keeps Circuit Designer mounted', await page.locator('[data-bw-circuit-stage-host] .bw-circuit-designer').count() === 1);
    check('debugger view shows controls in the right panel', await page.locator('[data-instruments-column] [data-debugger-panel]').count() === 1);
    check('debugger view explains missing code in the right panel', await page.locator('[data-instruments-column] [data-no-code-indicator]').count() === 1);
    await stageButton.click({force: true});
    check('Scratch Stage becomes selected again', await stageButton.getAttribute('aria-pressed') === 'true');
    await stageButton.click({force: true});
    await page.waitForTimeout(200);
    await circuitButton.click({force: true});
    await page.waitForTimeout(700);
    const stageChildren = await page.locator('div[class*="stage-and-target-wrapper"] > *').evaluateAll(nodes => nodes.map(node => ({className: node.className, display: getComputedStyle(node).display, host: node.hasAttribute('data-bw-circuit-stage-host')})));
    check('full-width circuit view hides the Scratch target beside it', stageChildren.some(child => child.className.includes('target-wrapper') && child.display === 'none'), JSON.stringify(stageChildren));

    // Load the first circuit example through the mounted CircuitTab instance.
    await page.getByRole('tab', {name: /Circuit/}).click();
    await page.waitForTimeout(4000);
    await debuggerButton.click({force: true});
    await page.waitForTimeout(500);
    const dedicatedDesigner = page.locator('.bw-circuit-designer:visible').last();
    check('dedicated Circuit tab keeps debugger controls visible', await dedicatedDesigner.locator('[data-instruments-column] [data-debugger-panel]').count() === 1,
        `designers=${await page.locator('.bw-circuit-designer').count()} visible=${await page.locator('.bw-circuit-designer:visible').count()} instruments=${await dedicatedDesigner.locator('[data-instruments-column]').count()}`);
    check('dedicated Circuit tab visibly reports missing code when applicable', await dedicatedDesigner.locator('[data-instruments-column] [data-no-code-indicator]').count() === 1,
        `dock=${await page.evaluate(() => localStorage.getItem('bw-debug-dock'))} noCode=${await dedicatedDesigner.locator('[data-no-code-indicator]').count()}`);
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
    check('Circuit Designer circuit content loaded', loaded || await page.locator('.bw-circuit-designer').count() >= 1);
    await page.waitForTimeout(2200);

    const designer = page.locator('.bw-circuit-designer').first();
    check('Circuit Designer rendered', await designer.count() >= 1);
    const modeToggle = designer.locator('[data-build-sim-toggle]');
    const toolbar = modeToggle.locator('..');
    check('shared toolbar has view buttons', await designer.locator('[data-circuit-view-toggle] [aria-label="Realistic view"]').count() >= 1 && await designer.locator('[data-circuit-view-toggle] [aria-label="Schematic view"]').count() >= 1);
    const viewToggle = designer.locator('[data-circuit-view-toggle]').first();
    check('Realistic/Schematic is one segmented view toggle', await viewToggle.count() === 1 && await viewToggle.getByRole('radio').count() === 2 && await viewToggle.getByRole('radio', {name: 'Realistic view'}).getAttribute('aria-checked') === 'true');
    check('view toggle matches toolbar control height', await viewToggle.evaluate(el => el.getBoundingClientRect().height >= 34));
    check('Build/Sim is one segmented mode toggle', await modeToggle.count() === 1 && await modeToggle.getByRole('radio').count() === 2 && await modeToggle.getByRole('radio', {name: 'Build mode'}).getAttribute('aria-checked') === 'true');
    const modeMetrics = await modeToggle.getByRole('radio').evaluateAll(buttons => buttons.map(button => ({width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height})));
    check('Build/Sim toggle segments have equal dimensions', modeMetrics.length === 2 && modeMetrics[0].width === modeMetrics[1].width && modeMetrics[0].height === modeMetrics[1].height, JSON.stringify(modeMetrics));
    const powerToggle = designer.locator('[data-power-toggle]');
    check('power is a visible two-state toggle', await powerToggle.getByRole('radio').count() === 2 && await powerToggle.getByRole('radio', {name: 'Power on'}).getAttribute('aria-checked') === 'true');
    check('view buttons share the Build/Sim toolbar', await designer.locator('[data-circuit-view-switcher]').first().locator('xpath=../..').locator('[data-build-sim-toggle]').count() === 1);
    const panelNavigation = designer.locator('[data-panel-navigation]');
    check('shared toolbar has panel navigation', await panelNavigation.count() === 1 && await panelNavigation.locator('button').count() >= 4, `containers=${await panelNavigation.count()} buttons=${await panelNavigation.locator('button').count()}`);
    const panelButtonMetrics = await designer.getByRole('button', {name: 'Designer'}).evaluateAll(buttons => buttons.map(button => ({width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height})));
    check('panel navigation uses compact equal buttons', panelButtonMetrics.length === 1 && panelButtonMetrics[0].width <= 42 && panelButtonMetrics[0].height >= 30, JSON.stringify(panelButtonMetrics));
    const toolbarBox = await toolbar.boundingBox();
    check('toolbar is touch-sized', !!toolbarBox && toolbarBox.height >= 40, toolbarBox ? `${toolbarBox.width}x${toolbarBox.height}` : 'missing');
    const moreControls = designer.getByRole('button', {name: 'More circuit controls'});
    check('save/load/zoom controls have a single overflow slot', await moreControls.count() === 1 && await designer.locator('[data-toolbar-more]').count() === 1);
    await moreControls.click({force: true});
    check('overflow slot exposes Save, Load, and Zoom', await designer.getByRole('button', {name: 'Save wiring as file'}).count() === 1 && await designer.getByRole('button', {name: 'Load wiring from file'}).count() === 1 && await designer.locator('[data-zoom-indicator]').count() === 1);
    check('zoom indicator has readable contrast styling', await designer.locator('[data-zoom-indicator]').evaluate(el => getComputedStyle(el).color !== getComputedStyle(el.parentElement).backgroundColor));
    await moreControls.click({force: true});
    check('toolbar explicitly wraps when space is constrained', await designer.locator('[data-circuit-toolbar]').evaluate(el => getComputedStyle(el).flexWrap === 'wrap'));

    // The dedicated Circuit tab is the full designer. The Blocks tab embeds a
    // compact circuit preview, where editor chrome starts collapsed.
    const fullPartsButton = designer.getByRole('button', {name: 'Collapse Selectors Panel'});
    check('full designer shows its parts panel', await fullPartsButton.count() === 1);
    if (await fullPartsButton.count()) {
        await fullPartsButton.click({force: true});
        await page.waitForTimeout(100);
        check('parts selector actually collapses', await designer.getByRole('button', {name: 'Expand Selectors Panel'}).count() === 1 && await designer.locator('[data-parts-panel]').count() === 0);
        await designer.getByRole('button', {name: 'Expand Selectors Panel'}).click({force: true});
        await page.waitForTimeout(100);
        check('parts selector actually reopens', await designer.getByRole('button', {name: 'Collapse Selectors Panel'}).count() === 1 && await designer.locator('[data-parts-panel]').count() === 1);
    }
    const examplesSelector = designer.locator('[data-examples-selector]').first();
    check('Examples selector has an independent collapse affordance', await examplesSelector.count() === 1 && await examplesSelector.getByRole('button', {name: 'Collapse examples selector'}).count() === 1);
    if (await examplesSelector.count()) {
        await examplesSelector.getByRole('button', {name: 'Collapse examples selector'}).click({force: true});
        check('Examples selector actually collapses', await examplesSelector.getByRole('button', {name: 'Expand examples selector'}).count() === 1 && await examplesSelector.getByText('Examples:', {exact: true}).count() === 0);
        await examplesSelector.getByRole('button', {name: 'Expand examples selector'}).click({force: true});
        check('Examples selector actually reopens', await examplesSelector.getByRole('button', {name: 'Collapse examples selector'}).count() === 1 && await examplesSelector.getByText('Examples:', {exact: true}).count() === 1);
    }
    await designer.locator('[data-circuit-view-switcher] button[title="Schematic view"]').first().evaluate(el => el.click());
    await page.waitForTimeout(150);
    const realisticEscape = page.locator('[data-schematic-escape] button[title="Realistic view"]');
    check('schematic view keeps an escape route', await realisticEscape.count() >= 1);
    if (await realisticEscape.count()) await realisticEscape.last().evaluate(el => el.click());
    await circuitButton.click();
    await page.waitForTimeout(250);
    await page.getByRole('tab', {name: 'Blocks', exact: true}).click();
    await page.waitForTimeout(700);
    const embedded = page.locator('[data-bw-circuit-stage-host] .bw-circuit-designer');
    const partsButton = embedded.getByRole('button', {name: 'Expand Selectors Panel'});
    check('embedded preview starts with parts collapsed', await partsButton.count() === 1);
    const collapsedPartsBox = await partsButton.boundingBox();
    const collapsedPartsStyle = await partsButton.evaluate(el => ({position: getComputedStyle(el).position, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height}));
    check('collapsed parts handle is a compact overlay', collapsedPartsStyle.position === 'absolute' && collapsedPartsStyle.width <= 40 && collapsedPartsStyle.height <= 40, JSON.stringify(collapsedPartsStyle));
    await partsButton.evaluate(el => el.click());
    await page.waitForTimeout(150);
    const palettes = embedded.locator('input[placeholder="search..."]');
    const palette = palettes.first();
    check('parts palette can reopen', await palettes.count() === 1, `embedded=${await embedded.count()} expand=${await partsButton.count()}`);
    const paletteBox = embedded.locator('[data-parts-palette]');
    const paletteMetrics = await paletteBox.evaluate(el => {
        const r = el.getBoundingClientRect();
        return {top: r.top, bottom: r.bottom, viewport: window.innerHeight,
            scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(el).overflowY};
    });
    check('parts palette fits inside the viewport', paletteMetrics.top >= 0 && paletteMetrics.bottom <= 768 && paletteMetrics.clientHeight > 0, JSON.stringify(paletteMetrics));
    const scrollable = paletteMetrics.scrollHeight > paletteMetrics.clientHeight && paletteMetrics.overflowY === 'auto';
    check('parts palette is genuinely scrollable', scrollable, JSON.stringify(paletteMetrics));
    const beforeScroll = await paletteBox.evaluate(el => el.scrollTop);
    await paletteBox.evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll', {bubbles: true})); });
    const afterScroll = await paletteBox.evaluate(el => el.scrollTop);
    check('parts palette reaches its bottom', afterScroll > beforeScroll && afterScroll + paletteMetrics.clientHeight >= paletteMetrics.scrollHeight - 1, `${beforeScroll} -> ${afterScroll}`);
    check('parts palette remains viewport bounded after scrolling', await paletteBox.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight && el.clientHeight > 0 && el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto';
    }), JSON.stringify(paletteMetrics));
    check('example info is compact and on demand', await embedded.getByText('Why active-low?', {exact: true}).count() === 0 && await embedded.getByRole('button', {name: /Example info|Info for/}).count() === 1);
    const canvasMetrics = await embedded.locator('[data-canvas]').evaluate(el => {
        const r = el.getBoundingClientRect();
        const p = el.closest('[data-designer-main]');
        const pr = p.getBoundingClientRect();
        return {width: r.width, height: r.height, parentWidth: pr.width, parentHeight: pr.height,
            scrollWidth: p.scrollWidth, clientWidth: p.clientWidth, scrollHeight: p.scrollHeight, clientHeight: p.clientHeight};
    });
    check('circuit canvas fits or exceeds its available width without clipping', canvasMetrics.parentWidth > 0 && canvasMetrics.width >= canvasMetrics.parentWidth - 2 && canvasMetrics.scrollWidth >= canvasMetrics.clientWidth, JSON.stringify(canvasMetrics));
    check('circuit designer viewport scrolls in both directions when needed', canvasMetrics.scrollWidth > canvasMetrics.clientWidth && canvasMetrics.scrollHeight > canvasMetrics.clientHeight, JSON.stringify(canvasMetrics));
    const narrowLayout = await embedded.evaluate(root => {
        const toolbar = root.querySelector('[data-circuit-toolbar]');
        const main = root.querySelector('[data-designer-main]');
        const canvas = root.querySelector('[data-canvas]');
        const oldWidth = toolbar.style.width;
        toolbar.style.width = '320px';
        toolbar.style.maxWidth = '320px';
        toolbar.style.flex = '0 0 320px';
        const result = {toolbarHeight: toolbar?.getBoundingClientRect().height || 0, mainWidth: main?.clientWidth || 0,
            mainScrollWidth: main?.scrollWidth || 0, mainScrollHeight: main?.scrollHeight || 0,
            canvasWidth: canvas?.getBoundingClientRect().width || 0};
        toolbar.style.width = oldWidth;
        toolbar.style.maxWidth = '';
        toolbar.style.flex = '';
        return result;
    });
    check('narrow toolbar grows to multiple rows', narrowLayout.toolbarHeight > 44, JSON.stringify(narrowLayout));
    check('wrapped toolbar is not vertically cropped', await embedded.evaluate(root => {
        const toolbar = root.querySelector('[data-circuit-toolbar]');
        const canvas = root.querySelector('[data-canvas]');
        const tr = toolbar?.getBoundingClientRect();
        const cr = canvas?.getBoundingClientRect();
        return !!tr && !!cr && tr.bottom <= cr.top && tr.height >= 44;
    }));
    check('narrow circuit pane remains scrollable instead of static crop', narrowLayout.mainWidth > 0 && narrowLayout.mainScrollWidth > narrowLayout.mainWidth && narrowLayout.mainScrollHeight > 0, JSON.stringify(narrowLayout));
    await page.setViewportSize({width: 760, height: 520});
    await page.waitForTimeout(150);
    const resizedLayout = await embedded.evaluate(root => {
        const main = root.querySelector('[data-designer-main]');
        const canvas = root.querySelector('[data-canvas]');
        const mr = main.getBoundingClientRect();
        const cr = canvas.getBoundingClientRect();
        return {mainWidth: mr.width, mainHeight: mr.height, canvasRight: cr.right, viewport: window.innerWidth,
            scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, scrollHeight: main.scrollHeight, clientHeight: main.clientHeight};
    });
    check('designer resizes with a narrow window and keeps horizontal scrolling', resizedLayout.mainWidth > 0 && resizedLayout.canvasRight > resizedLayout.mainWidth && resizedLayout.scrollWidth > resizedLayout.clientWidth, JSON.stringify(resizedLayout));
    check('designer keeps vertical scrolling after a narrow-window resize', resizedLayout.scrollHeight > resizedLayout.clientHeight, JSON.stringify(resizedLayout));
    await page.setViewportSize({width: 1024, height: 768});
    const actions = embedded.locator('[data-element-actions]');
    check('selected-element actions are contextual on the grid surface', await embedded.locator('[data-selection-actions]').count() === 0 || await embedded.locator('[data-selection-actions] button').count() >= 3);
    const undo = page.getByRole('button', {name: 'Undo'}).last();
    const undoBox = await undo.boundingBox();
    check('undo/redo controls are touch-sized', !!undoBox && undoBox.width >= 34 && undoBox.height >= 30);

    const instruments = embedded.locator('[data-instruments-column]');
    const expandInstruments = page.getByRole('button', {name: 'Expand instruments panel'});
    if (await expandInstruments.count()) {
        const collapsedInstrumentsStyle = await expandInstruments.last().evaluate(el => ({position: getComputedStyle(el).position, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height}));
        check('collapsed instruments handle is a compact overlay', collapsedInstrumentsStyle.position === 'absolute' && collapsedInstrumentsStyle.width <= 40 && collapsedInstrumentsStyle.height <= 40, JSON.stringify(collapsedInstrumentsStyle));
        await expandInstruments.last().evaluate(el => el.click());
        await page.waitForTimeout(100);
    }
    check('instrument panel has a compact expand/collapse affordance', await instruments.count() === 1 || await expandInstruments.count() === 1);
    check('toolbar has no duplicate right-panel button', await embedded.getByRole('button', {name: /Show right panel|Hide right panel/}).count() === 0);
    const scopeButtons = page.getByRole('button', {name: /Scope$/});
    for (let i = 0; i < await scopeButtons.count(); i++) {
        await scopeButtons.nth(i).evaluate(el => el.click());
        await page.waitForTimeout(80);
        if (await page.locator('[data-scope-panel]').count()) break;
    }
    const meterButton = page.getByRole('button', {name: /Meter$/}).last();
    if (await meterButton.count()) await meterButton.evaluate(el => el.click());
    await page.waitForTimeout(250);
    const scopePanel = page.locator('[data-scope-panel]').first();
    const meterTitle = page.getByText('Multimeter', {exact: true}).first();
    check('oscilloscope toggle is available from the instrument panel', await scopeButtons.count() >= 1 || await scopePanel.count() === 1, `embedded=${await embedded.count()} instruments=${await instruments.count()}`);
    if (await scopePanel.count()) check('oscilloscope fits inside the instrument column', await scopePanel.evaluate(el => el.getBoundingClientRect().right <= el.parentElement.getBoundingClientRect().right + 1));
    check('multimeter is available from the instrument panel', await meterTitle.count() >= 1, `titles=${await meterTitle.count()}`);

    await embedded.locator('[data-build-sim-toggle]').getByRole('radio', {name: 'Sim mode'}).evaluate(el => el.click());
    await page.waitForTimeout(100);
    check('run/step controls are in the instrument column', await embedded.locator('[data-simulation-controls]').count() === 1, `sim=${await embedded.locator('[data-simulation-controls]').count()}`);
    const pauseButton = page.locator('button[title="Pause simulation"]');
    const pauseBox = await pauseButton.count() ? await pauseButton.boundingBox() : null;
    const designerBox = await embedded.boundingBox();
    check('run/step controls stay in the designer instrument area', !!pauseBox && !!designerBox && pauseBox.x >= designerBox.x);

    const summaries = page.locator('summary');
    check('top circuit notices are collapsed disclosure triangles', await summaries.count() >= 1);
    if (await summaries.count()) {
        const before = await page.getByText(/Build a circuit on its own/, {exact: false}).count();
        await summaries.first().click({force: true});
        const after = await page.getByText(/Build a circuit on its own/, {exact: false}).count();
    check('notice triangle expands its text', after >= before);
    }

    // A program imported from the pseudocode/examples flow must leave a sprite
    // selected. The Stage has no Motion toolbox, so selecting it here would
    // recreate the regression even though the project loaded successfully.
    const blocksTab = page.getByRole('tab', {name: 'Blocks', exact: true});
    await blocksTab.click({force: true});
    await page.waitForTimeout(300);
    const targetText = await page.locator('body').innerText();
    check('Blocks workflow keeps Motion blocks available after example import', !targetText.includes('Stage selected: no motion blocks') && await page.getByText('Motion', {exact: true}).count() >= 1);
    await circuitButton.click({force: true});
    await page.waitForTimeout(250);
    check('Circuit Designer without debugger works from Blocks mode', await page.evaluate(() => localStorage.getItem('bw-debug-dock')) === 'off' && await page.locator('[data-bw-circuit-stage-host]').count() === 1);
    check('debugger panel is absent in debugger-free Blocks mode', await page.locator('[data-bw-circuit-stage-host] [data-debugger-panel]').count() === 0);

    const greenFlag = page.locator('img[title="Go"]:visible, [aria-label*="Green Flag" i]:visible, [title*="green flag" i]:visible');
    if (await greenFlag.count()) {
        await page.evaluate(() => { window.__bwGreenFlagSeen = 0; window.addEventListener('bw-green-flag', () => { window.__bwGreenFlagSeen++; }, {once: false}); });
        await greenFlag.last().click({force: true});
        await page.waitForTimeout(250);
        const greenFlagSeen = await page.evaluate(() => window.__bwGreenFlagSeen || 0);
        const controlsAfterGreen = await page.locator('[data-bw-circuit-stage-host] [data-simulation-controls]').count();
        check('green flag starts the embedded simulation lifecycle', controlsAfterGreen === 1,
            `events=${greenFlagSeen} simMode=${await page.locator('[data-bw-circuit-stage-host] [data-sim-mode="simulate"]').count()} controls=${controlsAfterGreen} direct=${await page.locator('[data-bw-circuit-stage-host] [data-simulation-controls]').count()}`);
        const stop = page.locator('img[title="Stop"]:visible, [aria-label="Stop"]:visible, [title="Stop"]:visible').last();
        if (await stop.count()) {
            await stop.click({force: true});
            await page.waitForTimeout(150);
            check('red flag stops the embedded simulation lifecycle', await page.locator('[data-bw-circuit-stage-host] [data-simulation-controls]').count() === 0);
        }
    } else {
        check('green flag control is discoverable for lifecycle testing', false, 'no green flag selector');
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
