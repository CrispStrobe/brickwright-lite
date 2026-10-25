// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {teachingMeasurementPreset} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/teaching-presets.js';
import {createMeasurementReader} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import {createMeasurementHistory} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/history.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
const catalog = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));
const prepared = name => prepareModel(readFileSync(new URL(`../overlay/scratch-gui/static/sim-lab/models/${name}`, import.meta.url), 'utf8'), catalog);
for (const [name, expected, port] of [['crank-rocker.ldr',['jointAngle','jointAngle','jointSpeed'],'A'],['forklift.ldr',['jointAngle','travel','weight'],'C']]) {
    test(`${name}: verified authored targets resolve unique compiled joint roles and current bindings`, () => {
        const s=prepared(name), before=JSON.stringify(s), p=teachingMeasurementPreset(s,name);
        assert.deepEqual(p.definitions.map(d=>d.kind),expected);
        const motor=s.mechanism.joints.find(j=>j.id===p.definitions[0].joint);assert.equal(motor.motor.port,port);
        assert.equal(JSON.stringify(s),before,'preset resolution does not mutate the model or mechanism');
        assert.notEqual(teachingMeasurementPreset(s,name,'de').title,p.title);
        assert.ok(p.definitions.every(d=>d.binding||d.targets));
        const read=createMeasurementReader({...s,core:{jointState:()=>({angle:0.25,velocity:0.5,position:0.02}),bodyPose:id=>({position:s.mechanism.bodies.find(b=>b.id===id).position,rotation:[0,0,0,1]})}}).read(p.definitions);
        assert.ok(read.every(r=>r.available),JSON.stringify(read));
    });
    test(`${name}: missing or ambiguous authored targets, wrong joint types and wrong motor roles refuse`, () => {
        for(const change of [
            s=>{s.runModel.parts[0].id='renamed';},
            s=>{s.mechanism.joints.find(j=>j.motor).motor.port='wrong';},
            s=>{s.mechanism.joints.find(j=>j.motor).type='slider';},
            s=>{s.mechanism.joints.push({...s.mechanism.joints.find(j=>j.motor),id:'duplicate'});}
        ]) {const s=prepared(name);change(s);assert.equal(teachingMeasurementPreset(s,name),null);}
        assert.equal(teachingMeasurementPreset(prepared(name),'imported.ldr'),null);
        assert.equal(teachingMeasurementPreset(prepared(name),'__proto__'),null);
    });
    test(`${name}: actual Jolt motion is sampled at real simulation times through existing readers`, async () => {
        const s=prepared(name), p=teachingMeasurementPreset(s,name), J=await loadJolt();
        const core=createPhysicsCore(J,s.mechanism,{stepHz:200});s.core=core;
        try {
            const reader=createMeasurementReader(s), history=createMeasurementHistory(), selected=p.definitions.map(d=>d.id);
            const input=s.mechanism.joints.find(j=>j.id===p.definitions[0].joint);
            core.setMotor(input.id,{mode:'velocity',radPerSec:1});
            let traces;
            for(let i=0;i<=240;i++) {
                if(i)core.step(1/200);
                if(i%20)continue;
                const rows=reader.read(p.definitions), time=i*5;
                assert.ok(rows.every(r=>r.available&&Number.isFinite(r.value)),JSON.stringify(rows));
                assert.ok(Math.abs(rows[0].value-core.jointState(input.id).angle*180/Math.PI)<1e-10);
                traces=history.update({session:s,definitions:p.definitions,selected,rows,time});
            }
            const points=traces.get(selected[0]);
            assert.equal(points.length,13);assert.deepEqual(points.map(x=>x.time),Array.from({length:13},(_,i)=>i*100));
            assert.ok(Math.max(...points.map(x=>x.value))-Math.min(...points.map(x=>x.value))>1,'real input joint moves');
        } finally {core.destroy();}
    });
}
