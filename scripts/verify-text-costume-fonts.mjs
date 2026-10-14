#!/usr/bin/env node
/**
 * The render fonts arrive with the first SVG that has text — not before.
 *
 * ROADMAP §2.4. scratch-render-fonts (seven faces, 1.34 MB of base64) used to
 * be in the boot chunk, then in a chunk fetched at boot; now nothing fetches it
 * until an SVG with a font-family needs rasterising. Two claims, both asserted:
 *
 *   1. A fresh load of the default project requests no render-fonts chunk.
 *      (verify-first-load-weight sees the bytes; this names the file.)
 *   2. A project whose costume is an SVG with <text font-family="Sans Serif">
 *      is rasterised WITH its @font-face inlined — which means SVGSkin waited
 *      for the chunk (scripts/apply-render-overlay.mjs) rather than drawing a
 *      fallback face. Checked on the skin's own data URI, not on pixels:
 *      headless keeps the stage canvas at 0x0, so a screenshot shows nothing
 *      either way.
 *
 * Service workers are blocked for the same reason as in
 * verify-lazy-extension-degradation.mjs: sw.js claims the page during the
 * load, and Chromium does not surface worker-originated requests to the page,
 * so the fetch we are counting would become invisible.
 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

// jszip is a dependency of the GUI package, not of the repo root; resolve it from there
// the way verify-lazy-extension-degradation.mjs does.
const requireFromGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const JSZip = requireFromGui('jszip');

const url = process.env.PROOF_URL || 'http://localhost:8617/';
const FONT_CHUNK = /\/chunks\/[^/]*render-fonts[^/]*\.js$/;
const TEXT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">' +
    '<text x="4" y="28" font-family="Sans Serif" font-size="24" fill="#333">Hello</text></svg>';

let failed = 0;
const record = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' — ' + detail : ''}`);
    if (!ok) failed++;
};
const dir = await mkdtemp(path.join(tmpdir(), 'bw-text-fonts-'));
const savedPath = path.join(dir, 'saved.sb3');
const fixturePath = path.join(dir, 'text-costume.sb3');

const browser = await chromium.launch({headless: true});
const newPage = async () => {
    const context = await browser.newContext({viewport: {width: 1280, height: 900},
        acceptDownloads: true, serviceWorkers: 'block'});
    const page = await context.newPage();
    await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
    });
    const fontRequests = [];
    page.on('response', res => {
        if (FONT_CHUNK.test(res.url())) fontRequests.push(`${res.request().method()} ${res.status()}`);
    });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    return {context, page, fontRequests, pageErrors};
};
const waitForVM = page => page.waitForFunction(() => {
    const vm = window.__brickwrightStore?.getState?.()?.scratchGui?.vm;
    if (!vm?.runtime) return false;
    window.__vm = vm;
    return true;
}, null, {timeout: 60000});

try {
    // 1. Fresh load, default project: no fonts.
    let {context, page, fontRequests, pageErrors} = await newPage();
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await waitForVM(page);
    await page.waitForFunction(() => document.querySelectorAll('[role="tab"]').length > 0, null, {timeout: 60000});
    await page.waitForLoadState('networkidle', {timeout: 20000}).catch(() => {});
    record('a fresh load fetches no render-fonts chunk', fontRequests.length === 0,
        fontRequests.length ? fontRequests.join(', ') : 'the default project has no text');
    record('the shim reports the faces absent at first paint',
        await page.evaluate(() => !document.getElementById('scratch-font-styles')),
        'no #scratch-font-styles in the document');

    // Save the app's own project so the fixture has genuine assets around the one we add.
    await page.getByText('File', {exact: true}).click();
    const downloadPromise = page.waitForEvent('download', {timeout: 30000});
    await page.getByText('Save to your computer', {exact: true}).click();
    await (await downloadPromise).saveAs(savedPath);
    await context.close();

    // 2. Give the sprite an SVG costume with text and make it current.
    const zip = await JSZip.loadAsync(await readFile(savedPath));
    const project = JSON.parse(await zip.file('project.json').async('text'));
    const sprite = project.targets.find(target => !target.isStage);
    if (!sprite) throw new Error('saved project has no sprite');
    const md5 = createHash('md5').update(TEXT_SVG).digest('hex');
    zip.file(`${md5}.svg`, TEXT_SVG);
    sprite.costumes.push({assetId: md5, name: 'hello text', bitmapResolution: 1, md5ext: `${md5}.svg`,
        dataFormat: 'svg', rotationCenterX: 60, rotationCenterY: 20});
    sprite.currentCostume = sprite.costumes.length - 1;
    zip.file('project.json', JSON.stringify(project));
    await writeFile(fixturePath, await zip.generateAsync({type: 'nodebuffer'}));

    // 3. Load it: the skin must wait for the chunk and inline the @font-face.
    ({context, page, fontRequests, pageErrors} = await newPage());
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 60000});
    await waitForVM(page);
    await page.getByText('File', {exact: true}).click();
    const chooserPromise = page.waitForEvent('filechooser', {timeout: 30000});
    await page.getByText('Load from your computer', {exact: true}).click();
    (await chooserPromise).setFiles(fixturePath);

    const skinState = () => page.evaluate(() => {
        const vm = window.__vm;
        const target = (vm.runtime.targets || []).find(t => !t.isStage && t.isOriginal);
        if (!target) return {reason: 'no sprite target yet'};
        const costume = target.getCostumes()[target.currentCostume];
        if (!costume || costume.name !== 'hello text') return {reason: `current costume is ${costume && costume.name}`};
        const skin = vm.runtime.renderer && vm.runtime.renderer._allSkins[costume.skinId];
        if (!skin || !skin._svgImage) return {reason: 'skin not created yet'};
        const src = decodeURIComponent(skin._svgImage.src || '');
        return {
            loaded: Boolean(skin._svgImageLoaded),
            hasFontFace: src.includes('@font-face') && src.includes('Sans Serif'),
            waiting: Boolean(skin._bwFontWait)
        };
    });
    // Wait for the FIXTURE's costume to be current and rasterised — not for
    // whatever skin the default project already had loaded, which is what a
    // bare "skin loaded" wait returns immediately.
    await page.waitForFunction(() => {
        const vm = window.__vm;
        const target = (vm.runtime.targets || []).find(t => !t.isStage && t.isOriginal);
        const costume = target && target.getCostumes()[target.currentCostume];
        if (!costume || costume.name !== 'hello text') return false;
        const skin = vm.runtime.renderer && vm.runtime.renderer._allSkins[costume.skinId];
        return Boolean(skin && skin._svgImageLoaded);
    }, null, {timeout: 60000}).catch(() => { /* reported below with the reason */ });
    const state = await skinState();
    record('loading a text costume fetched the render-fonts chunk', fontRequests.length > 0,
        fontRequests.join(', ') || 'never requested — SVGSkin did not wait (apply-render-overlay.mjs?)');
    record('the text costume was rasterised with its @font-face inlined', state.hasFontFace === true,
        JSON.stringify(state));
    record('the faces are in the document afterwards',
        await page.evaluate(() => Boolean(document.getElementById('scratch-font-styles'))),
        '#scratch-font-styles present');

    // 4. The costumes tab wants the faces for the paint editor's text tool.
    await page.getByRole('tab', {name: /Costumes/}).click();
    const loadedFace = await page.evaluate(async () => {
        await document.fonts.load('12px "Sans Serif"');
        return [...document.fonts].some(face => face.family.replace(/"/g, '') === 'Sans Serif' && face.status === 'loaded');
    });
    record('the paint editor has the Sans Serif face loaded', loadedFace, 'document.fonts status');
    record('no uncaught page errors across the whole trip', pageErrors.length === 0, pageErrors.join(' | ') || 'clean');
    await context.close();
} finally {
    await browser.close();
}
console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
