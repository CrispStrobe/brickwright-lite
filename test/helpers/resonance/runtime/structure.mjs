// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
import assert from 'node:assert/strict';
import {verifyPreparationDiagnostics} from './diagnostics.mjs';

export function checkTopology(prepared,geometry,catalog){
  const m=prepared.mechanism,model=prepared.model,issues=prepared.issues;
  assert.ok(m);
  const acceptedPreparationDiagnostics=verifyPreparationDiagnostics(prepared,catalog);
  const refs=geometry.interfaces?.bodyReferences||geometry.INTERFACES?.bodyReferences;
  assert.ok(refs,'The placement ledger must state unique actual-part body references.');
  assert.deepEqual(Object.keys(refs).sort(),['frame','input','output']);
  const roles=Object.fromEntries(Object.entries(refs).map(([role,id])=>{
    const owners=m.bodies.filter(b=>b.parts?.includes(id));assert.equal(owners.length,1,`${id}: unique actual ${role} reference`);return [role,owners[0].id];
  }));
  assert.equal(new Set(Object.values(roles)).size,3);
  assert.equal(m.bodies.length,4);assert.equal(m.bodies.filter(b=>b.motion==='dynamic').length,3);
  assert.deepEqual(m.bodies.filter(b=>b.motion==='static').map(b=>b.id),['ground']);
  assert.deepEqual(m.bodies.find(b=>b.id==='ground').parts,[]);
  assert.equal(m.joints.length,2);assert.ok(m.joints.every(j=>j.type==='hinge'));
  const joints=Object.fromEntries(['input','output'].map(role=>{
    const found=m.joints.filter(j=>[j.body1,j.body2].includes(roles.frame)&&[j.body1,j.body2].includes(roles[role]));assert.equal(found.length,1);
    const j=found[0];assert.ok(Math.abs(Math.abs(j.axis[1])-1)<1e-10);return [role,j];
  }));
  assert.equal(joints.input.motor?.port,'A');assert.ok(!joints.output.motor);
  assert.equal(m.actuators.length,1);assert.equal(m.actuators[0].port,'A');assert.equal(m.actuators[0].joint,joints.input.id);
  assert.equal(m.hubs.length,1);assert.equal(m.hubs[0].profile,'spike-prime');assert.equal(m.hubs[0].body,roles.frame);
  assert.equal(m.actuators[0].hub,m.hubs[0].id);
  assert.equal(m.couplings.length,2);assert.ok(m.couplings.every(c=>c.kind==='spring'));
  assert.equal(model.belts.length,2);assert.deepEqual(m.devices,[]);
  for(const c of m.couplings){assert.deepEqual(new Set([c.body1,c.body2]),new Set([roles.input,roles.output]));assert.ok(c.stiffness>0&&c.restM>0&&c.damping>0);}
  const motorParts=model.parts.filter(p=>p.port);assert.equal(motorParts.length,1);assert.equal(motorParts[0].port,'A');
  const motorId=motorParts[0].id;
  assert.deepEqual(new Set(m.bodies.filter(b=>b.parts.includes(motorId)).map(b=>b.id)),new Set([roles.frame,roles.input]));
  const grouped=geometry.parts;
  if(grouped){
    assert.deepEqual(new Set(model.parts.map(p=>p.id)),new Set(grouped.map(p=>p.id)));
    for(const p of grouped){
      const owners=m.bodies.filter(b=>b.parts.includes(p.id)).map(b=>b.id);
      if(p.id!==motorId){assert.ok(roles[p.group],`${p.id}: declared group ${p.group}`);assert.deepEqual(owners,[roles[p.group]],`${p.id}: exact intended rigid ownership`);}
    }
  }
  return {parts:model.parts.length,bands:model.belts.length,dynamicBodies:3,staticBodies:['ground'],bodyRoles:roles,bodyReferenceParts:refs,
    hinges:2,sliders:0,joints,couplingKinds:m.couplings.map(c=>c.kind),couplings:m.couplings,hubs:m.hubs,motorPorts:['A'],issues,acceptedPreparationDiagnostics,
    motorParts:motorParts.map(p=>({id:p.id,part:p.part,port:p.port})),solverOptions:m.solver||null,nativeNoCollide:m.noCollide||[],nativePerPartContactPolicy:m.noCollideParts||[]};
}
