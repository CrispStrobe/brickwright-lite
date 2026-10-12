#!/usr/bin/env node
/**
 * Browser check of the Arcade tile map painter (costume tab).
 *
 * Imports a real MakeCode Arcade platformer (test/fixtures/makecode/
 * arcade-tilemap.hex) through the Code tab's Open, builds blocks, opens
 * Costumes → Tile maps and, with real pointer input on the painter's canvases:
 * paints a cell with a tile, adds a wall, undoes and redoes, draws a pixel into
 * the tile, saves, and starts a new level. Then it reads the `set Arcade tilemap` block the level came
 * from and runs the game, checking the running tile map has the painted cell,
 * the wall and the edited tile pixel. It saves a real SB3, reopens it in a
 * fresh session, edits the restored painter, runs the restored level, and
 * exports/compiles/reimports MakeCode with exact map preservation.
 *
 *   node scripts/verify-arcade-tilemap-painter.mjs            # serves packages/scratch-gui/build
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-arcade-tilemap-painter.mjs
 */
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {openCodeActions} from './lib-code-actions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(process.env.BW_INTEGRATED_ROOT || root, 'packages', 'scratch-gui', 'build');
const fixture = join(root, 'test', 'fixtures', 'makecode', 'arcade-tilemap.hex');
const out = resolve(process.env.BW_TILEMAP_REPORT_DIR || 'test-results/arcade-tilemap-painter');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm'};

let server = null;
let url = process.env.PROOF_URL || process.env.BW_URL || null;
if (!url) {
    if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');
    server = createServer(async (req, res) => {
        let body = null;
        try {
            let path = decodeURIComponent(req.url.split('?')[0]);
            if (path.endsWith('/')) path += 'index.html';
            const file = join(build, normalize(path));
            if (!file.startsWith(build)) throw new Error('escape');
            body = await readFile(file);
            res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        } catch (e) {
            res.writeHead(404);
        }
        res.end(body || 'not found');
    });
    const first = Number(process.env.BW_PORT || 8191);
    let port = null;
    for (let p = first; p < first + 20 && port === null; p++) {
        try {
            await new Promise((done, fail) => {
                server.once('error', fail);
                server.listen(p, () => { server.removeListener('error', fail); done(); });
            });
            port = p;
        } catch (e) {
            if (e.code !== 'EADDRINUSE') throw e;
        }
    }
    if (port === null) throw new Error('no free port');
    url = `http://localhost:${port}/`;
}

const failures = [];
const report = {url: url.replace(/localhost:\d+/, 'localhost'), checks: []};
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    report.checks.push({name, ok: Boolean(ok), detail: String(detail)});
    if (!ok) failures.push(name);
};
const waitFor = async (read, ok, timeoutMs, stepMs = 400) => {
    const until = Date.now() + timeoutMs;
    let value = await read();
    while (!ok(value) && Date.now() < until) {
        await new Promise(done => setTimeout(done, stepMs));
        value = await read();
    }
    return value;
};

