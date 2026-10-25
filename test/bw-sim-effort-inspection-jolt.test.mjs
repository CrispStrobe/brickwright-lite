// SPDX-License-Identifier: BSD-3-Clause
// Hosted actual-Jolt controls: never substituted by the pure boundary suite.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {upgradeMechanismV1} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
const DT=0.005;
const body=(id,massKg,position,radius=0.1)=>({id,massKg,position,motion:massKg?'dynamic':'static',rotation:[0,0,0,1],colliders:[{shape:'cylinder',radius,halfHeight:0.01}],parts:[],linearDamping:0,angularDamping:0});
const motor={port:'A',maxTorqueNm:0.1,maxSpeedRadPerSec:20};
const mechanism=()=>({version:1,gravity:[0,0,0],bodies:[body('base',0,[0,-1,0]),body('rotor',1,[0,0,0])],joints:[{id:'j',type:'hinge',body1:'base',body2:'rotor',point:[0,0,0],axis:[0,1,0],motor}],gears:[],diagnostics:[]});
const near=(a,b,tol)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b} within ${tol}`);
test('actual solver signed torque, braking power, COM/inertia and rollback match angular momentum',async()=>{
    const J=await loadJolt();const core=createPhysicsCore(J,upgradeMechanismV1(mechanism()),{stepHz:200});
    try {
        assert.equal(core.jointDynamics('j'),null);core.step(0);assert.equal(core.jointDynamics('j'),null);
        const props=core.bodyDynamics('rotor');near(props.solverMassKg,1,1e-7);near(props.inertiaKgM2[1][1],0.005,1e-7);
        assert.deepEqual(props.centerOfMassWorld,[0,0,0]);assert.equal(core.bodyDynamics('base').solverMassKg,null);assert.equal(core.bodyDynamics('base').inertiaKgM2,null);
        for(const sign of [1,-1]) {
            core.setBodyVelocity('rotor',[0,0,0],[0,0,0]);core.setMotor('j',{mode:'velocity',radPerSec:sign*10});core.step(DT);
            const d=core.jointDynamics('j');near(d.motorTorqueNm,sign*0.1,1e-5);near(d.motorTorqueNm,props.inertiaKgM2[1][1]*d.angularVelocityRadS/DT,1e-5);assert.ok(d.motorPowerW>0);assert.equal(d.limitTorqueNm,0);
        }
        core.setBodyVelocity('rotor',[0,0,0],[0,2,0]);core.setMotor('j',{mode:'brake'});core.step(DT);assert.ok(core.jointDynamics('j').motorPowerW<0);
        core.setMotor('j',{mode:'coast',frictionNm:0.02});core.step(DT);const coast=core.jointDynamics('j');assert.equal(coast.motorTorqueNm,0);near(coast.passiveTorqueNm,-0.02,1e-5);assert.equal(coast.motorPowerW,0);
        core.checkpoint();const saved=core.jointDynamics('j');core.step(DT);const after=core.jointDynamics('j');core.rollback();assert.deepEqual(core.jointDynamics('j'),saved);core.step(DT);assert.deepEqual(core.jointDynamics('j'),after);
        core.jointDynamics('j').motorTorqueNm=99;assert.notEqual(core.jointDynamics('j').motorTorqueNm,99);
    } finally {core.destroy();}
});
test('actual freely falling floored gear assembly has no floor normal load',async()=>{
    const J=await loadJolt();
    const m={version:1,gravity:[0,-9.81,0],bodies:[body('frame',1,[0,4,0]),body('g1',0.003,[0,5,0],0.005),body('g2',0.007,[0.016,5,0],0.012)],joints:[{id:'j1',type:'hinge',body1:'frame',body2:'g1',point:[0,5,0],axis:[0,1,0]},{id:'j2',type:'hinge',body1:'frame',body2:'g2',point:[0.016,5,0],axis:[0,1,0]}],gears:[{id:'gear',type:'gear',joint1:'j1',joint2:'j2',ratio:-1/3}],diagnostics:[]};
    m.bodies[1].rollingResistance=0.05;m.bodies[2].rollingResistance=0.05;
    const core=createPhysicsCore(J,upgradeMechanismV1(m),{stepHz:200});
    try {
        const p=core.bodyDynamics('g1');assert.ok(p.massAdjusted&&p.inertiaAdjusted);near(p.solverMassKg,0.02,1e-7);near(p.gravityFactor,0.003/0.02,1e-6);
        for(let i=0;i<20;i++)core.step(DT);
        for(const id of ['g1','g2'])assert.ok(core.rollingWheel(id).load<1e-3,`${id} unsupported load ${core.rollingWheel(id).load}`);
        // Prescribed signed vertical kicks before the next fixed step isolate the
        // estimator's acceleration term while retaining the previous real hinge impulses.
        core.checkpoint();core.step(DT);const baseline=core.rollingWheel('g1').load;core.rollback();
        const v=core.bodyLinearVelocity('g1'),w=core.bodyAngularVelocity('g1');
        core.setBodyVelocity('g1',[v[0],v[1]+0.1,v[2]],w);core.step(DT);
        near(core.rollingWheel('g1').load,baseline+p.solverMassKg*0.1/DT,1e-3);
        core.rollback();core.setBodyVelocity('g1',[v[0],v[1]-0.1,v[2]],w);core.step(DT);
        near(core.rollingWheel('g1').load,0,1e-3);
    } finally {core.destroy();}
});
