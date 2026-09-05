#!/usr/bin/env node
/**
 * Costume artwork survives Save to your computer -> Load from your computer,
 * in BOTH paint modes, without taking the app down.
 *
 * WHY THIS GATE EXISTS. The project-bundle gates prove the four Brickwright
 * surfaces (blocks, code, circuit, widgets) round-trip. Nothing proved the
 * COSTUMES did, and costumes are the one payload a learner edits by hand in a
 * separate editor with its own asset pipeline — vector via paper.js, bitmap via
 * a canvas re-encode. `project-bundle-roundtrip.test.mjs` checks that attaching
 * the sidecar does not drop assets, but it does that against a synthetic
 * project.json fixture; it never opens the paint editor.
 *
 * WHAT IT ASSERTS, and what it deliberately does not. It compares the CONTENT
 * of each costume across the round trip, hashed from `asset.data`, not the
 * declared `assetId`. Those are different claims and only the first is the
 * learner's: ids are renormalised on load, because two default-project assets
 * ship named by an id that is not the md5 of their bytes
 * (test/default-project-asset-integrity.test.mjs records that, with its cause).
 * Asserting on ids here would fail for a reason that has nothing to do with
 * whether the artwork survived.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const SHOTS = path.resolve('artifacts/costume-roundtrip');
const work = mkdtempSync(path.join(tmpdir(), 'bw-costume-'));
const saved = path.join(work, 'costume-roundtrip.sb3');

let failed = 0;
const record = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed++;
};

await mkdir(SHOTS, {recursive: true});
const {chromium} = await import('playwright');
const browser = await chromium.launch();
const errors = [];

const open = async () => {
    const page = await browser.newPage({viewport: {width: 1600, height: 1000}, acceptDownloads: true});
    page.on('pageerror', e => errors.push(`pageerror: ${e && e.message}`));
    page.on('crash', () => errors.push('THE RENDERER CRASHED'));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('bw-starter-v1-complete', '1');
        } catch { /* private mode */ }
        const probe = window.__BW_PAINT_PERF__ = {longTasks: []};
        if (typeof PerformanceObserver === 'function') {
            try {
                probe.observer = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) {
                        probe.longTasks.push({at: entry.startTime, ms: entry.duration});
                    }
                });
                probe.observer.observe({entryTypes: ['longtask']});
            } catch { /* unsupported browsers retain an empty long-task receipt */ }
        }
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForFunction(() => {
        const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
        if (!vm?.runtime) return false;
        window.__vm = vm;
        return true;
    }, null, {timeout: 60000});
    return page;
};

/** Costume identity by CONTENT (FNV-1a over asset.data), never by declared id. */
const costumes = page => page.evaluate(() => {
    const hash = bytes => {
        let h = 0x811c9dc5;
        for (let i = 0; i < bytes.length; i++) {
            h ^= bytes[i];
            h = (h * 0x01000193) >>> 0;
        }
        return h.toString(16).padStart(8, '0');
    };
    return (window.__vm.editingTarget?.getCostumes?.() || []).map(c => {
        const d = c.asset && c.asset.data;
        return {
            name: c.name,
            fmt: c.dataFormat,
            bytes: d ? d.length : null,
            content: d ? hash(d) : null
        };
    });
});

const openCostumesTab = async page => {
    const startedAt = await page.evaluate(() => performance.now());
    await page.locator('[role="tab"]', {hasText: /Costume|Kost/}).first().click();
    // The paint editor loads as a lazy chunk, so the condition is "the canvas is
    // on screen", not "three seconds have passed".
    await page.locator('canvas:visible').last().waitFor({state: 'visible', timeout: 30000});
    return page.evaluate(start => new Promise(resolve => requestAnimationFrame(() =>
        requestAnimationFrame(() => {
            const readyAt = performance.now();
            const probe = window.__BW_PAINT_PERF__;
            for (const entry of probe?.observer?.takeRecords?.() || []) {
                probe.longTasks.push({at: entry.startTime, ms: entry.duration});
            }
            resolve({
                startedAt: start,
                readyAt,
                durationMs: readyAt - start,
                activationLongTasks: (probe?.longTasks || [])
                    .filter(task => task.at >= start && task.at < readyAt)
            });
        }))), startedAt);
};

const contentHash = page => page.evaluate(() => {
    const c = (window.__vm.editingTarget?.getCostumes?.() || [])[0];
    const d = c && c.asset && c.asset.data;
    if (!d) return null;
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) { h ^= d[i]; h = (h * 0x01000193) >>> 0; }
    return h.toString(16);
});

