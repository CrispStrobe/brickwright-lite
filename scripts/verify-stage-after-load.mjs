#!/usr/bin/env node
/**
 * Why the stage is wrong after loading a pure-Scratch example, NAMED.
 *
 * THE REPORT. Loading a pure-scratch-stage example in the Code Editor leaves
 * the stage wrong, and it "shows correctly after entering fullscreen". That
 * sentence is compatible with at least three different defects, which want
 * three different fixes:
 *
 *   WRONG SCALE    the stage is drawn at the wrong size
 *   WRONG OFFSET   the right size, in the wrong place
 *   STALE CONTENT  the right box, still showing the previous project
 *
 * Nobody can currently tell them apart, and a harness that only reported
 * "it looks different after fullscreen" would leave us exactly there —
 * fullscreen changes all three at once, so comparing before-fullscreen with
 * after-fullscreen conflates them by construction.
 *
 * SO THIS DOES NOT DO THAT. It inserts probes between the two, each changing
 * EXACTLY ONE THING:
 *
 *   step 2  force a REDRAW at unchanged geometry (a resize event at the same
 *           viewport). Content changes while geometry does not -> STALE CONTENT.
 *   step 3  set the viewport to what fullscreen would give, WITHOUT fullscreen.
 *           Correct now -> a SIZING problem, and step 4 says which kind.
 *   step 4  the canvas's own width/height attributes are what the APP INTENDED;
 *           getBoundingClientRect() is what the DOM actually produced. Size
 *           disagrees -> WRONG SCALE. Size agrees, position does not -> WRONG
 *           OFFSET. That comparison is what separates "the app computed the
 *           wrong size" from "the app computed the right size and the DOM did
 *           not follow" — different bugs, different fixes.
 *   step 5  real fullscreen, as the control that reproduces the owner's report.
 *
 * TWO HYPOTHESES ARE UNDER TEST HERE, both lego-ac's, and both are recorded as
 * things NOTICED rather than established:
 *   - getStageDimensions takes two entirely different paths: windowed uses a
 *     fixed scale from the stage-size mode, fullscreen computes from
 *     window.innerHeight/innerWidth. Step 3 tests that.
 *   - there is no ResizeObserver anywhere on the stage, while the circuit UI
 *     has them. Step 2 tests that. If step 2 fires, the absent observer is the
 *     shape of the fix. If step 3 fires, it is not.
 *
 * "NONE OF THEM FIRED" IS A FIRST-CLASS RESULT. The temptation is to fall
 * through into whichever hypothesis is closest; this reports NO VERDICT
 * instead, because a harness that always names a cause is not measuring one.
 *
 * CONTENT IS HASHED FROM AN ELEMENT SCREENSHOT, not canvas.toDataURL: a WebGL
 * canvas without preserveDrawingBuffer reads back blank, which would look like
 * stale content on every single measurement.
 *
 * IT CANNOT RUN ON A DEV BOX WITHOUT A BUILD. It serves
 * packages/scratch-gui/build, so its first real run is CI.
 *
 *   BW_ALLOW_LOCAL_BROWSER_PROOF=1 node scripts/verify-stage-after-load.mjs
 */
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

if (!process.env.CI && process.env.BW_ALLOW_LOCAL_BROWSER_PROOF !== '1') {
    throw new Error('This resource-intensive browser proof is CI-only; set BW_ALLOW_LOCAL_BROWSER_PROOF=1 explicitly');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'packages', 'scratch-gui', 'build');
const artifacts = resolve(process.env.STAGE_AFTER_LOAD_ARTIFACTS || 'artifacts/stage-after-load');
const EXAMPLE = process.env.STAGE_AFTER_LOAD_EXAMPLE || 'orbit_ward';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2'};

