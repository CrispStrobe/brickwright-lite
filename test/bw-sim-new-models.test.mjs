// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The 2026-10-22 deliveries as shipped: the gallery entry, its real parser/VM
// program, the passive output it claims to move, and both lessons through the
// production loader. Browser and hardware operation are separate gates.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {parseModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {loadModelLesson} from '../overlay/scratch-gui/src/lib/bw-sim/model/lesson-loader.js';
import {runRobotLabProgram} from './helpers/robot-lab-direct-vm.mjs';

import {judgeSky} from '../scripts/lib/sim-lab-sky-judge.mjs';
import {judgeProduct,judgeGimbal,measureProduct} from '../scripts/lib/sim-lab-product-gimbal-judge.mjs';

const ROOT = new URL('../', import.meta.url);
const LAB = 'overlay/scratch-gui/static/sim-lab/';
const read = path => readFileSync(new URL(path, ROOT));
const DEG = 180 / Math.PI;

const CASES = Object.freeze({
    'product-plotter': {
        en: 'Product Plotter — a mechanical multiplier',
        de: 'Product Plotter — ein mechanischer Multiplizierer',
        parts: 301,
        ports: ['A', 'B'],
        ranges: {A: 20, B: 100},
        timeLimitMs: 75000,
        output: 'output_marker',
        span: {x: 10, z: 8}
    },
    'sky-courier': {
        en: 'Sky Courier — two-winch suspended gondola',
        de: 'Sky Courier — schwebende Gondel an zwei Winden',
        parts: 251,
        ports: ['A', 'B'],
        ranges: {A: 500, B: 500},
        timeLimitMs: 180000,
        output: 'payload_tie_spine',
        span: {y: 20, z: 30}
    },
    'gimbal-lab': {
        en: 'Gimbal Lab — three-axis gimbal lock',
        de: 'Gimbal Lab — dreiachsige Gimbal-Sperre',
        parts: 245,
        ports: ['A', 'B', 'C'],
        ranges: {A: 15, B: 60, C: 15},
        timeLimitMs: 130000,
        output: 'marker_primary',
        orientationDegrees: 60
    }
});

const quaternionAngle = (a, b) => {
    const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(Math.min(1, dot)) * DEG;
};

for (const [id, spec] of Object.entries(CASES)) {
    test(`${id}: shipped title, program and both lessons`, async () => {
        const entry = MODELS.find(model => model.file === `${id}.ldr`);
        assert.ok(entry, `${id}: gallery entry`);
        assert.deepEqual(entry.title, {en: spec.en, de: spec.de});
        assert.equal(entry.example, `${id}.bw`);
        assert.match(read(`${LAB}programs/${id}.bw`).toString(), /^DEVICE SPIKE\s*$/m);

        const fetcher = async path => ({ok: true, json: async () => JSON.parse(read(`overlay/scratch-gui/${path}`))});
        for (const language of ['en', 'de']) {
            const lesson = await loadModelLesson(entry, language, {fetcher});
            assert.equal(lesson.id, id);
            assert.equal(lesson.language, language);
            assert.ok(lesson.answer.length > 200, `${id} ${language}: substantive explanation`);
            assert.ok(lesson.try.length >= 3 && lesson.further.length >= 3, `${id} ${language}: practical steps`);
        }
    });

    test(`${id}: the real program moves its outputs and returns home`, async () => {
        const modelText = read(`${LAB}models/${id}.ldr`).toString();
        assert.equal(parseModel(modelText).model.parts.length, spec.parts);
        const result = await runRobotLabProgram(read(`${LAB}programs/${id}.bw`).toString(), {
            modelText,
            observeFrame: ({vm,session}) => ({...(id==='sky-courier'?{ropes:session.core.ropeState()}:{}),variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value])))}),
            afterMs: id === 'gimbal-lab' ? 1000 : 0,
            timeLimitMs: spec.timeLimitMs
        });
        assert.ok(result.finishedAt, `${id}: program reaches its end`);
        assert.deepEqual(result.issues.filter(issue => issue.severity === 'error'), []);
        assert.deepEqual(result.mechanism.actuators.map(actuator => actuator.port).sort(), spec.ports);

        if (id === 'sky-courier') judgeSky(result,{native:true});
        if (id !== 'sky-courier') {
            const judge=id==='product-plotter'?judgeProduct:judgeGimbal;
            console.log(id,JSON.stringify(judge(result)));
            const frozen=structuredClone(result),part=id==='product-plotter'?'output_marker':'marker_primary';
            const body=frozen.mechanism.bodies.find(b=>b.parts.includes(part));
            for(const frame of frozen.track)frame.bodies[body.id]=structuredClone(frozen.track[0].bodies[body.id]);
            assert.throws(()=>judge(frozen),'Identical mechanism judge rejects a frozen passive output');
        }
        const track = result.track;
        for (const actuator of result.mechanism.actuators) {
            const angles = track.map(frame => frame.joints[actuator.joint].angle);
            const range = (Math.max(...angles) - Math.min(...angles)) * DEG;
            assert.ok(range >= spec.ranges[actuator.port], `${id} ${actuator.port}: ${range.toFixed(1)}°`);
            assert.ok(Math.abs(angles.at(-1) * DEG) < 3, `${id} ${actuator.port} returns home`);
        }

        const body = result.mechanism.bodies.find(candidate => candidate.parts.includes(spec.output));
        assert.ok(body, `${id}: output body`);
        const poses = track.map(frame => frame.bodies[body.id]);
        if (spec.orientationDegrees) {
            const maximum = Math.max(...poses.map(pose => quaternionAngle(poses[0].rotation, pose.rotation)));
            assert.ok(maximum >= spec.orientationDegrees, `${id}: output turns ${maximum.toFixed(1)}°`);
            assert.ok(quaternionAngle(poses[0].rotation, poses.at(-1).rotation) < 3, `${id}: output returns home`);
        } else {
            const positions = poses.map(pose => pose.position);
            for (const [axis, index] of [['x', 0], ['y', 1], ['z', 2]]) {
                if (!spec.span[axis]) continue;
                const values = positions.map(position => position[index]);
                const span = (Math.max(...values) - Math.min(...values)) * 1000;
                assert.ok(span >= spec.span[axis], `${id}: output travels ${span.toFixed(1)} mm in ${axis}`);
            }
            const home = Math.hypot(...positions.at(-1).map((value, index) => value - positions[0][index])) * 1000;
            assert.ok(home < 3, `${id}: output returns home`);
        }
    });
}


