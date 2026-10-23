import {openManualControls} from './sim-lab-manual-controls.mjs';
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {judgeMechanicsRun} from './sim-lab-mechanics-judge.mjs';

const DEFAULT_MACHINES = ['crank-rocker', 'parallel-lift', 'screw-crane', 'pivot-rover'];
export const mechanicsInteractions = async (page, {openSimLab, shotsDir, timeout,
    models = DEFAULT_MACHINES, judge = judgeMechanicsRun, simulatedMs = 18000,
    simulatedMsFor = () => simulatedMs, completeWhenPausedFor = () => false,
    fileFor = id => `${id}.ldr`, keyFor = id => fileFor(id), programMarker = null, speed = 1, observeProgram = false}) => {
    mkdirSync(shotsDir, {recursive: true});
    await openSimLab(page, {program: null});
    const results = {};
    for (const id of models) {
        await page.getByTestId('bw-sim-lab-examples').click();
        const gallery = page.getByTestId('bw-sim-examples');
        await gallery.getByRole('searchbox').fill(id);
        const card = gallery.locator(`[data-model="${keyFor(id)}"]`);
        assert.equal(await card.count(), 1);
        await card.getByRole('button', {name: /^Open model \+ program:/}).click();
        try { await gallery.waitFor({state: 'hidden'}); }
        catch (error) {
            const state = await page.evaluate(() => {
                const p = window.__bwSimLab?._pane;
                return {status: window.__bwSimLab?.status, pane: p ? {status:p.state.status, message:p.state.message,
                    info:p.state.info, modelFile:p.state.modelFile, shipped:p.state.shipped,
                    programLoading:p.state.programLoading, view3d:p.state.view3d} : null,
                    gallery:document.querySelector('[data-testid="bw-sim-examples"]')?.innerText,
                    resources:performance.getEntriesByType('resource').filter(e=>/sim-lab|ldraw|worker/.test(e.name)).slice(-30).map(e=>({name:e.name,duration:e.duration,responseEnd:e.responseEnd}))};
            });
            writeFileSync(resolve(shotsDir, id+'-gallery-failure.json'),JSON.stringify(state,null,2)+'\n');
            await page.screenshot({path:resolve(shotsDir,id+'-gallery-failure.png')}).catch(()=>{});
            throw error;
        }
        await page.waitForFunction(({file, key}) => window.__bwSimLab.status === 'ready' &&
            window.__bwSimLab._pane.state.modelFile === file && window.__bwSimLab._pane.state.shipped === key &&
            window.__bwSimLab._pane.session?.worker, {file: fileFor(id), key: keyFor(id)}, {timeout: 60000});
        if (programMarker) await page.waitForFunction(marker => [...document.querySelectorAll('.cm-content')].some(el =>
            el.textContent.includes(marker)), programMarker(id), {timeout: 30000});
        await page.getByTestId('bw-sim-lab-3d-canvas').waitFor();
        await page.screenshot({path: resolve(shotsDir, `${id}.png`)});
        await page.evaluate(observeProgram => {
            const pane = window.__bwSimLab._pane;
            const s = pane.session;
            const m = s.mechanism;
            const record = window.__bwMechanics = {start: s.time, runModel:s.runModel, mechanism: m, hubId: s.bridge.hubBody,
                issues: pane.state.issues, unsupported: [], track: []};
            const capture = () => {
                const bodies = {};
                for (const b of m.bodies.filter(b => b.motion === 'dynamic')) bodies[b.id] = s.core.bodyPose(b.id);
                const joints = {};
                for (const j of m.joints.filter(j => j.type === 'hinge' || j.type === 'slider')) joints[j.id] = s.core.jointState(j.id);
                const busy = {};
                for (const a of m.actuators) busy[a.port] = pane.hub.motors.busy(a.port);
                if (observeProgram && !record.finishedAt && s.time-record.start>1000 && !pane.props.vm.runtime.threads.some(t=>t.status!==4)) record.finishedAt=s.time;
                const extra=observeProgram?{variables:Object.fromEntries(pane.props.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value]))}:null;
                record.track.push({t: s.time, bodies, joints, busy, ...(extra?{extra}: {})});
            };
            window.__bwCaptureMechanics = capture;
            s.onAdvance(capture);
        }, observeProgram);
        await page.getByTestId('bw-sim-lab-speed').selectOption(String(speed));
        await page.getByTestId('bw-sim-lab-run').click();
        const simulatedForThis = simulatedMsFor(id);
        // The pane briefly drops its session while a model or program reloads; a
        // predicate that dereferences it then fails the whole gate with a TypeError
        // instead of waiting for the next frame.
        await page.waitForFunction(({ms, paused}) => {
            const pane=window.__bwSimLab?._pane;if(!pane?.session)return false;
            if(!paused)return pane.session.time-window.__bwMechanics.start>=ms;
            return pane.session.time-window.__bwMechanics.start>1000&&window.__bwSimLab.status==='paused'&&
                !pane.props.vm.runtime.threads.some(t=>t.status!==4);
        }, {ms:simulatedForThis,paused:completeWhenPausedFor(id)}, {timeout});
        if(completeWhenPausedFor(id))await page.evaluate(()=>window.__bwCaptureMechanics());
        const r = await page.evaluate(() => window.__bwMechanics);
        if (observeProgram) writeFileSync(resolve(shotsDir, id+'-actual-track.json'), JSON.stringify(r));
        results[id] = judge(id, r);
        // Capture the measured final pose without racing a continuously redrawn
        // software WebGL surface. The next model selection starts a fresh run.
        if (await page.getByTestId('bw-sim-lab-pause').isVisible()) {
            await page.getByTestId('bw-sim-lab-pause').click();
            await page.waitForFunction(() => window.__bwSimLab.status === 'paused');
        }
        await openManualControls(page, {motors: true});
        const mixer = page.getByTestId('bw-sim-lab-mixer-toggle');
        if (await mixer.getAttribute('aria-expanded') !== 'true') await mixer.click();
        assert.deepEqual(await page.locator('[data-testid="bw-sim-lab-mixer-slider"], [data-testid="bw-sim-lab-mixer-jog"]').evaluateAll(es => es.map(e => e.dataset.port).sort()),
            r.mechanism.actuators.map(a => a.port).sort());
        for (const slider of await page.getByTestId('bw-sim-lab-mixer-slider').all()) assert.ok(await slider.isDisabled(), 'program control keeps manual sliders off');
        await page.screenshot({path: resolve(shotsDir, `${id}-finished.png`)});
        await mixer.click();
        console.log(`PASS motorised mechanics ${id}: ${JSON.stringify(results[id])}`);
    }
    writeFileSync(resolve(shotsDir, 'measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
    return results;
};

export const manualMechanicsInteractions = async (page, {openSimLab, shotsDir, models = DEFAULT_MACHINES, jogSign = () => 1, jogMs = 250, keyFor = id => `${id}.ldr`}) => {
    mkdirSync(shotsDir, {recursive: true});
    await openSimLab(page, {program: null});
    const results = {};
    for (const id of models) {
        await page.getByTestId('bw-sim-lab-model').selectOption(keyFor(id));
        await page.waitForFunction(file => window.__bwSimLab.status === 'ready' &&
            window.__bwSimLab._pane.state.modelFile === file, `${id}.ldr`, {timeout: 60000});
        const framing = await page.evaluate(() => window.__bwSimLab._pane.view.framingStats());
        assert.ok(framing.corners.every(p => p.every(Number.isFinite) && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1 && Math.abs(p[2]) <= 1),
            `${id}: initial camera includes the whole model: ${JSON.stringify(framing)}`);
        await openManualControls(page, {override: true});
        const toggle = page.getByTestId('bw-sim-lab-mixer-toggle');
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
        await page.getByTestId('bw-sim-lab-mixer-stop-all').click();
        const sliders = page.getByTestId('bw-sim-lab-mixer-slider');
        const ports = await sliders.evaluateAll(es => es.map(e => e.dataset.port));
        const angle = port => page.evaluate(p => {
            const s = window.__bwSimLab._pane.session;
            return s.core.jointState(s.mechanism.actuators.find(a => a.port === p).joint).angle;
        }, port);
        const advance = (ms = 250) => page.evaluate(ms => new Promise(done => {
            const s = window.__bwSimLab._pane.session; const t = s.time;
            const off = s.onAdvance(() => { if (s.time - t >= ms) { off(); done(); } });
        }), ms);
        results[id] = {};
        for (const port of ports) {
            const slider = page.locator(`[data-testid="bw-sim-lab-mixer-slider"][data-port="${port}"]`);
            const before = await angle(port);
            await slider.focus();
            const sign = jogSign(id, port);
            await page.keyboard.press(sign < 0 ? 'ArrowLeft' : 'ArrowRight');
            assert.equal(await slider.inputValue(), String(sign * 5));
            await advance(jogMs);
            const delta = await angle(port) - before;
            assert.ok(Math.abs(delta) > 0.03, `${id} motor ${port} responds to its slider: ${delta}`);
            await page.locator(`[data-testid="bw-sim-lab-mixer-stop"][data-port="${port}"]`).click();
            assert.equal(await slider.inputValue(), '0');
            await advance();
            const stopped = await angle(port);
            await advance();
            assert.ok(Math.abs(await angle(port) - stopped) < 3 * Math.PI / 180,
                `${id}: motor ${port} holds after Stop`);
            results[id][port] = delta * 180 / Math.PI;
        }
        for (const control of await page.getByTestId('bw-sim-lab-mixer-jog').all()) {
            const port=await control.getAttribute('data-port'),before=await angle(port);
            const choices=control.locator('button[data-target]');
            let choice=null;
            for(const button of await choices.all())if(!await button.isDisabled()){choice=button;break;}
            assert.ok(choice,`${id}: at least one bounded jog is available`);
            const target=Number(await choice.getAttribute('data-target'));assert.ok(Number.isFinite(target));
            await choice.click();
            await page.waitForFunction(()=>window.__bwSimLab._pane.manualJogs.size===0,null,{timeout:15000});
            const after=await angle(port);assert.ok(Math.abs(after-before)>.03,`${id}: bounded ${port} actually moves`);
            assert.ok(Math.abs(after*180/Math.PI-target)<=2,`${id}: bounded ${port} reaches its requested target`);
            results[id][port]=(after-before)*180/Math.PI;
        }
        await page.getByTestId('bw-sim-lab-mixer-stop-all').click();
        assert.ok((await sliders.evaluateAll(es => es.map(e => e.value))).every(v => v === '0'));
        await page.screenshot({path: resolve(shotsDir, `${id}-manual.png`)});
        await toggle.click();
        console.log(`PASS manual motor controls ${id}: ${JSON.stringify(results[id])}`);
    }
    writeFileSync(resolve(shotsDir, 'manual-measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
    return results;
};
