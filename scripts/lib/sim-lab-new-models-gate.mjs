// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The three 2026-10-22 model deliveries in the shipped GUI: Product Plotter,
// Sky Courier and Gimbal Lab. Each is opened from the gallery with its program,
// run to completion in the worker, and checked against the motion its program
// claims. Lessons are read through the production lesson loader in
// test/bw-sim-new-models.test.mjs; this gate reads them in the browser too.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {mechanicsInteractions,manualMechanicsInteractions} from './sim-lab-mechanics-gate.mjs';
import {intakeRoundtrip} from './sim-lab-intake-roundtrip.mjs';

import {judgeBalance} from './sim-lab-balance-judge.mjs';
import {judgeRootBridge} from './sim-lab-root-bridge-judge.mjs';
import {judgeSky} from './sim-lab-sky-judge.mjs';
import {judgeCusp} from './sim-lab-cusp-judge.mjs';
import {judgeProduct,judgeGimbal} from './sim-lab-product-gimbal-judge.mjs';

import {judgeWatt} from './sim-lab-watt-judge.mjs';
import {judgeTwinTempo} from './sim-lab-twin-tempo-judge.mjs';
import {judgeRiseRatio} from './sim-lab-rise-ratio-judge.mjs';
import {judgeCascade} from './sim-lab-cascade-judge.mjs';
import {judgeWaveMaker} from './sim-lab-wavemaker-judge.mjs';
import {judgeSineShuttle,judgeQuartermaster} from './sim-lab-sine-quarter-judge.mjs';

const DEG = 180 / Math.PI;

const SPEC = Object.freeze({
    'rise-ratio': {simulatedMs: 27000},
    'rise-ratio-control': {simulatedMs: 27000},
    'cascade': {simulatedMs: 22000},
    'cascade-control': {simulatedMs: 22000},
    'wavemaker': {simulatedMs: 80000},
    'wavemaker-control': {simulatedMs: 80000},
    'sine-shuttle': {simulatedMs: 45000},
    'quartermaster': {simulatedMs: 100000},
    'watt-line': {simulatedMs: 22000},
    'twin-tempo': {simulatedMs: 35000},
    'root-bridge': {simulatedMs:125000},
    'balance-engine': {simulatedMs: 80000},
    'cusp-lab': {simulatedMs: 80000, motors: 1, minimumRange: {A: 359}, marker: 'marker_r20', span: {}},
    'product-plotter': {
        simulatedMs: 47000,
        motors: 2,
        minimumRange: {A: 20, B: 100},
        marker: 'output_marker',
        span: {x: 10, z: 8}
    },
    'sky-courier': {
        simulatedMs: 136000,
        motors: 2,
        minimumRange: {A: 500, B: 500},
        marker: 'payload_tie_spine',
        span: {y: 20, z: 30}
    },
    'gimbal-lab': {
        simulatedMs: 62000,
        motors: 3,
        minimumRange: {A: 15, B: 60, C: 15},
        marker: 'marker_primary'
    }
});

const quaternionAngle = (a, b) => {
    const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, dot)) * DEG;
};

const bodyWithPart = (mechanism, part) => mechanism.bodies.find(body => (body.parts || []).includes(part));

