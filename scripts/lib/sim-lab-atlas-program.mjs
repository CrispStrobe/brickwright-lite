// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const ATLAS_ORIGINAL_PROGRAM_SHA256='6c6459cb91ed656ad1a14a1546375890de214e4ac46b57ad8a5403c2eca4e59d';
export const ATLAS_FINAL_SETTLING_MS=1000;

// Factor the original repeated calculation into one joined VM receiver.
// This is an exact, reviewed source derivative: targets, six concurrent motion
// receivers, feedback, corrections, hold and the watchdog retain their bytes.
// A final powered settling second precedes completion; the independent full
// post-completion hold observation and its original limits remain mandatory.
export function compactAtlasProgram(original){
 assert.equal(createHash('sha256').update(original).digest('hex'),ATLAS_ORIGINAL_PROGRAM_SHA256,'Only the reviewed original Atlas program can be compacted');
 const calculation='  set travelBound to 0.4\n'+[...'ABCDEF'].map(port=>
  `  IF (abs of (target${port} - (lab motor ${port} angle))) > (travelBound) THEN:\n`+
  `    set travelBound to (abs of (target${port} - (lab motor ${port} angle)))\n`).join('');
 assert.equal(original.split(calculation).length-1,27,'Every original stage has the same preparation');
 const compacted=original.replaceAll(calculation,'  broadcast "prepare all six" and wait\n');
 const firstMotion='WHEN I receive "move all six":\n';
 assert.equal(compacted.split(firstMotion).length-1,6,'All six original concurrent receivers remain');
 const shared=compacted.replace(firstMotion,'WHEN I receive "prepare all six":\n'+calculation+'\n'+firstMotion);
 const end='  set stage to 28\n  set completed to 1';assert.ok(shared.includes(end));
 return shared.replace(end,'  # Keep the real motors holding while the passive platform settles.\n  wait 1 seconds\n'+end);
}

export function assertAtlasFinalSettling(record){
 const holds=new Map();
 for(const event of record.apiEvents||[])if(event.name==='stopMotor'&&event.args?.[1]==='hold'&&'ABCDEF'.includes(event.args[0]))holds.set(event.args[0],event.t);
 assert.deepEqual([...holds.keys()].sort(),[...'ABCDEF'],'All six real motors enter hold before completion');
 const lastHold=Math.max(...holds.values());
 assert.ok(Number.isFinite(lastHold)&&Number.isFinite(record.finishedAt)&&record.finishedAt-lastHold>=ATLAS_FINAL_SETTLING_MS-1e-6,'Atlas completion follows one actual powered settling second after the last hold command');
}