test('Product: removing only the swivel pin destroys multiplication while both factors still move',async()=>{
    const text=read(`${LAB}models/product-plotter.ldr`).toString();
    const removed=text.replace(/0 !BW ID p_swivel\n1 [^\n]*\n/,'');
    assert.notEqual(removed,text);
    assert.equal(parseModel(text).model.parts.length-parseModel(removed).model.parts.length,1);
    const result=await runRobotLabProgram(read(`${LAB}programs/product-plotter.bw`).toString(),{
        modelText:removed,timeLimitMs:75000,
        observeFrame:({vm})=>({variables:Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables).map(v=>[v.name,v.value])))})
    });
    assert.ok(result.finishedAt);
    const rows=measureProduct(result),span=key=>Math.max(...rows.map(s=>s[key]))-Math.min(...rows.map(s=>s[key]));
    assert.ok(span('a')>47&&span('b')>15,'Both physical input factors still move');
    assert.ok(span('output')<=1,'Disconnected retained output hardly moves');
    assert.ok(Math.max(...rows.map(s=>Math.abs(s.error)))>=10,'Physical disconnection destroys the product law');
    assert.throws(()=>judgeProduct(result));
    console.log('Product disconnected control',JSON.stringify({aSpan:span('a'),bSpan:span('b'),outputSpan:span('output')}));
});


test('intake: original source hashes and bundled model/program identity',()=>{
 for(const [id,folder,model]of [['cusp-lab','cusp-lab','cusp-lab'],['product-plotter','product-plotter','product-plotter'],['gimbal-lab','gimbal-lab','gimbal-lab'],['sky-courier','sky-courier-rebuilt','sky-courier-native']]){
  const root=`test/fixtures/model-files/${folder}-source/`,p=JSON.parse(read(root+'provenance.json'));
  for(const [file,sha]of Object.entries(p.files))assert.equal(createHash('sha256').update(read(root+file)).digest('hex'),sha);
  assert.deepEqual(read(root+`models/${model}.ldr`),read(LAB+`models/${id}.ldr`));
  let program=read(root+`programs/${id}.bw`).toString();
  // The pane has already reset before starting. Resetting inside the VM can
  // replace the session the running program and observers are attached to.
  if(id==='product-plotter')program=program.replace('  lab reset\n','');
  // This supplier text omitted the dialect declaration and simulation start.
  if(id==='sky-courier')program='DEVICE SPIKE\n'+program.replace('  lab stop motor A coast','  lab start\n  lab stop motor A coast');
  assert.equal(program,read(LAB+`programs/${id}.bw`).toString());
 }
});

test('Sky: fresh unpowered cable support and a real one-cable-loss control',async()=>{
 const source=read(LAB+'models/sky-courier.ldr').toString();
 const idle='DEVICE SPIKE\nWHEN flag clicked:\n  lab start\n  wait 0.01 seconds\n';
 for(const negative of [false,true]){
  const text=negative?source.replace(/^0 !BW ROPE B_cord.*\n/m,''):source;
  if(negative)assert.notEqual(text,source);
  const r=await runRobotLabProgram(idle,{modelText:text,timeLimitMs:200,coldMs:negative?100:2000,frameMs:5,
   observeFrame:({session})=>({ropes:session.core.ropeState()})});
  const cold=r.track.filter(f=>f.phase==='cold'),body=r.mechanism.bodies.find(b=>b.parts.includes('payload_tie_spine'));
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))*1000;
  const loss=Math.max(...cold.map(f=>distance(f.bodies[body.id].position,cold[0].bodies[body.id].position)));
  if(negative){assert.ok(loss>5,`A real missing cable loses support: ${loss} mm`);}
  else{
   assert.ok(loss<=1,`Cold gondola drift ${loss} mm`);
   assert.ok(cold.filter(f=>f.t>=1500).every(f=>f.extra.ropes.every(s=>s.tension>=.001)),'Every native 5ms settled cold tension sample supports the gondola');
  }
 }
});
