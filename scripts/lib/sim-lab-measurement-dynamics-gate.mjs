// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {realpathSync, accessSync, constants} from 'node:fs';
import {resolve} from 'node:path';
import JSZip from 'jszip';
import {tool, openRobotLabTab} from './sim-lab-toolbar-gate.mjs';
const PIN = '8ecbb4c116e4123fb9de18cdb71570c0dad2ceb9';
const MANIFEST = 'faff63be7372783d05e079f18feeb3a09386c659b95e7caaab6d7fff21051290';
const digest = value => createHash('sha256').update(value).digest('hex');
const gitExecutable=realpathSync('/usr/bin/git');accessSync(gitExecutable,constants.X_OK);
const git = args => execFileSync(gitExecutable, ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', ...args], {encoding:'utf8', maxBuffer: 8*1024*1024});
const ready = page => page.waitForFunction(() => window.__bwSimLab?.status === 'ready' && !window.__bwSimLab._pane.state.programLoading);
const panelOf = page => page.getByTestId('bw-sim-lab-measurements-panel');
// Authored Forklift fixture identities: its motor is C, and these two parts
// identify chassis and fork bodies without selecting a split motor housing.
export const forkliftDiagnosticTargets = ({joints, bodies, partIds}) => {
    const hinges = joints.filter(j => j.type === 'hinge' && j.motor?.port === 'C');
    const parts = ['hub', 'forkArm'];
    const owners = parts.map(id => bodies.filter(body => body.parts?.includes(id)));
    if (hinges.length !== 1 || parts.some(id => !partIds.includes(id)) ||
        owners.some(group => group.length !== 1) || owners[0][0].id === owners[1][0].id) return null;
    return {hinge: hinges[0].id, parts};
};
const showPanel = async page => { if (!await panelOf(page).isVisible()) await tool(page,'measurements'); };
const choose = async (page,file) => { await page.getByTestId('bw-sim-lab-model').selectOption(file); await ready(page); await showPanel(page); };
const loadProject = async (page,file) => {
    const old = await page.evaluateHandle(() => window.__bwSimLab._pane.session);
    try {
        await page.getByText('File',{exact:true}).first().click();
        await page.getByText('Load from your computer',{exact:true}).click();
        await page.locator('body > input[type="file"][accept*=".sb3"]').setInputFiles(file);
        await page.waitForFunction(previous => window.__bwSimLab?.status==='ready' && window.__bwSimLab._pane.session!==previous,old,{timeout:90000});
    } finally { await old.dispose(); }
    await openRobotLabTab(page); await ready(page); await showPanel(page);
};
/** Qualification fixture intake is explicit and confined to an isolated hosted checkout.
 * No shared local worktree performs a shallow fetch, and no model is registered.
 */
const admitModelSources = () => {
    try { git(['cat-file','-e',`${PIN}^{commit}`]); }
    catch {
        assert.equal(process.env.GITHUB_ACTIONS,'true','missing pinned model source must be acquired only in hosted qualification');
        assert.equal(git(['rev-parse','--git-common-dir']).trim(),'.git','hosted source intake requires an isolated checkout');
        git(['fetch','--no-tags','--depth=1','origin',PIN]);
    }
    const bytes=Buffer.from(git(['show',`${PIN}:docs/data/robot-lab-experimental-checkpoint.json`]));
    assert.equal(digest(bytes),MANIFEST,'admit the exact reviewed model manifest');
    const manifest=JSON.parse(bytes); assert.equal(manifest.models.length,60);
    return manifest;
};

/** All observations come from current-candidate real UI, accepted native batches and downloaded bytes. */
export const measurementDynamicsInteractions = async (page,{shotsDir,restoreProject,source}) => {
    const manifest=admitModelSources();
    // The CI command prepares this once before the browser journey; missing
    // coverage refuses rather than silently skipping the structural gate.
    const coverageBytes=await readFile(resolve(shotsDir,'sim-lab-role-persistence.json'));
    const coverage=JSON.parse(coverageBytes);assert.equal(coverage.status,'PASS');assert.equal(coverage.summary.modelsWithVerifiedPacks,60);
    await openRobotLabTab(page); await ready(page);
    const panel=panelOf(page),report={schema:'bw.robot.measurements.dynamics.v1',source,pinnedModelSource:{commit:PIN,manifestSha256:MANIFEST},
        coverage:{file:'sim-lab-role-persistence.json',bytes:coverageBytes.length,sha256:digest(coverageBytes)},force:[]};

    // Existing real slider and screw diagnostics, observed through the saved editor.
    for(const [file,kinds] of [['forklift.ldr',['motorForce','limitForce','sliderPower']],['screw-crane.ldr',['screwSlips','screwLoad']]]) {
        await choose(page,file);
        const joint=await page.evaluate(screw=>{
            const m=window.__bwSimLab._pane.session.mechanism;
            if(screw)return m.couplings.find(c=>c.kind==='screw')?.sliderJoint;
            return m.joints.find(j=>j.type==='slider')?.id;
        },file==='screw-crane.ldr');assert.ok(joint,`${file}: authored mechanism provides the diagnostic joint`);
        for(const kind of kinds) {
            await panel.getByTestId('bw-sim-lab-measurement-kind').selectOption(kind);
            await panel.getByTestId('bw-sim-lab-measurement-joint').selectOption(joint);
            await panel.getByTestId('bw-sim-lab-measurement-add').click();
        }
        if(file==='forklift.ldr') {
            const targets=forkliftDiagnosticTargets(await page.evaluate(()=>{
                const p=window.__bwSimLab._pane,m=p.session.mechanism;
                return {joints:m.joints.map(({id,type,motor})=>({id,type,motor})),
                    bodies:m.bodies.map(({id,parts})=>({id,parts})),partIds:p.measurementReader.partIds};
            }));
            assert.ok(targets,'Forklift motor C and uniquely owned chassis/fork targets must resolve');
            await panel.getByTestId('bw-sim-lab-measurement-kind').selectOption('passiveTorque');
            await panel.getByTestId('bw-sim-lab-measurement-joint').selectOption(targets.hinge);
            await panel.getByTestId('bw-sim-lab-measurement-add').click();kinds.push('passiveTorque');
            await panel.getByTestId('bw-sim-lab-measurement-kind').selectOption('contact');
            for(let i=0;i<2;i++)await panel.getByTestId(`bw-sim-lab-measurement-target-${i}`).selectOption(targets.parts[i]);
            await panel.getByTestId('bw-sim-lab-measurement-add').click();kinds.push('contact');
        }
        await tool(page,'run');
        await page.waitForFunction(kinds=>kinds.every(kind=>window.__bwSimLab._pane.measurementRows.some(row=>row.kind===kind&&row.available)),kinds,{timeout:15000});
        await tool(page,'pause');await page.evaluate(()=>window.__bwSimLab._pane.session.idle());
        await page.waitForFunction(()=>{const p=window.__bwSimLab._pane;return p.measurementRowsTime===p.session.time;});
        const observation=await page.evaluate(({joint,kinds})=>{
            const p=window.__bwSimLab._pane;
            const friction=p.measurements.find(d=>d.kind==='passiveTorque');
            const contact=p.measurements.find(d=>d.kind==='contact');
            return {definitions:p.measurements.filter(d=>kinds.includes(d.kind)),passiveJoint:friction?.joint||null,passiveSample:friction?p.session.core.jointDynamics(friction.joint):null,contacts:contact?p.session.core.currentContactPairs():null,contactBodies:contact?contact.targets.map(id=>p.session.mechanism.bodies.find(b=>b.parts?.includes(id)).id):null,model:p.state.modelFile,joint,coreTime:p.session.core.time,sample:p.session.core.jointDynamics(joint),screws:p.session.core.screwState?.(),
                rows:p.measurementRows.filter(r=>kinds.includes(r.kind)).map(({kind,value,unit,source,available})=>({kind,value,unit,source,available}))};
        },{joint,kinds});
        assert.ok(observation.rows.every(r=>r.available&&Number.isFinite(r.value)));
        for(const [kind,field] of [['motorForce','motorForceN'],['limitForce','limitForceN'],['sliderPower','motorPowerW']]) {
            const row=observation.rows.find(r=>r.kind===kind);if(row)assert.equal(row.value,observation.sample[field]);
        }
        const friction=observation.rows.find(r=>r.kind==='passiveTorque');if(friction)assert.equal(friction.value,observation.passiveSample.passiveTorqueNm);
        const contact=observation.rows.find(r=>r.kind==='contact');if(contact){const [a,b]=observation.contactBodies;assert.equal(contact.value,observation.contacts.some(([x,y])=>x===a&&y===b||x===b&&y===a)?1:0);}
        const screw=observation.screws?.find(s=>s.sliderJoint===joint);
        if(screw){assert.equal(observation.rows.find(r=>r.kind==='screwSlips').value,screw.slips);assert.equal(observation.rows.find(r=>r.kind==='screwLoad').value,screw.loadN);}
        report.force.push(observation);
    }

    // Full-turn period and signed native work: retain the accepted packets once.
    await choose(page,'crank-rocker.ldr');
    await panel.getByTestId('bw-sim-role-pack-choice').selectOption({label:'Motor A readings'});
    await panel.getByTestId('bw-sim-role-pack-apply').click();
    const angleId=await page.evaluate(()=>window.__bwSimLab._pane.measurements.find(d=>d.kind==='jointAngle').id);
    await panel.getByTestId(`bw-sim-measurement-plot-toggle-${angleId}`).check();
    await panel.getByTestId('bw-sim-precision-mode').selectOption('rotation');
    await panel.getByTestId('bw-sim-measurement-precision-toggle').click();
    await page.evaluate(()=>{
        const p=window.__bwSimLab._pane;
        p.__qualifiedPackets=[];p.__qualifiedPacketOverflow=false;
        p.__qualifiedDetach=p.session.onAdvance(()=>{
            const packet=p.session.measurementObservations;
            if(!packet?.samples.length)return;
            const previous=p.__qualifiedPackets.at(-1)?.samples.at(-1)?.t;
            if(previous!==undefined&&packet.samples[0].t<=previous)return;
            const count=p.__qualifiedPackets.reduce((sum,x)=>sum+x.samples.length,0);
            if(count+packet.samples.length>600){p.__qualifiedPacketOverflow=true;return;}
            p.__qualifiedPackets.push(packet);
        });
    });
    await tool(page,'run');assert.equal(await page.evaluate(()=>window.__bwSimLab.api.setMotorSpeed('A',360)),true);
    await page.waitForFunction(()=>window.__bwSimLab._pane.session.time>=2500,null,{timeout:15000});
    await tool(page,'pause');await page.evaluate(()=>window.__bwSimLab._pane.session.idle());
    report.precision=await page.evaluate(()=>{const p=window.__bwSimLab._pane;p.__qualifiedDetach();return{
        selection:p.session._measurementObservation,packets:p.__qualifiedPackets,result:p.session.measurementPrecision,overflow:p.__qualifiedPacketOverflow};});
    assert.equal(report.precision.overflow,false);assert.equal(report.precision.result.gap,false);
    assert.ok(report.precision.result.rows.some(row=>Math.abs(row.workJ)>1e-8));
    assert.ok(report.precision.result.rows.some(row=>Number.isFinite(row.periodSeconds)&&row.periodSeconds>0));
    await panel.getByTestId('bw-sim-measurement-precision-toggle').click();

    // Two independently loaded experimental model files; apply, edit, record and save.
    const pilots=[];
    for(const id of ['foldback','foldback-open']) {
        const item=manifest.models.find(m=>m.id===id),text=git(['show',`${PIN}:overlay/scratch-gui/static/sim-lab/models/${id}.ldr`]);
        assert.equal(digest(text),item.canonicalLdrawSha256);
        const old=await page.evaluateHandle(()=>window.__bwSimLab._pane.session);
        try {
            await page.getByTestId('bw-sim-lab-file').setInputFiles({name:`${id}.ldr`,mimeType:'text/plain',buffer:Buffer.from(text)});
            await page.waitForFunction(previous=>window.__bwSimLab?.status==='ready'&&window.__bwSimLab._pane.session!==previous,old,{timeout:90000});
        } finally {await old.dispose();}
        await showPanel(page);
        await panel.getByTestId('bw-sim-role-pack-choice').selectOption({label:'Motor A readings'});
        await panel.getByTestId('bw-sim-role-pack-apply').click();
        const definition=await page.evaluate(()=>window.__bwSimLab._pane.measurements.find(d=>d.kind==='jointAngle'));
        await panel.getByTestId(`bw-sim-measurement-plot-toggle-${definition.id}`).check();
        const startTime=await page.evaluate(()=>window.__bwSimLab._pane.session.time);
        await panel.getByTestId('bw-sim-window-start').fill(String(startTime/1000));
        await panel.getByTestId('bw-sim-window-duration').fill('1');
        await panel.getByTestId('bw-sim-window-arm').click();
        await tool(page,'run');assert.equal(await page.evaluate(()=>window.__bwSimLab.api.setMotorSpeed('A',60)),true);
        await page.waitForFunction(()=>{const p=window.__bwSimLab._pane;return !p.measurementRecording.snapshot().active&&p.measurementRecording.snapshot().runs.length===1;},null,{timeout:15000});
        await tool(page,'pause');await page.evaluate(()=>window.__bwSimLab._pane.session.idle());
        const pilot=await page.evaluate(()=>{const p=window.__bwSimLab._pane,record=window.__bwSimLab.projectRecord;return{context:p.measurementContext,definitions:p.measurements,record,packet:record.experiments};});
        assert.ok(pilot.packet.runs[0].window);assert.ok(pilot.packet.runs[0].samples.length>=2);
        pilots.push({id,modelSourceSha256:digest(text),sourceLdraw:text,...pilot});
    }
    report.pilots=pilots;
    const pairPanel=panel.getByTestId('bw-sim-control-pair');
    for(const [role,pilot] of [['baseline',pilots[0]],['control',pilots[1]]]) {
        const option=await pairPanel.getByTestId(`bw-sim-control-pair-${role}`).locator('option').evaluateAll((options,hash)=>options.find(o=>o.textContent.includes(hash))?.value,pilot.context.modelSha256);
        assert.ok(option);await pairPanel.getByTestId(`bw-sim-control-pair-${role}`).selectOption(option);
    }
    assert.equal(await pairPanel.getByTestId('bw-sim-control-pair-baseline-measurement-0').count(),1,'mapping starts blank and must be selected explicitly');
    for(const [role,pilot] of [['baseline',pilots[0]],['control',pilots[1]]])await pairPanel.getByTestId(`bw-sim-control-pair-${role}-measurement-0`).selectOption(pilot.definitions.find(d=>d.kind==='jointAngle').id);
    await pairPanel.getByTestId('bw-sim-control-pair-apply').click();await pairPanel.getByTestId('bw-sim-control-pair-comparison').waitFor();
    assert.equal(await panel.getByTestId('bw-sim-measurement-record-start').isDisabled(),true,'pair occupies both ordinary slots');
    const before=await page.evaluate(()=>window.__bwSimLab.projectRecord);
    assert.equal(before.experiments.schema,'bw.sim-lab.experiments.v2');assert.notEqual(before.experiments.baseline.modelSha256,before.experiments.control.modelSha256);
    await page.getByText('File',{exact:true}).first().click();
    const download=page.waitForEvent('download',{timeout:30000});await page.getByText('Save to your computer',{exact:true}).click();
    const file='sim-lab-dynamics-pair.sb3',savedPath=resolve(shotsDir,file);await(await download).saveAs(savedPath);
    const bytes=await readFile(savedPath);assert.ok(bytes.length<=8*1024*1024);
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true}),saved=JSON.parse(await zip.file('brickwright/state.json').async('text')).state.simLab;
    assert.deepEqual(saved,before);await loadProject(page,savedPath);
    const after=await page.evaluate(()=>window.__bwSimLab.projectRecord);assert.deepEqual(after,before);
    await panel.getByTestId('bw-sim-control-pair-comparison').waitFor();
    report.project={file,bytes:bytes.length,sha256:digest(bytes),before,saved,after};
    const body=JSON.stringify(report,null,2)+'\n';assert.ok(Buffer.byteLength(body)<=1024*1024);
    await writeFile(resolve(shotsDir,'sim-lab-measurement-dynamics.json'),body,{flag:'wx'});
    await loadProject(page,restoreProject);
    assert.equal(await page.evaluate(()=>window.__bwSimLab._pane.measurementControlPair),null,'project replacement clears explicit paired provenance');
    assert.equal(await panel.getByTestId('bw-sim-control-pair-comparison').count(),0,'project replacement removes the visible paired comparison');
    if(await panel.isVisible())await panel.getByRole('button',{name:'Close',exact:true}).click();
    console.log('PASS bounded dynamics: native slider/screw diagnostics, accepted-step period/work, 60-source structural persistence and explicit model pair save/reopen');
};
