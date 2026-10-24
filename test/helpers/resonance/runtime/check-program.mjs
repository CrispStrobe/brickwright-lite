// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Check the actual compiler's block graph, including finite repeats and joins.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {CONTROL,EXPERIMENTS,programPlan,programText} from '../analysis/control.mjs';
const SOURCE=fileURLToPath(new URL('../../../../',import.meta.url));
const digest=s=>createHash('sha256').update(s).digest('hex');

export async function checkProgram(source,experiment='near'){
  const e=EXPERIMENTS[experiment];assert.ok(e);
  assert.equal(source,programText(experiment),'Delivered text must match its declared deterministic finite plan.');
  const {default:Creator}=await import(pathToFileURL(path.join(SOURCE,'overlay/scratch-gui/src/lib/sb3-creator-register-art.js')).href);
  const inspect=project=>{
    assert.deepEqual(project.extensions,['robotlab']);assert.equal(project.targets.length,1);
    const stage=project.targets[0],blocks=stage.blocks,all=Object.values(blocks);assert.equal(stage.isStage,true);
    const vars=Object.entries(stage.variables);assert.equal(vars.length,1);assert.deepEqual(vars[0][1],['target',0]);const vid=vars[0][0];
    const chain=first=>{const found=[],seen=new Set();for(let id=first;id;id=blocks[id].next){assert.ok(blocks[id]&&!seen.has(id));seen.add(id);found.push(blocks[id]);}return found;};
    const child=i=>{assert.equal(typeof i?.[1],'string');assert.ok(blocks[i[1]]);return blocks[i[1]];};
    const number=i=>{assert.ok(Array.isArray(i?.[1]));const n=Number(i[1][1]);assert.ok(Number.isFinite(n));return n;};
    const motor=b=>{const menu=child(b.inputs.MOTOR);assert.equal(menu.opcode,'robotlab_menu_motors');assert.equal(menu.fields.motors[0],'A');};
    const hold=b=>{assert.equal(b.opcode,'robotlab_stopMotor');motor(b);assert.equal(b.fields.ACTION[0],'hold');};
    const error=(b,target)=>{assert.equal(b.opcode,'operator_subtract');
      if(target==='target')assert.deepEqual(b.inputs.NUM1[1],[12,'target',vid]);else assert.equal(number(b.inputs.NUM1),target);
      const angle=child(b.inputs.NUM2);assert.equal(angle.opcode,'robotlab_motorAngle');motor(angle);
    };
    const guard=(b,target,tolerance)=>{assert.equal(b.opcode,'control_if');const gt=child(b.inputs.CONDITION);assert.equal(gt.opcode,'operator_gt');assert.equal(number(gt.inputs.OPERAND2),tolerance);
      const abs=child(gt.inputs.OPERAND1);assert.equal(abs.opcode,'operator_mathop');assert.equal(abs.fields.OPERATOR[0],'abs');error(child(abs.inputs.NUM),target);
      const failure=chain(b.inputs.SUBSTACK[1]);assert.equal(failure.length,2);hold(failure[0]);assert.equal(failure[1].opcode,'control_stop');assert.equal(failure[1].fields.STOP_OPTION[0],'all');
    };
    const wait=(b,seconds)=>{assert.equal(b.opcode,'control_wait');assert.equal(number(b.inputs.DURATION),seconds);};
    const assign=(b,value)=>{assert.equal(b.opcode,'data_setvariableto');assert.deepEqual(b.fields.VARIABLE,['target',vid]);assert.equal(number(b.inputs.VALUE),value);};
    const join=b=>{assert.equal(b.opcode,'event_broadcastandwait');assert.equal(b.inputs.BROADCAST_INPUT[1][0],11);assert.equal(b.inputs.BROADCAST_INPUT[1][1],'rock input');};
    const hats=all.filter(b=>b.topLevel);assert.equal(hats.length,2);
    const flag=hats.find(b=>b.opcode==='event_whenflagclicked'),receiver=hats.find(b=>b.opcode==='event_whenbroadcastreceived');assert.ok(flag&&receiver);
    assert.equal(receiver.fields.BROADCAST_OPTION[0],'rock input');
    const a=CONTROL.inputAmplitudeDegrees/CONTROL.motorToInputSign,main=chain(flag.next);let i=0;
    assert.equal(main[i++].opcode,'robotlab_startSimulation');hold(main[i++]);wait(main[i++],CONTROL.startupWaitSeconds);guard(main[i++],0,CONTROL.endpointGuardDegrees);
    assign(main[i++],a);join(main[i++]);const repeat=main[i++];assert.equal(repeat.opcode,'control_repeat');assert.equal(number(repeat.inputs.TIMES),CONTROL.cycles);
    const loop=chain(repeat.inputs.SUBSTACK[1]);assert.equal(loop.length,4);assign(loop[0],-a);join(loop[1]);assign(loop[2],a);join(loop[3]);
    assign(main[i++],0);join(main[i++]);hold(main[i++]);wait(main[i++],CONTROL.ringdownSeconds);guard(main[i++],0,CONTROL.endpointGuardDegrees);assert.equal(i,main.length);
    const move=chain(receiver.next);assert.equal(move.length,4);guard(move[0],'target',CONTROL.maximumMoveDegrees);
    assert.equal(move[1].opcode,'robotlab_runMotorDegrees');motor(move[1]);error(child(move[1].inputs.DEGREES),'target');assert.equal(number(move[1].inputs.SPEED),e.speedDps);
    hold(move[2]);guard(move[3],'target',CONTROL.endpointGuardDegrees);
    assert.equal(all.filter(b=>b.opcode==='robotlab_runMotorDegrees').length,1);
    assert.equal(all.filter(b=>b.opcode==='control_if').length,4);assert.equal(all.filter(b=>b.opcode==='control_repeat').length,1);
    return {blocks:all.length,staticMotorCommandBlocks:1,finiteRepeatCount:CONTROL.cycles,
      expectedRuntimeMotorCommands:programPlan(experiment).length,staticGuardBlocks:4,expectedGuardEvaluations:2+2*programPlan(experiment).length,
      expectedRuntimeBroadcastJoins:programPlan(experiment).length,globalVariables:['target'],
      targetsDegrees:programPlan(experiment).map(p=>p.targetDegrees),requestedSpeedDps:e.speedDps,
      startupWaitSeconds:CONTROL.startupWaitSeconds,finalRingdownSeconds:CONTROL.ringdownSeconds,
      freshAbsoluteEncoderFeedback:true,endpointGuardDegrees:CONTROL.endpointGuardDegrees,maximumMoveDegrees:CONTROL.maximumMoveDegrees};
  };
  const creator=new Creator();creator.parse(source);const shape=inspect(creator.project),decompiled=creator.decompile(creator.project);
  const roundtrip=new Creator();roundtrip.parse(decompiled);assert.equal(roundtrip.decompile(roundtrip.project),decompiled);assert.deepEqual(inspect(roundtrip.project),shape);
  return {passed:true,experiment,file:`programs/${e.file}`,sha256:digest(source),...shape,roundTripPassed:true,decompiledSha256:digest(decompiled)};
}
