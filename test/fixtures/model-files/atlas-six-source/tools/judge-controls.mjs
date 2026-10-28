// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
// Observe the registered VM's actual API events. A control PASS is not a
// mechanical/platform PASS; the full observer additionally measures output.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
const PORTS=[...'ABCDEF'];
const vars=f=>Object.assign({},...(f.variables || []).map(t=>t.variables));
export function judgeControls(record,plan) {
  const gates=[];
  const gate=(name,pass,actual,requirement)=>gates.push({name,status:pass?'PASS':'FAIL',actual,requirement});
  const track=record.track || [], events=record.apiEvents || [], cfg=plan.controller;
  const eventVars=e=>e.variables || vars(track.find(f=>f.t>e.t+1e-7) || track.at(-1) || {});
  const commands=events.filter(e=>e.name==='runMotorDegrees');
  const controlled=record.controlledMotors || [];
  const knownPorts=controlled.map(m=>m.port).sort();
  gate('all-six-native-ports',JSON.stringify(knownPorts)===JSON.stringify(PORTS),knownPorts,PORTS);
  gate('one-shared-native-hub',record.mechanism?.hubs?.length===1&&new Set(controlled.map(m=>m.hub)).size===1&&controlled.every(m=>m.direct===true),controlled,'all six actual motors belong to the same one real native hub');
  gate('registered-compiler-and-primitives',record.compiler?.validation?.isValid===true&&record.compiler?.unparsed?.length===0&&record.compiler?.warnings?.length===0&&record.compiler?.missingRobotlabPrimitives?.length===0,record.compiler,'valid registered compiler, no unparsed syntax/warnings/missing Robot Lab primitives');
  gate('all-native-commands-complete',commands.length>0&&commands.every(e=>e.result==='completed'&&Number.isFinite(e.resolvedAt)),{count:commands.length,failed:commands.filter(e=>e.result!=='completed')},'every actual finite motor command resolves completed through controller feedback');
  gate('no-native-api-refusals',record.refusals?.length===0,record.refusals,'no refused, stalled, interrupted or unsupported native API operations');
  const perStage=[];
  let previous=Object.fromEntries(PORTS.map(p=>[p,0]));
  for(const stage of plan.stages) {
    const frames=track.filter(f=>Number(vars(f).stage)===stage.stage);
    const settled=frames.filter(f=>Number(vars(f).settled)===1);
    const issued=commands.filter(e=>Number(eventVars(e).stage)===stage.stage);
    const firstByPort=Object.fromEntries(PORTS.map(p=>[p,issued.find(e=>e.args[0]===p)]));
    const expected=PORTS.filter(p=>Math.abs(stage.targetsDegrees[p]-previous[p])>cfg.correctionToleranceDeg);
    gate(`stage-${stage.stage}-observed`,frames.length>0&&settled.length>0,{frames:frames.length,settledFrames:settled.length},'stage occurs and its VM settled flag is observed after the join');
    gate(`stage-${stage.stage}-required-moves-issued`,expected.every(p=>firstByPort[p]),{expected,issued:issued.map(e=>e.args[0])},'each changed target issues its actual port command');
    const firsts=Object.values(firstByPort).filter(Boolean),spread=firsts.length?Math.max(...firsts.map(e=>e.t))-Math.min(...firsts.map(e=>e.t)):0;
    const maxSpread=plan.controlThresholds?.startSpreadMs ?? record.timing.frameMs+1e-6;
    gate(`stage-${stage.stage}-concurrent-start`,spread<=maxSpread,spread,`first actual command on each moving axis starts within ${maxSpread}ms`);
    const lastResolution=issued.length?Math.max(...issued.map(e=>e.resolvedAt??Infinity)):frames[0]?.t;
    gate(`stage-${stage.stage}-joined-before-settled`,settled.length>0&&settled[0].t>=lastResolution,{settledAt:settled[0]?.t,lastResolution},'the joined VM settled flag cannot precede any issued command completion');
    const attempts=Object.fromEntries(PORTS.map(p=>[p,issued.filter(e=>e.args[0]===p).length]));
    gate(`stage-${stage.stage}-bounded-corrections`,Object.values(attempts).every(n=>n<=cfg.maximumCorrections),attempts,`at most ${cfg.maximumCorrections} finite calls per axis and stage`);
    const arrival=Object.fromEntries(PORTS.map(p=>[p,settled.length?Math.abs(settled[0].encoder[p].angleDeg-stage.targetsDegrees[p]):null]));
    gate(`stage-${stage.stage}-encoder-arrival`,Object.values(arrival).every(e=>e!==null&&e<=cfg.arrivalToleranceDeg),arrival,`each actual encoder is within ${cfg.arrivalToleranceDeg}deg at joined arrival`);
    if(plan.requireFreshAngleEvidence) {
      const errors=issued.map(e=>({port:e.args[0],error:e.encoderAtCall?.ok?Math.abs(e.args[1]-(stage.targetsDegrees[e.args[0]]-e.encoderAtCall.angleDeg)):Infinity}));
      gate(`stage-${stage.stage}-fresh-encoder-target`,errors.every(e=>e.error<=0.11),errors,'finite move equals absolute target minus fresh encoder, allowing the native0.1deg reporter rounding');
    }
    if(cfg.coordination==='shared-duration-first-pass') {
      const tol=plan.controlThresholds.speedFormulaToleranceDps,boundDrift=plan.controlThresholds.travelBoundDriftDeg;
      if(!Number.isFinite(tol)||!Number.isFinite(boundDrift))throw new Error('Coordinated control needs predeclared speed-formula and travel-bound tolerances');
      const firstDetails=firsts.map(e=>{
        const bound=Number(eventVars(e).travelBound),expected=Math.min(cfg.speedDps,cfg.speedDps*Math.abs(e.args[1])/bound);
        return {port:e.args[0],speedDps:e.args[2],travelBoundDeg:bound,expectedDps:expected,errorDps:Math.abs(e.args[2]-expected)};
      });
      gate(`stage-${stage.stage}-proportional-first-speeds`,firstDetails.every(e=>e.travelBoundDeg>=cfg.correctionToleranceDeg&&e.speedDps>0&&e.speedDps<=cfg.speedDps&&e.errorDps<=tol),firstDetails,`first actual port speeds follow min(${cfg.speedDps},${cfg.speedDps}*abs(fresh delta)/shared travel bound) within ${tol}deg/s`);
      const boundErrors=firstDetails.map(e=>Math.abs(e.travelBoundDeg-Math.max(cfg.correctionToleranceDeg,...firsts.map(f=>Math.abs(f.args[1])))));
      gate(`stage-${stage.stage}-shared-fresh-travel-bound`,boundErrors.every(e=>e<=boundDrift),boundErrors,`the shared fresh maximum differs from actual first-call errors by at most ${boundDrift}deg`);
      const corrections=issued.filter(e=>firstByPort[e.args[0]]!==e);
      gate(`stage-${stage.stage}-gentle-correction-speeds`,corrections.every(e=>Math.abs(e.args[2]-cfg.correctionSpeedDps)<1e-9),corrections.map(e=>({port:e.args[0],speedDps:e.args[2]})),`subsequent bounded corrections use ${cfg.correctionSpeedDps}deg/s`);
    }
    perStage.push({stage:stage.stage,name:stage.name,startedAt:frames[0]?.t,settledAt:settled[0]?.t,lastResolution,firstStartSpreadMs:spread,attempts,arrivalErrorDeg:arrival,settledFrames:settled.length});
    previous=stage.targetsDegrees;
  }
  const globals=Object.assign({},...(record.programVariables || []).map(t=>t.variables));
  const want={completed:1,failed:0,stage:plan.stages.length+1};
  gate('finite-program-terminal-state',record.finishedAt!==null&&Number.isFinite(record.finishedAt)&&Object.entries(want).every(([k,v])=>Number(globals[k])===v),{finishedAt:record.finishedAt,completed:globals.completed,failed:globals.failed,stage:globals.stage},want);
  gate('program-watchdog-bound',record.finishedAt!==null&&record.finishedAt-record.timing.coldMs<=(cfg.watchdogSeconds*1000+2*record.timing.frameMs),record.finishedAt-record.timing.coldMs,`program completes within ${cfg.watchdogSeconds}s watchdog plus VM timing tolerance`);
  const finalCommands=Object.fromEntries(PORTS.map(p=>[p,events.filter(e=>['stopMotor','runMotorDegrees','setMotorSpeed','setMotorPower'].includes(e.name)&&e.args[0]===p).at(-1)]));
  gate('all-six-final-hold',Object.values(finalCommands).every(e=>e?.name==='stopMotor'&&e.args[1]==='hold'&&e.result?.ok===true),finalCommands,'last accepted command on every port is stop hold');
  gate('all-six-idle-at-finish',PORTS.every(p=>track.at(-1)?.busy[p]===false),track.at(-1)?.busy,'no finite command remains busy');
  const finalErrors=Object.fromEntries(PORTS.map(p=>[p,Math.abs(track.at(-1)?.encoder[p]?.angleDeg-previous[p])]));
  gate('all-six-final-encoders',Object.values(finalErrors).every(e=>Number.isFinite(e)&&e<=cfg.arrivalToleranceDeg),finalErrors,`final encoders within ${cfg.arrivalToleranceDeg}deg of final declared targets`);
  return {status:gates.every(g=>g.status==='PASS')?'PASS':'FAIL',scope:'Six-port native compiler/VM/controller scheduling only; mechanical output is judged separately',gates,stages:perStage,commandCount:commands.length,finalErrorsDeg:finalErrors};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const [recordPath,planPath,outPath]=process.argv.slice(2);
  if(!outPath)throw new Error('Usage: node judge-controls.mjs RECORD.json[.gz] PLAN.json REPORT.json');
  const bytes=readFileSync(recordPath),record=JSON.parse(recordPath.endsWith('.gz')?gunzipSync(bytes):bytes),plan=JSON.parse(readFileSync(planPath));
  const result=judgeControls(record,plan);writeFileSync(outPath,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,scope:result.scope,stages:result.stages,failedGates:result.gates.filter(g=>g.status==='FAIL')},null,2));
  if(result.status!=='PASS')process.exitCode=1;
}
