#!/usr/bin/env node
/**
 * Measure the built GUI's layout in a real browser, and assert the invariants that kept breaking.
 *
 * Why this exists: every layout bug in the costume-designer work was diagnosed by reasoning about
 * CSS and shipped wrong — four times — because the misbehaving element and the responsible
 * element were never the same one. Each wrong guess cost a deploy cycle. Opening the built page
 * and READING the computed boxes turns that entire class of bug into a measurement.
 *
 * Firefox on purpose: it is what this project is actually used in, and layout differences between
 * engines are real here — gui.css already carries a `min-height: 0 /* this makes it work in
 * Firefox *­/` note. A green Chromium run would not have told us what we need to know.
 *
 *   node scripts/probe-layout.mjs            # assert the invariants, non-zero exit on failure
 *   node scripts/probe-layout.mjs --report   # also dump the measurements
 *
 * Needs a build in packages/scratch-gui/build and, once:
 *   npm i -D playwright && npx playwright install firefox
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {extname, join, normalize, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(REPO, 'packages', 'scratch-gui', 'build');
const PORT = 8097;
const REPORT = process.argv.includes('--report');

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.hex': 'text/plain', '.txt': 'text/plain'
};

if (!existsSync(join(BUILD, 'index.html'))) {
    console.error(`No build at ${BUILD}. Run the gui build first.`);
    process.exit(2);
}

let chromiumlessFirefox;
try {
    ({firefox: chromiumlessFirefox} = await import('playwright'));
} catch {
    console.error('playwright is not installed. Run:  npm i -D playwright && npx playwright install firefox');
    process.exit(2);
}

const server = createServer(async (req, res) => {
    try {
        let path = decodeURIComponent(req.url.split('?')[0]);
        if (path.endsWith('/')) path += 'index.html';
        const file = join(BUILD, normalize(path));
        if (!file.startsWith(BUILD)) throw new Error('escape');
        res.writeHead(200, {'content-type': TYPES[extname(file)] || 'application/octet-stream'});
        res.end(await readFile(file));
    } catch {
        res.writeHead(404);
        res.end('not found');
    }
});
await new Promise(done => server.listen(PORT, done));

const browser = await chromiumlessFirefox.launch();
const page = await browser.newPage({viewport: {width: 1600, height: 900}});
const failures = [];
const check = (name, ok, detail) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

try {
    await page.goto(`http://localhost:${PORT}/`, {waitUntil: 'load'});
    await page.waitForSelector('[class*="gui_tab"]', {timeout: 90000});
    await page.waitForTimeout(3000);

    /** @return {object} Widths and heights of the boxes the invariants care about. */
    const measure = () => page.evaluate(() => {
        const box = frag => {
            const el = document.querySelector(`[class*="${frag}"]`);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom)};
        };
        return {
            editor: box('editor-wrapper'),
            stageColumn: box('stage-and-target-wrapper'),
            paintCanvas: box('paint-editor_canvas-container'),
            rail: box('bw-properties-panel_rail'),
            viewportHeight: window.innerHeight
        };
    });

    const before = await measure();
    if (REPORT) console.log('\nlarge stage:', JSON.stringify(before, null, 1), '\n');

    // --- Invariant 1: the small/large stage buttons must give the editor room back.
    const stageButtons = await page.$$('[class*="stage-header_stage-button"]');
    if (stageButtons.length >= 2) {
        await stageButtons[0].click(); // small
        await page.waitForTimeout(1200);
        const small = await measure();
        if (REPORT) console.log('small stage:', JSON.stringify(small, null, 1), '\n');
        check('small stage widens the editor', small.editor.w > before.editor.w,
            `${before.editor.w}px -> ${small.editor.w}px`);
        await stageButtons[1].click(); // back to large
        await page.waitForTimeout(1200);
    } else {
        check('stage size buttons present', false, `found ${stageButtons.length}`);
    }

    // --- Invariant 2: the costume tab's properties rail must not stretch the editor past the
    // window. This is the bug that produced the grey band and the "broken" zoom, four times over.
    const costumeTab = await page.$('[class*="gui_tab"]:nth-child(2)');
    if (costumeTab) {
        await costumeTab.click();
        await page.waitForTimeout(2500);
        const closed = await measure();
        const toggle = await page.$('[class*="bw-properties-panel_rail-collapsed"] button');
        if (toggle) {
            await toggle.click();
            await page.waitForTimeout(1500);
            const open = await measure();
            if (REPORT) console.log('rail open:', JSON.stringify(open, null, 1), '\n');
            check('opening the rail does not push the canvas past the window',
                open.paintCanvas && open.paintCanvas.bottom <= open.viewportHeight + 2,
                open.paintCanvas ? `canvas bottom ${open.paintCanvas.bottom} vs window ${open.viewportHeight}` : 'no canvas');
            check('opening the rail does not change the canvas height',
                closed.paintCanvas && open.paintCanvas &&
                    Math.abs(open.paintCanvas.h - closed.paintCanvas.h) <= 2,
                closed.paintCanvas && open.paintCanvas ?
                    `${closed.paintCanvas.h}px -> ${open.paintCanvas.h}px` : 'missing');
            check('the rail fits within the window',
                open.rail && open.rail.bottom <= open.viewportHeight + 2,
                open.rail ? `rail bottom ${open.rail.bottom} vs window ${open.viewportHeight}` : 'no rail');
        } else {
            check('properties rail toggle present', false, 'collapsed toggle not found');
        }
    } else {
        check('costume tab present', false);
    }
} finally {
    await browser.close();
    server.close();
}

console.log(failures.length ? `\n${failures.length} failing invariant(s)` : '\nall invariants hold');
process.exit(failures.length ? 1 : 0);