export const judgeNewModel = (id, record) => {
    if(id==='rise-ratio'||id==='rise-ratio-control')return judgeRiseRatio(record,{control:id.endsWith('control')});
    if(id==='cascade'||id==='cascade-control')return judgeCascade(record,{control:id.endsWith('control')});
    if(id==='wavemaker'||id==='wavemaker-control')return judgeWaveMaker(record,{control:id.endsWith('control')});
    if(id==='sine-shuttle')return judgeSineShuttle(record);
    if(id==='quartermaster')return judgeQuartermaster(record);
    if(id==='watt-line')return judgeWatt(record).metrics;
    if(id==='twin-tempo')return judgeTwinTempo(record);
    if(id==='root-bridge')return judgeRootBridge(record);
    if(id==='balance-engine')return judgeBalance(record);
    const spec = SPEC[id];
    assert.ok(spec, `${id}: known delivery`);
    assert.ok(record.finishedAt, `${id}: the program finished: ${JSON.stringify({finishedAt: record.finishedAt})}`);
    assert.deepEqual((record.issues || []).filter(issue => issue.severity === 'error'), [], `${id}: no error issues`);
    assert.equal(record.mechanism.actuators.length, spec.motors, `${id}: motor count`);

    const track = record.track;
    assert.ok(track.length > 30, `${id}: enough samples`);
    const ranges = {};
    const finalTargets = track.at(-1).extra?.variables || {};
    for (const actuator of record.mechanism.actuators) {
        const angles = track.map(sample => sample.joints[actuator.joint].angle);
        const range = (Math.max(...angles) - Math.min(...angles)) * DEG;
        assert.ok(range >= spec.minimumRange[actuator.port],
            `${id} port ${actuator.port} moves: ${range.toFixed(1)}° >= ${spec.minimumRange[actuator.port]}°`);
        ranges[actuator.port] = Number(range.toFixed(2));
        const target = Number(finalTargets[`target${actuator.port}`]);
        if (Number.isFinite(target)) {
            const error = Math.abs(angles.at(-1) * DEG - target);
            assert.ok(error < 5, `${id} port ${actuator.port} ends on its final target: ${error.toFixed(2)}°`);
        }
    }

    const marker = bodyWithPart(record.mechanism, spec.marker);
    assert.ok(marker, `${id}: passive output body contains ${spec.marker}`);
    const poses = track.map(sample => sample.bodies[marker.id]);
    const positions = poses.map(pose => pose.position);
    const summary = {motors: ranges, finishedAt: Math.round(record.finishedAt)};

    if (id === 'gimbal-lab') {
        const maximum = Math.max(...poses.map(pose => quaternionAngle(poses[0].rotation, pose.rotation)));
        const final = quaternionAngle(poses[0].rotation, poses.at(-1).rotation);
        assert.ok(maximum >= 60, `${id}: the attitude marker turns through ${maximum.toFixed(1)}°`);
        assert.ok(final < 3, `${id}: the attitude marker returns home: ${final.toFixed(2)}°`);
        summary.markerDegrees = Number(maximum.toFixed(2));
        summary.finalDegrees = Number(final.toFixed(2));
    } else {
        const spans = {};
        for (const [axis, index] of [['x', 0], ['y', 1], ['z', 2]]) {
            const values = positions.map(position => position[index]);
            spans[axis] = (Math.max(...values) - Math.min(...values)) * 1000;
        }
        for (const [axis, minimum] of Object.entries(spec.span)) {
            assert.ok(spans[axis] >= minimum, `${id}: the output travels ${spans[axis].toFixed(1)} mm in ${axis} (>= ${minimum})`);
        }
        const home = Math.hypot(...positions.at(-1).map((value, index) => value - positions[0][index])) * 1000;
        assert.ok(home < 3, `${id}: the output returns home: ${home.toFixed(2)} mm`);
        summary.travelMm = Object.fromEntries(Object.entries(spans).map(([axis, value]) => [axis, Number(value.toFixed(2))]));
        summary.homeMm = Number(home.toFixed(2));
    }
    if (id === 'sky-courier') summary.physics = judgeSky(record);
    if (id === 'cusp-lab') summary.physics = judgeCusp(record);
    if (id === 'product-plotter') summary.physics = judgeProduct(record);
    if (id === 'gimbal-lab') summary.physics = judgeGimbal(record);
    return summary;
};

