// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Real browser interactions. Internal APIs only observe the scene/program;
// no prescribed poses, native-step shortcuts, or synthetic motor commands.
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openManualControls} from './sim-lab-manual-controls.mjs';

const PRESETS = [
    {id: 'resonance-lab-slow', name: 'slow', speed: 5, minimumPeak: 1.5, maximumPeak: 5, minimumDuration: 17000},
    {id: 'resonance-lab.ldr', name: 'near', speed: 13, minimumPeak: 6, maximumPeak: 15, minimumDuration: 12500},
    {id: 'resonance-lab-fast', name: 'fast', speed: 80, minimumPeak: .2, maximumPeak: 3, minimumDuration: 11000}
];
// Browser observations are worker batches, not the independent 5 ms native
// qualification. These bounds are declared before this browser's first run.
export const BROWSER_LIMITS = Object.freeze({inputDegrees: 3, outputDegrees: 35,
    finalEncoderDegrees: .5, manualInputDegrees: 3, minimumNearSlowRatio: 2,
    minimumNearFastRatio: 3, minimumBrowserSamples: 100, maximumDurationMs: 22000});

const ready = (page, key) => page.waitForFunction(key => {
    const p = window.__bwSimLab?._pane;
    return p?.state.status === 'ready' && p.state.shipped === key && !p.state.programLoading && p.session?.worker && p.view;
}, key, {timeout: 90000});
const choose = async (page, key) => {
    await page.getByTestId('bw-sim-lab-model').selectOption(key);
    await ready(page, key);
    await page.waitForFunction(() => document.querySelector('input[maxlength="100"]')?.value ===
        document.querySelector('[data-testid="bw-sim-lab-model"]')?.selectedOptions[0]?.textContent);
};
const pause = async page => {
    if (await page.getByTestId('bw-sim-lab-pause').isVisible()) {
        await page.getByTestId('bw-sim-lab-pause').click();
        await page.waitForFunction(() => window.__bwSimLab.status === 'paused');
    }
};

const boundedControls = async (page, context) => {
    await openManualControls(page, {motors:true});
    assert.equal(await page.getByTestId('bw-sim-lab-mixer-jog-plus').count(),1,`${context}: finite manual control is present`);
    assert.equal(await page.getByTestId('bw-sim-lab-mixer-slider').count(),0,`${context}: no continuous slider`);
    assert.equal(await page.getByTestId('bw-sim-lab-drive').count(),0,`${context}: no continuous drive pad`);
};

/** Attach a read-only body-pose/encoder/program observer to this fresh session. */
const observe = page => page.evaluate(() => {
    const p = window.__bwSimLab._pane, s = p.session, m = s.mechanism;
    const hinges = m.joints.filter(j => j.type === 'hinge');
    const driven = hinges.find(j => j.motor?.port === 'A'), passive = hinges.find(j => !j.motor);
    const frame = [driven.body1, driven.body2].find(b => [passive.body1, passive.body2].includes(b));
    const input = driven.body1 === frame ? driven.body2 : driven.body1;
    const output = passive.body1 === frame ? passive.body2 : passive.body1;
    const initial = Object.fromEntries([frame, input, output].map(id => [id, s.core.bodyPose(id)]));
    const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
    const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const mul = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
        a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
        a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-dot(a.slice(0, 3), b.slice(0, 3))];
    const conj = q => [-q[0], -q[1], -q[2], q[3]];
    const rotate = (q, v) => { const t = cross(q, v).map(x => 2*x), u = cross(q, t); return v.map((x, i) => x + q[3]*t[i] + u[i]); };
    const record = window.__bwResonance = {start: s.time, ids: {frame, input, output}, track: [], targets: [], finishedAt: null};
    let previousTarget = 0;
    const sample = () => {
        const poses = Object.fromEntries([frame, input, output].map(id => [id, s.core.bodyPose(id)]));
        const dq = id => mul(poses[id].rotation, conj(initial[id].rotation));
        const x = rotate(dq(frame), [1,0,0]), z = rotate(dq(frame), [0,0,1]);
        const angle = id => {const v = rotate(dq(id), [1,0,0]); return Math.atan2(dot(v,z),dot(v,x))*180/Math.PI;};
        const variables = p.props.vm.runtime.targets.flatMap(t => Object.values(t.variables || {}));
        const target = Number(variables.find(v => v.name === 'target')?.value || 0);
        if (target !== previousTarget) { record.targets.push({t: s.time, value: target}); previousTarget = target; }
        const active = p.props.vm.runtime.threads.some(t => t.status !== 4);
        if (!record.finishedAt && s.time-record.start > 1000 && !active) record.finishedAt = s.time;
        record.track.push({t: s.time, input: angle(input), output: angle(output), encoder: p.api.encoder('A').angleDeg,
            target, active, bodies: poses});
    };
    sample();
    const off = s.onAdvance(sample);
    window.__bwResonanceStopObserve = off;
});

