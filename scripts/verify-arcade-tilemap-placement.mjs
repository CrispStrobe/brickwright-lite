#!/usr/bin/env node
/**
 * Browser check of sprite placement in the Arcade tile map painter.
 *
 * Imports the real MakeCode Arcade platformer (test/fixtures/makecode/
 * arcade-tilemap.hex), builds blocks, opens Costumes → Tile maps and, with
 * real pointer input: chooses the Place sprite tool and a sprite, clicks a
 * free cell, and checks the marker and the listed placement. Save must write
 * an ordinary `place Arcade sprite on tile` block after the level's
 * `set Arcade tilemap`, and the running game must start the sprite on that
 * tile. Then: a staged move is reverted, and a removal saved drops the block.
 *
 *   node scripts/verify-arcade-tilemap-placement.mjs            # serves packages/scratch-gui/build
 *   PROOF_URL=http://localhost:8617/ node scripts/verify-arcade-tilemap-placement.mjs
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
const out = resolve(process.env.BW_TILEMAP_PLACEMENT_REPORT_DIR || 'test-results/arcade-tilemap-placement');
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
    const first = Number(process.env.BW_PORT || 8211);
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

// The placements in the script after the first level block: [{sprite, column, row}].
const readPlacements = (page, mapBlockId) => page.evaluate(id => {
    const vm = window.__brickwrightStore.getState().scratchGui.vm;
    for (const target of vm.runtime.targets) {
        const blocks = target.blocks._blocks;
        if (!blocks[id]) continue;
        const found = [];
        for (let current = blocks[id].next; current; current = blocks[current]?.next) {
            const block = blocks[current];
            if (block.opcode === 'arcade_setTilemap') break;
            if (block.opcode !== 'arcade_placeOnTile') continue;
            const sprite = blocks[block.inputs.ID?.block];
            const location = blocks[block.inputs.LOCATION?.block];
            const number = name => location?.inputs?.[name] ? Number(blocks[location.inputs[name].shadow]?.fields?.NUM?.value) : null;
            found.push({sprite: sprite?.fields?.VARIABLE?.value || null, location: location?.opcode,
                column: number('COLUMN'), row: number('ROW')});
        }
        return found;
    }
    return null;
}, mapBlockId);

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

    const readLevel = () => page.evaluate(() => {
        const vm = window.__brickwrightStore?.getState().scratchGui.vm;
        for (const target of vm?.runtime.targets || []) {
            if (!target.isOriginal) continue;
            const blocks = target.blocks._blocks;
            for (const block of Object.values(blocks)) {
                if (block.opcode !== 'arcade_setTilemap') continue;
                const text = blocks[block.inputs.DATA?.shadow]?.fields?.TEXT?.value;
                if (text) return {blockId: block.id, data: JSON.parse(text)};
            }
        }
        return null;
    });
    const level = await waitFor(readLevel, value => Boolean(value), 60000);
    check('blocks hold the game\'s first level', Boolean(level));
    const data = level.data;
    // A free cell (no tile, no wall) away from the top-left corner.
    let cell = data.columns + 1;
    while (cell < data.indices.length - 1 && (data.indices[cell] || data.walls[cell])) cell++;
    const column = cell % data.columns, row = Math.floor(cell / data.columns);
    const before = await readPlacements(page, level.blockId);
    report.level = {columns: data.columns, rows: data.rows, tileSize: data.tileSize, cell: [column, row], before};

    await page.locator('[role="tab"]', {hasText: /Costumes|Kostüme/}).first().click();
    const toggle = page.locator('[data-testid="bw-tilemap-toggle"]');
    await toggle.waitFor({state: 'visible', timeout: 30000});
    await toggle.click();
    await page.locator('[data-testid="bw-tilemap-editor"]').waitFor({state: 'visible', timeout: 30000});
    const canvas = page.locator('[data-testid="bw-tilemap-canvas"]');
    const cellPoint = async (c, r) => {
        const box = await canvas.boundingBox();
        const size = await canvas.evaluate((element, cols) => element.width / cols, data.columns);
        const scale = box.width / (await canvas.evaluate(element => element.width));
        return {x: box.x + (c + 0.5) * size * scale, y: box.y + (r + 0.5) * size * scale};
    };
    const centrePixel = (c, r) => canvas.evaluate((element, [cc, rr, cols]) => {
        const size = element.width / cols;
        return Array.from(element.getContext('2d').getImageData(Math.floor((cc + 0.5) * size), Math.floor((rr + 0.5) * size), 1, 1).data);
    }, [c, r, data.columns]);
    const isMarker = rgba => rgba[2] > 180 && rgba[0] < 90;

    // Place a sprite with the Place sprite tool.
    await page.locator('[data-testid="bw-tilemap-tool-place"]').click();
    const spriteSelect = page.locator('[data-testid="bw-tilemap-place-sprite"]');
    const spriteNames = await spriteSelect.locator('option').allTextContents();
    check('the painter offers the game\'s sprite variables', spriteNames.length > 0, spriteNames.join(', '));
    const chosen = spriteNames[0];
    await spriteSelect.selectOption({label: chosen});
    check('the free cell shows no marker before placing', !isMarker(await centrePixel(column, row)));
    let p = await cellPoint(column, row);
    await page.mouse.click(p.x, p.y);
    check('a marker appears on the clicked cell', isMarker(await centrePixel(column, row)), String(await centrePixel(column, row)));
    const listed = await page.locator('[data-testid="bw-tilemap-placements"]').innerText();
    check('the placement is listed with its tile', listed.includes(`${chosen} on tile (${column}, ${row})`), listed.replace(/\n/g, ' | '));
    check('nothing is written before Save', JSON.stringify(await readPlacements(page, level.blockId)) === JSON.stringify(before));
    await page.screenshot({path: join(out, 'placement.png')});

    await page.locator('[data-testid="bw-tilemap-save"]').click();
    const status = await page.locator('[data-testid="bw-tilemap-status"]').innerText();
    check('save reports success', /Saved|gespeichert/.test(status), status);
    const saved = await readPlacements(page, level.blockId);
    const mine = saved.find(entry => entry.sprite === chosen && entry.column === column && entry.row === row);
    check('the level\'s script now places the sprite on that tile', Boolean(mine) && mine.location === 'arcade_tileLocation',
        JSON.stringify(saved));
    check('placements already in the script are kept', before.every(old => saved.some(entry =>
        entry.sprite === old.sprite && entry.column === old.column && entry.row === old.row)));

    // The running game starts the sprite on the tile: its x is the tile centre
    // (gravity may move it down at once, so only the column is fixed).
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.greenFlag());
    const centreX = (column + 0.5) * data.tileSize;
    const xs = await waitFor(() => page.evaluate(() => {
        const state = window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState;
        return Object.values(state?.sprites || {}).filter(sprite => sprite.id).map(sprite => sprite.x);
    }), values => values.some(x => Math.abs(x - centreX) <= 0.5), 30000, 100);
    check('the running game starts a sprite on the placed tile', xs.some(x => Math.abs(x - centreX) <= 0.5),
        `centre x ${centreX}; sprite x ${xs.slice(0, 8).join(', ')}`);
    await page.evaluate(() => window.__brickwrightStore.getState().scratchGui.vm.stopAll());
    const dialog = page.locator('[role="dialog"][aria-label^="Arcade"]');
    for (let i = 0; i < 10 && await dialog.count(); i++) {
        const text = await dialog.innerText().catch(() => '');
        await dialog.locator('button').first().click({timeout: 5000}).catch(() => {});
        await waitFor(async () => (await dialog.count()) ? await dialog.innerText().catch(() => '') : null, t => t !== text, 5000);
    }
    await page.locator('[role="tab"]', {hasText: /Costumes|Kostüme/}).first().click();
    await page.locator('[data-testid="bw-tilemap-editor"]').waitFor({state: 'visible', timeout: 30000});

    // A staged move, then Revert: the block keeps the saved tile.
    await page.locator('[data-testid="bw-tilemap-tool-place"]').click();
    await page.locator('[data-testid="bw-tilemap-place-sprite"]').selectOption({label: chosen});
    const other = column > 0 ? column - 1 : column + 1;
    p = await cellPoint(other, row);
    await page.mouse.click(p.x, p.y);
    check('placing the sprite again moves its marker', isMarker(await centrePixel(other, row)) && !isMarker(await centrePixel(column, row)));
    await page.locator('[data-testid="bw-tilemap-revert"]').click();
    check('revert puts the marker back', isMarker(await centrePixel(column, row)));
    check('a reverted move writes nothing', JSON.stringify(await readPlacements(page, level.blockId)) === JSON.stringify(saved));

    // Remove the placement and save: the block is gone, the rest kept.
    const rows = page.locator('[data-testid^="bw-tilemap-placement-remove-"]');
    const count = await rows.count();
    let removed = false;
    for (let i = 0; i < count && !removed; i++) {
        const row_ = rows.nth(i);
        const label = await row_.locator('xpath=..').innerText();
        if (label.includes(`${chosen} on tile (${column}, ${row})`)) { await row_.click(); removed = true; }
    }
    check('the placement can be removed', removed);
    await page.locator('[data-testid="bw-tilemap-save"]').click();
    const last = await readPlacements(page, level.blockId);
    check('saved, the removal drops only that block', JSON.stringify(last) === JSON.stringify(before), JSON.stringify(last));
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
