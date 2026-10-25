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
        // The canvas's width/height ATTRIBUTES are the renderer's DRAWING
        // BUFFER, not "what the app intended". Calling them intent was a
        // mislabel that produced a WRONG SCALE verdict for a layout that is
        // in fact correct — see the header.
        drawingBuffer: {w: canvas.width, h: canvas.height},
        box: {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)},
        offsetInParent: parent
            ? {dx: Math.round(r.x - parent.x), dy: Math.round(r.y - parent.y)}
            : null,
        stageSizeMode: state.stageSize?.stageSize ?? null,
        isFullScreen: !!state.mode?.isFullScreen,
        // isStarted is one of the props shouldComponentUpdate gates on, so it
        // is recorded to prove the step 4b poke LANDED. Without it, "the
        // buffer did not change" cannot be told apart from "the prop never
        // changed", and the experiment decides nothing either way.
        isStarted: !!state.vmStatus?.started,
        // Written by the overlay's own sizing step. Absent = this overlay
        // never reached the build; present with 0x0 = the box had no size when
        // it looked. Same output otherwise, opposite fixes.
        sizedMarker: canvas.getAttribute('data-bw-sized'),
        dpr: window.devicePixelRatio
    };
};

/**
 * Mark the stage's canvas, by IDENTITY rather than by size.
 *
 * MEASURED IN CI, 2026-09-07 — the DOM holds exactly two canvases and BOTH are
 * 0x0 at this point:
 *
 *   class=(none)                        attr 0x0  inStage=true   <- the renderer's
 *   class=stage_dragging-sprite_eMctD   attr 0x0  inStage=true   <- the drag layer
 *
 * The previous version required a non-zero size and so matched neither, and
 * refused. That filter was wrong twice over: it encoded an assumption about
 * WHEN the canvas is sized, and 0x0 may be the very defect under
 * investigation. An instrument must not refuse to measure the symptom.
 *
 * The renderer's canvas carries NO class — it is inserted as a domElement —
 * so it is identified as the canvas inside the stage subtree that is not the
 * drag layer. Exactly one such element exists.
 *
 * RE-MARKED BEFORE EVERY MEASUREMENT, not once at the start: if the load path
 * ever replaced the element, a mark applied at mount would go missing at
 * precisely the moment the bug occurs, and zero matches would be read as a
 * broken harness rather than as a replaced canvas (lego-ac).
 */
