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
 *   npm i -D playwright --no-save && npx playwright install firefox
 *   git checkout package-lock.json        # <- do not skip this
 *
 * playwright stays out of package.json deliberately: it is ~100 MB and only this script wants
 * it, and CI's verify-gui job installs its own copy standalone. But --no-save only spares
 * package.json — npm still rewrites package-lock.json, which IS tracked, and a concurrent
 * `git add -A` in this repo has already once committed playwright into it as a root dependency
 * the root package.json does not declare. Restore the lock after installing.
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
        // Read BEFORE writing the head. With the 200 sent first, a missing
        // file threw into a catch that could no longer set a status, and
        // that second throw escaped the handler and killed the probe with
        // ERR_HTTP_HEADERS_SENT — the app's own 404 for a lazy chunk was
        // enough to do it.
        const body = await readFile(file);
        res.writeHead(200, {'content-type': TYPES[extname(file)] || 'application/octet-stream'});
        res.end(body);
    } catch {
        if (res.headersSent) return res.end();
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

    // The starter-journeys modal opens over a fresh session and every box below
    // it measures 0x0 while it is up — which reads exactly like a broken layout
    // rather than a covered one. Escape closes it; waiting for the backdrop to
    // go is what makes the measurements real.
    const backdrop = '[class*="starter-journeys_backdrop"]';
    if (await page.$(backdrop)) {
        await page.keyboard.press('Escape');
        await page.waitForSelector(backdrop, {state: 'detached', timeout: 15000})
            .catch(() => console.log('note: the starter-journeys backdrop did not close'));
    }
    // The right pane starts HIDDEN (localStorage 'bw-right-pane-hidden'), which
    // collapses the stage column to `display: none; flex: 0 0 0px`. Every
    // invariant below is about how that column and the editor share a row, so
    // with the pane shut they all measure a 0x0 stage and read as a broken
    // layout rather than a closed one. The toggle carries no class — it is
    // styled inline — so address it by its data attribute, and press it only
    // when it is actually shut.
    const paneToggle = '[data-right-pane-toggle]';
    const toggle = await page.$(paneToggle);
    if (!toggle) {
        check('the right-pane toggle is present', false, `no ${paneToggle}`);
    } else if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
        await toggle.click();
        // Wait for the CONDITION, not a guess at how long it takes: the stage
        // column is what every invariant below measures, so the thing worth
        // waiting for is that column having a width at all.
        await page.waitForFunction(() => {
            const col = document.querySelector('[class*="stage-and-target-wrapper"]');
            return !!col && col.getBoundingClientRect().width > 200;
        }, null, {timeout: 15000}).catch(() => console.log('note: the right pane did not open'));
    }
    await page.waitForTimeout(3000);

    /** @return {object} Widths and heights of the boxes the invariants care about. */
    const measure = () => page.evaluate(() => {
        const box = frag => {
            const el = document.querySelector(`[class*="${frag}"]`);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
                w: Math.round(r.width), h: Math.round(r.height),
                bottom: Math.round(r.bottom),
                left: Math.round(r.left), right: Math.round(r.right),
                top: Math.round(r.top)
            };
        };
        return {
            editor: box('editor-wrapper'),
            stageColumn: box('stage-and-target-wrapper'),
            paintCanvas: box('paint-editor_canvas-container'),
            rail: box('bw-properties-panel_rail'),
            divider: box('pane-divider_divider'),
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

        // "Wider" was too weak a claim to be worth much: the column used to step from a
        // 'm' share to an 's' share, which widened the editor by 95px while leaving 372px
        // of empty background around a 240px stage. Asking for a small stage is asking for
        // editor room, so the column has to actually fit the stage — compare it against
        // the width its own content needs, which is what flex-basis: min-content resolves.
        const fit = await page.evaluate(() => {
            const col = document.querySelector('[class*="stage-and-target-wrapper"]');
            const saved = col.getAttribute('style') || '';
            col.style.flexBasis = 'min-content';
            col.style.flexGrow = '0';
            const needed = Math.round(col.getBoundingClientRect().width);
            col.setAttribute('style', saved);
            return {needed, actual: Math.round(col.getBoundingClientRect().width)};
        });
        check('the small stage\'s column is as narrow as the stage allows',
            Math.abs(fit.actual - fit.needed) <= 4,
            `column ${fit.actual}px, stage needs ${fit.needed}px`);
        await stageButtons[1].click(); // back to large
        await page.waitForTimeout(1200);
    } else {
        check('stage size buttons present', false, `found ${stageButtons.length}`);
    }

    // --- Invariant 2: the divider that replaced the xs/s/m/l/xl debug button must actually
    // move the boundary. Two columns share one row, so a drag that grows one and does not
    // shrink the other has not moved a boundary — it has resized a box, which is the exact
    // failure the stage-size buttons had.
    //
    // Kept BEFORE the costume tab, but the reason recorded here for months was
    // wrong in both halves, and measurement (2026-08-28, --report prints it)
    // says so:
    //
    //   blocks tab, before costume is ever opened  250px
    //   costume tab, rail CLOSED                   776px
    //   costume tab, rail OPEN                     776px
    //   back on the blocks tab                     250px
    //
    // The rail costs NOTHING — 776px is what the paint editor itself needs, open
    // or shut — and the floor does NOT persist, because an unselected tab panel
    // is `display: none` (gui.css) and a display:none subtree contributes no
    // min-content at all. `forceRenderTabPanel` keeps panels MOUNTED, which is
    // not the same as keeping them laid out. So there was never a rail floor to
    // overlay away; ROADMAP 1.2 was written against a misreading.
    //
    // The ordering stays anyway: it costs nothing, and running the drag on the
    // blocks tab keeps this invariant measuring the divider rather than the
    // paint editor's own 776px.
    const start = await measure();
    if (!start.divider) {
        check('the pane divider is present', false, 'no [class*="pane-divider_divider"]');
    } else {
        const y = start.divider.top + Math.round(start.divider.h / 2);

        /** Drag the divider by dx px and report the resulting boxes. @returns {object} */
        const drag = async dx => {
            const from = await measure();
            const grabX = Math.round((from.divider.left + from.divider.right) / 2);
            await page.mouse.move(grabX, y);
            await page.mouse.down();
            // In steps, because a single jump is not a drag: it would pass even if the
            // component only handled pointerup.
            await page.mouse.move(grabX + dx, y, {steps: 12});
            await page.mouse.up();
            await page.waitForTimeout(600);
            return measure();
        };

        const DX = 220;
        const wider = await drag(-DX); // boundary left = stage column grows
        if (REPORT) console.log('after dragging left:', JSON.stringify(wider, null, 1), '\n');

        // THE assertion. Not "it moved" — "it moved by what I asked for". The first
        // implementation passed a "did it move" check while moving 90px for a 220px
        // drag, because the column had flex-grow 1 and rendered at its basis plus a
        // cut of the free space. A boundary that lags the pointer is the whole way a
        // split pane feels broken, and only a measured delta catches it.
        const grew = wider.stageColumn.w - start.stageColumn.w;
        check('the divider follows the pointer',
            Math.abs(grew - DX) <= 8,
            `dragged ${DX}px, boundary moved ${grew}px`);
        check('...and the editor gives up exactly that much',
            Math.abs((start.editor.w - wider.editor.w) - DX) <= 8,
            `${start.editor.w}px -> ${wider.editor.w}px`);

        // The clamp: dragged hard against the edge, the far column must keep a usable width
        // rather than collapsing. Collapsing is double-click, and it has to stay deliberate.
        // The target stays inside the viewport on purpose — playwright cannot move the mouse
        // past it, so a larger dx would silently deliver no movement at all and the check
        // would pass by doing nothing.
        const shoved = await drag(
            1560 - Math.round((wider.divider.left + wider.divider.right) / 2));
        if (REPORT) console.log('after dragging far right:', JSON.stringify(shoved, null, 1), '\n');
        check('dragging past the edge does not collapse the stage column',
            shoved.stageColumn.w >= 120,
            `stage column ${shoved.stageColumn.w}px, minimum 120px`);
        check('...and leaves the editor holding the rest of the row',
            shoved.editor.w > start.editor.w,
            `${start.editor.w}px -> ${shoved.editor.w}px`);

        // Double-click is the only route to the collapsed strip. Re-measure first: the
        // divider is wherever the last drag left it, not where it started.
        await page.mouse.dblclick(
            Math.round((shoved.divider.left + shoved.divider.right) / 2), y);
        await page.waitForTimeout(600);
        const collapsed = await measure();
        check('double-clicking the divider collapses the stage column to a strip',
            collapsed.stageColumn.w <= 40,
            `stage column ${collapsed.stageColumn.w}px`);

        // A collapsed pane must LOOK collapsed. Without the strip covering it, those 28px
        // show a vertical slice of the live stage — part of the green flag, a sliced
        // sprite, two orphaned letters — which is what got the old collapse step reported
        // as broken. Width alone does not catch that; the lid has to be there.
        const strip = await page.evaluate(() => {
            const el = document.querySelector('[class*="pane-strip_strip"]');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return {w: Math.round(r.width), h: Math.round(r.height),
                text: el.textContent.trim(), opaque: s.backgroundColor,
                covers: r.height > 100};
        });
        check('the collapsed column shows a labelled strip, not a slice of stage',
            strip && strip.covers && /stage|bühne/i.test(strip.text),
            strip ? `strip ${strip.w}x${strip.h}, label "${strip.text}"` : 'no strip rendered');

        // The stage must survive being collapsed. Unmounting StageWrapper would take
        // scratch-render's canvas with it, and the restore would be a remount.
        const canvasAlive = await page.evaluate(() => {
            const c = document.querySelector('canvas');
            return c ? c.width : 0;
        });
        check('the stage canvas is still mounted behind the strip',
            canvasAlive > 0, `canvas backing store ${canvasAlive}px wide`);

        if (strip) {
            await page.click('[class*="pane-strip_strip"]');
            await page.waitForTimeout(900);
            const restored = await measure();
            check('clicking the strip restores the stage column',
                restored.stageColumn.w > 200,
                `${collapsed.stageColumn.w}px -> ${restored.stageColumn.w}px`);
        }
    }
    // --- Invariant 3: the costume tab's properties rail must not stretch the editor past the
    // window. This is the bug that produced the grey band and the "broken" zoom, four times over.
    // Last, because opening the rail permanently raises the editor's min-content width (see
    // invariant 2) and every later measurement inherits that.
    // Not `[class*="gui_tab"]:nth-child(2)`: that fragment also matches
    // `gui_tab-panel`, and nth-child counts among ALL siblings, so it selected
    // something that was not a tab and the click silently did nothing — the
    // paint editor never mounted and this invariant reported a missing rail
    // for 20 seconds of waiting. Address the tab by what it IS.
    // `getByRole('tab')` alone is not enough either: the debugger's solo pane
    // carries tabs of its own, and its overlay then intercepts the click. The
    // editor's own tabs are the ones whose CSS-module class is `gui_tab_` —
    // note the trailing underscore, which is what separates them from
    // `gui_tab-panel_`.
    const costumeTab = page.locator('[class*="gui_tab_"]')
        .filter({hasText: /costume|kostüm/i});
    if (await costumeTab.count()) {
        await costumeTab.first().click();
        await page.waitForTimeout(2500);
        const closed = await measure();
        const toggle = await page.$('[class*="bw-properties-panel_rail-collapsed"] button');
        if (toggle) {
            await toggle.click();
            await page.waitForTimeout(1500);
            const open = await measure();
            if (REPORT) {
                console.log('rail open:', JSON.stringify(open, null, 1), '\n');
                // The number ROADMAP 1.2 was about. Printed rather than asserted:
                // it is a property of the paint editor's own controls, and a
                // threshold here would just encode today's toolbar.
                const floors = await page.evaluate(() => {
                    const col = document.querySelector('[class*="editor-wrapper"]');
                    const saved = col.getAttribute('style') || '';
                    col.style.flexBasis = 'min-content';
                    col.style.flexGrow = '0';
                    col.style.flexShrink = '0';
                    const needed = Math.round(col.getBoundingClientRect().width);
                    col.setAttribute('style', saved);
                    return needed;
                });
                console.log(`editor min-content, costume tab with the rail open: ${floors}px\n`);
            }
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
