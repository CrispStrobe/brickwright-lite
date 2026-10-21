// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {buildSteps} from '../overlay/scratch-gui/src/lib/bw-sim/instructions/steps.js';
import {solidOverlaps} from '../overlay/scratch-gui/src/lib/bw-sim/editor/overlap.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {runOnSimLab} from './helpers/sim-lab-vm.mjs';
import {TIDAL_PRESETS, judgeTidalRun} from '../scripts/lib/sim-lab-tidal-judge.mjs';
const GUI = new URL('../overlay/scratch-gui/', import.meta.url);
const C = catalogFrom(JSON.parse(readFileSync(new URL('src/lib/bw-sim/part-meta/parts.json',GUI))));
const text = readFileSync(new URL('static/sim-lab/models/tidal-trio.ldr',GUI),'utf8');
const prepared = () => prepareModel(text,C,{mat:'plain'});
test('tidal trio: pinned console, 226 connected pieces, three motors, complete instructions and owner credit', () => {
    const {model, mechanism, issues} = prepared();
    const source = readFileSync(new URL('./fixtures/model-files/tidal-trio-source/tidal_trio_home.mpd',import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'),'2d22875000cdedb24e5135eea5c1282b1e0ddfa4ca6a7a56ee7f3d07c69233c5');
    assert.equal(model.parts.length,226);
    assert.equal(model.decor?.length||0,0);
    assert.equal(mechanism.actuators.length,3);
    assert.deepEqual(issues.map(i=>i.code),['locked-hinges','locked-hinges','locked-hinges']);
    assert.deepEqual(issues.flatMap(i=>i.parts).filter(id=>/^rocker[012]$/.test(id)).sort(),['rocker0','rocker1','rocker2']);
    assert.equal(mechanism.bodies.find(b=>b.parts.includes('hub')).id,mechanism.bodies.find(b=>b.parts.includes('motor0')).id);
    for(const part of model.parts) assert.deepEqual(solidOverlaps(model,C,part),[],part.id);
    const plan=buildSteps(model,C);
    assert.ok(plan.steps.every(s=>!s.loose && s.parts.length<=6));
    assert.deepEqual(plan.steps.flatMap(s=>s.parts).sort(),model.parts.map(p=>p.id).sort());
    assert.match(text,/Author: CrispStrobe/);
    assert.match(text,/BSD-3-Clause/);
    assert.match(readFileSync(new URL('static/sim-lab/licenses/tidal-trio.txt',GUI),'utf8'),/Copyright \(c\) 2026 CrispStrobe/);
    // Our own named designs keep unplugged ports unplugged, as Brickwright files do.
    const unplugged=prepareModel(text.replace(/^0 !BW PORT [ABC]\r?\n/gm,''),C,{mat:'plain'});
    assert.ok(!unplugged.issues.some(i=>i.code==='ports-plugged'));
});
test('tidal trio: all three motors at 60% for two seconds remain finite and upright',async()=>{
    const {mechanism:m}=prepared();const core=createPhysicsCore(await loadJolt(),m,{stepHz:200});
    const base=m.bodies.find(b=>b.parts.includes('hub')).id;
    try{
        for(let i=0;i<40;i++)core.step(.005);
        for(const a of m.actuators)core.setMotor(a.joint,{mode:'velocity',radPerSec:.6*a.maxSpeedRadPerSec});
        for(let i=0;i<400;i++){
            core.step(.005);const root=core.bodyPose(base);
            assert.ok(1-2*(root.rotation[0]**2+root.rotation[2]**2)>.995);
            for(const b of m.bodies.filter(b=>b.motion==='dynamic')){
                const p=core.bodyPose(b.id);assert.ok([...p.position,...p.rotation].every(Number.isFinite));
                assert.ok(Math.hypot(...p.position.map((x,j)=>x-root.position[j]))<.5);
            }
        }
        for(const a of m.actuators)assert.ok(Math.abs(core.jointState(a.joint).angle)>20,a.port);
    }finally{core.destroy();}
});
for(const preset of TIDAL_PRESETS)test(`tidal trio ${preset.id}: actual VM program satisfies four-bar geometry, sweep and phase`,async t=>{
    const r=await runOnSimLab(readFileSync(new URL(`static/sim-lab/programs/${preset.id}.bw`,GUI),'utf8'),{modelText:text,mat:'plain',timeLimitMs:36000});
    const result={...r,unsupported:r.run.unsupported};
    t.diagnostic(JSON.stringify(judgeTidalRun(preset.id,result)));
    if(preset.id==='tidal-trio'){
        const rocker=r.mechanism.bodies.find(b=>b.parts.includes('rocker0')).id;
        const track=r.track.map(f=>({...f,bodies:{...f.bodies,[rocker]:r.track[0].bodies[rocker]}}));
        assert.throws(()=>judgeTidalRun(preset.id,{...result,track}),/four-bar closure residual/,'turning encoders cannot replace physical rocking');
    }
});