const modelFacts = page => page.evaluate(() => {
    const p = window.__bwSimLab._pane, s = p.session;
    return {parts: s.model.parts.length, bands: s.model.belts.length,
        dynamicBodies: s.mechanism.bodies.filter(b => b.motion === 'dynamic').length,
        motors: s.mechanism.actuators.map(a => a.port),
        springs: s.mechanism.couplings.filter(c => c.kind === 'spring').length,
        errors: p.state.issues.filter(i => i.severity === 'error'),
        blocks: p.props.vm.runtime.targets.flatMap(t => Object.values(t.blocks?._blocks || {})).map(b => b.opcode),
        source: window.__bwResonanceProgramLoads?.at(-1)?.code,
        title: document.querySelector('input[maxlength="100"]')?.value,
        render: p.view.renderStats(), framing: p.view.framingStats()};
});

export async function resonanceLesson(page, {openSimLab, shotsDir}, language = 'en') {
    if (language === 'de') {
        await openSimLab(page, {program: null});
        await choose(page, 'resonance-lab.ldr');
    }
    const evidence = [];
    for (const preset of PRESETS) {
        await choose(page, preset.id);
        await page.getByTestId('bw-sim-lab-lesson').click();
        const lesson = page.getByTestId('bw-sim-lesson');
        await page.waitForFunction(id => document.querySelector('[data-testid="bw-sim-lesson"]')?.dataset.lesson === id,
            preset.id.replace(/\.ldr$/, ''));
        await lesson.getByRole('button', {name: language === 'de' ? 'Erklärung zeigen' : 'Show explanation', exact: true}).click();
        const answer = await lesson.getByTestId('bw-sim-lesson-answer').textContent();
        assert.ok(answer.length > 100, 'substantive explanation is visible');
        assert.equal(await lesson.getByTestId('bw-sim-lesson-steps').locator('li').count() >= 3, true);
        evidence.push({id: preset.id, language, answer});
        if (preset.name === 'near') await lesson.screenshot({path: resolve(shotsDir, `lesson-${language}.png`)});
        await lesson.getByRole('button', {name: language === 'de' ? 'Lektion schließen' : 'Close lesson', exact: true}).click();
    }
    if (language === 'de') {
        await openManualControls(page, {motors: true});
        assert.match(await page.getByTestId('bw-sim-lab-mixer-jog-range').textContent(), /-2° bis 2°.*0,5°.*5°\/s/);
        assert.match(await page.getByTestId('bw-sim-lab-mixer-jog-guidance').textContent(), /Zurücksetzen/);
        assert.match(await page.getByTestId('bw-sim-lab-mixer-jog-plus').getAttribute('aria-label'), /0,5° vorwärts/);
        assert.equal(await page.getByTestId('bw-sim-lab-mixer-slider').count(), 0);
        await page.screenshot({path: resolve(shotsDir, 'manual-controls-de.png')});
    }
    writeFileSync(resolve(shotsDir, `lessons-${language}.json`), JSON.stringify(evidence, null, 2));
    console.log(`PASS Resonance Lab: all three ${language.toUpperCase()} lessons and explanations`);
}

