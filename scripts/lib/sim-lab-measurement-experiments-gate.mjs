// SPDX-License-Identifier: BSD-3-Clause
import assert from 'node:assert/strict';
import {readFile, stat, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {tool} from './sim-lab-toolbar-gate.mjs';

/** Parse downloaded CSV independently of the application's serializer. */
const csvRecords = text => {
    const rows = [];let row=[], cell='', quoted=false;
    for(let i=0;i<text.length;i++) {
        const c=text[i];
        if(quoted) {if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
        else if(c==='"')quoted=true;
        else if(c===','){row.push(cell);cell='';}
        else if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
        else cell+=c;
    }
    assert.equal(quoted,false,'CSV quoting closes');assert.equal(cell,'');return rows;
};

/** Actual controls, actual Jolt state, downloaded CSV; no substituted simulation or generated observations. */
export const measurementExperimentInteractions = async (page, {shotsDir}) => {
    const original=await page.getByTestId('bw-sim-lab-model').inputValue();
    const choose=async name=>{
        await page.getByTestId('bw-sim-lab-model').selectOption(name);
        await page.waitForFunction(key=>window.__bwSimLab.status==='ready'&&window.__bwSimLab._pane.state.shipped===key&&
            !window.__bwSimLab._pane.state.programLoading,name);
        if(!await page.getByTestId('bw-sim-lab-measurements-panel').isVisible())await tool(page,'measurements');
    };
    const panel=page.getByTestId('bw-sim-lab-measurements-panel'), report={lessons:[]};
    for(const name of ['gearbox.ldr','sky-courier.ldr','snapgate.ldr','pneumatic-press.ldr']) {
        await choose(name);await panel.getByTestId('bw-sim-measurement-teaching-preset').click();
        await panel.getByTestId('bw-sim-measurement-lesson-relation').waitFor();
        const observation=await page.evaluate(()=>{const p=window.__bwSimLab._pane;return{
            definitions:p.measurements,rows:p.measurementRows.map(r=>({id:r.id,kind:r.kind,value:r.value,available:r.available,source:r.source,unit:r.unit})),
            air:p.session.core.airState()};});
        assert.ok(observation.rows.length>=3&&observation.rows.every(r=>r.available&&Number.isFinite(r.value)),`${name}: live lesson targets resolve`);
        if(name==='pneumatic-press.ldr') {
            const pressure=observation.rows.find(r=>r.kind==='pressure');
            assert.equal(pressure.unit,'kPa');assert.equal(pressure.value,150);
            assert.ok(observation.air.some(n=>n.kPa===pressure.value),'pressure joins the actual core network');
            await tool(page,'run');
            await page.waitForFunction(()=>window.__bwSimLab._pane.measurementRows.some(r=>r.kind==='pressure'&&r.available&&r.value<149),null,{timeout:15000});
            await tool(page,'pause');
            observation.after=await page.evaluate(()=>window.__bwSimLab._pane.measurementRows.find(r=>r.kind==='pressure'));
            assert.ok(observation.after.value>=0&&observation.after.value<149,'real cylinder consumption changes the gauge');
        }
        report.lessons.push({name,...observation});
    }
    await choose('crank-rocker.ldr');await panel.getByTestId('bw-sim-measurement-teaching-preset').click();
    const before=await page.evaluate(()=>window.__bwSimLab._pane.measurements);
    await panel.getByTestId('bw-sim-lab-measurement-edit-lesson-0').click();
    await panel.getByTestId('bw-sim-lab-measurement-kind').selectOption('distance');
    await panel.getByTestId('bw-sim-lab-measurement-target-0').selectOption('crank');
    await panel.getByTestId('bw-sim-lab-measurement-target-1').selectOption('frame');
    const candidates=await page.evaluate(()=>{
        const p=window.__bwSimLab._pane, panel=document.querySelector('[data-testid="bw-sim-lab-measurements-panel"]').getBoundingClientRect();
        const canvas=p.view.canvas.getBoundingClientRect();
        return p.session.runModel.parts.map(part=>({id:part.id,...p.view.partScreenPoint(part.id)}))
            .filter(q=>q.z>=-1&&q.z<=1&&q.x>panel.right+8&&q.x<canvas.right-8&&q.y>canvas.top+8&&q.y<canvas.bottom-8)
            .sort((a,b)=>b.x-a.x).slice(0,12);
    });
    assert.ok(candidates.length,'visible scene targets outside the panel');
    await panel.getByTestId('bw-sim-measurement-pick-0').click();
    for(const candidate of candidates) {
        await page.mouse.click(candidate.x,candidate.y);
        if(!await panel.getByTestId('bw-sim-measurement-picking').count()) {
            if(await panel.getByTestId('bw-sim-lab-measurement-target-0').inputValue()!=='frame')break;
            await panel.getByTestId('bw-sim-measurement-pick-0').click();
        }
    }
    assert.equal(await panel.getByTestId('bw-sim-measurement-picking').count(),0,'an actual canvas click completed the pick');
    const picked=await panel.getByTestId('bw-sim-lab-measurement-target-0').inputValue();
    assert.notEqual(picked,'frame','scene geometry check uses distinct targets');
    const expected=await page.evaluate(id=>{
        const s=window.__bwSimLab._pane.session;
        const position=id=>{
            const part=s.runModel.parts.find(p=>p.id===id),body=s.mechanism.bodies.find(b=>b.parts.includes(id));
            const pose=s.core.bodyPose(body.id),[x,y,z,w]=pose.rotation;
            const local=[part.position[0]*0.0004-body.position[0],-part.position[1]*0.0004-body.position[1],-part.position[2]*0.0004-body.position[2]];
            const matrix=[[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],
                [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]];
            return matrix.map((row,i)=>pose.position[i]+row.reduce((sum,v,j)=>sum+v*local[j],0));
        };
        const a=position(id),b=position('frame');return Math.hypot(...a.map((v,i)=>v-b[i]))*1000;
    },picked);
    assert.ok(expected>0.1,'nonzero independently computed distance');
    const preview=panel.getByTestId('bw-sim-measurement-preview');
    const previewValue = /^Preview: ([0-9]+(?:\.[0-9]+)?) mm$/.exec(await preview.locator('output').textContent());
    assert.ok(previewValue,'the complete preview names its quantity and millimetre unit');
    assert.ok(Math.abs(Number(previewValue[1])-expected)<0.1,'draft preview matches independent part positions');
    await page.locator('[data-measurement-id="measurement-preview"]').waitFor();
    assert.deepEqual(await page.evaluate(()=>window.__bwSimLab._pane.measurements),before,'scene pick leaves saved definitions untouched');
    await panel.getByTestId('bw-sim-lab-measurement-cancel').click();
    assert.equal(await preview.count(),0);assert.deepEqual(await page.evaluate(()=>window.__bwSimLab._pane.measurements),before);
    report.picking={picked,expectedMm:expected,cancelPreserved:true};

    // The new motion observation is selected through the real editor, then sampled while the mechanism moves.
    await panel.getByTestId('bw-sim-lab-measurement-kind').selectOption('acceleration');
    // The balanced crank COM lies on its hinge axis; observe the translating coupler COM.
    await panel.getByTestId('bw-sim-lab-measurement-target-0').selectOption('coupler');
    await panel.getByTestId('bw-sim-lab-measurement-add').click();
    await panel.getByTestId('bw-sim-measurement-plot-toggle-lesson-0').check();
    const start=panel.getByTestId('bw-sim-measurement-record-start');
    const clear=panel.getByTestId('bw-sim-measurement-record-clear');
    if(await clear.count())await clear.click();
    for(let run=0;run<2;run++) {
        if(run) {await tool(page,'reset');await page.waitForFunction(()=>window.__bwSimLab.status==='ready'&&!window.__bwSimLab._pane.state.programLoading);
            assert.equal(await panel.getByTestId('bw-sim-measurement-plot-toggle-lesson-0').isChecked(),true,'Reset preserves this model’s plot selection');}
        await start.click();await panel.getByTestId('bw-sim-measurement-record-stop').waitFor();
        // The supported API starts the real world before submitting its motor command.
        // A separate green-flag start can reset that command during connection admission.
        const accepted=await page.evaluate(()=>window.__bwSimLab.api.setMotorSpeed('A',60));
        assert.equal(accepted,true,'the public motor controller accepts the recording drive');
        await page.waitForFunction(()=>{const p=window.__bwSimLab._pane;
            return p.state.status==='running'&&p.measurementRecording.snapshot().sampleCount>=6&&
                p.measurementRows.some(r=>r.id==='lesson-0'&&r.available&&Math.abs(r.value)>1)&&
                p.measurementRows.some(r=>r.kind==='acceleration'&&r.available&&r.value>0.001);},null,{timeout:15000});
        await panel.getByTestId('bw-sim-measurement-record-stop').click();await tool(page,'pause');
    }
    await panel.getByTestId('bw-sim-measurement-record-comparison').waitFor();
    assert.equal(await start.isDisabled(),true,'two-run bound is enforced through the UI');
    const runs=await page.evaluate(()=>window.__bwSimLab._pane.measurementRecording.snapshot());
    assert.equal(runs.runs.length,2);assert.equal(runs.compatible,true);
    assert.ok(runs.runs.every(r=>r.samples.length>=6&&r.samples.length<=600&&r.samples[0].elapsedMs===0));
    const csvDownload=page.waitForEvent('download');await panel.getByTestId('bw-sim-measurement-record-export').click();
    const csvPath=resolve(shotsDir,'sim-lab-measurement-runs.csv');await(await csvDownload).saveAs(csvPath);
    assert.ok((await stat(csvPath)).size<=8*1024*1024);
    const csv=await readFile(csvPath), records=csvRecords(csv.toString('utf8')), header=records.shift();
    assert.deepEqual(header,['run_id','model_sha256','measurement_id','label','kind','definition_json','unit','source','elapsed_ms','available','value','reason']);
    assert.ok(records.length>=12&&records.length<=4800);assert.ok(records.every(r=>r.length===header.length));
    assert.equal(new Set(records.map(r=>r[0])).size,2);
    assert.ok(records.some(r=>r[9]==='true'&&Math.abs(Number(r[10]))>1),'download contains actual driven motion');
    assert.ok(records.every(r=>r[4]==='jointAngle'&&r[6]==='°'&&r[7]==='jolt-joint'&&r[9]==='true'&&Number.isFinite(Number(r[10]))));
    report.recording={compatible:runs.compatible,runCount:2,sampleSets:runs.runs.map(r=>r.samples.length),
        modelSha256:runs.runs[0].modelSha256,definitions:runs.runs[0].definitions,csv:{file:'sim-lab-measurement-runs.csv',bytes:csv.length,sha256:createHash('sha256').update(csv).digest('hex'),rows:records.length}};
    const gitObject=arg=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','rev-parse',arg],{encoding:'utf8'}).trim();
    report.source={checkout:gitObject('HEAD'),tree:gitObject('HEAD^{tree}')};
    const body=JSON.stringify(report,null,2)+'\n';assert.ok(Buffer.byteLength(body)<=65536);
    await writeFile(resolve(shotsDir,'sim-lab-measurement-experiments.json'),body,{flag:'wx'});
    await choose(original);await panel.getByRole('button',{name:'Close',exact:true}).click();
    console.log('PASS measurement experiments: four real-Jolt lessons, changing air pressure, scene pick/preview/Cancel, sampled acceleration, two bounded recordings and independently parsed downloaded CSV');
};
