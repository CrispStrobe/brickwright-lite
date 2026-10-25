// SPDX-License-Identifier: BSD-3-Clause
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRollingResistance,rollingRadius} from '../overlay/scratch-gui/src/lib/bw-sim/physics/rolling.js';
const vec = (x=0,y=0,z=0) => ({GetX:()=>x,GetY:()=>y,GetZ:()=>z});
function bench(mass, factor) {
    let vy=0;
    const b={id:'wheel',massKg:0.01,motion:'dynamic',rollingResistance:0.05,position:[0,0,0],rotation:[0,0,0,1],colliders:[{shape:'cylinder',radius:0.02}]};
    const mp={GetInverseMass:()=>1/mass,GetGravityFactor:()=>factor};
    const h={mode:'coast',frictionNm:0,hinge:{GetTotalLambdaPosition:()=>vec(),SetMaxFrictionTorque:()=>{}}};
    const rolling=createRollingResistance({J:{Vec3:class{},destroy:()=>{}},mechanism:{gravity:[0,-10,0],bodies:[b],joints:[{id:'j',body1:'world',body2:'wheel',axis:[0,1,0],point:[0,0,0]}]},bodyMap:new Map([['wheel',{bodyID:1,body:{GetMotionProperties:()=>mp}}]]),hingeMap:new Map([['j',{...h,localAxis2:[0,1,0]}]]),bodyInterface:{GetLinearVelocity:()=>vec(0,vy,0)},dt:0.1,inertiaOf:()=>[]});
    return {rolling,set:v=>{vy=v;}};
}
test('floored rolling body uses inertial mass for acceleration and retained gravitational weight',()=>{
    const b=bench(0.02,0.5);b.rolling.apply();assert.equal(b.rolling.wheels[0].load,0.1);
    b.set(0.1);b.rolling.apply();assert.ok(Math.abs(b.rolling.wheels[0].load-0.12)<1e-12);
    b.set(0);b.rolling.apply();assert.ok(Math.abs(b.rolling.wheels[0].load-0.08)<1e-12);
});
test('ordinary wheel, freefall, and rollback preserve the normal load boundary',()=>{
    const b=bench(0.01,1);b.rolling.apply();const saved=b.rolling.registrant.save();
    b.set(-1);b.rolling.apply();assert.equal(b.rolling.wheels[0].load,0);
    b.rolling.registrant.restore(saved);b.set(0.1);b.rolling.apply();assert.ok(Math.abs(b.rolling.wheels[0].load-0.11)<1e-12);
});

