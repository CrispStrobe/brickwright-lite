// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mechanicsInteractions, manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {captureRenderedModel, captureUiScreenshot} from './sim-lab-rendered-model-gate.mjs';
import {intakeRoundtrip} from './sim-lab-intake-roundtrip.mjs';
import {NINE_INTAKES, evaluateNineIntake} from './sim-lab-nine-intake-judge.mjs';

const placements = {helixgate: 20, looprelay: 54, paritydial: 31, counterslide: 44,
    'toggle-press': 142, footfall: 120, phasekeeper: 81, vectorsum: 122, pointweaver: 128};

export function judgeNineBrowser(id, record) {
    // Worker snapshots expose body poses and controllers. Native contact
    // presence is proved separately by the actual-Jolt native suite, never
    // inferred here from a body's height or a successful program.
    const result = evaluateNineIntake(id, record, {requireObservations: false});
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const after = record.track.filter(f => f.phase === 'after');
    assert.ok(after.length > 0 && after.every(f => Object.keys(NINE_INTAKES[id].drive)
        .every(p => f.extra?.modes?.[p] === 'hold')), 'Every actual terminal controller holds');
    return {...result.metrics, nativeGroundContact: 'separately checked in native intake suite'};
}

export async function nineIntakeInteractions(page, opts, id) {
    assert.ok(NINE_INTAKES[id], 'Reviewed intake');
    await mechanicsInteractions(page, {
        ...opts, models: [id], judge: judgeNineBrowser, captureModel: captureRenderedModel,
        extendedObservations: true, completionHoldMsFor: () => 2000, speed: 4, observeProgram: true,
        includeExperimental: true
    });
    await manualMechanicsInteractions(page, {
        ...opts, models: [id], captureModel: captureRenderedModel,
        // PointWeaver intentionally offers one-degree precision buttons.
        minimumJogRadians: id === 'pointweaver' ? .01 : .03
    });
    await page.getByTestId('bw-sim-lab-instructions').click();
    await page.waitForFunction(() => window.__bwSimLabInstructions?.status === 'ready', null, {timeout: 120000});
    const plan = await page.evaluate(() => window.__bwSimLabInstructions.plan);
    const parts = plan.steps.flatMap(s => s.parts);
    assert.equal(parts.length, placements[id]);
    assert.equal(new Set(parts).size, placements[id]);
    assert.ok(plan.steps.every(s => !s.loose && s.parts.length >= 1 && s.parts.length <= 6));
    await page.keyboard.press('End');
    await page.waitForFunction(() => window.__bwSimLabInstructions.page === window.__bwSimLabInstructions.steps);
    assert.equal(await page.getByTestId('bw-sim-instructions-bom').getByTestId('bw-sim-instructions-part')
        .evaluateAll(es => es.reduce((n, e) => n + Number(e.dataset.count), 0)), placements[id]);
    await captureUiScreenshot(page, {path: resolve(opts.shotsDir, id + '-bom.png')}, page.getByTestId('bw-sim-instructions'));
    await page.keyboard.press('Escape');
    await intakeRoundtrip(page, {...opts, extendedObservations: true, afterMs: 2000}, id, judgeNineBrowser);
    console.log(`PASS ${id}: full passive law/hold, bounded manual control, connected instructions, placement BOM, LDR/MPD and fresh saved-project replay`);
}
