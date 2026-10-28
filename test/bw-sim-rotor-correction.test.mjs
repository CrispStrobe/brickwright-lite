// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Native controls for the provisional rotor correction. Original Sarrus/world/
// transport assertions remain in their existing files and must also qualify it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadJolt,createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
const J=await loadJolt(),DT=.005,JR=3e-4;
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1e-9,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const tensorsNear=(a,b)=>a.flat().forEach((v,i)=>near(v,b.flat()[i],2e-5));
const bench=({shared=false,clamped=false,reverse=false}={})=>{
    const bodies=[['a',.5,.095],['b',.05,.048],...(shared?[['c',.08,.06]]:[])].map(([id,massKg,radius],i)=>({
        id,motion:clamped&&id==='a'?'static':'dynamic',massKg,position:[0,i*.05,0],rotation:[0,0,0,1],angularDamping:0,
        colliders:[{shape:'cylinder',radius,halfHeight:.002}],parts:[]}));
    const hinge=(id,body1,body2,y)=>({id,type:'hinge',body1,body2,point:[0,y,0],axis:[0,1,0],motor:{port:id==='j1'?'A':'B',maxTorqueNm:.2,maxSpeedRadPerSec:30}});
    const joints=[reverse?hinge('j1','b','a',.025):hinge('j1','a','b',.025),...(shared?[hinge('j2','b','c',.075)]:[])];
    const core=createPhysicsCore(J,{version:1,gravity:[0,0,0],bodies,joints,gears:[],diagnostics:[]},{stepHz:1/DT});
    return {core,ids:bodies.filter(b=>b.motion==='dynamic').map(b=>b.id)};
};
const bareMoments=(core,ids)=>Object.fromEntries(ids.map(id=>[id,core.bodyDynamics(id).inertiaKgM2[1][1]]));
const momentum=(core,m)=>Object.entries(m).reduce((s,[id,I])=>s+I*core.bodyAngularVelocity(id)[1],0);
const step=(core,n)=>{for(let i=0;i<n;i++)core.step(DT);};
const record=core=>({a:core.bodyPose('a'),b:core.bodyPose('b'),j:core.jointState('j1'),effort:core.jointDynamics('j1')});

test('rotor configuration is idempotent; shared additions remove and restore without tensor drift',()=>{
    const {core,ids}=bench({shared:true});
    try{
        const bare=Object.fromEntries(ids.map(id=>[id,core.bodyDynamics(id).inertiaKgM2]));
        core.setRotorInertia('j1',JR);core.setRotorInertia('j2',JR/2);
        const configured=Object.fromEntries(ids.map(id=>[id,core.bodyDynamics(id).inertiaKgM2]));
        for(let i=0;i<20;i++){core.setRotorInertia('j1',JR);core.setRotorInertia('j2',JR/2);}
        for(const id of ids)tensorsNear(core.bodyDynamics(id).inertiaKgM2,configured[id]);
        core.setRotorInertia('j1',0);core.setRotorInertia('j2',0);
        for(const id of ids)tensorsNear(core.bodyDynamics(id).inertiaKgM2,bare[id]);
        core.setRotorInertia('j2',JR/2);core.setRotorInertia('j1',JR);
        for(const id of ids)tensorsNear(core.bodyDynamics(id).inertiaKgM2,configured[id]);
    }finally{core.destroy();}
});
test('current signed motor impulse conserves bare pair momentum for acceleration and reversal',()=>{
    const {core,ids}=bench();
    try{
        const m=bareMoments(core,ids);core.setRotorInertia('j1',JR);
        for(const torqueNm of [.003,-.003]){
            core.setMotor('j1',{mode:'torque',torqueNm,dampingNmsPerRad:0});
            for(let i=0;i<80;i++){
                core.step(DT);const p=momentum(core,m);
                assert.ok(Math.abs(p)<1e-7,`bare momentum ${p}`);
                assert.equal(Math.sign(core.jointDynamics('j1').motorTorqueNm),Math.sign(torqueNm));
            }
        }
    }finally{core.destroy();}
});
test('passive off-state friction is an internal impulse, not an omitted motor-state case',()=>{
    const {core,ids}=bench();
    try{
        const m=bareMoments(core,ids),relative=4,a=-m.b/(m.a+m.b)*relative;
        core.setRotorInertia('j1',JR);core.setBodyVelocity('a',[0,0,0],[0,a,0]);core.setBodyVelocity('b',[0,0,0],[0,a+relative,0]);
        core.setMotor('j1',{mode:'coast',frictionNm:.001});
        for(let i=0;i<50;i++){core.step(DT);assert.ok(Math.abs(momentum(core,m))<1e-7);}
        assert.ok(Math.abs(core.jointState('j1').velocity)<relative,'friction actually slowed the pair');
    }finally{core.destroy();}
});
test('one common correction preserves simultaneous velocity servos on a shared rotor body',()=>{
    const {core,ids}=bench({shared:true});
    try{
        const m=bareMoments(core,ids);core.setRotorInertia('j1',JR);core.setRotorInertia('j2',JR/2);
        core.setMotor('j1',{mode:'velocity',radPerSec:3});core.setMotor('j2',{mode:'velocity',radPerSec:-2});
        step(core,200);
        assert.ok(Math.abs(core.jointState('j1').velocity-3)<.01);
        assert.ok(Math.abs(core.jointState('j2').velocity+2)<.01);
        assert.ok(Math.abs(momentum(core,m))<1e-7);
    }finally{core.destroy();}
});
test('clamped endpoint orientation retains Jr and no kick reaches the static housing',()=>{
    for(const reverse of [false,true]){
        const {core}=bench({clamped:true,reverse});
        try{
            const base=core.bodyDynamics('b').inertiaKgM2,pose=core.bodyPose('a');core.setRotorInertia('j1',JR);
            near(core.bodyDynamics('b').inertiaKgM2[1][1],base[1][1]+JR,2e-5);
            core.setMotor('j1',{mode:'velocity',radPerSec:2});step(core,100);
            assert.ok(Math.abs(core.jointState('j1').velocity-2)<.01);assert.deepEqual(core.bodyPose('a'),pose);
        }finally{core.destroy();}
    }
});
test('rollback restores changed rotor configuration and the next trajectory exactly',()=>{
    const {core}=bench();
    try{
        core.setRotorInertia('j1',JR);core.setMotor('j1',{mode:'torque',torqueNm:.003,dampingNmsPerRad:.0001});
        step(core,10);core.checkpoint();step(core,30);const expected=record(core);
        core.setRotorInertia('j1',0);core.setMotor('j1',{mode:'velocity',radPerSec:-2});step(core,10);
        core.rollback();step(core,30);assert.deepEqual(record(core),expected);
    }finally{core.destroy();}
});