import {readFileSync} from 'node:fs';
const coreSource=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js',import.meta.url),'utf8');
const protocolSource=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/sim-worker-protocol.js',import.meta.url),'utf8');
const captureSource=coreSource.slice(coreSource.indexOf('const capture = (id,'),coreSource.indexOf('                for (const [id, e] of hingeMap) capture'));
const capture=(off,velocity,lambda,limit,angular=true)=>{
    const dynamics={};const constraint={GetTotalLambdaMotor:()=>lambda,GetMotorState:()=>off?0:1,GetTotalLambdaRotationLimits:()=>limit,GetTotalLambdaPositionLimits:()=>limit};
    Function('dynamics','dtFixed','timeSteps','J','entry','constraint','angular',`${captureSource};capture('j',entry,constraint,angular);`)(dynamics,0.01,2,{EMotorState_Off:0},{velocity,mode:off?'coast':'velocity'},constraint,angular);
    return dynamics.j;
};
test('actual fixed-step capture separates signed motor, passive and limit effort and matching power',()=>{
    const d=capture(false,-2,-0.03,0.04);assert.equal(d.motorTorqueNm,-3);assert.equal(d.motorPowerW,6);assert.equal(d.limitTorqueNm,4);assert.equal(d.passiveTorqueNm,0);assert.equal(d.t,0.02);assert.equal(d.stepSeconds,0.01);
    const brake=capture(false,2,-0.03,0);assert.equal(brake.motorPowerW,-6);
    const off=capture(true,2,-0.03,0);assert.equal(off.motorTorqueNm,0);assert.equal(off.passiveTorqueNm,-3);assert.equal(off.motorPowerW,0);
    const slider=capture(false,2,0.03,-0.04,false);assert.equal(slider.motorForceN,3);assert.equal(slider.limitForceN,-4);assert.equal(slider.linearVelocityMS,2);
});
const MirrorCore=Function('copyObservation',protocolSource.slice(protocolSource.indexOf('export class MirrorCore')).replace('export class','return class'))(x=>x==null?null:JSON.parse(JSON.stringify(x)));
test('accepted mirror observations copy ingress and egress and clear missing telemetry',()=>{
    const mechanism={bodies:[{id:'b'}],joints:[{id:'j',type:'hinge'}]};
    const body={centerOfMassWorld:[1,2,3],inertiaKgM2:[[1,0,0],[0,2,0],[0,0,3]]};
    const joint={motorTorqueNm:2};const poses={t:1,bodies:new Float64Array(7),joints:new Float64Array(2),bodyDynamics:{b:body},jointDynamics:{j:joint}};
    const mirror=new MirrorCore(mechanism,poses);body.centerOfMassWorld[0]=99;joint.motorTorqueNm=99;
    assert.equal(mirror.bodyDynamics('b').centerOfMassWorld[0],1);assert.equal(mirror.jointDynamics('j').motorTorqueNm,2);
    mirror.bodyDynamics('b').inertiaKgM2[0][0]=99;assert.equal(mirror.bodyDynamics('b').inertiaKgM2[0][0],1);
    mirror.update({t:2,bodies:poses.bodies,joints:poses.joints});assert.equal(mirror.jointDynamics('j'),null);assert.equal(mirror.bodyDynamics('b'),null);
});
test('actual observation registrant restores independent fixed-step data on rollback',()=>{
    const start=coreSource.indexOf("stateRegistry.register('joint-dynamics',");const end=coreSource.indexOf("    stateRegistry.register('clock',",start);
    const run=Function(`let dynamics={j:{motorTorqueNm:3,t:1}};const copyDynamics=x=>JSON.parse(JSON.stringify(x));let registry;const stateRegistry={register:(k,r)=>{registry=r;}};${coreSource.slice(start,end)}const saved=registry.save();dynamics.j.motorTorqueNm=9;registry.restore(saved);saved.j.motorTorqueNm=20;return registry.save();`);
    assert.deepEqual(run(),{j:{motorTorqueNm:3,t:1}});
});

