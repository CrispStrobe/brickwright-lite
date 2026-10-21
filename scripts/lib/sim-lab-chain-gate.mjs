// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Chains and treads round gears (editor/chain-path.js, kinds/chain.js, docs/ROBOT-LAB-UX.md §11) for
// scripts/verify-sim-lab-browser.mjs `--part=editor`, by the properties panel's button.
// Internal APIs lay out the parts (set-up), select them as a click would, and READ the
// results (the model, the status line, the compiled mechanism).
//
// Fixture: the gear bench of test/fixtures/bw-sim/gears/8-24.json (an 8T on the medium motor's
// output, a beam pinned under the housing) with the 24T's axle in the beam's end hole, 60 LDU
// out: the gears do not mesh.
//
//   1. both gears selected, "Chain or tread round" lays a closed chain of links in one undo step
//      and selects it; Ctrl+Z takes it all away, the button lays it again;
//   2. in Simulate the compiled mechanism couples the two gears' hinges by the chain (the 24T
//      the motor's way, 3 to 1), with no chain warning;
//   3. two gears too close for a chain: refused, nothing placed;
//   4. two tread sprockets on a beam: the same button lays a tread round them; in Simulate they
//      turn together, and each is a wheel of the tread's outer radius (it carries the frame);
//   5. a rubber band round the 8T and the 24T: "Rubber band round" picks the 26 mm band and draws
//      it; Simulate drives the 24T by it (a 'band' coupling); "Take off rubber band" removes it, Ctrl+Z
//      puts it back;
//   6. a winch: a bush on an axle in a beam, a brick below; drum then hook selected, "Tie a rope" ties
//      them taut and draws the rope; Simulate makes it a 'rope' on the drum's hinge;
//   7. pneumatics: a valve with an axle in its lever and a 1 x 11 cylinder; "Connect a hose" twice
//      hoses both valve outlets to the cylinder's two ports and draws them; Simulate makes it a
//      'pneumatic' coupling on the valve's hinge.

import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const UP = [0, 1, 0, 1, 0, 0, 0, 0, -1];
const FLAT = [1, 0, 0, 0, 0, 1, 0, -1, 0];
const lab = (page, fn, arg) => page.evaluate(fn, arg);
const statusText = page => page.getByTestId('bw-sim-lab-build-status').textContent();
const count = (page, part) => lab(page, p => window.__bwSimLab.editor.model.parts.filter(x => x.part === p).length, part);
const select = (page, ids) => lab(page, s => window.__bwSimLab.editView.select(s), ids);
const waitKind = (page, kind) => page.waitForFunction(k => document.querySelector('[data-testid="bw-sim-lab-build-status"]')?.dataset.kind === k, kind, {timeout: 10000});

/** Set-up: the model emptied, then `list` placed ([part, position, rotation]); returns their ids. */
const layOut = (page, list) => lab(page, l => {
    const ed = window.__bwSimLab.editor;
    if (ed.model.parts.length) ed.apply({type: 'batch', commands: ed.model.parts.map(p => ({type: 'delete', id: p.id}))});
    const ids = [];
    for (const [part, position, rotation] of l) {
        ed.apply({type: 'place', part, position, rotation, color: 71});
        ids.push(ed.model.parts.at(-1).id);
    }
    window.__bwSimLab.editView.select([]);
    return ids;
}, list);

const bench = x24 => [
    ['54696p01.dat', [0, 0, 0], I], ['4519.dat', [0, -60, 0], UP], ['3647.dat', [0, -60, 0], FLAT],
    ['32524.dat', [0, 40, 0], [0, 0, 1, 0, 1, 0, -1, 0, 0]], ['2780.dat', [20, 30, 0], UP], ['2780.dat', [-20, 30, 0], UP],
    ['3707.dat', [x24, -10, 0], UP], ['3648.dat', [x24, -60, 0], FLAT]];

const openProperties = async page => {
    const panel = page.getByTestId('bw-sim-lab-properties-panel');
    if (!(await panel.isVisible())) {
        const button = page.getByTestId('bw-sim-lab-properties');
        if (!(await button.isVisible())) await page.getByTestId('bw-sim-lab-more').click();
        await button.click();
    }
    await panel.waitFor();
};

export const chainInteractions = async (page, {shotsDir}) => {
    try {
        return await checks(page, {shotsDir});
    } catch (error) {
        await page.screenshot({path: resolve(shotsDir, 'sim-lab-chain-failure.png'), fullPage: true}).catch(() => {});
        throw error;
    }
};

