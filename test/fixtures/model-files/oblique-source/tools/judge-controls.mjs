// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {variables} from './native-observation.mjs';
export function judgeControls(record,plan){
  const gates=[],gate=(name,pass,actual,requirement)=>gates.push({name,status:pass?'PASS':'FAIL',actual,requirement});
  const c=plan.controller,ports=c.ports,track=record.track,events=record.apiEvents||[],commands=events.filter(e=>e.name==='runMotorDegrees');
  const eventVars=e=>e.variables||variables(track.find(f=>f.t>e.t+1e-7)||track.at(-1)||{});
  gate('two-actual-controlled-ports',JSON.stringify(record.controlledMotors.map(m=>m.port).sort())===JSON.stringify([...ports].sort()),record.controlledMotors,ports);
  gate('registered-compiler-and-primitives',record.compiler?.validation?.isValid===true&&record.compiler.unparsed.length===0&&record.compiler.warnings.length===0&&record.compiler.missingRobotlabPrimitives.length===0,record.compiler,'valid actual registered compiler; no warnings, unparsed syntax or missing native primitives');
  gate('all-finite-commands-complete',commands.length>0&&commands.every(e=>e.result==='completed'&&Number.isFinite(e.resolvedAt)),{count:commands.length,failed:commands.filter(e=>e.result!=='completed')},'every finite controller command completes');
  gate('no-native-api-refusals',record.refusals.length===0,record.refusals,'no native refusal, stall or interruption');
  gate('finite-native-moves-only',!events.some(e=>['setMotorPower','setMotorSpeed'].includes(e.name)),events.filter(e=>['setMotorPower','setMotorSpeed'].includes(e.name)),'actual program uses bounded finite moves and holds');
  let previous=Object.fromEntries(ports.map(p=>[p,0]));const stages=[];
  for(const stage of plan.stages){
    const frames=track.filter(f=>Number(variables(f).stage)===stage.stage),settled=frames.filter(f=>Number(variables(f).settled)===1),issued=commands.filter(e=>Number(eventVars(e).stage)===stage.stage);
    gate(`stage-${stage.stage}-observed`,frames.length>0&&settled.length>0,{frames:frames.length,settled: settled.length},'actual VM stage and joined settled state observed');
    const lastResolution=issued.length?Math.max(...issued.map(e=>e.resolvedAt??Infinity)):frames[0]?.t;
    gate(`stage-${stage.stage}-joined-before-settled`,settled.length>0&&settled[0].t>=lastResolution,{settledAt:settled[0]?.t,lastResolution},'settled follows every actual finite command completion');
    const portReports={};
    for(const p of ports){
      const moves=issued.filter(e=>e.args[0]===p),required=Math.abs(stage.targetsDegrees[p]-previous[p])>c.correctionToleranceDeg;
      const fresh=moves.map(e=>e.encoderAtCall?.ok?Math.abs(e.args[1]-(stage.targetsDegrees[p]-e.encoderAtCall.angleDeg)):Infinity);
      const speeds=moves.map((e,i)=>({actual:e.args[2],expected:i===0?stage.speedsDps[p]:c.correctionSpeedDps}));
      const arrival=settled.length?Math.abs(settled[0].encoder[p].angleDeg-stage.targetsDegrees[p]):Infinity,hold=settled.length?Math.max(...settled.map(f=>Math.abs(f.encoder[p].angleDeg-stage.targetsDegrees[p]))):Infinity;
      gate(`stage-${stage.stage}-${p}-required-and-bounded`,(!required||moves.length>0)&&moves.length<=c.maximumCorrections,{required,commands:moves.length},`changed target moves; at most ${c.maximumCorrections} finite calls`);
      gate(`stage-${stage.stage}-${p}-fresh-target-delta`,fresh.every(e=>e<=.11),fresh,'absolute target minus fresh unwrapped encoder within native 0.11° rounding tolerance');
      gate(`stage-${stage.stage}-${p}-declared-speed`,speeds.every(s=>Math.abs(s.actual-s.expected)<1e-9),speeds,'native degrees/second match first pass and correction declarations');
      gate(`stage-${stage.stage}-${p}-arrival-and-hold`,arrival<=c.arrivalToleranceDeg&&hold<=c.arrivalToleranceDeg,{arrivalErrorDeg:arrival,holdErrorDeg:hold},`actual encoder within ${c.arrivalToleranceDeg}° at arrival and during hold`);
      portReports[p]={commands:moves.length,arrivalErrorDeg:arrival,holdErrorDeg:hold};
    }
    const duration=settled.length?settled.at(-1).t-settled[0].t:0;
    gate(`stage-${stage.stage}-hold-duration`,duration+record.timing.frameMs>=stage.dwellSeconds*1000,duration,`hold lasts ${stage.dwellSeconds}s within one sampled frame`);
    stages.push({stage:stage.stage,name:stage.name,startedAt:frames[0]?.t,settledAt:settled[0]?.t,lastResolution,ports:portReports,holdDurationMs:duration});previous=stage.targetsDegrees;
  }
  const globals=Object.assign({},...(record.programVariables||[]).map(t=>t.variables));
  gate('finite-success-state',Number.isFinite(record.finishedAt)&&Number(globals.completed)===1&&Number(globals.failed)===0&&Number(globals.stage)===plan.stages.length+1,{finishedAt:record.finishedAt,completed:globals.completed,failed:globals.failed,stage:globals.stage},'completed = 1, failed = 0, final stage after every experiment');
  gate('watchdog-bound',Number.isFinite(record.finishedAt)&&record.finishedAt-record.timing.coldMs<=c.watchdogSeconds*1000+2*record.timing.frameMs,record.finishedAt-record.timing.coldMs,`complete within ${c.watchdogSeconds}s plus two-frame tolerance`);
  const last=Object.fromEntries(ports.map(p=>[p,events.filter(e=>['stopMotor','runMotorDegrees','setMotorPower','setMotorSpeed'].includes(e.name)&&e.args[0]===p).at(-1)]));
  gate('both-ports-final-hold',Object.values(last).every(e=>e?.name==='stopMotor'&&e.args[1]==='hold'&&e.result?.ok===true),last,'last accepted command on both ports is stop hold');
  gate('both-ports-idle',ports.every(p=>track.at(-1)?.busy[p]===false),track.at(-1)?.busy,'neither finite command remains busy');
  return {status:gates.every(g=>g.status==='PASS')?'PASS':'FAIL',gates,stages,commandCount:commands.length};
}
