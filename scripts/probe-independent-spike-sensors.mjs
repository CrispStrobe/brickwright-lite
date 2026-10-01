import {privateSpikeEvidenceDirectory} from './lib/private-spike-evidence.mjs';
const evidenceDirectory = privateSpikeEvidenceDirectory();
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPybricksHost} from '../overlay/scratch-gui/src/lib/pybricks-sim/pybricks-hub-host.js';
const require=createRequire(import.meta.url),dir=resolve('overlay/scratch-gui/static/pybricks-sim');
let output='',stopAt=null;const beepEvents=[];
const host=await createPybricksHost({factory:require(resolve(dir,'pybricks-hub.js')),wasmBinary:readFileSync(resolve(dir,'pybricks-hub.wasm')),realtime:false,onOutput:s=>{output+=s;},onBeep:frequency=>beepEvents.push(frequency),onTick:ms=>{if(stopAt!==null&&ms>=stopAt){stopAt=null;host.stop();}}});
host.setDevice('C','distance');host.setDistance('C',345);
host.setDevice('D','force');host.setForce('D',2.5);
host.setDevice('E','color');host.setColor('E',{r:20,g:200,b:30});
await host.boot();host.setOrientation({pitch:30,roll:-20,yaw:90});host.setButtons({left:true});
const source=`from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor, UltrasonicSensor, ForceSensor, ColorSensor
from pybricks.parameters import Port, Button
from pybricks.tools import wait
h=PrimeHub()
wait(1000)
print('distance',UltrasonicSensor(Port.C).distance())
f=ForceSensor(Port.D)
print('force',f.force(),f.pressed(),f.pressed(2))
print('color',ColorSensor(Port.E).color())
p,r=h.imu.tilt()
print('imu',round(p),round(r),round(h.imu.heading()))
print('left',Button.LEFT in h.buttons.pressed())
h.display.off()
h.display.pixel(1,2,100)
for name,fn in [('invalid-port',lambda:Motor(99)),('invalid-pixel',lambda:h.display.pixel(5,0))]:
    try:
        fn()
        print(name,'unexpected-success')
    except Exception as e:
        print(name,str(type(e)),str(e))
`;
const result=await host.run(source,{settleMs:0});
if(result.result!=='ok')throw new Error(output);
const record={inputs:{distance:345,forceNewtons:2.5,colorRgb:[20,200,30],imu:{pitch:30,roll:-20,yaw:90},left:true},lines:output.trim().split(/\r?\n/),pixels:host.pixels(),result:result.result};
output='';
record.failure=await host.run('1 / 0\n',{settleMs:0});record.failureOutput=output.trim();
stopAt=host.simulatedMs+300;
record.cancellation=await host.run('from pybricks.tools import wait\nwhile True:\n    wait(10)\n',{settleMs:0});
record.beepRun=await host.run('from pybricks.hubs import PrimeHub\nPrimeHub().speaker.beep(440,100)\n',{settleMs:0});
record.speaker=host.speaker();record.beepEvents=beepEvents;
writeFileSync(resolve(evidenceDirectory,'oracle-sensors.json'),JSON.stringify(record,null,2)+'\n');
console.log('Sensor evidence recorded in the configured private directory.');
