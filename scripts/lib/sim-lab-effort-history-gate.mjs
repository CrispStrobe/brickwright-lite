// SPDX-License-Identifier: BSD-3-Clause
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import JSZip from 'jszip';
import {tool, openRobotLabTab} from './sim-lab-toolbar-gate.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const ready = (page, model = null) => page.waitForFunction(file => window.__bwSimLab?.status === 'ready' &&
    !window.__bwSimLab._pane.state.programLoading && (!file || window.__bwSimLab._pane.state.shipped === file), model);
const loadProject = async (page, file) => {
    const old = await page.evaluateHandle(() => window.__bwSimLab._pane.session);
    try {
        await page.getByText('File', {exact: true}).first().click();
        await page.getByText('Load from your computer', {exact: true}).click();
        await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(file);
        await page.waitForFunction(previous => window.__bwSimLab?.status === 'ready' &&
            window.__bwSimLab._pane.session !== previous && !window.__bwSimLab._pane.state.programLoading, old, {timeout: 90000});
    } finally { await old.dispose(); }
    // Project uploads activate Code; return through the real editor tab before
    // touching the persistently mounted Lab's controls.
    await openRobotLabTab(page);
    await ready(page);
};

/** Current-candidate real UI/Jolt and saved bytes; no substituted simulation state. */
export const effortHistoryInteractions = async (page, {shotsDir, restoreProject, source}) => {
    await openRobotLabTab(page);
    await ready(page);
    const panel = page.getByTestId('bw-sim-lab-measurements-panel');
    const rightPaneInitiallyVisible = await page.locator('[data-right-pane-toggle]').getAttribute('aria-pressed');
    await page.getByTestId('bw-sim-lab-model').selectOption('crank-rocker.ldr');
    await ready(page, 'crank-rocker.ldr');
    if (!await panel.isVisible()) await tool(page, 'measurements');
    await panel.getByTestId('bw-sim-measurement-teaching-preset').click();
    const csvPath = resolve(shotsDir, 'sim-lab-measurement-runs.csv');
    await panel.getByTestId('bw-sim-measurement-record-import-file').setInputFiles(csvPath);
    await page.waitForFunction(() => window.__bwSimLab._pane.measurementRecording.snapshot().runs.length === 2);
    await panel.getByTestId('bw-sim-measurement-record-comparison').waitFor();
    const imported = await page.evaluate(() => window.__bwSimLab._pane.measurementRecording.snapshot());
    assert.equal(imported.compatible, true);
    assert.ok(imported.runs.every(run => run.samples.length >= 6 && run.samples.every(sample => sample.timeMs === undefined)), 'CSV import does not invent absolute capture times');
    assert.equal(await panel.getByTestId('bw-sim-measurement-plot-toggle-lesson-0').isChecked(), true);

    // Add real joint diagnostics through the same saved editor as other quantities.
    for (const kind of ['motorTorque', 'limitTorque', 'motorPower']) {
        await panel.getByTestId('bw-sim-lab-measurement-kind').selectOption(kind);
        await panel.getByTestId('bw-sim-lab-measurement-joint').selectOption('j0');
        await panel.getByTestId('bw-sim-lab-measurement-add').click();
    }
    assert.equal(await page.evaluate(() => window.__bwSimLab.api.setMotorSpeed('A', 60)), true);
    await page.waitForFunction(() => {
        const p = window.__bwSimLab._pane, sample = p.session.core.jointDynamics('j0');
        return p.measurementRows.some(r => r.kind === 'motorTorque' && r.available && Math.abs(r.value) > 1e-8) &&
            sample && Math.abs(sample.angularVelocityRadS) > 0.05;
    }, null, {timeout: 15000});
    await tool(page, 'pause');
    await page.waitForFunction(() => { const p = window.__bwSimLab._pane; return p.measurementRowsTime === p.session.time; });
    const effort = await page.evaluate(() => {
        const p = window.__bwSimLab._pane;
        return {sample: p.session.core.jointDynamics('j0'), coreTime: p.session.core.time,
            rows: p.measurementRows.filter(r => ['motorTorque', 'limitTorque', 'motorPower'].includes(r.kind)).map(r => ({kind: r.kind, value: r.value, available: r.available, unit: r.unit, source: r.source}))};
    });
    assert.ok(effort.rows.every(r => r.available && Number.isFinite(r.value)));
    assert.equal(effort.sample.t, effort.coreTime);
    assert.ok(Math.abs(effort.sample.motorPowerW - effort.sample.motorTorqueNm * effort.sample.angularVelocityRadS) <= 1e-10);
    for (const [kind, field] of [['motorTorque', 'motorTorqueNm'], ['limitTorque', 'limitTorqueNm'], ['motorPower', 'motorPowerW']]) {
        assert.ok(Math.abs(effort.rows.find(r => r.kind === kind).value - effort.sample[field]) <= 1e-10);
    }

    const beforeProject = await page.evaluate(() => window.__bwSimLab.projectRecord);
    assert.equal(beforeProject.experiments.runs.length, 2);
    assert.deepEqual(beforeProject.experiments.selection, ['lesson-0']);
    await page.getByText('File', {exact: true}).first().click();
    const download = page.waitForEvent('download', {timeout: 30000});
    await page.getByText('Save to your computer', {exact: true}).click();
    const path = resolve(shotsDir, 'sim-lab-experiment-history.sb3');
    await (await download).saveAs(path);
    assert.ok((await stat(path)).size <= 8 * 1024 * 1024);
    const bytes = await readFile(path), zip = await JSZip.loadAsync(bytes, {checkCRC32: true});
    const saved = JSON.parse(await zip.file('brickwright/state.json').async('text')).state.simLab;
    assert.deepEqual(saved, beforeProject, 'downloaded project carries the actual histories and plot choices');
    await loadProject(page, path);
    if (!await panel.isVisible()) await tool(page, 'measurements');
    const afterProject = await page.evaluate(() => window.__bwSimLab.projectRecord);
    assert.deepEqual(afterProject, beforeProject, 'real project reopen preserves histories despite normalized LDraw headers');
    assert.equal(await panel.getByTestId('bw-sim-measurement-plot-toggle-lesson-0').isChecked(), true);
    await panel.getByTestId('bw-sim-measurement-record-comparison').waitFor();

    // The arena handover really unmounts the persistent Robot Lab tab.
    await page.getByRole('tab', {name: 'Code', exact: true}).click();
    await page.getByTestId('bw-open-spike-arena').click();
    await page.getByTestId('bw-spike-simulator-use-arena').click();
    await page.waitForFunction(() => !window.__bwSimLab);
    await openRobotLabTab(page); await ready(page);
    await tool(page, 'measurements');
    const afterRemount = await page.evaluate(() => window.__bwSimLab.projectRecord);
    assert.deepEqual(afterRemount, beforeProject, 'actual pane remount restores the saved recordings');
    await panel.getByTestId('bw-sim-measurement-record-comparison').waitFor();

    await page.getByTestId('bw-sim-lab-model').selectOption('gearbox.ldr'); await ready(page, 'gearbox.ldr');
    assert.equal(await page.evaluate(() => window.__bwSimLab._pane.measurementRecording.snapshot().runs.length), 0, 'another model never borrows history');
    const inspector = panel.getByTestId('bw-sim-physics-inspector');
    await inspector.locator('summary').click();
    const target = await page.evaluate(() => {
        const p = window.__bwSimLab._pane;
        return p.session.mechanism.bodies.find(b => p.session.core.bodyDynamics(b.id)?.massAdjusted)?.id;
    });
    assert.ok(target, 'gearbox exposes a real solver mass floor');
    await inspector.getByTestId('bw-sim-physics-body').selectOption(target);
    const body = await page.evaluate(id => window.__bwSimLab._pane.session.core.bodyDynamics(id), target);
    assert.ok(body.solverMassKg > body.configuredMassKg && body.massAdjusted);
    assert.ok(body.inertiaKgM2.flat().every(Number.isFinite));
    await inspector.getByTestId('bw-sim-physics-mass-adjusted').waitFor();
    assert.match(await inspector.getByTestId('bw-sim-physics-com').textContent(), / m$/);

    const csv = await readFile(csvPath);
    const evidence = {source, project: {before: beforeProject.measurements, saved: saved.measurements, after: afterProject.measurements,
        modelBeforeSha256: digest(beforeProject.ldraw), modelAfterSha256: digest(afterProject.ldraw),
        sb3: {file: 'sim-lab-experiment-history.sb3', bytes: bytes.length, sha256: digest(bytes)}},
    history: {before: beforeProject.experiments, saved: saved.experiments, after: afterProject.experiments, remounted: afterRemount.experiments,
        csv: {file: 'sim-lab-measurement-runs.csv', bytes: csv.length, sha256: digest(csv)}},
    effort, inspector: {bodyId: target, ...body}, isolation: {differentModelEmpty: true, paneRemountRestored: true}};
    const report = JSON.stringify(evidence, null, 2) + '\n'; assert.ok(Buffer.byteLength(report) <= 65536);
    await writeFile(resolve(shotsDir, 'sim-lab-experiment-history.json'), report, {flag: 'wx'});
    await loadProject(page, restoreProject);
    assert.equal(await page.evaluate(() => window.__bwSimLab._pane.measurementRecording.snapshot().runs.length), 0, 'a project without history clears all retained runs');
    if (await panel.isVisible()) await panel.getByRole('button', {name: 'Close', exact: true}).click();
    const rightPaneToggle = page.locator('[data-right-pane-toggle]');
    if (await rightPaneToggle.getAttribute('aria-pressed') !== rightPaneInitiallyVisible) await rightPaneToggle.click();
    console.log('PASS effort and saved experiments: actual signed Jolt readings, solver mass/COM/inertia, CSV import, original SB3 save/reopen, real pane remount and project isolation');
};
