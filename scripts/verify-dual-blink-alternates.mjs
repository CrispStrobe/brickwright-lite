#!/usr/bin/env node
/**
 * "Two LEDs alternating" must show BOTH LEDs, in their own phases.
 *
 * The owner reported 12-dual-blink showing only one LED ever on. Five layers
 * were eliminated by running them headlessly before this gate was written, and
 * that is why it is aimed where it is rather than being a fishing trip:
 *
 *   - the example data: program.bw alternates P1.0 and P1.1, both ACTIVE LOW,
 *     and the circuit wires both symmetrically;
 *   - the board: driven directly, LED_led1 and LED_led2 read 0.145 / 0.000 and
 *     0.000 / 0.145 in their phases, and 0.145 / 0.145 when both are on;
 *   - the emitted program: 21 pin events, led1 11 and led2 10, alternating;
 *   - the driver's pin table: both pins, both ACTIVE LOW;
 *   - the renderer's lookup: `ledBrightness?.(id)` per part.
 *
 * What is left is the LIVE path, and there is a previous instance of this exact
 * symptom recorded in CircuitDesigner.jsx: "the rendered LED still asked the
 * idle internal board and read 0. One board, one truth applies to READS as much
 * as writes."
 *
 * SO THIS GATE SEPARATES TWO CAUSES THAT LOOK IDENTICAL ON SCREEN:
 *   (a) led2 is never DRIVEN — the program or driver only writes one pin; or
 *   (b) led2 is driven, but on a board the renderer is not READING.
 * It samples both the pin writes and the rendered brightness, so a failure says
 * which. A gate that only asserted "one LED changes" would pass on both.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const port = Number(process.env.BW_PORT || 8121);
const budgetMs = Number(process.env.BW_STEP_BUDGET_MIN || 4) * 60_000;
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.json': 'application/json', '.ttf': 'font/ttf', '.wasm': 'application/wasm'};
if (!existsSync(join(build, 'index.html'))) throw new Error('Build first: packages/scratch-gui/build/index.html is missing');

const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);
        if (path.endsWith('/')) path += 'index.html';
        const file = join(build, normalize(path));
        if (!file.startsWith(build)) throw new Error('escape');
        const body = await readFile(file);
        res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream'});
        res.end(body);
    } catch {
        if (!res.headersSent) res.writeHead(404);
        res.end('not found');
    }
});
await new Promise(done => server.listen(port, done));

const url = process.env.PROOF_URL || `http://localhost:${port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1400, height: 900}});
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};

try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: Math.min(90_000, budgetMs / 3)});
    await page.waitForSelector('[role="tab"]', {timeout: 60_000});
    await page.getByRole('tab', {name: /circuit/i}).click();

    // The Circuit tab, found the way the green example-journey gate finds it.
    await page.waitForFunction(() => {
        const gui = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
        const key = gui && Object.keys(gui).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        if (!key) return false;
        const queue = [gui[key]];
        for (let i = 0; i < 8000 && queue.length; i++) {
            const fiber = queue.shift();
            const node = fiber && fiber.stateNode;
            if (node && typeof node.loadExample === 'function' && Array.isArray(node.state && node.state.examples)) {
                window.__bwTab = node;
                return node.state.examples.some(e => e.id === '12-dual-blink');
            }
            if (fiber && fiber.child) queue.push(fiber.child);
            if (fiber && fiber.sibling) queue.push(fiber.sibling);
        }
        return false;
    }, null, {timeout: 40_000});
    check('the dual-blink example is published in the gallery', true);

    const loaded = await page.evaluate(async () => {
        const tab = window.__bwTab;
        return tab.loadExample(tab.state.examples.find(e => e.id === '12-dual-blink'));
    });
    check('the gallery loads it', loaded && loaded.ok !== false, (loaded && loaded.error) || '');

    // WHICH BOARD IS BEING WRITTEN, AND WHICH IS BEING READ. Recorded separately
    // on purpose: the two causes this gate exists to tell apart differ precisely
    // here. Every setPin is logged with the board object it landed on, so a pin
    // driven onto a board the renderer never reads is visible as itself.
    await page.evaluate(() => {
        window.__bwPinWrites = [];
        const seen = new Set();
        const arm = board => {
            if (!board || seen.has(board) || typeof board.setPin !== 'function') return;
            seen.add(board);
            const original = board.setPin.bind(board);
            board.setPin = (pin, mode, drive) => {
                window.__bwPinWrites.push({pin, drive, at: Date.now(), board: board.__bwId});
                return original(pin, mode, drive);
            };
        };
        window.__bwArmBoards = arm;
        // Tag and wrap every board reachable from the tab, and keep tagging: the
        // running program attaches its own.
        let n = 0;
        const walk = () => {
            for (const candidate of [window.bwBoard, window.__bwTab && window.__bwTab.board,
                window.__bwTab && window.__bwTab.state && window.__bwTab.state.board]) {
                if (candidate && !candidate.__bwId) candidate.__bwId = `board${++n}`;
                arm(candidate);
            }
        };
        walk();
        window.__bwWalk = setInterval(walk, 100);
    });

    await page.getByRole('button', {name: /simulate|run|▶/i}).first().click().catch(() => {});
    await page.waitForTimeout(2500);   // two 500 ms phases plus slack

    const sample = await page.evaluate(() => {
        const tab = window.__bwTab;
        const board = window.bwBoard || (tab && tab.board);
        const read = id => {
            try { return board && board.ledBrightness ? board.ledBrightness(id) : null; } catch { return null; }
        };
        return {
            writes: window.__bwPinWrites || [],
            led1: read('LED_led1'),
            led2: read('LED_led2'),
            boards: [...new Set((window.__bwPinWrites || []).map(w => w.board))]
        };
    });

    const p10 = sample.writes.filter(w => w.pin === 'P1.0');
    const p11 = sample.writes.filter(w => w.pin === 'P1.1');
    // (a) Is led2 driven at all?
    check('both pins are written by the running program', p10.length > 0 && p11.length > 0,
        `P1.0 ${p10.length} write(s), P1.1 ${p11.length} write(s)` +
        (p11.length === 0 ? ' — led2 is NEVER DRIVEN: the defect is above the board, in the program or the driver' : ''));
    // (b) Are the writes landing on the board the renderer reads?
    check('every pin write lands on one board', sample.boards.length <= 1,
        sample.boards.length > 1
            ? `writes split across ${sample.boards.length} boards (${sample.boards.join(', ')}) — ` +
              'led2 may be driven on a board nobody is reading'
            : `one board (${sample.boards[0] || 'none tagged'})`);

    // The complementary assertion the owner's symptom needs: one on, one off, and
    // then the reverse. Sampling twice, half a phase apart.
    const phase = async () => await page.evaluate(() => {
        const board = window.bwBoard || (window.__bwTab && window.__bwTab.board);
        const read = id => { try { return board.ledBrightness(id); } catch { return null; } };
        return {a: read('LED_led1'), b: read('LED_led2')};
    });
    const first = await phase();
    await page.waitForTimeout(520);
    const second = await phase();
    const lit = v => typeof v === 'number' && v > 0.01;
    check('the two LEDs are complementary in one phase', lit(first.a) !== lit(first.b),
        `led1 ${first.a}, led2 ${first.b}`);
    check('and they swap in the next phase', lit(second.a) !== lit(second.b) && lit(first.a) !== lit(second.a),
        `led1 ${first.a}→${second.a}, led2 ${first.b}→${second.b}` +
        (lit(first.a) === lit(second.a) ? ' — the pair never swapped' : ''));
    check('led2 is lit in at least one sampled phase', lit(first.b) || lit(second.b),
        `led2 ${first.b} then ${second.b}` +
        (p11.length > 0 ? ' — but P1.1 WAS written, so the write is not reaching the read' : ''));

    console.log(`\nDual blink: ${failures.length ? `${failures.length} failure(s)` : 'both LEDs alternate'}`);
} finally {
    await browser.close().catch(() => {});
    await new Promise(done => server.close(done));
}
if (failures.length) throw new Error(failures.join(' | '));
