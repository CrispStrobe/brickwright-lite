// SPDX-License-Identifier: BSD-3-Clause
// Requires the separately qualified native reflected-rotor package; no fallback solver.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
const DT=0.005,Jr=0.0003;
const body=(id,y)=>({id,motion:'dynamic',massKg:0.5,position:[0,y,0],rotation:[0,0,0,1],
    colliders:[{shape:'cylinder',radius:0.1,halfHeight:0.002}],parts:[],linearDamping:0,angularDamping:0});
const motor={port:'A',maxTorqueNm:0.003,maxSpeedRadPerSec:20};
const scene=()=>({version:1,rotor:'native',gravity:[0,0,0],bodies:[body('a',0),body('b',0.05)],
    joints:[{id:'j',type:'hinge',body1:'a',body2:'b',point:[0,0.025,0],axis:[0,1,0],motor}],gears:[],diagnostics:[]});
const create=async()=>createPhysicsCore(await loadJolt(),scene(),{stepHz:200});
const bare=core=>['a','b'].map(id=>{const p=core.bodyDynamics(id);return {mass:p.solverMassKg,com:p.centerOfMassWorld,inertia:p.inertiaKgM2};});
const optional=['rotorImpulseNmS','rotorTorqueNm','rotorInertiaKgM2','rotorAngularVelocityRadS','rotorEnergyJ'];
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b} (${tol})`);
test('native rotor config is atomic, preserves bare properties and zero effort shape',async()=>{
    const core=await create();
    try {
        const properties=bare(core);core.step(DT);
        const zero=core.jointDynamics('j');for(const k of optional)assert.equal(k in zero,false);
        core.setRotorInertia('j',Jr);assert.deepEqual(bare(core),properties);
        core.setMotor('j',{mode:'velocity',radPerSec:10});core.step(DT);
        const loaded=core.jointDynamics('j');assert.ok(loaded.rotorInertiaKgM2>0);assert.ok(Math.abs(loaded.rotorImpulseNmS)>0);
        near(loaded.rotorInertiaKgM2,Math.fround(Jr));near(loaded.rotorTorqueNm,loaded.rotorImpulseNmS/DT);
        near(loaded.rotorEnergyJ,0.5*loaded.rotorInertiaKgM2*loaded.rotorAngularVelocityRadS**2);
        near(loaded.motorPowerW,loaded.motorTorqueNm*loaded.angularVelocityRadS);
        // A completed-step sample stays immutable across later commands/configuration.
        core.setRotorInertia('j',2*Jr);assert.deepEqual(core.jointDynamics('j'),loaded);
        core.jointDynamics('j').rotorEnergyJ=99;assert.deepEqual(core.jointDynamics('j'),loaded);
        core.checkpoint();core.step(DT);const expected=core.jointDynamics('j');core.rollback();
        for(const invalid of [-1,NaN,Infinity,Number.MAX_VALUE])assert.throws(()=>core.setRotorInertia('j',invalid));
        core.step(DT);assert.deepEqual(core.jointDynamics('j'),expected);
        core.setRotorInertia('j',0);core.step(DT);for(const k of optional)assert.equal(k in core.jointDynamics('j'),false);
    } finally {core.destroy();}
});
test('native checkpoint restores rotor config, scalar and warm impulse without a setter reset',async()=>{
    const core=await create();
    try {
        core.setRotorInertia('j',Jr);core.setMotor('j',{mode:'velocity',radPerSec:10});
        for(let i=0;i<5;i++)core.step(DT);
        core.checkpoint();const saved=core.jointDynamics('j');core.step(DT);
        const expected={effort:core.jointDynamics('j'),a:core.bodyAngularVelocity('a'),b:core.bodyAngularVelocity('b')};
        // Ensure JS metadata differs at restore: calling the native setter would
        // clear the restored warm impulse or initialize the scalar incorrectly.
        core.setRotorInertia('j',0);core.step(DT);core.setRotorInertia('j',2*Jr);core.step(DT);
        core.rollback();assert.deepEqual(core.jointDynamics('j'),saved);core.step(DT);
        assert.deepEqual({effort:core.jointDynamics('j'),a:core.bodyAngularVelocity('a'),b:core.bodyAngularVelocity('b')},expected);
        core.checkpoint();core.setRotorInertia('j',Jr);core.step(DT);const same=core.jointDynamics('j');
        core.rollback();core.step(DT);assert.deepEqual(core.jointDynamics('j'),same);
    } finally {core.destroy();}
});
test('worker mirror preserves optional rotor fields, isolates copies and clears stale samples',async()=>{
    const {MirrorCore}=await import('../overlay/scratch-gui/src/lib/bw-sim/sim-worker-protocol.js');
    const pose={t:DT,bodies:[],joints:[0,0],jointDynamics:{j:{t:DT,stepSeconds:DT,
        rotorImpulseNmS:1e-6,rotorTorqueNm:0.0002,rotorInertiaKgM2:Jr,rotorAngularVelocityRadS:2,rotorEnergyJ:2*Jr}}};
    const mirror=new MirrorCore({bodies:[],joints:[{id:'j',type:'hinge'}]},pose);
    const original=structuredClone(pose.jointDynamics.j);pose.jointDynamics.j.rotorEnergyJ=99;
    assert.deepEqual(mirror.jointDynamics('j'),original);
    mirror.jointDynamics('j').rotorEnergyJ=88;assert.deepEqual(mirror.jointDynamics('j'),original);
    mirror.update({t:2*DT,bodies:[],joints:[0,0]});assert.equal(mirror.jointDynamics('j'),null);
});