export async function newModelsInteractions(page, opts) {
    mkdirSync(opts.shotsDir, {recursive: true});
    const models = (opts.models || Object.keys(SPEC)).filter(id => SPEC[id]);
    assert.ok(models.length, 'at least one new model is selected');
    const results = {};
    for (const id of models) {
        Object.assign(results, await mechanicsInteractions(page, {
            ...opts, models: [id], judge: judgeNewModel,
            simulatedMsFor: key => SPEC[key].simulatedMs, completeWhenPausedFor:key=>key==='root-bridge', speed: 4, observeProgram: true
        }));
        await manualMechanicsInteractions(page,{...opts,models:[id]});
        await page.getByTestId('bw-sim-lab-instructions').click();
        await page.waitForFunction(()=>window.__bwSimLabInstructions?.status==='ready',null,{timeout:120000});
        const plan=await page.evaluate(()=>window.__bwSimLabInstructions.plan);
        const count={'rise-ratio':182,'rise-ratio-control':181,'cascade':70,'cascade-control':76,'wavemaker':298,'wavemaker-control':298,'sine-shuttle':105,'quartermaster':209,'watt-line':148,'twin-tempo':81,'root-bridge':447,'balance-engine':292,'cusp-lab':128,'product-plotter':301,'gimbal-lab':245,'sky-courier':251}[id];
        const bands=id==='balance-engine'?2:0;
        const placed=plan.steps.flatMap(s=>s.parts);
        assert.equal(plan.steps.flatMap(s=>s.belts||[]).length,bands);
        assert.equal(placed.length,count);assert.equal(new Set(placed).size,count);
        assert.ok(plan.steps.every(s=>!s.loose),'Every construction step connects');
        await page.keyboard.press('End');
        await page.waitForFunction(()=>window.__bwSimLabInstructions.page===window.__bwSimLabInstructions.steps);
        assert.equal(await page.getByTestId('bw-sim-instructions-bom').getByTestId('bw-sim-instructions-part').evaluateAll(es=>es.reduce((n,e)=>n+Number(e.dataset.count),0)),count+bands);
        await page.getByTestId('bw-sim-instructions').screenshot({path:resolve(opts.shotsDir,id+'-bom.png')});
        await page.keyboard.press('Escape');
        console.log(`PASS ${id}: manual controls, ${plan.steps.length} connected instruction pages and ${count+bands}-piece BOM`);
        if(['rise-ratio','rise-ratio-control','cascade','cascade-control','wavemaker','wavemaker-control','sine-shuttle','quartermaster','watt-line','twin-tempo','root-bridge','balance-engine'].includes(id))await intakeRoundtrip(page,opts,id,judgeNewModel);
    }
    writeFileSync(resolve(opts.shotsDir, 'new-model-measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
    return results;
}

/** Reads one shipped lesson in the active page language. */
export async function newModelLesson(page, {openSimLab, shotsDir}, id, language = 'en') {
    const current = await page.evaluate(() => window.__bwSimLab?._pane?.state?.modelFile);
    if (language === 'de' || current !== `${id}.ldr`) {
        await openSimLab(page, {program: null});
        await page.getByTestId('bw-sim-lab-examples').click();
        const gallery = page.getByTestId('bw-sim-examples');
        await gallery.getByRole('searchbox').fill(id);
        const card = gallery.locator(`[data-model="${id}.ldr"]`);
        assert.equal(await card.count(), 1, `${id}: gallery card`);
        await card.getByRole('button', {name: language === 'de' ? /Modell/ : /^Open model \+ program:/}).click();
        await gallery.waitFor({state: 'hidden'});
        await page.waitForFunction(file => window.__bwSimLab.status === 'ready' && window.__bwSimLab._pane.state.modelFile === file,
            `${id}.ldr`, {timeout: 60000});
    }
    await page.getByTestId('bw-sim-lab-lesson').click();
    const lesson = page.getByTestId('bw-sim-lesson');
    await page.waitForFunction(id => document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson === id, id);
    await lesson.getByRole('button', {name: language === 'de' ? 'Erklärung zeigen' : 'Show explanation', exact: true}).click();
    const answer = await lesson.getByTestId('bw-sim-lesson-answer').textContent();
    const steps = await lesson.getByTestId('bw-sim-lesson-steps').locator('li').count();
    assert.ok(answer.length > 100, `${id}: substantive ${language} explanation`);
    assert.ok(steps >= 3, `${id}: ${language} lesson has ${steps} steps`);
    mkdirSync(shotsDir, {recursive: true});
    const frames = [];
    for (const frame of page.frames()) frames.push(await frame.evaluate(() => ({
        url: location.href, fonts: document.fonts.status,
        faces: [...document.fonts].map(font => ({family: font.family, status: font.status})),
        simulation: window.__bwSimLab?.status, view3d: window.__bwSimLab?.view3d
    })));
    writeFileSync(resolve(shotsDir, `${id}-lesson-${language}-capture-state.json`), JSON.stringify({frames}, null, 2));
    await lesson.screenshot({path: resolve(shotsDir, `${id}-lesson-${language}.png`)});
    await lesson.getByRole('button', {name: language === 'de' ? 'Lektion schließen' : 'Close lesson', exact: true}).click();
    console.log(`PASS ${id}: ${language.toUpperCase()} lesson (${steps} steps, ${answer.length} characters)`);
    return {id, language, steps, characters: answer.length};
}