const drawRect = async (page, box, from, to) => {
    const before = await contentHash(page);
    await page.locator('[aria-label="Rectangle"], [title="Rectangle"]').first().click();
    await page.mouse.move(box.x + box.width * from, box.y + box.height * from);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to, box.y + box.height * to, {steps: 12});
    await page.mouse.up();
    // The costume asset is rewritten when the stroke commits. Wait for THAT,
    // not for a guess at how long paper.js takes.
    await page.waitForFunction(prev => {
        const c = (window.__vm.editingTarget?.getCostumes?.() || [])[0];
        const d = c && c.asset && c.asset.data;
        if (!d) return false;
        let h = 0x811c9dc5;
        for (let i = 0; i < d.length; i++) { h ^= d[i]; h = (h * 0x01000193) >>> 0; }
        return h.toString(16) !== prev;
    }, before, {timeout: 30000});
};

try {
    // ── author artwork in both paint modes ──────────────────────────────
    let page = await open();
    const paintPerformance = await openCostumesTab(page);
    await writeFile(path.join(SHOTS, 'paint-performance.json'), `${JSON.stringify({
        schema: 'brickwright/paint-first-costume-baseline/v1',
        url,
        userAgent: await page.evaluate(() => navigator.userAgent),
        ...paintPerformance
    }, null, 2)}\n`);
    console.log(`MEASURE: first Costume became interactive in ${paintPerformance.durationMs.toFixed(1)} ms; ` +
        `${paintPerformance.activationLongTasks.length} activation long task(s)`);
    const start = await costumes(page);
    record('the paint editor opened on the shipped costumes', start.length > 0,
        start.map(c => `${c.name}:${c.fmt}`).join(', '));

    const box = await page.locator('canvas:visible').last().boundingBox();
    record('the paint canvas is on screen', !!box,
        box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no visible canvas');

    await drawRect(page, box, 0.35, 0.60);
    const drawn = await costumes(page);
    record('drawing in VECTOR mode changed the costume content',
        drawn[0] && start[0] && drawn[0].content !== start[0].content,
        `${start[0]?.content} -> ${drawn[0]?.content}`);

    const convert = page.getByText(/Convert to Bitmap/i).first();
    const convertible = await convert.count() > 0;
    if (convertible) {
        await convert.click();
        await page.waitForFunction(() => {
            const c = (window.__vm.editingTarget?.getCostumes?.() || [])[0];
            return c && c.dataFormat === 'png';
        }, null, {timeout: 30000});
        await drawRect(page, box, 0.45, 0.70);
    }
    const authored = await costumes(page);
    record('the costume converts to BITMAP and is still drawable',
        convertible ? authored[0].fmt === 'png' : true,
        convertible ? `dataFormat=${authored[0].fmt}, ${authored[0].bytes} bytes`
            : 'no Convert control in this build — skipped');
    await page.screenshot({path: path.join(SHOTS, '01-authored.png'), fullPage: true});

    // ── save ────────────────────────────────────────────────────────────
    await page.getByText('File', {exact: true}).click();
    const download = page.waitForEvent('download', {timeout: 60000});
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await download).saveAs(saved);
    record('Save to your computer produced a file and the app stayed up',
        errors.length === 0, errors.join(' | ') || saved);

    // ── reopen in a FRESH session and load it back ──────────────────────
    await page.close();
    page = await open();
    await page.getByText('File', {exact: true}).click();
    await page.getByText('Load from your computer', {exact: true}).click();
    await page.locator('body > input[type="file"][accept=".sb,.sb2,.sb3"]').setInputFiles(saved);
    // The load is done when the costumes are back and carry their asset bytes —
    // which is precisely what the checks below read.
    await page.waitForFunction(n => {
        const cs = window.__vm.editingTarget?.getCostumes?.() || [];
        return cs.length === n && cs.every(c => c.asset && c.asset.data && c.asset.data.length);
    }, authored.length, {timeout: 60000});
    await openCostumesTab(page);
    const reloaded = await costumes(page);
    await page.screenshot({path: path.join(SHOTS, '02-reloaded.png'), fullPage: true});

    record('every costume came back', reloaded.length === authored.length,
        `${authored.length} -> ${reloaded.length}`);
    record('each costume kept its name and paint mode',
        JSON.stringify(reloaded.map(c => [c.name, c.fmt])) ===
        JSON.stringify(authored.map(c => [c.name, c.fmt])),
        reloaded.map(c => `${c.name}:${c.fmt}`).join(', '));
    record('the ARTWORK survived byte-for-byte, both modes',
        JSON.stringify(reloaded.map(c => c.content)) ===
        JSON.stringify(authored.map(c => c.content)),
        `${authored.map(c => c.content).join(',')} -> ${reloaded.map(c => c.content).join(',')}`);
    record('no renderer crash and no uncaught page errors across the whole trip',
        errors.length === 0, errors.join(' | ') || 'clean');
} catch (e) {
    record('the round trip ran to completion', false, e && e.message);
} finally {
    await browser.close();
}

console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'}`);
console.log(`screenshots: ${SHOTS}`);
process.exit(failed ? 1 : 0);
