// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Parts from the whole LDraw catalogue in the shipped build (the palette's "+",
// docs/ROBOT-LAB-ARCHITECTURE.md §5.4.1), for scripts/verify-sim-lab-browser.mjs
// (--part=editor). The ldraw-stl mirror is served by Playwright from
// ldraw-catalogue-fixture.mjs (the vendored files plus parts only the catalogue has),
// so the gate needs no network. Through clicks and typing only:
//
//   1. "+" opens the catalogue; searching finds a part the app does not ship; "Add"
//      derives it, arms it, and a click in the view places it;
//   2. a sticker (nothing to connect to) is added as decoration (the note says why) and
//      both added parts sit in "My parts"; an alias is not offered;
//   3. the catalogue view's credits name the added files' author and licence;
//   4. the catalogue files come from the mirror, and static/ldraw/ is never asked
//      for a file it does not vendor;
//   5. a model holding both added parts simulates (the decoration is a free body);
//   6. after a reload both parts are still in the palette, before "+" is opened;
//   7. catalogue results show a picture of each part, drawn from the mirror's files;
//   8. "My parts" removes a part, but not while the model in Build holds it.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {CATALOGUE_ONLY, vendoredLDraw, buildCatalogueFixture} from './ldraw-catalogue-fixture.mjs';
import {openRobotLabTab} from './sim-lab-toolbar-gate.mjs';

const MIRROR = 'https://crispstrobe.github.io/ldraw-stl/library/';

const routeMirror = async (page, served, log) => {
    await page.route(`${MIRROR}**`, async route => {
        const file = route.request().url().slice(MIRROR.length);
        const body = served.get(file);
        log.push(file);
        const cors = {'Access-Control-Allow-Origin': '*'};
        if (!body) return route.fulfill({status: 404, headers: cors, body: ''});
        const range = /bytes=(\d+)-(\d+)/.exec(route.request().headers().range || '');
        if (!range) return route.fulfill({status: 200, headers: cors, body});
        const [s, e] = [Number(range[1]), Number(range[2])];
        return route.fulfill({status: 206, headers: {...cors, 'Content-Range': `bytes ${s}-${e}/${body.length}`}, body: body.subarray(s, e + 1)});
    });
};

const lab = (page, fn, arg) => page.evaluate(fn, arg);

const enterBuild = async page => {
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
};

const addFromCatalogue = async (page, query, part) => {
    await page.getByTestId('bw-sim-lab-catalogue-open').click();
    const search = page.getByTestId('bw-sim-lab-catalogue-search');
    await search.fill(query);
    const add = page.getByTestId(`bw-sim-lab-catalogue-add-${part}`);
    await add.waitFor({timeout: 30000});
    await add.click();
    const note = page.getByTestId('bw-sim-lab-catalogue-note');
    await note.waitFor({timeout: 30000});
    return note.textContent();
};

export const catalogueInteractions = async (page, {root, shotsDir}) => {
    try {
        return await checks(page, {root, shotsDir});
    } catch (error) {
        await page.screenshot({path: resolve(shotsDir, 'sim-lab-catalogue-failure.png'), fullPage: true}).catch(() => {});
        throw error;
    }
};