const checks = async (page, {shotsDir}) => {
    const out = {};
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);

    // 1. The chain, one undo step.
    const ids = await layOut(page, bench(60));
    const [g8, g24] = [ids[2], ids[7]];
    await lab(page, () => window.__bwSimLab.editView.frameModel());
    await select(page, [g8, g24]);
    await openProperties(page);
    await page.getByTestId('bw-sim-lab-prop-chain').click();
    await waitKind(page, 'chained');
    const links = await count(page, '3711.dat');
    assert.ok(links >= 14 && links <= 18, `a chain of ${links} links round an 8T and a 24T 60 LDU apart`);
    assert.match(await statusText(page), new RegExp(`A chain of ${links} links round 2 gears`));
    assert.equal((await lab(page, () => window.__bwSimLab.editView.selection)).length, links, 'the new links are selected');
    assert.equal(await lab(page, () => window.__bwSimLab._pane.state.recent[0]), '3711.dat', 'Recently used: the chain link');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-chain.png')});
    await page.getByTestId('bw-sim-lab-editor-canvas').focus();
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => !window.__bwSimLab.editor.model.parts.some(p => p.part === '3711.dat'));
    assert.equal(await count(page, '3711.dat'), 0, 'Ctrl+Z takes the whole chain away');
    await select(page, [g8, g24]);
    await page.getByTestId('bw-sim-lab-prop-chain').click();
    await waitKind(page, 'chained');
    assert.equal(await count(page, '3711.dat'), links);
    out.links = links;

    // 2. Simulate: the chain couples the gears.
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session,
        null, {timeout: 60000});
    const mech = await lab(page, () => {
        const m = window.__bwSimLab._pane.session.mechanism;
        return {chains: m.couplings.filter(c => c.kind === 'chain'), codes: (m.diagnostics || []).map(d => d.code)};
    });
    assert.equal(mech.chains.length, 1, `one chain coupling: ${JSON.stringify(mech)}`);
    assert.ok(Math.abs(Math.abs(mech.chains[0].ratio) - 3) < 1e-9 || Math.abs(Math.abs(mech.chains[0].ratio) - 1 / 3) < 1e-9, `8:24 ${mech.chains[0].ratio}`);
    assert.ok(!mech.codes.some(c => c.startsWith('chain')), `no chain warning: ${mech.codes}`);
    out.ratio = mech.chains[0].ratio;

    // 3. Too close: refused, nothing placed.
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
    const near = await layOut(page, bench(40));
    await select(page, [near[2], near[7]]);
    await openProperties(page);
    await page.getByTestId('bw-sim-lab-prop-chain').click();
    await page.waitForFunction(() => /too close for a chain/.test(document.querySelector('[data-testid="bw-sim-lab-build-status"]')?.textContent || ''),
        null, {timeout: 10000});
    assert.equal(await count(page, '3711.dat'), 0, 'a refused chain places nothing');

    // 4. A tread round two sprockets.
    const tracks = await layOut(page, [
        ['32524.dat', [0, 0, 0], [0, 1, 0, -1, 0, 0, 0, 0, 1]], ['3707.dat', [30, 0, -60], I], ['3707.dat', [30, 0, 60], I],
        ['57519.dat', [40, 0, -60], [0, 0, 1, 0, 1, 0, -1, 0, 0]], ['57519.dat', [40, 0, 60], [0, 0, 1, 0, 1, 0, -1, 0, 0]]]);
    await lab(page, () => window.__bwSimLab.editView.frameModel());
    await select(page, [tracks[3], tracks[4]]);
    await openProperties(page);
    await page.getByTestId('bw-sim-lab-prop-chain').click();
    await page.waitForFunction(() => /A tread of \d+ links round 2 sprocket wheels/.test(document.querySelector('[data-testid="bw-sim-lab-build-status"]')?.textContent || ''),
        null, {timeout: 10000});
    out.treadLinks = await count(page, '57518.dat');
    assert.equal(out.treadLinks, 18, 'a tread of 18 links round two sprockets 120 LDU apart');
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-tread.png')});
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session,
        null, {timeout: 60000});
    const treadMech = await lab(page, ids => {
        const m = window.__bwSimLab._pane.session.mechanism;
        const wheels = ids.map(id => m.bodies.find(b => b.parts.includes(id)).colliders.filter(c => c.shape === 'cylinder').map(c => c.radius));
        return {chains: m.couplings.filter(c => c.kind === 'chain').map(c => c.ratio), wheels};
    }, [tracks[3], tracks[4]]);
    assert.deepEqual(treadMech.chains.map(r => Math.abs(r)), [1], `the sprockets turn together: ${JSON.stringify(treadMech)}`);
    const outer = (15 / Math.sin(Math.PI / 10) + 14) * 0.0004;
    for (const w of treadMech.wheels) assert.ok(w.some(r => Math.abs(r - outer) < 1e-6), `a wheel of the tread's outer radius: ${w}`);

    // 5. A rubber band.
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
    const banded = await layOut(page, bench(60));
    await lab(page, () => window.__bwSimLab.editView.frameModel());
    await select(page, [banded[2], banded[7]]);
    await openProperties(page);
    await page.getByTestId('bw-sim-lab-prop-band').click();
    await waitKind(page, 'banded');
    assert.match(await statusText(page), /A 26 mm rubber band round them, stretched 1\.\d times/);
    assert.deepEqual(await lab(page, () => window.__bwSimLab.editor.model.belts.map(b => b.band)), ['85545.dat']);
    await page.waitForFunction(() => window.__bwSimLab.editView.debug.bands() === 1);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-band.png')});
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session,
        null, {timeout: 60000});
    const beltKinds = await lab(page, () => window.__bwSimLab._pane.session.mechanism.couplings.map(c => c.kind));
    assert.ok(beltKinds.includes('band'), `a band drive: ${beltKinds}`);
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
    await select(page, [banded[2]]);
    await openProperties(page);
    await page.getByTestId('bw-sim-lab-prop-band-off').click();
    await waitKind(page, 'unbanded');
    await page.waitForFunction(() => !window.__bwSimLab.editor.model.belts && window.__bwSimLab.editView.debug.bands() === 0);
    await page.getByTestId('bw-sim-lab-editor-canvas').focus();
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => window.__bwSimLab.editor.model.belts?.length === 1 && window.__bwSimLab.editView.debug.bands() === 1);
    out.band = '26 mm';

    // 6. A rope from a drum to a hook.
    const winch = await layOut(page, [
        ['32524.dat', [0, 0, 0], [0, 1, 0, -1, 0, 0, 0, 0, 1]], ['3707.dat', [60, 0, 0], I],
        ['3713.dat', [50, 0, 0], [0, 0, 1, 0, 1, 0, -1, 0, 0]], ['3001.dat', [50, 200, 0], I]]);
    await lab(page, () => window.__bwSimLab.editView.frameModel());
    await select(page, [winch[2], winch[3]]);
    await openProperties(page);
    await page.getByTestId('bw-sim-lab-prop-rope').click();
    await waitKind(page, 'roped');
    assert.match(await statusText(page), /A rope [\d.,]+ cm long from the drum to the hook/);
    assert.deepEqual(await lab(page, () => window.__bwSimLab.editor.model.ropes.map(r => r.around)), [[winch[2], winch[3]]]);
    await page.waitForFunction(() => window.__bwSimLab.editView.debug.ropes() === 1);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-rope.png')});
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session,
        null, {timeout: 60000});
    const ropeC = await lab(page, () => window.__bwSimLab._pane.session.mechanism.couplings.filter(c => c.kind === 'rope').map(c => ({drum: c.drumJoint, parts: c.parts})));
    assert.equal(ropeC.length, 1, JSON.stringify(ropeC));
    assert.ok(ropeC[0].drum, 'the rope winds on the drum\'s hinge');
    out.rope = true;

    // 7. A valve hosed to a cylinder.
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'build' && window.__bwSimLab.status === 'ready' && window.__bwSimLab.editView);
    const air = await layOut(page, [
        ['19474-f1.dat', [0, 0, 0], I], ['4519.dat', [0, 0, 0], I],
        ['u9145c01.dat', [100, 0, 0], I], ['21828c01.dat', [100, -200, 0], I]]);
    await lab(page, () => window.__bwSimLab.editView.frameModel());
    await select(page, [air[0], air[2]]);
    await openProperties(page);
    for (let i = 0; i < 2; i++) {
        await page.getByTestId('bw-sim-lab-prop-hose').click();
        await page.waitForFunction(n => window.__bwSimLab.editor.model.hoses?.length === n, i + 1);
    }
    assert.match(await statusText(page), /A hose from the valve's outlet [AB] to the cylinder's (push-out|pull-in) port/);
    const hoses = await lab(page, () => window.__bwSimLab.editor.model.hoses.map(h => [h.a.port, h.b.port].join('-')).sort());
    assert.deepEqual(hoses.map(h => h.split('-')[0]).sort(), ['a', 'b'], `both valve outlets: ${hoses}`);
    await page.waitForFunction(() => window.__bwSimLab.editView.debug.hoses() === 2);
    await page.screenshot({path: resolve(shotsDir, 'sim-lab-hoses.png')});
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(() => window.__bwSimLab.mode === 'simulate' && window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.session,
        null, {timeout: 60000});
    const airC = await lab(page, () => window.__bwSimLab._pane.session.mechanism.couplings.filter(c => c.kind === 'pneumatic')
        .map(c => ({valve: c.valveJoint, slider: c.sliderJoint, extendFrom: c.extendFrom, retractFrom: c.retractFrom})));
    assert.equal(airC.length, 1, JSON.stringify(airC));
    assert.ok(airC[0].valve && airC[0].slider && airC[0].extendFrom && airC[0].retractFrom, JSON.stringify(airC));
    out.hoses = hoses;
    return out;
};