async function instructions(page, shotsDir) {
    await choose(page, 'resonance-lab.ldr');
    await page.getByTestId('bw-sim-lab-instructions').click();
    const dialog = page.getByTestId('bw-sim-instructions');
    const pageReady = n => page.waitForFunction(n => {
        const i = window.__bwSimLabInstructions;
        return i?.status === 'ready' && i.page === n && (n === i.steps || i.stats?.step === n);
    }, n, {timeout: 30000});
    await pageReady(0);
    const plan = await page.evaluate(() => window.__bwSimLabInstructions.plan);
    assert.deepEqual(plan.steps.map(s => s.parts.length), [49,25,16,36,16]);
    assert.deepEqual(plan.steps.map(s => (s.belts || []).length), [0,0,0,0,2]);
    const rendered = [];
    for (let n = 0; n < 5; n++) {
        if (n) {await page.keyboard.press('ArrowRight'); await pageReady(n);}
        const stats = await page.evaluate(() => window.__bwSimLabInstructions.stats);
        assert.equal(stats.belts, n === 4 ? 2 : 0);
        assert.equal(stats.freshBelts, n === 4 ? 2 : 0);
        const rows = await page.getByTestId('bw-sim-instructions-callout').getByTestId('bw-sim-instructions-part').evaluateAll(es =>
            es.map(e => {
                const img = e.querySelector('img');
                let visiblePixels = 0;
                if (img?.naturalWidth) {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
                    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 0) visiblePixels++;
                }
                return {part:e.dataset.part, count:Number(e.dataset.count), picture:Boolean(img?.naturalWidth), visiblePixels};
            }));
        assert.equal(rows.reduce((sum,r) => sum+r.count,0), plan.steps[n].parts.length + (n === 4 ? 2 : 0));
        assert.ok(rows.every(r => r.picture), `stage ${n+1}: all thumbnails are decoded`);
        assert.ok(rows.every(r => r.visiblePixels > 100), `stage ${n+1}: every part thumbnail draws visible faces`);
        if (n === 4) assert.equal(rows.find(r => r.part === '85546.dat').count, 2);
        rendered.push({stage:n+1, stats, rows});
        await dialog.screenshot({path: resolve(shotsDir, `assembly-stage-${n+1}.png`)});
    }
    await page.keyboard.press('ArrowRight'); await pageReady(5);
    const bom = await page.getByTestId('bw-sim-instructions-bom').getByTestId('bw-sim-instructions-part').evaluateAll(es =>
        es.map(e => ({part:e.dataset.part, count:Number(e.dataset.count)})));
    assert.equal(bom.reduce((sum,r) => sum+r.count,0),144);
    assert.equal(bom.find(r => r.part === '85546.dat').count,2);
    await dialog.screenshot({path:resolve(shotsDir,'parts-list.png')});
    const popup = page.waitForEvent('popup', {timeout:30000});
    await page.getByTestId('bw-sim-instructions-print').click();
    const printed = await popup;
    await printed.waitForFunction(() => document.querySelectorAll('img.shot[data-step]').length === 5 && document.querySelector('[data-bom]'));
    const printInfo = await printed.evaluate(async () => {
        const shots = [...document.querySelectorAll('img.shot[data-step]')];
        await Promise.all(shots.map(i => i.decode()));
        return {shots:shots.map(i=>[i.naturalWidth,i.naturalHeight]),
            count:[...document.querySelectorAll('[data-bom] .count')].reduce((n,e)=>n+Number(e.textContent.replace('×','')),0),
            text:document.body.textContent};
    });
    assert.deepEqual(printInfo.shots, Array.from({length:5},()=>[1200,800]));
    assert.equal(printInfo.count,144);
    assert.match(printInfo.text,/rubber band/i);
    writeFileSync(resolve(shotsDir,'printable-instructions.html'),await printed.content());
    await printed.screenshot({path:resolve(shotsDir,'print-preview.png')});
    await printed.close();
    await page.waitForFunction(()=>window.__bwSimLabInstructions.printing===false);
    await dialog.focus(); await page.keyboard.press('Escape');
    writeFileSync(resolve(shotsDir,'instructions.json'),JSON.stringify({plan,rendered,bom,printInfo},null,2));
    console.log('PASS Resonance Lab: all five rendered assembly pages, two native bands, 144-piece BOM and decoded printable manual');
}