const MARK_STAGE_CANVAS = () => {
    for (const c of document.querySelectorAll('[data-bw-stage-canvas]')) {
        c.removeAttribute('data-bw-stage-canvas');
    }
    const inStage = [...document.querySelectorAll('[class*="stage"] canvas')];
    const pool = inStage.length ? inStage : [...document.querySelectorAll('canvas')];
    const real = pool.filter(c => !/drag/i.test(c.className || ''));
    if (real.length !== 1) return false;
    real[0].setAttribute('data-bw-stage-canvas', '1');
    return true;
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
    /**
     * A content signature, WHEN ONE CAN BE TAKEN.
     *
     * An element screenshot needs a visible element, and the stage canvas has
     * measured 0x0 at every step so far — so Playwright waited 30 s for it to
     * become "stable" and threw. That is the SAME mistake as the non-zero size
     * filter this harness already had to remove: an instrument that only works
     * on the healthy state cannot report on the sick one. lego-ac's rule —
     * filter by what a thing IS, never by whether it LOOKS WELL — applies to
     * how a thing is measured as much as to how it is found.
     *
     * So a failed capture is DATA, not an error: the geometry is still
     * recorded, and the verdict below says plainly that the stale-content
     * hypothesis could not be tested rather than quietly skipping it.
     */
    const shot = async (name) => {
        const el = await page.$('[data-bw-stage-canvas]');
        if (!el) return null;
        try {
            const buf = await el.screenshot({timeout: 5000});
            await writeFile(join(artifacts, `${name}.png`), buf);
            return createHash('sha256').update(buf).digest('hex').slice(0, 16);
        } catch {
            return null;                    // not visible: nothing to hash, and that is a reading
        }
    };
    const snap = async (name) => {
        const ok = await page.evaluate(MARK_STAGE_CANVAS);
        if (!ok) throw new Error(`the stage canvas could not be identified at '${name}' — it may have been replaced`);
        return {name, ...(await page.evaluate(MEASURE)), content: await shot(name)};
    };

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
        // HOW A USER ACTUALLY ARRIVES IN THE CODE EDITOR, which turns out to
        // matter more than it looks. Nothing in either tree dispatches a
        // pane-layout action — no component calls applyPreset, setPaneSize or
        // setSlotContent — so the only routes into the 'code' layout are the
        // persisted `bw-pane-layout` key and a direct store dispatch.
        //
        // The first version of this harness dispatched AFTER mount, and that
        // is a real difference rather than a convenience: the layout changed
        // under a stage that had already mounted. Seeding localStorage BEFORE
        // navigation means the stage mounts into the code layout, which is the
        // state a returning user is in. If the drawing buffer is sized here and
        // not there, the 0x0 was mine; if it is 0x0 both ways, the defect does
        // not depend on how the layout was reached.
        const LAYOUT_VIA = process.env.STAGE_AFTER_LOAD_VIA || 'storage';
        if (LAYOUT_VIA === 'storage') {
            await page.addInitScript(() => {
                localStorage.setItem('bw-pane-layout', JSON.stringify({
                    left: {upper: 'blocks-palette', lower: null, size: 'xs'},
                    middle: {upper: 'code', lower: null, size: 'xl'},
                    right: {upper: 'stage', lower: 'sprites', size: 's'},
                    activePreset: 'code'
                }));
            });
        }
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
        // Prefer the canvas that lives inside the stage's own subtree. CSS
        // module names keep their readable prefix in this build, which is how
        // the other gates find `[class*="gui_body"]`.
        const marked = await page.waitForFunction(MARK_STAGE_CANVAS, null, {timeout: 45000})
            .catch(() => null);

        // WHEN IT CANNOT, SAY WHAT IT SAW. The previous run failed with
        // "zero or several canvases matched" and nothing else, which is a
        // refusal without evidence — right to stop, useless to act on. Every
        // candidate is written to the artifact directory before throwing, so
        // the next reader gets the DOM's answer instead of another guess.
        if (!marked) {
            const seen = await page.evaluate(() => [...document.querySelectorAll('canvas')].map(c => {
                const r = c.getBoundingClientRect();
                return {
                    className: String(c.className || ''),
                    attr: {w: c.width, h: c.height},
                    box: {w: Math.round(r.width), h: Math.round(r.height)},
                    parent: String(c.parentElement && c.parentElement.className || ''),
                    inStageSubtree: !!c.closest('[class*="stage"]')
                };
            }));
            await writeFile(join(artifacts, 'canvas-candidates.json'), JSON.stringify(seen, null, 2));
            console.log(`  canvases found: ${seen.length}`);
            for (const c of seen) {
                console.log(`    class=${c.className || '(none)'} attr=${c.attr.w}x${c.attr.h} ` +
                    `box=${c.box.w}x${c.box.h} inStage=${c.inStageSubtree} parent=${c.parent || '(none)'}`);
            }
            // ZERO and SEVERAL are opposite causes and cost a cycle each if
            // conflated: zero means the identification missed the element,
            // several means it matched more than the stage (lego-ac).
            const matched = seen.filter(c => c.inStageSubtree && !/drag/i.test(c.className)).length;
            check('exactly one stage canvas can be identified', false,
                matched === 0
                    ? `ZERO matched: no canvas in a stage subtree that is not the drag layer, out of ${seen.length} on the page — candidates in ${artifacts}`
                    : `SEVERAL matched (${matched}): more than one canvas answers to the stage — candidates in ${artifacts}`);
            throw new Error('cannot identify the stage canvas; refusing to measure the wrong element');
        }
        check('exactly one stage canvas can be identified', true);

        // THE CODE EDITOR MUST BE MOUNTED FIRST. The default pane preset is
        // 'blocks', where the middle column shows the blocks canvas and the
        // pseudocode importer is not in the tree at all — so the walk below
        // searched for a component that could not be there and timed out after
        // 40 s. The owner's report is specifically about the CODE EDITOR, so
        // the preset is part of the reproduction rather than setup noise.
        if (LAYOUT_VIA !== 'storage') {
            await page.evaluate(() => {
                const store = window.__brickwrightStore;
                if (store) store.dispatch({type: 'scratch-gui/pane-layout/APPLY_PRESET', preset: 'code'});
            });
        }
        await settle();
        const layout = await page.evaluate(() =>
            window.__brickwrightStore?.getState?.()?.scratchGui?.paneLayout?.middle?.upper ?? null);
        check(`the Code Editor is the middle pane (reached via ${LAYOUT_VIA})`, layout === 'code',
            `middle.upper = ${layout}`);
        // Write something to the artifact directory NOW. Every failure so far
        // has stopped before the measurements were written, so the upload step
        // failed too and the one place a human could look was empty.
        await writeFile(join(artifacts, 'progress.json'), JSON.stringify(
            {reached: 'code preset applied, looking for the importer', example: EXAMPLE}, null, 2));

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

        // STEP 4b — IS FULLSCREEN SPECIAL, OR IS ANY GATED PROP ENOUGH?
        //
        // Read in packages/scratch-gui/src/containers/stage.jsx:
        //   componentDidMount   attaches events and updateRect, and NEVER
        //                       calls renderer.resize
        //   componentDidUpdate  is the ONLY caller of renderer.resize
        //   shouldComponentUpdate gates it on stageSize, isColorPicking,
        //                       colorInfo, isFullScreen, question,
        //                       micIndicator, isStarted — and on NOTHING about
        //                       the container's actual size
        //
        // If that reading is right, the buffer is sized by ANY change to one of
        // those props and not by fullscreen as such. isStarted flips on the
        // green flag, so this pokes that one instead. Buffer non-zero here means
        // the gate is the mechanism and fullscreen was incidental; still zero
        // means the reading is wrong and fullscreen does something else.
        // The green flag was the wrong prop to poke: isStarted was ALREADY true
        // before it, so the flag could not flip anything and the run was
        // undecided for a reason that had nothing to do with the theory.
        // stageSize is also gated and is provably changeable — large to small.
        const poke = await page.evaluate(() => {
            const store = window.__brickwrightStore;
            if (!store) return {ran: false, why: 'no store'};
            store.dispatch({type: 'scratch-gui/StageSize/SET_STAGE_SIZE', stageSize: 'small'});
            return {ran: true};
        });
        await settle();
        const afterGreenFlag = await snap('3b-after-stage-size-change');
        // THE EXPERIMENT ONLY DECIDES ANYTHING IF THE POKE LANDED. The first
        // version called greenFlag inside an `if` that silently did nothing
        // when the handle was missing, so a 0x0 buffer afterwards could have
        // meant "a gated prop changed and resize still did not run" or "no
        // prop ever changed" — opposite conclusions from identical output.
        const started = afterGreenFlag.stageSizeMode !== afterViewport.stageSizeMode;
        check('the poke actually changed a gated prop (stageSize)', started,
            poke.ran ? `stageSize ${afterViewport.stageSizeMode} -> ${afterGreenFlag.stageSizeMode}` : poke.why);

        // STEP 3c — CAN A BOX CHANGE WITH NO GATED PROP LEAVE A STALE BUFFER?
        //
        // This decides whether the repair needs an observer or only a resize at
        // mount, and it is a real question rather than a hypothetical one:
        // setPaneSize IS dispatched by gui.jsx, so users can resize panes, and
        // pane size is NOT in shouldComponentUpdate's list. If the box moves
        // and the buffer does not follow, the stage is stale after every drag
        // of the divider and an observer is justified BY EVIDENCE. If the
        // buffer keeps up, adding one would be a mechanism in a container we do
        // not own, guarding a case that cannot occur.
        //
        // Run at a point where the buffer is known non-zero, so a stale reading
        // is unambiguous rather than the pre-existing zero.
        const paneResized = await page.evaluate(() => {
            const store = window.__brickwrightStore;
            if (!store) return {ran: false, why: 'no store'};
            store.dispatch({type: 'scratch-gui/pane-layout/SET_PANE_SIZE', column: 'right', size: 'l'});
            return {ran: true};
        });
        await settle();
        const afterPaneResize = await snap('3c-after-pane-resize');
        // SIZE and POSITION are different questions here. A stale BUFFER can
        // only come from a SIZE change the renderer did not follow; moving the
        // stage sideways cannot strand it. The first version asserted "the box
        // moved" meaning size, saw the size hold, and reported UNDECIDED — when
        // the size holding IS the answer.
        const sizeChanged = afterPaneResize.box.w !== afterGreenFlag.box.w ||
            afterPaneResize.box.h !== afterGreenFlag.box.h;
        const movedAtAll = sizeChanged ||
            afterPaneResize.box.x !== afterGreenFlag.box.x ||
            afterPaneResize.box.y !== afterGreenFlag.box.y;
        check('resizing a pane reaches the stage at all', movedAtAll,
            paneResized.ran
                ? `box ${afterGreenFlag.box.w}x${afterGreenFlag.box.h} @${afterGreenFlag.box.x} -> `
                  + `${afterPaneResize.box.w}x${afterPaneResize.box.h} @${afterPaneResize.box.x}`
                : paneResized.why);

        // STEP 5 — the control: real fullscreen, which is what the owner did.
        await page.evaluate(() => {
            const store = window.__brickwrightStore;
            if (store) store.dispatch({type: 'scratch-gui/mode/SET_FULL_SCREEN', isFullScreen: true});
        });
        await settle();
        const afterFullscreen = await snap('4-after-fullscreen');

        const all = [before, afterLoad, afterRedraw, afterViewport, afterGreenFlag, afterPaneResize, afterFullscreen];
        await writeFile(join(artifacts, 'measurements.json'), JSON.stringify(all, null, 2));
        for (const m of all) {
            console.log(`  ${m.name.padEnd(28)} sized=${m.sizedMarker ?? 'ABSENT'}  buffer ${m.drawingBuffer.w}x${m.drawingBuffer.h}  ` +
                `box ${m.box.w}x${m.box.h} @${m.box.x},${m.box.y}  content ${m.content}`);
        }

        // ---- the verdict, as one named line ---------------------------------
        let verdict = null, why = '';
        const contentTestable = afterLoad.content !== null && afterRedraw.content !== null;
        if (!contentTestable) {
            console.log('\nNOTE: no content signature could be taken — the stage canvas is not');
            console.log('  visible, so STALE CONTENT could not be tested this run. The geometry');
            console.log('  below is still a reading, and a 0x0 canvas is itself a finding.');
        }
        if (contentTestable && afterRedraw.content !== afterLoad.content && sameBox(afterRedraw, afterLoad)) {
            verdict = 'STALE CONTENT';
            why = 'a repaint at unchanged geometry changed the picture, so the box was right and '
                + 'the drawing was old. The absent ResizeObserver on the stage is the shape of the fix.';
        } else if (afterLoad.drawingBuffer.w === 0 || afterLoad.drawingBuffer.h === 0) {
            // A FOURTH CASE, which the original three did not contain. Measured
            // 2026-09-07: the laid-out box is correct at 480x360 and
            // stageSizeMode is 'large' throughout, so nothing is mis-scaled —
            // the renderer's DRAWING BUFFER is simply never sized. A canvas
            // with a 0x0 buffer draws nothing however right its CSS box is.
            verdict = 'DRAWING BUFFER NEVER SIZED';
            why = `the laid-out box is ${afterLoad.box.w}x${afterLoad.box.h} and correct, and the `
                + `renderer's buffer is ${afterLoad.drawingBuffer.w}x${afterLoad.drawingBuffer.h}. `
                + 'Neither a synthetic resize event nor a real viewport change set it; only '
                + `fullscreen did (${afterFullscreen.drawingBuffer.w}x${afterFullscreen.drawingBuffer.h}). `
                + 'This is NOT wrong scale: the layout is right and the buffer is absent.';
        } else if (afterLoad.drawingBuffer.w !== afterLoad.box.w || afterLoad.drawingBuffer.h !== afterLoad.box.h) {
            verdict = 'WRONG SCALE';
            why = `the renderer's buffer is ${afterLoad.drawingBuffer.w}x${afterLoad.drawingBuffer.h} `
                + `and layout produced ${afterLoad.box.w}x${afterLoad.box.h}`;
        } else if (afterLoad.offsetInParent && (afterLoad.offsetInParent.dx !== 0 || afterLoad.offsetInParent.dy !== 0) &&
                   afterFullscreen.offsetInParent &&
                   (afterFullscreen.offsetInParent.dx !== afterLoad.offsetInParent.dx ||
                    afterFullscreen.offsetInParent.dy !== afterLoad.offsetInParent.dy)) {
            verdict = 'WRONG OFFSET';
            why = `the canvas sat at +${afterLoad.offsetInParent.dx},+${afterLoad.offsetInParent.dy} in its `
                + 'parent after load and somewhere else after fullscreen, at the same size';
        }

        // ONE BRANCH, NOT A DANGLING ELSE. The previous version printed the
        // UNDECIDED block AND the decided conclusion in the same run, because
        // the `else` bound to only the first of two console.logs. Contradictory
        // prose over a correct measurement — the very failure this file keeps
        // finding, this time in its own reporting.
        const gatedPropSized = afterGreenFlag.drawingBuffer.w > 0;
        if (!started) {
            console.log('\nWHAT SIZES THE BUFFER: UNDECIDED — the poke did not change a gated');
            console.log('  prop, so this run says nothing about whether one would size the');
            console.log('  buffer. Not evidence for the gate theory, and not against it.');
        } else if (gatedPropSized) {
            console.log(`\nWHAT SIZES THE BUFFER: a gated prop change DID size it ` +
                `(${afterGreenFlag.drawingBuffer.w}x${afterGreenFlag.drawingBuffer.h}).`);
            console.log('  So fullscreen is not special: renderer.resize runs from');
            console.log('  componentDidUpdate and any gated prop reaches it. Nothing on the');
            console.log('  load path changes one, which is the defect.');
        } else {
            console.log('\nWHAT SIZES THE BUFFER: a gated prop change did NOT size it.');
            console.log('  The componentDidUpdate reading does not explain it, and whatever');
            console.log('  fullscreen does is something else. Do not build on the gate theory.');
        }

        // Reported whether or not it changes the verdict: it decides the SHAPE
        // of the repair, which is a separate question from naming the defect.
        if (!movedAtAll) {
            console.log('\nDOES A PANE RESIZE LEAVE A STALE BUFFER: UNDECIDED — the pane change');
            console.log('  did not reach the stage at all, so nothing was tested.');
        } else if (!sizeChanged) {
            console.log(`\nDOES A PANE RESIZE LEAVE A STALE BUFFER: NO, AND IT CANNOT. The pane`);
            console.log(`  change moved the stage sideways (x ${afterGreenFlag.box.x} -> ${afterPaneResize.box.x})`);
            console.log(`  and left its SIZE at ${afterPaneResize.box.w}x${afterPaneResize.box.h}. The stage's size is`);
            console.log('  getStageDimensions(stageSize, isFullScreen) — a pure function of two');
            console.log('  GATED props — so every size change already triggers the update path.');
            console.log('  A stale buffer needs a size change the renderer did not follow, and a');
            console.log('  pane resize cannot produce one.');
            console.log('  NOTE: this rules out an observer for STEADY-STATE changes only. The');
            console.log('  first 0 -> N transition is driven by no gated prop either, and that');
            console.log('  one DOES need watching — measured, after this text first claimed');
            console.log('  otherwise. A rule about how a thing behaves once it works does not');
            console.log('  automatically hold for how it starts working.');
        } else if (afterPaneResize.drawingBuffer.w === afterGreenFlag.drawingBuffer.w &&
                   afterPaneResize.drawingBuffer.h === afterGreenFlag.drawingBuffer.h) {
            console.log(`\nDOES A PANE RESIZE LEAVE A STALE BUFFER: YES. The box moved to ` +
                `${afterPaneResize.box.w}x${afterPaneResize.box.h} and the buffer stayed at ` +
                `${afterPaneResize.drawingBuffer.w}x${afterPaneResize.drawingBuffer.h}.`);
            console.log('  A resize at mount alone would not cover this. An observer is');
            console.log('  justified by evidence, not by caution.');
        } else {
            console.log(`\nDOES A PANE RESIZE LEAVE A STALE BUFFER: NO. The buffer followed the ` +
                `box to ${afterPaneResize.drawingBuffer.w}x${afterPaneResize.drawingBuffer.h}.`);
            console.log('  So a resize at mount is the whole repair, and adding an observer to a');
            console.log('  container we do not own would guard a case that cannot occur.');
        }

        // THE GATE'S PRIMARY ASSERTION, now that the defect is understood: after
        // loading an example the renderer's buffer must match the laid-out box.
        // This file was built to FIND a defect, and a finder inverts once the
        // defect is fixed — it would have gone red for "none of my hypotheses
        // fired" on the very run that proved the repair. So the assertion is
        // the correct behaviour, and the verdict machinery below is diagnosis
        // for when it fails.
        const sizedOnLoad = afterLoad.drawingBuffer.w === afterLoad.box.w &&
            afterLoad.drawingBuffer.h === afterLoad.box.h && afterLoad.box.w > 0;
        check('the drawing buffer matches the stage box after a load', sizedOnLoad,
            `buffer ${afterLoad.drawingBuffer.w}x${afterLoad.drawingBuffer.h}, `
            + `box ${afterLoad.box.w}x${afterLoad.box.h}`);

        if (sizedOnLoad) {
            console.log('\nThe stage is correct after a load: the buffer matches the box with');
            console.log(`  nothing poked (sized by: ${afterLoad.sizedMarker ?? 'unknown'}).`);
        } else if (verdict) {
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
