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
 * the wall and the edited tile pixel.
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
import {openCodeActions} from './lib-code-actions.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
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
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
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
        await dialog.locator('button').first().click({timeout: 5000}).catch(() => {});
        await page.waitForTimeout(300);
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
    await page.locator('[data-testid="bw-tilemap-save"]').click();
    const fresh = await page.evaluate(() => {
        const vm = window.__brickwrightStore.getState().scratchGui.vm;
        for (const target of vm.runtime.targets) {
            if (!target.isOriginal) continue;
            const blocks = target.blocks._blocks;
            for (const block of Object.values(blocks)) {
                if (block.opcode !== 'arcade_setTilemap') continue;
                const data = JSON.parse(blocks[block.inputs.DATA.shadow].fields.TEXT.value);
                if (data.columns === 10 && data.rows === 8) return {hat: blocks[block.parent]?.opcode, cell: data.indices[0]};
            }
        }
        return null;
    });
    check('the new level is set when the green flag is clicked', fresh?.hat === 'event_whenflagclicked', JSON.stringify(fresh));
    check('and holds what was painted', fresh?.cell === 1);
    const crashes = browserErrors.filter(e => /Costume Tab|TypeError|ReferenceError/.test(e));
    check('no errors from the painter', crashes.length === 0, crashes[0]?.slice(0, 160) || '');
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