const checks = async (page, {root, shotsDir}) => {
    const out = {};
    const all = new Map([...vendoredLDraw(resolve(root, 'overlay/scratch-gui/static/ldraw')), ...Object.entries(CATALOGUE_ONLY)]);
    const {served} = buildCatalogueFixture(all);
    const mirrorLog = [];
    const localAsks = [];
    page.on('request', r => { if (/\/static\/ldraw\/(parts|p)\//.test(r.url())) localAsks.push(r.url()); });
    await routeMirror(page, served, mirrorLog);
    await enterBuild(page);
    await lab(page, () => {
        const ed = window.__bwSimLab.editor;
        if (ed.model.parts.length) ed.apply({type: 'batch', commands: ed.model.parts.map(p => ({type: 'delete', id: p.id}))});
    });

    // 1. A part the app does not ship: found, added, armed, placed by a click.
    assert.equal(await lab(page, () => window.__bwSimLab._pane.lib.CATALOG.has('zz-brick.dat')), false);
    const added = await addFromCatalogue(page, 'zz brick', 'zz-brick.dat');
    assert.match(added, /added\. Click in the view/);
    await page.waitForFunction(() => window.__bwSimLab._pane.state.placing === 'zz-brick.dat');
    const box = await page.getByTestId('bw-sim-lab-editor-canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
    await page.waitForFunction(() => window.__bwSimLab.editor.model.parts.some(p => p.part === 'zz-brick.dat'), null, {timeout: 10000});
    const meta = await lab(page, () => window.__bwSimLab._pane.lib.CATALOG.get('zz-brick.dat'));
    assert.ok(meta.connectors.some(c => c.type === 'stud'), 'the added brick has studs');
    out.brickConnectors = meta.connectors.length;
    await page.getByTestId('bw-sim-lab-editor-canvas').focus();
    await page.keyboard.press('Escape');

    // 2. A sticker becomes decoration; an alias is not offered.
    const deco = await addFromCatalogue(page, 'zz sticker', 'zz-sticker.dat');
    assert.match(deco, /decoration/);
    const mine = page.getByTestId('bw-sim-lab-category-mine');
    await mine.waitFor();
    for (const part of ['zz-brick.dat', 'zz-sticker.dat']) await mine.getByTestId(`bw-sim-lab-part-${part}`).waitFor();
    await page.getByTestId('bw-sim-lab-catalogue-open').click();
    await page.getByTestId('bw-sim-lab-catalogue-search').fill('moved 3001');
    assert.equal(await page.getByTestId('bw-sim-lab-catalogue-add-zz-alias.dat').count(), 0, 'an alias is not offered');

    // 3. Credits for the added parts.
    const credits = page.getByTestId('bw-sim-lab-catalogue-credits');
    await credits.locator('summary').click();
    const creditText = await credits.textContent();
    assert.match(creditText, /parts\/zz-brick\.dat — Test Author \[tester\] — Licensed under CC BY 4\.0/);
    assert.match(creditText, /parts\/zz-sticker\.dat/);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-catalogue.png')});
    await page.getByTestId('bw-sim-lab-catalogue-back').click();

    // 4. Catalogue files from the mirror by range requests; nothing asked of static/ldraw that it lacks.
    assert.ok(mirrorLog.includes('manifest.json') && mirrorLog.includes('files.json') && mirrorLog.includes('catalog.json'));
    assert.ok(mirrorLog.some(f => /\.zip\.\d+$/.test(f)), 'part files came from the chunks');
    assert.deepEqual(localAsks.filter(u => /zz-/.test(u)), [], 'static/ldraw was not asked for catalogue parts');

    // 5. The decoration in a model that simulates.
    await lab(page, () => {
        window.__bwSimLab.editor.apply({type: 'place', part: 'zz-sticker.dat', position: [60, -40, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], color: 4});
    });
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode !== 'build' && ['ready', 'failed'].includes(window.__bwSimLab.status), null, {timeout: 60000});
    const sim = await lab(page, () => ({status: window.__bwSimLab.status, issues: window.__bwSimLab.issues.map(i => i.message || String(i))}));
    assert.equal(sim.status, 'ready', `simulate: ${JSON.stringify(sim)}`);
    assert.ok(!sim.issues.some(m => /zz-(sticker|brick)/.test(m)), `no issue about the added parts: ${JSON.stringify(sim.issues)}`);
    out.simulated = true;

    // 6. After a reload the added parts are still there. (The gate's page clears localStorage on every
    // load; an init script added after that one puts the stored parts back, as a returning learner has them.)
    const stored = await lab(page, () => localStorage.getItem('bw-sim-catalog-parts'));
    assert.ok(stored && stored.includes('zz-sticker.dat'));
    await page.addInitScript(value => localStorage.setItem('bw-sim-catalog-parts', value), stored);
    await page.reload({waitUntil: 'domcontentloaded'});
    await openRobotLabTab(page);
    await page.waitForFunction(() => window.__bwSimLab && ['ready', 'failed'].includes(window.__bwSimLab.status), null, {timeout: 60000});
    assert.ok(await lab(page, () => window.__bwSimLab._pane.lib.CATALOG.has('zz-sticker.dat') && window.__bwSimLab._pane.lib.CATALOG.has('zz-brick.dat')));
    await enterBuild(page);
    await page.getByTestId('bw-sim-lab-category-mine').getByTestId('bw-sim-lab-part-zz-sticker.dat').waitFor();
    out.persisted = true;
    out.chunkRequests = mirrorLog.filter(f => /\.zip\.\d+$/.test(f)).length;

    // 7. Pictures in the catalogue results (the palette draws pictures here, so results get them too).
    if (await lab(page, () => Boolean(window.__bwSimLab._pane.thumbs))) {
        await page.getByTestId('bw-sim-lab-catalogue-open').click();
        await page.getByTestId('bw-sim-lab-catalogue-search').fill('zz');
        await page.getByTestId('bw-sim-lab-catalogue-results').waitFor({timeout: 30000});
        await page.getByTestId('bw-sim-lab-catalogue-thumb').first().waitFor({timeout: 30000});
        const src = await page.getByTestId('bw-sim-lab-catalogue-thumb').first().getAttribute('src');
        assert.match(src, /^data:image\//, 'a result picture is a drawn image');
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="bw-sim-lab-catalogue-thumb"]').length >= 2, null, {timeout: 30000});
        out.resultPictures = await page.getByTestId('bw-sim-lab-catalogue-thumb').count();
        await page.screenshot({path: resolve(shotsDir, 'sim-lab-catalogue-pictures.png')});
        await page.getByTestId('bw-sim-lab-catalogue-back').click();
    }

    // 8. Remove from "My parts": refused while the model holds the part, done once it does not.
    await lab(page, () => window.__bwSimLab.editor.apply({type: 'place', part: 'zz-brick.dat', position: [0, -24, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], color: 4}));
    await page.getByTestId('bw-sim-lab-mine-remove-zz-brick.dat').click();
    assert.match(await page.getByTestId('bw-sim-lab-catalogue-note').textContent(), /in this model/);
    assert.ok(await lab(page, () => window.__bwSimLab._pane.lib.CATALOG.has('zz-brick.dat')), 'a part in use stays');
    await lab(page, () => {
        const ed = window.__bwSimLab.editor;
        ed.apply({type: 'batch', commands: ed.model.parts.filter(p => p.part === 'zz-brick.dat').map(p => ({type: 'delete', id: p.id}))});
    });
    await page.getByTestId('bw-sim-lab-mine-remove-zz-brick.dat').click();
    await page.waitForFunction(() => !window.__bwSimLab._pane.lib.CATALOG.has('zz-brick.dat'));
    assert.equal(await page.getByTestId('bw-sim-lab-part-zz-brick.dat').count(), 0, 'its tile is gone');
    assert.ok(!(await lab(page, () => localStorage.getItem('bw-sim-catalog-parts') || '')).includes('zz-brick.dat'), 'and it is gone from this device');
    await page.getByTestId('bw-sim-lab-category-mine').getByTestId('bw-sim-lab-part-zz-sticker.dat').waitFor();
    out.removed = true;
    return out;
};
