// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {tool} from './sim-lab-toolbar-gate.mjs';

/** Actual UI and Jolt motion; internals are observed, never substituted. */
export const measurementPlotInteractions = async (page, {shotsDir}) => {
    const original = await page.getByTestId('bw-sim-lab-model').inputValue();
    const choose = async name => {
        await page.getByTestId('bw-sim-lab-model').selectOption(name);
        await page.waitForFunction(key => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.shipped === key, name);
    };
    await choose('crank-rocker.ldr');
    if (!await page.getByTestId('bw-sim-lab-measurements-panel').isVisible()) await tool(page, 'measurements');
    const panel = page.getByTestId('bw-sim-lab-measurements-panel');
    await panel.getByTestId('bw-sim-measurement-teaching-preset').click();
    assert.match(await panel.textContent(), /Input crank angle/);
    assert.match(await panel.textContent(), /Output rocker angle/);
    await panel.getByTestId('bw-sim-measurement-plot-toggle-lesson-0').check();
    await tool(page, 'run');
    await page.evaluate(() => window.__bwSimLab.api.setMotorSpeed('A', 60));
    await page.waitForFunction(() => {
        const svg = document.querySelector('[data-testid="bw-sim-measurement-plot"] svg');
        const points = [...(svg?.querySelectorAll('polyline') || [])].flatMap(p => p.getAttribute('points').trim().split(/\s+/));
        const pane = window.__bwSimLab._pane;
        return pane.measurementRowsTime >= 500 && points.length >= 4 && pane.state.replayFrames >= 2;
    }, null, {timeout: 15000});
    const observed = await page.evaluate(() => {
        const p = window.__bwSimLab._pane;
        const svg = document.querySelector('[data-testid="bw-sim-measurement-plot"] svg');
        return {time:p.measurementRowsTime, live:p.session.time, values:p.measurementRows.map(r=>({available:r.available,value:r.value})),
            points:[...svg.querySelectorAll('polyline')].flatMap(s=>s.getAttribute('points').trim().split(/\s+/)), label:svg.getAttribute('aria-label')};
    });
    assert.ok(observed.time <= observed.live && observed.time > 0);
    assert.ok(observed.values.every(r=>r.available&&Number.isFinite(r.value)));
    assert.ok(Math.abs(observed.values[0].value)>1, 'actual driven input joint moves');
    assert.ok(observed.points.length <= 128 && observed.points.every(p=>p.split(',').map(Number).every(Number.isFinite)));
    assert.match(observed.label,/Current.*°; min.*°; max.*°/);
    await tool(page,'pause');
    await page.waitForFunction(()=>{const p=window.__bwSimLab._pane;return p.state.status==='paused'&&p.measurementRowsTime===p.session.time;});
    await page.waitForFunction(() => {
        const row = window.__bwSimLab._pane.measurementRows.find(r => r.id === 'lesson-0');
        const label = document.querySelector('[data-testid="bw-sim-lab-measurement-overlay"] [data-measurement-id="lesson-0"] text');
        return row?.available && label?.textContent.endsWith(`${row.value.toFixed(1)} °`);
    }, null, {timeout: 15000});
    if (shotsDir) await page.screenshot({path:resolve(shotsDir,'sim-lab-measurement-time-plot.png')});
    await page.getByTestId('bw-sim-lab-replay-slider').fill('0');
    await page.waitForFunction(()=>window.__bwSimLab._pane.state.replayAt===0);
    assert.equal(await panel.getByTestId('bw-sim-measurement-plot').count(),0, 'live traces hide during pose replay');
    await tool(page,'reset');
    await page.waitForFunction(()=>window.__bwSimLab.status==='ready');
    assert.equal(await panel.getByTestId('bw-sim-measurement-plot').count(),0, 'reset starts a fresh panel and history');
    assert.equal(await panel.getByTestId('bw-sim-measurement-plot-toggle-lesson-0').isChecked(),false);
    await choose('forklift.ldr');
    await panel.getByTestId('bw-sim-measurement-teaching-preset').click();
    assert.match(await panel.textContent(),/Carriage travel/);
    assert.match(await panel.getByTestId('bw-sim-lab-measurement-lesson-1').locator('output').textContent(),/mm/);
    assert.match(await panel.getByTestId('bw-sim-lab-measurement-lesson-2').locator('output').textContent(),/N/);
    assert.equal(await panel.getByTestId('bw-sim-measurement-plot').count(),0, 'model replacement cannot retain earlier traces');
    await choose(original);
    await panel.getByRole('button',{name:'Close',exact:true}).click();
};