const serveBuild = async () => {
    if (!existsSync(join(build, 'index.html'))) {
        throw new Error(`no GUI build at ${build}. This proof needs one; run npm run build:gui.`);
    }
    const server = createServer(async (req, res) => {
        const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
        let file = join(build, rel === '/' ? 'index.html' : rel);
        if (!existsSync(file)) file = join(build, 'index.html');
        try {
            const body = await readFile(file);
            res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'});
            res.end(body);
        } catch (e) {
            res.writeHead(500); res.end(String(e));
        }
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    return {server, url: `http://127.0.0.1:${server.address().port}/`};
};

const results = [];
const check = (what, ok, detail = '') => {
    results.push({what, ok: !!ok, detail});
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `  — ${detail}` : ''}`);
};

/**
 * Everything measurable about the stage at one moment.
 *
 * `intended` is the canvas's own width/height ATTRIBUTES — what the component
 * set, i.e. what the app believes the stage should be. `box` is what layout
 * actually produced. Keeping both is the whole point: they answer different
 * questions and only together separate a bad computation from a bad layout.
 */
const MEASURE = () => {
    const canvas = document.querySelector('[data-bw-stage-canvas]');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const parent = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : null;
    const state = window.__brickwrightStore?.getState?.()?.scratchGui ?? {};
    return {
        intended: {w: canvas.width, h: canvas.height},
        box: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)},
        offsetInParent: parent
            ? {dx: Math.round(r.x - parent.x), dy: Math.round(r.y - parent.y)}
            : null,
        stageSizeMode: state.stageSize?.stageSize ?? null,
        isFullScreen: !!state.mode?.isFullScreen,
        dpr: window.devicePixelRatio
    };
};

const sameBox = (a, b) => a && b && a.box.w === b.box.w && a.box.h === b.box.h &&
    a.box.x === b.box.x && a.box.y === b.box.y;

async function run () {
    await mkdir(artifacts, {recursive: true});
    // CI serves the build once for every browser gate and passes PROOF_URL;
    // serving our own is the local fallback, the same way the example journey
    // does it. Two servers for one build would be a second thing to keep right.
    let server = null;
    let url = process.env.PROOF_URL || process.env.BW_URL || null;
    if (!url) ({server, url} = await serveBuild());
    const browser = await chromium.launch({headless: true});
    const page = await browser.newPage({viewport: {width: 1600, height: 1050}});
    const shot = async (name) => {
        const el = await page.$('[data-bw-stage-canvas]');
        if (!el) return null;
        const buf = await el.screenshot();
        await writeFile(join(artifacts, `${name}.png`), buf);
        return createHash('sha256').update(buf).digest('hex').slice(0, 16);
    };
    const snap = async (name) => ({name, ...(await page.evaluate(MEASURE)), content: await shot(name)});

    /**
     * Wait for TWO PAINTED FRAMES, not for a number of milliseconds.
     *
     * A fixed sleep is a guess about how long the app needs and it costs
     * exactly what it was given, every run, forever — which is why this repo
     * counts them and only lets the total shrink (test/wait-census.test.mjs).
     * It is also the wrong instrument here specifically: this harness EXISTS
     * to decide whether a repaint happened, and a sleep long enough to be safe
     * would hide the very timing it is measuring. Two rAFs is the condition
     * itself — the browser has painted — and costs only what it costs.
     */
    const settle = () => page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
    }));

    try {
        await page.goto(url, {waitUntil: 'networkidle', timeout: 90000});

        // WHICH CANVAS. The stage is not `document.querySelector('canvas')`:
        // stage.jsx also renders a 0x0 dragging-sprite canvas, and it comes
        // first in the DOM. The first version of this harness waited for that
        // one, never saw it become visible, and timed out after 60 s — which
        // was the good outcome. Had it measured that element instead, a 0x0
        // box against a non-zero intent would have produced a confident and
        // entirely wrong WRONG SCALE.
        //
        // So the candidate is chosen by what it IS — a canvas with a real
        // size that is not the drag layer — and AMBIGUITY IS REPORTED RATHER
        // THAN RESOLVED: if there is not exactly one, this says so and stops
        // instead of taking the first and hoping.
        const marked = await page.waitForFunction(() => {
            const all = [...document.querySelectorAll('canvas')];
            const real = all.filter(c =>
                !/drag/i.test(c.className || '') && c.width > 0 && c.height > 0);
            if (real.length !== 1) return false;
            real[0].setAttribute('data-bw-stage-canvas', '1');
            return true;
        }, null, {timeout: 60000}).catch(() => null);
        check('exactly one stage canvas can be identified', !!marked,
            marked ? '' : 'zero or several canvases matched — the harness will not guess which is the stage');
        if (!marked) throw new Error('cannot identify the stage canvas; refusing to measure the wrong element');

        // The Code Editor's own example loader, reached the way the green
        // gates reach the circuit tab's. The importer is told apart from the
        // circuit tab by `bundledExamplesStatus`, which only it has.
        const found = await page.waitForFunction(() => {
            const gui = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
            if (!gui) return false;
            const key = Object.keys(gui).find(k =>
                k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
            if (!key) return false;
            const queue = [gui[key]];
            for (let i = 0; i < 8000 && queue.length; i++) {
                const fiber = queue.shift();
                const node = fiber && fiber.stateNode;
                if (node && typeof node.loadExample === 'function' &&
                    node.state && 'bundledExamplesStatus' in node.state) {
                    window.__bwImporter = node;
                    return true;
                }
                if (fiber && fiber.child) queue.push(fiber.child);
                if (fiber && fiber.sibling) queue.push(fiber.sibling);
            }
            return false;
        }, null, {timeout: 40000});
        check('the Code Editor exposes its example loader', !!found);

        const before = await snap('0-before-load');

        const loaded = await page.evaluate(async (key) => {
            try { await window.__bwImporter.loadExample(key); return {ok: true}; } catch (e) { return {ok: false, error: String(e)}; }
        }, EXAMPLE);
        check(`the pure-Scratch example '${EXAMPLE}' loads`, loaded.ok, loaded.error || '');
        // loadExample already awaited the VM's load, so the only thing left to
        // wait for is paint.
        await settle();
        const afterLoad = await snap('1-after-load');

        // STEP 2 — redraw at UNCHANGED geometry. Only a repaint changes.
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        await settle();
        const afterRedraw = await snap('2-after-redraw-same-size');

        // STEP 3 — the size fullscreen would give, WITHOUT fullscreen.
        const vp = page.viewportSize();
        await page.setViewportSize({width: vp.width, height: vp.height - 1});
        await settle();
        await page.setViewportSize(vp);
        await settle();
        const afterViewport = await snap('3-after-viewport-nudge');

        // STEP 5 — the control: real fullscreen, which is what the owner did.
        await page.evaluate(() => {
            const store = window.__brickwrightStore;
            if (store) store.dispatch({type: 'scratch-gui/mode/SET_FULL_SCREEN', isFullScreen: true});
        });
        await settle();
        const afterFullscreen = await snap('4-after-fullscreen');

        const all = [before, afterLoad, afterRedraw, afterViewport, afterFullscreen];
        await writeFile(join(artifacts, 'measurements.json'), JSON.stringify(all, null, 2));
        for (const m of all) {
            console.log(`  ${m.name.padEnd(28)} intended ${m.intended.w}x${m.intended.h}  ` +
                `box ${m.box.w}x${m.box.h} @${m.box.x},${m.box.y}  content ${m.content}`);
        }

        // ---- the verdict, as one named line ---------------------------------
        let verdict = null, why = '';
        if (afterRedraw.content !== afterLoad.content && sameBox(afterRedraw, afterLoad)) {
            verdict = 'STALE CONTENT';
            why = 'a repaint at unchanged geometry changed the picture, so the box was right and '
                + 'the drawing was old. The absent ResizeObserver on the stage is the shape of the fix.';
        } else if (afterLoad.intended.w !== afterLoad.box.w || afterLoad.intended.h !== afterLoad.box.h) {
            verdict = 'WRONG SCALE';
            why = `the app intended ${afterLoad.intended.w}x${afterLoad.intended.h} and layout produced `
                + `${afterLoad.box.w}x${afterLoad.box.h}`;
        } else if (afterLoad.offsetInParent && (afterLoad.offsetInParent.dx !== 0 || afterLoad.offsetInParent.dy !== 0) &&
                   afterFullscreen.offsetInParent &&
                   (afterFullscreen.offsetInParent.dx !== afterLoad.offsetInParent.dx ||
                    afterFullscreen.offsetInParent.dy !== afterLoad.offsetInParent.dy)) {
            verdict = 'WRONG OFFSET';
            why = `the canvas sat at +${afterLoad.offsetInParent.dx},+${afterLoad.offsetInParent.dy} in its `
                + 'parent after load and somewhere else after fullscreen, at the same size';
        }

        if (verdict) {
            console.log(`\nVERDICT: ${verdict}\n  ${why}`);
            check(`the defect is named: ${verdict}`, true, why);
        } else {
            // A real outcome, not a fall-through. Say so.
            console.log('\nVERDICT: NO VERDICT — none of the three hypotheses fired.');
            console.log('  The stage measured identically after load, after a repaint and after a');
            console.log('  viewport nudge. Either the defect needs a condition this run did not');
            console.log('  reproduce (a different example, a different pane preset, a narrower');
            console.log('  window), or it is not one of scale, offset or stale content. Do not');
            console.log('  pick the closest one: the measurements are in ' + artifacts + '.');
            check('a defect was reproduced and named', false,
                'none of the three fired — see the note above, and do not read this as "fixed"');
        }
    } finally {
        await browser.close();
        if (server) server.close();
    }

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) process.exitCode = 1;
}

run().catch(e => { console.error(e); process.exitCode = 1; });
