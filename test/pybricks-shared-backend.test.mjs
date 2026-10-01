// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {createSpikeBackend} from '../overlay/scratch-gui/src/lib/spike-sim/backends.js';
import {ArenaHubBridge} from '../overlay/scratch-gui/src/lib/spike-arena/arena-hub-bridge.js';
const require=createRequire(import.meta.url),dir=new URL('../overlay/scratch-gui/static/pybricks-sim/',import.meta.url);
const scene={id:'shared',title:{en:'Shared world'},intro:{en:'Synthetic world'},mat:{width:300,height:200,background:'white'},
 start:{x:50,y:100,heading:0},timeLimitMs:10000,objects:[{id:'probe',shape:{type:'circle',x:290,y:10,r:1}}],success:[{type:'touch',object:'probe'}]};
test('Pybricks and native backends use one arena with exclusive clock ownership',async()=>{
 const hub=new Hub(),arena=new ArenaHubBridge({hubState:hub,world:scene});let output='',sawOwnership=false;
 const host=await createSpikeBackend({kind:'pybricks',hubState:hub,arena,realtime:false,
  factory:require(new URL('pybricks-hub.js',dir).pathname),wasmBinary:readFileSync(new URL('pybricks-hub.wasm',dir)),
  onOutput:s=>{output+=s;},onTick:()=>{
   if(hub.clockOwner==='pybricks'){
    sawOwnership=true;
    assert.equal(hub.backend.step(50),false);
    assert.throws(()=>hub.backend.runAtSpeed('A',100),/owned/);
   }
  }});
 const timeout=setTimeout(()=>host.stop(),10000);
 const run=await host.run(`from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Port, Direction
from pybricks.tools import wait
from pybricks.hubs import PrimeHub
print('before motors')
m=Motor(Port.A, Direction.COUNTERCLOCKWISE)
n=Motor(Port.B)
print('before motion')
m.run_angle(300,360,wait=False)
n.run_angle(300,360)
wait(200)
print('after motion')
print(ColorSensor(Port.C).color())
h=PrimeHub()
h.display.off()
h.display.pixel(1,2,100)
`);
 clearTimeout(timeout);
 assert.equal(run.result,'ok',output+JSON.stringify(host.snapshot())+JSON.stringify(hub.snapshot()));assert.equal(sawOwnership,true);assert.equal(hub.clockOwner,null);
 assert.ok(Math.abs(arena.sim.pose.x-(50+Math.PI*5.6))<0.3,JSON.stringify(arena.sim.pose));
 assert.match(output,/Color.WHITE/);assert.equal(hub.data.display[7],9);
 assert.ok(arena.sim.timeMs>1000);assert.equal(hub.backend.simulatedMs,0,'native clock never advanced during Python');
 const promise=hub.backend.runToPosition('A',-450,200);
 for(let i=0;i<300;i++)arena.tick(5);
 assert.equal(await promise,'completed');assert.equal(hub.backend.simulatedMs,1500);
});

test('shared Pybricks cancellation, busy and Python failure release the hub',async()=>{
 const hub=new Hub();hub.setPort('A','motor',{deviceId:48});let output='';
 const host=await createSpikeBackend({kind:'pybricks',hubState:hub,realtime:false,
  factory:require(new URL('pybricks-hub.js',dir).pathname),wasmBinary:readFileSync(new URL('pybricks-hub.wasm',dir)),onOutput:s=>{output+=s;}});
 const bootRun=host.run('print("unexpected-start")\n');
 host.cancel();
 assert.equal((await bootRun).result,'stopped');
 assert.doesNotMatch(output,/unexpected-start/);
 assert.equal(hub.clockOwner,null);
 const first=host.run('from pybricks.tools import wait\nwhile True:\n    wait(10)\n');
 const completion=host.completion;
 await assert.rejects(host.run('print(1)\n'),/already owned/);
 assert.equal(host.completion,completion,'rejected start must preserve active completion');
 const stop=setTimeout(()=>hub.stopAll(),50);
 try{assert.equal((await first).result,'stopped');}finally{clearTimeout(stop);}
 assert.equal(hub.clockOwner,null);assert.equal(hub.externalBackend,null);
 const failed=await host.run('1 / 0\n');assert.equal(failed.result,'exception');assert.match(output,/ZeroDivisionError/);
 assert.equal(hub.clockOwner,null);
 hub.backend.runAtSpeed('A',100);hub.stepMotors(100);assert.ok(hub.data.motors[0].position>0);
});