const browser = await chromium.launch(process.env.BW_BROWSER ? {executablePath: process.env.BW_BROWSER} : {});
const browserErrors = [];
try {
    await mkdir(out, {recursive: true});
    const newSession = async () => {
        const context = await browser.newContext({viewport: {width: 1600, height: 1000}, acceptDownloads: true});
        const page = await context.newPage();
        page.on('dialog', d => d.accept());
        page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
        page.on('pageerror', error => browserErrors.push(String(error)));
        await page.addInitScript(() => {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
            sessionStorage.clear();
        });
        await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});
        await page.waitForSelector('[role="tab"]', {timeout: 60000});
        return page;
    };
    let page = await newSession();
    report.fixtureSha256 = createHash('sha256').update(await readFile(fixture)).digest('hex');
    report.probeSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
    report.testedSource = process.env.GITHUB_SHA || null;
    report.bundle = await page.evaluate(() => [...document.scripts].map(s => s.src).filter(Boolean));
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await openCodeActions(page);
    await page.locator('input[type="file"][accept*=".hex"]').setInputFiles(fixture);
    const text = await waitFor(() => page.evaluate(() => document.body.innerText || ''), t => /sprite\(s\)/i.test(t), 60000);
    check('the platformer imports', /sprite\(s\)/i.test(text));
    await page.getByRole('button', {name: /To blocks|Zu Blöcken/i}).first().click({force: true});

    // Blocks built: the levels are `set Arcade tilemap` blocks.
    const readLevels = () => page.evaluate(() => {
        const vm = window.__brickwrightStore?.getState().scratchGui.vm;
        const levels = [];
        for (const target of vm?.runtime.targets || []) {
            if (!target.isOriginal) continue;
            const blocks = target.blocks._blocks;
            for (const block of Object.values(blocks)) {
                if (block.opcode !== 'arcade_setTilemap') continue;
                const shadow = blocks[block.inputs.DATA?.shadow];
                levels.push({target: target.getName(), blockId: block.id, text: shadow?.fields?.TEXT?.value || ''});
            }
        }
        return levels;
    });
    const levels = await waitFor(readLevels, l => l.length > 0, 60000);
    check('blocks hold the game\'s tile maps', levels.length > 0, `${levels.length} level block(s)`);
    const firstData = JSON.parse(levels[0].text);
    // A cell on the first row that is empty and not a wall, and its right neighbour.
    let cell = 0;
    while (cell < firstData.columns - 1 && (firstData.indices[cell] || firstData.walls[cell] || firstData.walls[cell + 1])) cell++;
    report.level = {columns: firstData.columns, rows: firstData.rows, tileSize: firstData.tileSize, tiles: firstData.images.length, cell};

    await page.locator('[role="tab"]', {hasText: /Costumes|Kostüme/}).first().click();
    const toggle = page.locator('[data-testid="bw-tilemap-toggle"]');
    await toggle.waitFor({state: 'visible', timeout: 30000});
    check('the costume tab offers the tile map painter', await toggle.isVisible());
    await toggle.click();
    const editor = page.locator('[data-testid="bw-tilemap-editor"]');
    await editor.waitFor({state: 'visible', timeout: 30000});
    const options = await page.locator('[data-testid="bw-tilemap-select"] option').count();
    check('the painter lists every level', options === levels.length, `${options} listed, ${levels.length} blocks`);

    const canvas = page.locator('[data-testid="bw-tilemap-canvas"]');
    const cellPoint = async (column, row, columns = firstData.columns) => {
        const box = await canvas.boundingBox();
        const size = await canvas.evaluate((c, cols) => c.width / cols, columns);
        const scale = box.width / (await canvas.evaluate(c => c.width));
        return {x: box.x + (column + 0.5) * size * scale, y: box.y + (row + 0.5) * size * scale};
    };
    const column = cell % firstData.columns, row = Math.floor(cell / firstData.columns);

    // Paint the cell with tile 1.
    await page.locator('[data-testid="bw-tilemap-tile-1"]').click();
    await page.locator('[data-testid="bw-tilemap-tool-paint"]').click();
    let p = await cellPoint(column, row);
    await page.mouse.click(p.x, p.y);
    // Add a wall on its right neighbour.
    await page.locator('[data-testid="bw-tilemap-tool-wall"]').click();
    p = await cellPoint(column + 1, row);
    await page.mouse.click(p.x, p.y);
    // Undo the wall, check, redo it.
    const undoButton = page.locator('[data-testid="bw-tilemap-undo"]');
    const redoButton = page.locator('[data-testid="bw-tilemap-redo"]');
    await undoButton.click();
    check('undo is available after an edit, redo after undo', await redoButton.isEnabled());
    await redoButton.click();
    // Draw colour 2 into the tile's top-left pixel.
    await page.locator('[data-testid="bw-tilemap-tile-1"]').click();
    await page.locator('[data-testid="bw-tilemap-colour-2"]').click();
    const tileBox = await page.locator('[data-testid="bw-tilemap-tile-canvas"]').boundingBox();
    await page.mouse.click(tileBox.x + 2, tileBox.y + 2);
    await page.screenshot({path: join(out, 'painter.png')});
    await page.locator('[data-testid="bw-tilemap-save"]').click();
    const status = await page.locator('[data-testid="bw-tilemap-status"]').innerText();
    check('save reports where the level went', /Saved|gespeichert/.test(status), status);

    const after = (await readLevels()).find(level => level.blockId === levels[0].blockId);
    const saved = JSON.parse(after.text);
    check('the block holds the painted cell', saved.indices[cell] === 1, `cell ${cell} = ${saved.indices[cell]}`);
    check('the block holds the new wall', saved.walls[cell + 1] === 1);
    check('the block holds the edited tile pixel', saved.images[1].pixels[0] === 2, `pixel ${saved.images[1].pixels[0]}`);
    check('nothing else changed in the map', saved.indices.every((v, i) => i === cell || v === firstData.indices[i]) &&
        saved.walls.every((v, i) => i === cell + 1 || v === firstData.walls[i]));

    // The running game uses the painted level.
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.greenFlag());
    const running = await waitFor(() => page.evaluate(([w, h]) => {
        const map = window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState?.tilemap;
        return map && map.columns === w && map.rows === h ? {
            indices: Array.from(map.indices), walls: Array.from(map.walls), pixel: map.images[1]?.pixels?.[0]
        } : null;
    }, [saved.columns, saved.rows]), value => value && value.indices[cell] === 1, 30000);
    check('the running game draws the painted cell', running?.indices[cell] === 1);
    check('and collides with the new wall', running?.walls[cell + 1] === 1);
    check('and draws the edited tile', running?.pixel === 2, `pixel ${running?.pixel}`);

    // Stop the game and answer any dialog it opened (the platformer greets the
    // player), so the tab bar is reachable again.
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.stopAll());
    const dialog = page.locator('[role="dialog"][aria-label^="Arcade"]');
    for (let i = 0; i < 10 && await dialog.count(); i++) {
        const before = await dialog.innerText().catch(() => '');
        await dialog.locator('button').first().click({timeout: 5000}).catch(() => {});
        // Answered when it closes or the next message replaces it.
        await waitFor(async () => (await dialog.count()) ? await dialog.innerText().catch(() => '') : null,
            text => text !== before, 5000);
    }
    check('the game\'s dialogs can be dismissed', await dialog.count() === 0);
    // A new level from scratch: a real green-flag script, painted and saved.
    await page.locator('[role="tab"]', {hasText: /Costumes|Kostüme/}).first().click();
    await page.locator('[data-testid="bw-tilemap-new"]').click();
    const created = await page.locator('[data-testid="bw-tilemap-status"]').innerText();
    check('a new tile map can be started', /New tile map added|Neue Kachelkarte/.test(created), created);
    const listed = await page.locator('[data-testid="bw-tilemap-select"] option').count();
    check('it is listed with the game\'s levels', listed === levels.length + 1, `${listed} listed`);
    p = await cellPoint(0, 0, 10);
    await page.mouse.click(p.x, p.y);
    await page.locator('[data-testid="bw-tilemap-tool-wall"]').click();
    p = await cellPoint(1, 0, 10);
    await page.mouse.click(p.x, p.y);
    await page.locator('[data-testid="bw-tilemap-tile-1"]').click();
    await page.locator('[data-testid="bw-tilemap-colour-3"]').click();
    const newTileBox = await page.locator('[data-testid="bw-tilemap-tile-canvas"]').boundingBox();
    await page.mouse.click(newTileBox.x + 2, newTileBox.y + 2);
    await page.locator('[data-testid="bw-tilemap-save"]').click();
    const fresh = await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        for (const target of vm.runtime.targets) {
            if (!target.isOriginal) continue;
            const blocks = target.blocks._blocks;
            for (const block of Object.values(blocks)) {
                if (block.opcode !== 'arcade_setTilemap') continue;
                const data = JSON.parse(blocks[block.inputs.DATA.shadow].fields.TEXT.value);
                if (data.columns === 10 && data.rows === 8) return {hat: blocks[block.parent]?.opcode, cell: data.indices[0], wall: data.walls[1], pixel: data.images[1].pixels[0], blockId: block.id};
            }
        }
        return null;
    });
    check('the new level is set when the green flag is clicked', fresh?.hat === 'event_whenflagclicked', JSON.stringify(fresh));
    check('and holds what was painted', fresh?.cell === 1 && fresh.wall === 1 && fresh.pixel === 3);
    // Persist the entire project through the user's File controls. A fresh
    // browser context prevents the old VM, resource caches or local draft from
    // supplying data which the actual SB3 failed to preserve.
    const beforeReload = await readLevels();
    const canonical = data => JSON.stringify({
        columns: data.columns, rows: data.rows, tileSize: data.tileSize,
        indices: Array.from(data.indices), walls: Array.from(data.walls),
        images: data.images.map(image => ({width: image.width, height: image.height, pixels: Array.from(image.pixels)}))
    });
    const mapSet = refs => refs.map(ref => canonical(JSON.parse(ref.text))).sort();
    const expectedMaps = mapSet(beforeReload);
    const expectedNewLevel = canonical(JSON.parse(beforeReload.find(ref => ref.blockId === fresh.blockId).text));
    const expectedIds = beforeReload.map(ref => `${ref.target}:${ref.blockId}`).sort();
    await page.getByText('File', {exact: true}).click();
    const sb3Event = page.waitForEvent('download', {timeout: 60000});
    await page.getByText('Save to your computer', {exact: true}).click();
    const sb3 = await sb3Event;
    const sb3Path = join(out, 'painted-levels.sb3');
    await sb3.saveAs(sb3Path);
    const sb3Bytes = await readFile(sb3Path);
    check('File Save downloads an actual SB3 archive', /\.sb3$/i.test(sb3.suggestedFilename()) &&
        sb3Bytes[0] === 0x50 && sb3Bytes[1] === 0x4b, `${sb3Bytes.length} bytes`);
    report.sb3 = {bytes: sb3Bytes.length, sha256: createHash('sha256').update(sb3Bytes).digest('hex')};
    const {default: JSZip} = await import('jszip');
    const zip = await JSZip.loadAsync(sb3Bytes);
    const project = JSON.parse(await zip.file('project.json').async('text'));
    const archivedLevels = project.targets.flatMap(target => Object.values(target.blocks || {})
        .filter(block => block.opcode === 'arcade_setTilemap')
        .map(block => {
            // SB3 uses compact [shadow-kind, [primitive-kind, value]] inputs;
            // the live VM expands these into actual shadow block objects.
            const input = block.inputs.DATA[1];
            const text = Array.isArray(input) ? input[1] : target.blocks[input]?.fields?.TEXT?.[0];
            if (typeof text !== 'string') throw new Error('saved tilemap input is not literal text');
            return {text};
        }));
    check('the downloaded SB3 contains every exact painted map',
        JSON.stringify(mapSet(archivedLevels)) === JSON.stringify(expectedMaps));
    await page.context().close();
    page = await newSession();
    check('reopen starts with a fresh VM without the saved levels', (await readLevels()).length === 0);
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(sb3Path);
    const reopened = await waitFor(readLevels, refs => refs.length === beforeReload.length, 60000);
    check('GUI reopen preserves all level dimensions, tiles, pixels and walls',
        JSON.stringify(mapSet(reopened)) === JSON.stringify(expectedMaps));
    check('GUI reopen preserves level targets and block identities',
        JSON.stringify(reopened.map(ref => `${ref.target}:${ref.blockId}`).sort()) === JSON.stringify(expectedIds));
    await page.locator('[role="tab"]', {hasText: /Costumes|Kostüme/}).first().click();
    await page.locator('[data-testid="bw-tilemap-toggle"]').click();
    await page.locator('[data-testid="bw-tilemap-editor"]').waitFor({state: 'visible'});
    check('every reopened level remains selectable in the painter',
        await page.locator('[data-testid="bw-tilemap-select"] option').count() === beforeReload.length);
    check('reopened level still has enabled editing controls',
        await page.locator('[data-testid="bw-tilemap-tool-paint"]').isEnabled() &&
        await page.locator('[data-testid="bw-tilemap-tool-wall"]').isEnabled());
    // Make another real pointer edit after reopening, then undo it. This
    // proves the restored painter operates on the loaded project, while the
    // exported data remains precisely the saved data.
    const reopenedTile = page.getByTestId('bw-tilemap-tile-canvas');
    await page.getByTestId('bw-tilemap-tile-1').click();
    const tileBefore = await reopenedTile.evaluate(canvas => canvas.toDataURL());
    await page.getByTestId('bw-tilemap-colour-5').click();
    const reopenedBox = await reopenedTile.boundingBox();
    await page.mouse.click(reopenedBox.x + 2, reopenedBox.y + 2);
    const tileEdited = await waitFor(() => reopenedTile.evaluate(canvas => canvas.toDataURL()),
        value => value !== tileBefore, 5000);
    check('the reopened painter responds to a real tile-pixel edit', tileEdited !== tileBefore);
    await page.getByTestId('bw-tilemap-undo').click();
    const tileUndone = await waitFor(() => reopenedTile.evaluate(canvas => canvas.toDataURL()),
        value => value === tileBefore, 5000);
    check('undo restores the exact reopened tile preview', tileUndone === tileBefore);
    await page.getByTestId('bw-tilemap-save').click();
    check('saving the undone edit preserves all saved levels',
        JSON.stringify(mapSet(await readLevels())) === JSON.stringify(expectedMaps));
    await page.screenshot({path: join(out, 'reopened-painter.png')});
    // Observe the actual reopened VM, not the old instance or only project JSON.
    // The green flag starts TWO scripts that set a tile map: the painter's new
    // level script installs the 10x8 level at once, and the platformer's own
    // start script installs its first level a few frames later (after it has
    // initialised animations and the player). The new level is therefore the
    // running map only for that window, and reading "the current map" raced
    // the platformer (red on main 8f2cdf8a8, run 38197900088: the poll missed
    // the window and saw only the 32x8 level). Record what each tile-map block
    // installs in the reopened runtime, and check each script's own result.
    const newLevelHat = await page.evaluate(blockId => {
        for (const target of window.__brickwrightStore.getState().scratchGui.vm.runtime.targets) {
            const block = target.isOriginal && target.blocks.getBlock(blockId);
            if (block) return target.blocks.getTopLevelScript(blockId);
        }
        return null;
    }, fresh.blockId);
    const expectedFirstLevel = canonical(JSON.parse(beforeReload.find(ref => ref.blockId === levels[0].blockId).text));
    await page.evaluate(() => {
        const runtime = window.__brickwrightStore.getState().scratchGui.vm.runtime;
        const install = runtime._primitives.arcade_setTilemap;
        window.__bwTilemapInstalls = [];
        if (typeof install !== 'function') return;
        runtime._primitives.arcade_setTilemap = function (args, util) {
            const result = install.call(this, args, util);
            const map = runtime.bwArcadeDeviceState?.tilemap;
            window.__bwTilemapInstalls.push({script: util?.thread?.topBlock || null, map: map ? {
                columns: map.columns, rows: map.rows, tileSize: map.tileSize,
                indices: Array.from(map.indices), walls: Array.from(map.walls),
                images: map.images.map(image => ({width: image.width, height: image.height, pixels: Array.from(image.pixels)}))
            } : null});
            return result;
        };
    });
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.greenFlag());
    const readRun = () => page.evaluate(() => ({installs: window.__bwTilemapInstalls}));
    const reopenedRun = await waitFor(readRun, run => run.installs.some(entry => entry.script === newLevelHat) &&
        run.installs.some(entry => entry.script !== newLevelHat), 30000);
    const reopenedRuntime = reopenedRun.installs.find(entry => entry.script === newLevelHat)?.map || null;
    check('a saved painted level runs with exact pixels and collision walls after reopen',
        Boolean(newLevelHat && reopenedRuntime && canonical(reopenedRuntime) === expectedNewLevel &&
            reopenedRuntime.indices[0] === 1 && reopenedRuntime.walls[1] === 1 && reopenedRuntime.images[1].pixels[0] === 3),
        `${reopenedRun.installs.length} tile map install(s) by ${new Set(reopenedRun.installs.map(entry => entry.script)).size} script(s)`);
    const platformerInstall = reopenedRun.installs.filter(entry => entry.script !== newLevelHat).pop();
    // What the platformer's script installed, not the live map: the running
    // game then clears its spawn tiles (tile indices 4-6) in place.
    const firstLevelRuntime = platformerInstall?.map || null;
    check('and the reopened platformer then runs its own painted first level',
        Boolean(firstLevelRuntime && canonical(firstLevelRuntime) === expectedFirstLevel &&
            firstLevelRuntime.indices[cell] === 1 && firstLevelRuntime.walls[cell + 1] === 1 &&
            firstLevelRuntime.images[1].pixels[0] === 2));
    report.reopenedRuntime = reopenedRuntime;
    report.reopenedInstalls = reopenedRun.installs.map(entry => ({script: entry.script,
        level: entry.map && `${entry.map.columns}x${entry.map.rows}`}));
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.stopAll());
    // Close any title/greeting opened by the original platformer before export.
    const reopenedDialog = page.locator('[role="dialog"][aria-label^="Arcade"]');
    for (let i = 0; i < 10 && await reopenedDialog.count(); i++) {
        const before = await reopenedDialog.innerText();
        await reopenedDialog.locator('button').first().click();
        await waitFor(async () => await reopenedDialog.count() ? reopenedDialog.innerText() : null,
            text => text !== before, 5000);
    }
    check('reopened game dialogs can be dismissed', await reopenedDialog.count() === 0);
    await page.locator('[role="tab"]', {hasText: 'Code'}).first().click();
    await page.getByRole('button', {name: /From blocks|Von Blöcken/i}).first().click();
    await page.waitForFunction(() => {
        const editor = document.querySelector('[data-testid="bw-code-editor"] .cm-content');
        return editor?.cmTile?.root?.view?.state?.doc?.toString()?.includes('arcade set tilemap');
    }, null, {timeout: 30000});
    await openCodeActions(page);
    const mkcdEvent = page.waitForEvent('download', {timeout: 60000});
    await page.getByTestId('bw-makecode-arcade-export').click();
    const mkcd = await mkcdEvent;
    const mkcdPath = join(out, 'painted-levels.mkcd');
    await mkcd.saveAs(mkcdPath);
    const exported = await readFile(mkcdPath);
    check('the reopened project exports a real MakeCode project',
        /\.mkcd$/i.test(mkcd.suggestedFilename()) && exported.length > 100, `${exported.length} bytes`);
    report.export = {bytes: exported.length, sha256: createHash('sha256').update(exported).digest('hex')};
    // Original compiler and simulator exercise the reopened blocks export.
    await openCodeActions(page);
    await page.getByTestId('bw-makecode-arcade-run').click();
    const simulator = await waitFor(async () => page.frames().find(frame =>
        frame.url().includes('makecode/arcade/sim/simulator.html')) || null, frame => Boolean(frame), 60000);
    const lit = simulator && await waitFor(() => simulator.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas?.width) return 0;
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let pixels = 0;
        for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 30) pixels++;
        return pixels;
    }), pixels => pixels > 20, 60000);
    check('original MakeCode compiles and renders the reopened export', lit > 20, `${lit || 0} lit pixels`);
    // Reimport the actual downloaded file into native editable blocks. Compare
    // maps as a multiset because export/import intentionally regenerates IDs.
    await openCodeActions(page);
    await page.getByTestId('bw-open-file').locator('input[type=file]').setInputFiles(mkcdPath);
    await page.getByText(/Imported the Arcade game.*painted-levels\.mkcd/).first()
        .waitFor({state: 'visible', timeout: 60000});
    await page.getByRole('button', {name: /To blocks|Zu Blöcken/i}).first().click();
    const reimported = await waitFor(readLevels, refs => refs.length === beforeReload.length, 60000);
    check('MakeCode file reimport preserves every saved level including wall and art edits',
        JSON.stringify(mapSet(reimported)) === JSON.stringify(expectedMaps));
    report.levelCount = beforeReload.length;
    const crashes = browserErrors.filter(e => /Costume Tab|TypeError|ReferenceError/.test(e));
    check('no errors from the painter', crashes.length === 0, crashes[0]?.slice(0, 160) || '');
} catch (error) {
    report.fatal = String(error?.stack || error);
    throw error;
} finally {
    report.failures = failures;
    await writeFile(join(out, 'current.json'), JSON.stringify(report, null, 2)).catch(() => {});
    await browser.close();
    server?.close();
}
if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exitCode = 1;
}
