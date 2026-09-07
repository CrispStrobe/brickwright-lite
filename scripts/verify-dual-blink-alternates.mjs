#!/usr/bin/env node
/**
 * "Two LEDs alternating" must show BOTH LEDs, in their own phases.
 *
 * The owner reported 12-dual-blink showing one LED. Five layers were eliminated
 * by running them headlessly before this gate was written, and that is why it is
 * aimed where it is rather than being a fishing trip:
 *
 *   - the example data: program.bw alternates P1.0 and P1.1, both ACTIVE LOW,
 *     and the circuit wires both symmetrically;
 *   - the board: driven directly, LED_led1 and LED_led2 read 0.145 / 0.000 and
 *     0.000 / 0.145 in their phases, and 0.145 / 0.145 when both are on;
 *   - the emitted program: 21 pin events, led1 11 and led2 10, alternating;
 *   - the driver's pin table: both pins, both ACTIVE LOW;
 *   - the renderer's lookup: `ledBrightness?.(id)` per part.
 *
 * WHAT THE LIVE PAGE THEN SHOWED, MEASURED. Both pins ARE written and both LEDs
 * DO light — in unison. Over an 8.5 s window P1.0 and P1.1 received the identical
 * level at the identical moment, every time, and both LEDs read 0.1449 together.
 * The stack behind those writes is CircuitDesigner's own loop, which drives every
 * pin it classified as an output with one shared on/off value. So the circuit
 * view is not running the example's program at all; it is playing a canned blink
 * that happens to look correct for any example with exactly one LED.
 *
 * THE DECISIVE ASSERTION IS THEREFORE AT THE PIN LAYER, not the pixel layer. Two
 * LEDs lighting together and two LEDs alternating are both "both LEDs work" to a
 * brightness check sampled at the wrong instant. Only "the two pins never hold
 * the same level at the same time" separates the program from the canned blink,
 * and that is what fails today.
 *
 * The rendered brightness is still sampled, because the pin layer alone cannot
 * tell a pin driven onto a board nobody reads from a pin driven correctly.
 *
 * WHAT THE FIRST RUN OF THIS GATE TAUGHT (run 34163626035, all five checks red).
 * Opening an example with a program calls confirm() — it replaces the project and
 * undo cannot recover that. Playwright DISMISSES an unhandled dialog, so
 * loadExample returned {ok: false, cancelled: true} and nothing ran. Every check
 * after it then reported on a page where the example had never loaded: "led2 is
 * NEVER DRIVEN" was a true statement about a program that was never opened, and
 * it named the wrong half of the codebase.
 *
 * Three consequences, all of them here:
 *   - the drive mirrors the green example-journey gate INCLUDING its dialog
 *     handler. That gate's own comment says mirroring means the navigation too,
 *     and this gate had copied the clever part and not the boring one;
 *   - a failed precondition ABORTS. A check cannot describe a page that never
 *     reached the state it is about, so it must not be allowed to try;
 *   - null and 0 are different findings. null is a part the renderer could not
 *     find at all; 0 is a part it found and read as unlit. The first sends you to
 *     the wiring, the second to the program. Reporting them alike costs a day.
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
const diagnostics = [];
// Opening an example asks before replacing the project. An unhandled dialog is
// DISMISSED by Playwright, which is a "no" — that is what made every check in the
// first run of this gate describe a page the example had never loaded into.
page.on('dialog', dialog => dialog.accept());
page.on('pageerror', error => diagnostics.push(`pageerror: ${error.message}`));
page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
});

const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};
// A precondition whose failure makes every later check a statement about the
// wrong page. It stops the run rather than producing more confident sentences
// about a state that was never reached.
const gate = (name, ok, detail = '') => {
    // A gate's detail explains a FAILURE, so it is not printed on a pass — a
    // green line reading "no green flag matched" is worse than no line at all.
    check(name, ok, ok ? '' : detail);
    if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ''}` +
        (diagnostics.length ? ` | page said: ${diagnostics.slice(0, 3).join(' ; ')}` : ''));
};

try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-right-pane-hidden', '0');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: Math.min(90_000, budgetMs / 3)});
    await page.waitForSelector('[role="tab"]', {timeout: 60_000});
    // The Circuit tab must be MOUNTED before the fiber walk can find it.
    await page.getByRole('tab', {name: /circuit/i}).click();

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
    gate('the dual-blink example is published in the gallery', true);

    const loaded = await page.evaluate(async () => {
        const tab = window.__bwTab;
        return tab.loadExample(tab.state.examples.find(e => e.id === '12-dual-blink'));
    });
    gate('the gallery loads it', loaded && loaded.ok !== false,
        // `cancelled` is a different finding from an error and has to say so: it
        // means the confirm was answered no, which is the harness, not the app.
        (loaded && loaded.cancelled) ? 'the open-example confirm was dismissed, so nothing loaded'
            : (loaded && loaded.error) || (loaded ? '' : 'loadExample returned nothing'));

    // WHICH BOARD IS WRITTEN AND WHICH IS READ. The tab publishes two objects:
    // __circuit is the model and __board is the solver under it, and the model
    // DELEGATES — a write appears on both. That is a chain, not a split, so the
    // gate records the innermost board (which is also the one the renderer reads)
    // and does not mistake one write travelling through two objects for two
    // boards disagreeing.
    await page.waitForFunction(() => !!(window.__board && typeof window.__board.setPin === 'function'),
        null, {timeout: 30_000}).catch(() => {});
    gate('the board the renderer reads is published', await page.evaluate(
        () => !!(window.__board && typeof window.__board.ledBrightness === 'function')),
    'window.__board is absent or has no ledBrightness, so nothing on this page can be read');

    await page.evaluate(() => {
        window.__bwPinWrites = [];
        const board = window.__board;
        const original = board.setPin.bind(board);
        board.setPin = (pin, mode, drive) => {
            window.__bwPinWrites.push({pin, drive: !!drive, mode, at: Date.now()});
            return original(pin, mode, drive);
        };
    });

    // The green flag, located the way the green verify-circuit-ux gate locates
    // it. Finding it is a PRECONDITION: the previous version swallowed a missed
    // click with .catch(() => {}) and then reported on a program never started.
    const greenFlag = page.locator(
        'img[title="Go"]:visible, [aria-label*="Green Flag" i]:visible, [title*="green flag" i]:visible');
    gate('the run control is on the page', await greenFlag.count() > 0,
        'no green flag matched, so this gate cannot start anything');
    await greenFlag.last().click({force: true});

    // Long enough to cross several 500 ms phases of the example.
    await page.waitForTimeout(3000);

    const writes = await page.evaluate(() => window.__bwPinWrites || []);
    gate('the running program writes pins at all', writes.length > 0,
        'no setPin reached the board after the run started');

    const p10 = writes.filter(w => w.pin === 'P1.0');
    const p11 = writes.filter(w => w.pin === 'P1.1');
    check('both declared pins are written', p10.length > 0 && p11.length > 0,
        `P1.0 ${p10.length} write(s), P1.1 ${p11.length} write(s)` +
        (p11.length === 0 ? ' — led2 is NEVER DRIVEN: the defect is above the board, in the program or the driver' : ''));

    // THE DECISIVE CHECK. Two LEDs lighting together and two LEDs alternating
    // both look like "both LEDs work" to a brightness sample taken at one
    // instant. The pins cannot be misread the same way: an alternating program
    // never holds both at the same level, and a blink that drives every output
    // pin from one shared value never holds them at different ones.
    const level = new Map();
    let together = 0;
    let opposed = 0;
    for (const w of writes) {
        level.set(w.pin, w.drive);
        if (level.has('P1.0') && level.has('P1.1')) {
            if (level.get('P1.0') === level.get('P1.1')) together++; else opposed++;
        }
    }
    check('the two pins are driven to OPPOSITE levels, as an alternating program does', opposed > 0,
        `${opposed} write(s) left the pair opposed, ${together} left them identical` +
        (opposed === 0
            ? ' — the pins are always at the SAME level, so this is not the example running: ' +
              'CircuitDesigner drives every pin it classified as an output from one shared on/off value'
            : ''));

    // NULL IS NOT ZERO. null means ledBrightness could not answer for that id at
    // all — no such part, or no board to ask; 0 means it found the part and read
    // it as unlit. The first is a naming or wiring fault, the second is the
    // reported defect. Folding them into one word sends the reader to the wrong
    // layer, which is what happened here.
    // SAMPLED ACROSS A WHOLE PERIOD, NOT AT TWO INSTANTS. Two snapshots half a
    // second apart can both land in the same phase and then say "never lit",
    // which invites the conclusion that a write is not reaching the read when in
    // truth the sampler blinked at the wrong moment. Sampling a span and
    // reporting what was SEEN in it cannot make that mistake.
    const frames = [];
    for (let i = 0; i < 20; i++) {
        frames.push(await page.evaluate(() => {
            const board = window.__board;
            const read = id => { try { return board.ledBrightness(id); } catch { return null; } };
            return {a: read('LED_led1'), b: read('LED_led2')};
        }));
        await page.waitForTimeout(120);
    }
    const known = v => typeof v === 'number';
    const lit = v => known(v) && v > 0.01;
    const say = v => (v === null || v === undefined ? 'NOT FOUND' : String(v));
    const unreadable = [...new Set(frames.flatMap(f =>
        [...(known(f.a) ? [] : ['led1']), ...(known(f.b) ? [] : ['led2'])]))];
    gate('the renderer can read both LEDs', unreadable.length === 0,
        `no brightness for ${unreadable.join(' and ')} — the part id is wrong or there is no ` +
        'board to ask, which is not the same as the LED being dark');

    const litA = frames.filter(f => lit(f.a)).length;
    const litB = frames.filter(f => lit(f.b)).length;
    const alone = frames.filter(f => lit(f.a) !== lit(f.b)).length;
    const both = frames.filter(f => lit(f.a) && lit(f.b)).length;
    const trace = frames.map(f => `${lit(f.a) ? '1' : '.'}${lit(f.b) ? '2' : '.'}`).join(' ');
    check('led1 is lit somewhere in the sampled span', litA > 0,
        `${litA} of ${frames.length} frames — ${trace}`);
    check('led2 is lit somewhere in the sampled span', litB > 0,
        `${litB} of ${frames.length} frames` +
        (litB === 0 && p11.length > 0 ? ' — but P1.1 WAS written, so the write is not reaching the read' : ''));
    check('there is a moment where exactly ONE of them is lit', alone > 0,
        `${alone} frame(s) with one lit, ${both} with both lit together — ${trace}` +
        (alone === 0 && both > 0
            ? ' — they only ever light TOGETHER, which is the unison blink and not the example'
            : ''));

    console.log(`\nDual blink: ${failures.length ? `${failures.length} failure(s)` : 'both LEDs alternate'}`);
} finally {
    await browser.close().catch(() => {});
    await new Promise(done => server.close(done));
}
if (failures.length) throw new Error(failures.join(' | '));
