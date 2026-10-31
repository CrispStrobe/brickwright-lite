// SPDX-License-Identifier: BSD-3-Clause
// Issue #1435 fix: a compound body resting on the floor with a collider hovering inside the
// speculative contact band (1–2 mm up) no longer rocks, sinks or creeps. Jolt prunes a reduced
// floor manifold to 4 points, weighting each by its unsigned point separation, so the idle hover
// point displaced a touching support corner. The core's contact listener now drops a floor hit
// that is separated by more than the slop and cannot close in this step (jolt-core.js,
// floorSpeculativeFilterPlan). experiments.floorSpeculativeFilter=false restores main's
// behaviour, so each case first shows the creep and then its absence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {prepareInputs,frameBody} from './fixtures/resting-creep-1435/observe.mjs';
import {contactManifest,buildContactCase} from './fixtures/resting-creep-1435/observe-contact.mjs';
import {clearStrayTimers} from './helpers/bw-vm.mjs';

const HZ=200,STEPS=350;
const yawDeg=q=>2*Math.atan2(q[1],q[3])*180/Math.PI;
const tiltDeg=q=>{const [x,,z]=q;return Math.acos(Math.max(-1,Math.min(1,1-2*(x*x+z*z))))*180/Math.PI;};

/** Passive run of one body; horizontal drift (mm), yaw change (deg), max tilt (deg) and lowest y change (mm). */
function rest(J,mechanism,id,experiments={},steps=STEPS) {
    const core=createPhysicsCore(J,mechanism,{stepHz:HZ,experiments});
    try {
        const p0=core.bodyPose(id);let tilt=0,dropMm=0;
        for(let i=0;i<steps;i++) {
            core.step(1/HZ);
            const p=core.bodyPose(id);
            tilt=Math.max(tilt,tiltDeg(p.rotation));dropMm=Math.max(dropMm,(p0.position[1]-p.position[1])*1e3);
        }
        const p=core.bodyPose(id);
        return {mm:Math.hypot(p.position[0]-p0.position[0],p.position[2]-p0.position[2])*1e3,
            yaw:Math.abs(yawDeg(p.rotation)-yawDeg(p0.rotation)),tilt,dropMm,pose:p};
    } finally {core.destroy();}
}
const spec=id=>contactManifest.cases.find(c=>c.id===id);

test('Resting creep fix: hover-in-band frames creep on the old contact path and stand still now',{timeout:120000},async t=>{
    try {
        const J=await loadJolt(),prepared=prepareInputs();
        // The complete coplanar Orrery (base_rail_0 lowered back to y 200: every joint, gear and hub
        // kept), then the isolated-frame and synthetic-plate cases of the contact stage.
        const complete=prepared.get('orrery-coplanar').mechanism;
        const cases=[['orrery-coplanar-complete',{mechanism:complete,subject:frameBody(complete)}],
            ...['coplanar-all-colliders','raised-hover-parts-up-0.5mm','plate-hover-1.6mm','plate-hover-1.9mm'].map(id=>[id,buildContactCase(spec(id),prepared)])];
        for(const [id,built] of cases) {
            const before=rest(J,built.mechanism,built.subject.id,{floorSpeculativeFilter:false});
            const after=rest(J,built.mechanism,built.subject.id);
            t.diagnostic(`${id}: before ${before.mm.toFixed(4)} mm ${before.yaw.toFixed(4)}° tilt ${before.tilt.toFixed(4)}°; after ${after.mm.toFixed(4)} mm ${after.yaw.toFixed(4)}° tilt ${after.tilt.toFixed(4)}°`);
            assert.ok(before.mm>1||before.tilt>0.5,`${id}: the old path reproduces the creep (${before.mm} mm, tilt ${before.tilt}°)`);
            assert.ok(after.mm<=0.01,`${id}: drift ${after.mm} mm`);
            assert.ok(after.yaw<=0.01,`${id}: yaw ${after.yaw}°`);
            assert.ok(after.tilt<=0.01,`${id}: tilt ${after.tilt}°`);
            assert.ok(after.dropMm<=0.01,`${id}: sink ${after.dropMm} mm`);
        }
    } finally {clearStrayTimers();}
});

test('Resting creep fix: four coplanar flat beams alone stay still, with and without the filter',{timeout:60000},async()=>{
    try {
        const J=await loadJolt(),built=buildContactCase(spec('plate-flat'),prepareInputs());
        for(const experiments of [{},{floorSpeculativeFilter:false}]) {
            const r=rest(J,built.mechanism,built.subject.id,experiments,600);
            assert.ok(r.mm<=0.01&&r.yaw<=0.01&&r.tilt<=0.01,JSON.stringify(r));
        }
    } finally {clearStrayTimers();}
});

test('Resting creep fix: a falling compound still lands on its speculative contacts',{timeout:60000},async()=>{
    try {
        // The plate with its hover cube, released 30 mm up: every floor hit near touchdown is
        // closing, so none is dropped and the landing is the same as on the old path.
        const J=await loadJolt(),built=buildContactCase(spec('plate-hover-1.6mm'),prepareInputs());
        const body=built.mechanism.bodies[1];
        const dropped={...built.mechanism,bodies:[built.mechanism.bodies[0],{...body,position:[body.position[0],body.position[1]+0.03,body.position[2]]}]};
        const core=(experiments)=>{const c=createPhysicsCore(J,dropped,{stepHz:HZ,experiments});
            try{let low=Infinity;for(let i=0;i<30;i++){c.step(1/HZ);low=Math.min(low,c.bodyPose(body.id).position[1]);}return low;}finally{c.destroy();}};
        const on=core({}),off=core({floorSpeculativeFilter:false});
        // Up to the touchdown step both runs are identical; the lowest point reached may differ only
        // by the post-landing settling, never by a fall through the floor.
        assert.ok(on>body.position[1]-0.0005,`landed at ${on}, rest height ${body.position[1]}`);
        assert.ok(Math.abs(on-off)<0.0005,`lowest ${on} vs ${off}`);
    } finally {clearStrayTimers();}
});
