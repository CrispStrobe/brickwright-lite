import {privateSpikeEvidenceDirectory} from './lib/private-spike-evidence.mjs';
const evidenceDirectory = privateSpikeEvidenceDirectory();
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Coordinator-only black-box observations of shipped audited WASM.
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createPybricksHost} from '../overlay/scratch-gui/src/lib/pybricks-sim/pybricks-hub-host.js';
const require = createRequire(import.meta.url);
const dir = resolve('overlay/scratch-gui/static/pybricks-sim');
const wasmBinary = readFileSync(resolve(dir, 'pybricks-hub.wasm'));
const scenarios = [
 ['speed-positive', 'm.run(300)', [50,100,200,500,1000]],
 ['speed-negative', 'm.run(-300)', [50,100,200,500,1000]],
 ['speed-limit-positive', 'm.run(5000)', [100,400,800,1500]],
 ['speed-limit-negative', 'm.run(-5000)', [100,400,800,1500]],
 ['target-positive', 'm.run_target(300, 180, wait=False)', [100,300,600,1000,1500]],
 ['target-negative', 'm.run_target(300, -90, wait=False)', [100,300,600,1000,1500]],
 ['timed', 'm.run_time(300, 500, wait=False)', [100,300,500,700,1000]],
 ['replace-target', 'm.run_target(300, 180, wait=False)\nwait(100)\nm.run_target(300, -90, wait=False)', [100,300,600,1000,1500]],
 ['reverse', 'm.run(300)\nwait(500)\nm.run(-300)', [50,100,200,500,1000]],
 ['brake', 'm.run(300)\nwait(500)\nm.brake()', [0,50,100,200,500]],
 ['coast', 'm.run(300)\nwait(500)\nm.stop()', [0,50,100,200,500]],
 ['hold', 'm.run(300)\nwait(500)\nm.hold()', [0,50,100,200,500]],
 ['concurrent', 'm.run_target(300, 180, wait=False)\nn.run_target(200, -90, wait=False)', [100,500,1000,1500]],
 ['zero-target', 'm.run_target(300, 0, wait=False)', [0,100]],
 ['zero-speed', 'm.run_time(0, 100, wait=False)', [0,100,300]]
];
const records = [];
for (const [id, commands, times] of scenarios) {
 let output = '';
 const host = await createPybricksHost({factory: require(resolve(dir,'pybricks-hub.js')), wasmBinary, realtime:false, onOutput:s=>{output+=s;}});
 host.setDevice('A','motor-m'); host.setDevice('B','motor-m');
 const code = `from pybricks.pupdevices import Motor\nfrom pybricks.parameters import Port\nfrom pybricks.tools import wait, StopWatch\nm=Motor(Port.A)\nn=Motor(Port.B)\nm.control.limits(speed=1110, acceleration=1500)\nn.control.limits(speed=1110, acceleration=1500)\n${commands}\nsw=StopWatch()\n` + times.map(t=>`while sw.time()<${t}:\n    wait(1)\nprint(sw.time(), m.angle(), m.speed(), m.done(), n.angle(), n.speed(), n.done())`).join('\n')+'\n';
 const run = await host.run(code);
 if(run.result!=='ok') throw new Error(output);
 records.push({id,commands,times, samples: output.trim().split(/\r?\n/).map(line=>{const v=line.split(' ');return {ms:+v[0],angle:+v[1],speed:+v[2],done:v[3]==='True',bAngle:+v[4],bSpeed:+v[5],bDone:v[6]==='True'};}),result:run.result});
}
const result={wasmSha256:createHash('sha256').update(wasmBinary).digest('hex'),acceleration:1500,speedLimit:1110,records};
writeFileSync(resolve(evidenceDirectory,'oracle-motors.json'),JSON.stringify(result,null,2)+'\n');
console.log('Oracle evidence recorded in the configured private directory.');
