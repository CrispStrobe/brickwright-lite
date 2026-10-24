// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Three finite fresh-reset experiments; qualify against the prospective freeze.
export const CONTROL=Object.freeze({motorToInputSign:1,inputAmplitudeDegrees:2,
  cycles:4,startupWaitSeconds:.5,ringdownSeconds:10,endpointGuardDegrees:.5,
  maximumMoveDegrees:4.5,watchdogMs:90000});
export const EXPERIMENTS=Object.freeze({
  slow:Object.freeze({id:'slow',file:'resonance-lab-slow.bw',speedDps:5}),
  near:Object.freeze({id:'near',file:'resonance-lab.bw',speedDps:13}),
  fast:Object.freeze({id:'fast',file:'resonance-lab-fast.bw',speedDps:80})
});
export function programPlan(experiment='near'){
  const e=EXPERIMENTS[experiment];if(!e)throw new Error(`Unknown experiment ${experiment}`);
  const a=CONTROL.inputAmplitudeDegrees;
  return [a,...Array.from({length:CONTROL.cycles},()=>[-a,a]).flat(),0].map((targetInputDegrees,index)=>({
    index,targetInputDegrees,targetDegrees:targetInputDegrees===0?0:targetInputDegrees/CONTROL.motorToInputSign,
    speedDps:e.speedDps,role:index===0?'entry':index===2*CONTROL.cycles+1?'return':'cycle',
    cycle:index===0||index===2*CONTROL.cycles+1?null:Math.floor((index-1)/2)
  }));
}
export function programText(experiment='near'){
  const e=EXPERIMENTS[experiment],a=CONTROL.inputAmplitudeDegrees/CONTROL.motorToInputSign;
  if(!e)throw new Error(`Unknown experiment ${experiment}`);
  return `# Resonance Lab — ${experiment} finite spring-response experiment
# SPDX-License-Identifier: BSD-3-Clause
# Copyright (c) 2026 Christian Ströbele (CrispStrobe)
# RELOAD the saved model before each experiment. Do not inherit earlier ringing.
# One motor drives the blue input; the weighted output is completely passive.
# The input returns to zero and holds. The passive arm intentionally rings on.
DEVICE SPIKE
GLOBAL target = 0

WHEN flag clicked:
  lab start
  lab stop motor A hold
  wait ${CONTROL.startupWaitSeconds} seconds
  IF (abs of (0 - (lab motor A angle))) > ${CONTROL.endpointGuardDegrees} THEN:
    lab stop motor A hold
    stop all
  set target to ${a}
  broadcast "rock input" and wait
  REPEAT ${CONTROL.cycles}:
    set target to ${-a}
    broadcast "rock input" and wait
    set target to ${a}
    broadcast "rock input" and wait
  set target to 0
  broadcast "rock input" and wait
  lab stop motor A hold
  wait ${CONTROL.ringdownSeconds} seconds
  IF (abs of (0 - (lab motor A angle))) > ${CONTROL.endpointGuardDegrees} THEN:
    lab stop motor A hold
    stop all

WHEN I receive "rock input":
  IF (abs of (target - (lab motor A angle))) > ${CONTROL.maximumMoveDegrees} THEN:
    lab stop motor A hold
    stop all
  lab run motor A for (target - (lab motor A angle)) degrees at ${e.speedDps} degrees per second
  lab stop motor A hold
  IF (abs of (target - (lab motor A angle))) > ${CONTROL.endpointGuardDegrees} THEN:
    lab stop motor A hold
    stop all
`;
}