export async function resonanceInteractions(page, opts) {
    const {openSimLab,shotsDir,timeout} = opts;
    mkdirSync(shotsDir,{recursive:true});
    const missingParts = [], failed = [], drawingReads = [], drawingSources = new Map();
    page.on('response', r => {
        if (!/\.(?:dat|ldr)(?:\?|$)/i.test(r.url())) return;
        if (!r.ok()) {missingParts.push({url:r.url(),status:r.status()});return;}
        if (/\/ldraw\//i.test(r.url())) drawingReads.push(r.text().then(body => {
            const name = new URL(r.url()).pathname.replace(/^.*\/ldraw\//i, '');
            drawingSources.set(name, body.split(/\r?\n/).filter(l => /^0\s+(?:Author:|!LICENSE\b|!LDRAW_ORG\b)/i.test(l)));
        }).catch(error => missingParts.push({url:r.url(),readError:error.message})));
    });
    page.on('requestfailed', r => {if (/\.dat(?:\?|$)/i.test(r.url())) failed.push({url:r.url(),failure:r.failure()});});
    await openSimLab(page,{program:null});
    await page.evaluate(() => {
        window.__bwResonanceProgramLoads = [];
        window.addEventListener('bw-load-pseudocode', e => {
            window.__bwResonanceProgramLoads.push({code:e.detail.code, source:e.detail.source});
        });
    });
    // Discoverable entry through the actual gallery, then use the dropdown for comparisons.
    await page.getByTestId('bw-sim-lab-examples').click();
    const gallery = page.getByTestId('bw-sim-examples');
    await gallery.getByRole('searchbox').fill('resonance');
    const card = gallery.locator('[data-model="resonance-lab.ldr"]');
    assert.equal(await card.count(),1);
    await card.getByRole('button',{name:/^Open model \+ program:/}).click();
    await gallery.waitFor({state:'hidden'}); await ready(page,'resonance-lab.ldr');
    const facts = await modelFacts(page);
    assert.equal(facts.title, 'Resonance Lab — near-resonant burst');
    assert.equal(facts.source, readFileSync(resolve(opts.sourceModelsDir, '../programs/resonance-lab.bw'), 'utf8'));
    assert.equal(facts.parts,142); assert.equal(facts.bands,2); assert.equal(facts.dynamicBodies,3);
    assert.equal(facts.springs,2); assert.deepEqual(facts.motors,['A']); assert.deepEqual(facts.errors,[]);
    assert.ok(facts.blocks.some(x=>x.startsWith('robotlab_')),'the program has automatically become Robot Lab blocks');
    assert.ok(facts.render.triangles>10000 && facts.render.parts===142,'the actual model is drawn');
    assert.ok(facts.framing.corners.every(p=>p.every(Number.isFinite)&&Math.abs(p[0])<=1&&Math.abs(p[1])<=1),'the camera includes the whole model');
    await page.screenshot({path:resolve(shotsDir,'installed-model.png')});
    const results = {};
    for (const preset of PRESETS) {
        await choose(page,preset.id); await observe(page);
        const loaded = await page.evaluate(() => window.__bwResonanceProgramLoads.at(-1));
        const filename = `resonance-lab${preset.name === 'near' ? '' : `-${preset.name}`}.bw`;
        assert.equal(loaded.code, readFileSync(resolve(opts.sourceModelsDir, '../programs', filename), 'utf8'));
        await page.getByTestId('bw-sim-lab-speed').selectOption('1');
        await page.getByTestId('bw-sim-lab-run').click();
        await page.waitForFunction(()=>window.__bwResonance.finishedAt!==null,null,{timeout});
        await pause(page);
        const rec = await page.evaluate(()=>{window.__bwResonanceStopObserve();return window.__bwResonance;});
        writeFileSync(resolve(shotsDir,`${preset.name}-actual-track.json`),JSON.stringify(rec));
        const duration = rec.finishedAt-rec.start, peak = Math.max(...rec.track.map(s=>Math.abs(s.output)));
        const inputPeak = Math.max(...rec.track.map(s=>Math.abs(s.input)));
        assert.ok(rec.track.length>=BROWSER_LIMITS.minimumBrowserSamples);
        assert.ok(duration>=preset.minimumDuration&&duration<BROWSER_LIMITS.maximumDurationMs,`${preset.name}: finite completion at ${duration} ms`);
        assert.deepEqual(rec.targets.map(t=>t.value),[2,-2,2,-2,2,-2,2,-2,2,0]);
        assert.ok(inputPeak>1.5&&inputPeak<=BROWSER_LIMITS.inputDegrees,`${preset.name}: actual input ${inputPeak}°`);
        assert.ok(peak>=preset.minimumPeak&&peak<=preset.maximumPeak,`${preset.name}: passive output ${peak}°`);
        assert.ok(Math.abs(rec.track.at(-1).encoder)<=BROWSER_LIMITS.finalEncoderDegrees);
        results[preset.name]={durationMs:duration,samples:rec.track.length,inputPeakDegrees:inputPeak,outputPeakDegrees:peak};
        await page.screenshot({path:resolve(shotsDir,`${preset.name}-finished.png`)});
    }
    assert.ok(results.near.outputPeakDegrees/results.slow.outputPeakDegrees>BROWSER_LIMITS.minimumNearSlowRatio);
    assert.ok(results.near.outputPeakDegrees/results.fast.outputPeakDegrees>BROWSER_LIMITS.minimumNearFastRatio);
    await resonanceLesson(page,opts,'en');
    await instructions(page,shotsDir);
    // Import both exact deliverables through the file input. Programs/titles are
    // checked through the installed gallery path, since raw CAD has no code payload.
    const imports=[];
    for (const extension of ['ldr','mpd']) {
        const old = await page.evaluateHandle(()=>window.__bwSimLab._pane.session);
        await page.getByTestId('bw-sim-lab-file').setInputFiles(resolve(opts.sourceModelsDir,`resonance-lab.${extension}`));
        await page.waitForFunction(old=>window.__bwSimLab?.status==='ready'&&window.__bwSimLab._pane.session!==old,old,{timeout:90000});
        await old.dispose();
        const f=await modelFacts(page); assert.equal(f.parts,142);assert.equal(f.bands,2);assert.deepEqual(f.errors,[]);
        await boundedControls(page,`${extension} import`);
        imports.push({extension,parts:f.parts,bands:f.bands,boundedManualControls:true});
    }
    // The exact unchanged assembly keeps its control policy through editing and
    // ordinary project persistence, without becoming a catalog preset again.
    await page.getByTestId('bw-sim-lab-mode-build').click();
    await page.waitForFunction(()=>window.__bwSimLab?.mode==='build'&&window.__bwSimLab.status==='ready'&&window.__bwSimLab.editor,null,{timeout:60000});
    await page.getByTestId('bw-sim-lab-mode-simulate').click();
    await page.waitForFunction(()=>window.__bwSimLab?.mode==='simulate'&&window.__bwSimLab.status==='ready',null,{timeout:90000});
    await boundedControls(page,'unchanged Build → Simulate');
    assert.equal(await page.evaluate(()=>window.__bwSimLab._pane.state.shipped),null,'custom model stays custom');
    const savedRecord=await page.evaluate(()=>window.__bwSimLab.projectRecord);
    await page.getByText('File',{exact:true}).click();
    const download=page.waitForEvent('download',{timeout:30000});
    await page.getByText('Save to your computer',{exact:true}).click();
    const savedPath=resolve(shotsDir,'resonance-roundtrip.sb3');
    await (await download).saveAs(savedPath);
    await choose(page,'driving-base.ldr');
    const priorLoad=await page.evaluateHandle(()=>window.__bwSimLab._pane.session);
    await page.getByText('File',{exact:true}).click();
    await page.getByText('Load from your computer',{exact:true}).click();
    await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(savedPath);
    await page.getByRole('tab',{name:'Robots',exact:true}).click();
    await page.waitForFunction(old=>window.__bwSimLab?.status==='ready'&&window.__bwSimLab._pane.session!==old&&
        window.__bwSimLab._pane.session?.model.parts.length===142,priorLoad,{timeout:90000});
    await priorLoad.dispose();
    assert.deepEqual(await page.evaluate(()=>window.__bwSimLab.projectRecord),savedRecord,'saved project reopens byte-identical');
    await boundedControls(page,'saved project reopen');
    const persistence={buildRoundtrip:true,sb3Roundtrip:true,byteIdentical:true,boundedManualControls:true};
    writeFileSync(resolve(shotsDir,'persistence.json'),JSON.stringify(persistence,null,2));
    await choose(page,'resonance-lab.ldr');
    await openManualControls(page,{motors:true});
    const plus=page.getByTestId('bw-sim-lab-mixer-jog-plus'), minus=page.getByTestId('bw-sim-lab-mixer-jog-minus');
    assert.equal(await page.getByTestId('bw-sim-lab-mixer-slider').count(),0);
    assert.equal(await page.getByTestId('bw-sim-lab-drive').count(),0,'bounded manual model has no unbounded drive pad');
    assert.equal(await plus.isDisabled(),true,'manual override is required');
    assert.equal(await minus.isDisabled(),true);
    assert.match(await page.getByTestId('bw-sim-lab-mixer-jog-range').textContent(), /-2° to 2°.*0.5°.*5°\/s/);
    await page.getByTestId('bw-sim-lab-mixer-override').check();
    assert.equal(await plus.isDisabled(),false);
    await observe(page);
    const jogs=[];
    const jog=async direction=>{
        const button=direction>0?plus:minus;
        const target=Number(await button.getAttribute('data-target'));
        assert.ok(target>=-2&&target<=2,'every finite jog target stays in the declared manual range');
        const start=await page.evaluate(()=>window.__bwSimLab._pane.session.time);
        await button.click();
        await page.waitForFunction(start=>{const p=window.__bwSimLab._pane;
            return p.manualJogs.size===0&&p.session.time>=start+300;},start,{timeout:15000});
        jogs.push({direction,target,encoder:await page.evaluate(()=>window.__bwSimLab._pane.api.encoder('A').angleDeg)});
    };
    await jog(1); await jog(1); await jog(-1);
    for(let n=0;n<4&&!await plus.isDisabled();n++) await jog(1);
    await page.locator('[data-testid="bw-sim-lab-mixer-stop"][data-port="A"]').click();
    const stopTime=await page.evaluate(()=>window.__bwSimLab._pane.session.time);
    await page.waitForFunction(t=>window.__bwSimLab._pane.session.time>=t+1000,stopTime,{timeout:15000});
    const manual=await page.evaluate(()=>{window.__bwResonanceStopObserve();return window.__bwResonance;});
    // Preserve actual observations even when an assertion below fails.
    writeFileSync(resolve(shotsDir,'manual-actual-track.json'),JSON.stringify({...manual,jogs,stopTime}));
    const held=manual.track.filter(s=>s.t>=stopTime+500), heldSpan=Math.max(...held.map(s=>s.encoder))-Math.min(...held.map(s=>s.encoder));
    assert.ok(held.length>2&&heldSpan<.5,`manual Stop holds: ${heldSpan}°`);
    const manualPeak=Math.max(...manual.track.map(s=>Math.abs(s.input)));
    assert.ok(manualPeak>=1.5&&manualPeak<=BROWSER_LIMITS.manualInputDegrees,`finite manual jogs reach the endpoint inside the qualified input envelope: ${manualPeak}°`);
    await page.getByTestId('bw-sim-lab-mixer-stop-all').click();
    await pause(page);await page.screenshot({path:resolve(shotsDir,'manual-controls.png')});
    const previous=await page.evaluateHandle(()=>window.__bwSimLab._pane.session);
    await page.getByTestId('bw-sim-lab-reset').click();
    await page.waitForFunction(previous=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.session!==previous,previous,{timeout:90000});
    await previous.dispose();
    const resetAngle=await page.evaluate(()=>window.__bwSimLab._pane.api.encoder('A').angleDeg);
    assert.ok(Math.abs(resetAngle)<.01,'reset restores the saved zero pose');
    await Promise.all(drawingReads);
    assert.deepEqual(missingParts,[]); assert.deepEqual(failed,[]);
    writeFileSync(resolve(shotsDir,'ldraw-attribution.txt'),
        'LDraw part and primitive sources used by the actual browser render.\n'+
        'Original Resonance Lab assembly: Christian Ströbele (CrispStrobe), BSD-3-Clause.\n'+
        'Rendered CAD images retain the geometry authors and licenses below. Preserve the accompanying CAreadme and license files.\n\n'+
        [...drawingSources].sort(([a],[b])=>a.localeCompare(b)).map(([name,lines])=>`${name}\n${lines.join('\n')}\n`).join('\n'));
    const report={limits:BROWSER_LIMITS,presets:PRESETS,facts,results,imports,persistence,
        manual:{jogs,maximumInputDegrees:manualPeak,heldSpanDegrees:heldSpan},resetAngle,missingParts,failed};
    writeFileSync(resolve(shotsDir,'browser-results.json'),JSON.stringify(report,null,2));
    console.log(`PASS Resonance Lab: three real worker/VM programs, passive response, imports, manual Stop/hold and reset: ${JSON.stringify(results)}`);
    return report;
}