test('imported locked differential has an explicit finite straight-only no-slip boundary',t=>{
    const source=readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/catalog-parts.js',import.meta.url),'utf8');
    const start=source.indexOf('const COMPOUND = ');const end=source.indexOf('\nconst compound =',start);
    const compounds=Function(`${source.slice(start,end)};return COMPOUND;`)();
    const differential=compounds['62821.dat'];assert.deepEqual(differential.retype,{h0:'axlehole',h1:'axlehole'});assert.deepEqual(differential.connectors,[]);
    // A solid axle requires equal rates. A finite-radius no-slip turn requires
    // unequal outer/inner rates; this records a model boundary, not a slip repair.
    const track=0.16,radius=0.5,speed=0.2,wheelRadius=0.04;
    const outer=speed*(radius+track/2)/radius/wheelRadius,inner=speed*(radius-track/2)/radius/wheelRadius;
    nearPure(outer/inner,0.58/0.42);assert.ok(outer-inner>1);
    const hub=compounds['46490c01.dat'];assert.equal(hub.internalJoints.length,1);assert.equal(hub.internalJoints[0].type,'hinge');assert.equal(hub.internalJoints[0].actuatedBy,'none');
    const beta=20*Math.PI/180;const ratios=[Math.cos(beta),1/Math.cos(beta)];assert.ok(ratios.every(Number.isFinite));assert.ok(ratios[0]<0.95&&ratios[1]>1.05);
    t.diagnostic(`Locked axle cannot satisfy no-slip rate ratio ${outer/inner}; Cardan proxy at 20 degrees spans ${ratios.join(' to ')}. No planetary reduction or true CV fidelity is inferred.`);
});
function nearPure(a,b){assert.ok(Math.abs(a-b)<1e-12);}
test('actual inspector method returns solver properties, adjustment flags, independent COM/tensor and explicit static state',()=>{
    const start=coreSource.indexOf('        bodyDynamics(bodyId) {');const end=coreSource.indexOf('        bodyPose(bodyId)',start);
    const tensor=[[0.1,0,0],[0,0.2,0],[0,0,0.3]],mp={GetInverseMass:()=>50,GetGravityFactor:()=>0.5};
    const dynamic={motionType:1,configuredMassKg:0.01,massFloorKg:0.02,smallInertiaRepaired:true,baselineInertia:[[0.01,0,0],[0,0.02,0],[0,0,0.03]],body:{GetCenterOfMassPosition:()=>vec(1,2,3),GetMotionProperties:()=>mp}};
    const fixed={...dynamic,motionType:0,configuredMassKg:0};const bodyMap=new Map([['b',dynamic],['s',fixed]]);
    const api=Function('ensureAlive','bodyMap','J','inertiaOf',`return {${coreSource.slice(start,end)}}`)(()=>{},bodyMap,{EMotionType_Static:0},()=>tensor.map(r=>[...r]));
    const d=api.bodyDynamics('b');assert.equal(d.solverMassKg,0.02);assert.equal(d.configuredMassKg,0.01);assert.equal(d.gravityFactor,0.5);assert.equal(d.massAdjusted,true);assert.equal(d.massFloorKg,0.02);assert.equal(d.smallInertiaRepaired,true);assert.equal(d.inertiaAdjusted,true);assert.deepEqual(d.centerOfMassWorld,[1,2,3]);d.inertiaKgM2[0][0]=99;assert.equal(api.bodyDynamics('b').inertiaKgM2[0][0],0.1);
    const s=api.bodyDynamics('s');assert.equal(s.motion,'static');assert.equal(s.solverMassKg,null);assert.equal(s.inertiaKgM2,null);assert.equal(s.gravityFactor,null);assert.equal(s.massAdjusted,false);assert.equal(s.smallInertiaRepaired,false);assert.equal(s.inertiaAdjusted,false);
    dynamic.massFloorKg=0;dynamic.configuredMassKg=0.0199999995;assert.equal(api.bodyDynamics('b').massAdjusted,false,'Float32 representation alone is not an applied mass floor');
});

import {validateCompiledMechanism,upgradeMechanismV1} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
test('both authored hosted fixtures validate and normalize to exact actuator, gear, role and collision contracts without loading Jolt',()=>{
    const source=readFileSync(new URL('./bw-sim-effort-inspection-jolt.test.mjs',import.meta.url),'utf8');
    const definitions=source.slice(source.indexOf('const body='),source.indexOf('const near='));
    const freefall=source.slice(source.indexOf('    const m={version:1'),source.indexOf('    m.bodies[1].rollingResistance'));
    const fixtures=Function(`${definitions}${freefall};return [mechanism(),m];`)();
    for(const fixture of fixtures){
        assert.deepEqual(validateCompiledMechanism(fixture),[]);
        const lifted=upgradeMechanismV1(fixture);assert.equal(lifted.version,2);
        for(const field of ['hubs','actuators','couplings','devices','noCollide'])assert.ok(Array.isArray(lifted[field]),field);
        assert.deepEqual(validateCompiledMechanism(lifted),[]);
        assert.ok(lifted.bodies.every(b=>b.role&&b.collisionGroup));
        assert.ok(lifted.joints.every(j=>lifted.noCollide.some(pair=>pair.includes(j.body1)&&pair.includes(j.body2))));
    }
    const motor=upgradeMechanismV1(fixtures[0]).actuators[0];assert.equal(motor.joint,'j');assert.equal(motor.maxTorqueNm,0.1);assert.equal(motor.maxSpeedRadPerSec,20);
    const geared=upgradeMechanismV1(fixtures[1]);assert.equal(geared.couplings[0].kind,'gear');assert.equal(geared.couplings[0].ratio,-1/3);
    assert.ok(geared.noCollide.some(pair=>pair.join('|')==='g1|g2'));
    for(const id of ['g1','g2']) {
        const wheel=geared.bodies.find(b=>b.id===id),joint=geared.joints.find(j=>j.body2===id);
        assert.equal(rollingRadius(wheel,joint),wheel.colliders[0].radius);
        assert.equal(wheel.motion,'dynamic');
    }
    const broken=structuredClone(fixtures[1]);delete broken.gears[0].type;assert.ok(validateCompiledMechanism(broken).length>0);
});
