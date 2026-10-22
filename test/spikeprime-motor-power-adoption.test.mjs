import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Hub from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js';
import {applyHubPython} from '../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-commands.js';
import {SpikeVirtualHub} from '../overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-virtual-hub.js';
import {bundleSource, sourceOf, ALLOWED_DIVERGENCE, sha256} from '../scripts/spike/bundled-upstream.mjs';
const pins=JSON.parse(readFileSync(new URL('../vendor-pins.json',import.meta.url)));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('SPIKE alone adopts the qualified power supplier without a private divergence',()=>{
 assert.equal(pins.spikeprime,'ff74f1309b8807713508884048292182a369f8f5');
 assert.equal(sourceOf('spikeprime',pins).commit,pins.spikeprime);
 assert.equal(ALLOWED_DIVERGENCE.spikeprime,undefined);
 const src=bundleSource('spikeprime');
 const table=JSON.parse(readFileSync(new URL('../overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json',import.meta.url)));
 assert.equal(sha256(src),table.files.spikeprime.sha256);
 assert.match(src,/return this\._waitForMovement\(ports, Math\.floor\(degrees\), slowest\)/);
 assert.match(src,/const STALL_MS = 2000/);
 assert.match(src,/starts\.length\s*\? 120000/);
});

for(const [python,duty] of [
 ['hub.port.A.motor.pwm(40)',.4],['hub.port.A.motor.start_at_power(-120)',-1],
 ['import motor; from hub import port; motor.set_duty_cycle(port.A, -3750)',-.375],
 ['motor.set_duty_cycle(port.A, 20000)',1]
])test(`actual virtual command selects signed duty: ${python}`,()=>{
 const h=new Hub();assert.equal(applyHubPython(h,python).handled,true);
 assert.equal(h.backend._controllers[0].mode,'power');near(h.backend._controllers[0].duty,duty);
 h.stepMotors(1000);assert.equal(Math.sign(h.data.motors[0].position),Math.sign(duty));
 assert.equal(h.motors.busy('A'),true);
});

test('power validates ports/nonfinite values, replaces finite tasks and zero coasts',async()=>{
 const h=new Hub(),b=h.backend;
 for(const [p,v] of [['G',50],['A',NaN],['A',Infinity]])assert.throws(()=>b.runAtPower(p,v));
 assert.equal(applyHubPython(h,'motor.set_duty_cycle(port.G, 5000)').handled,false);
 const done=b.runForDegrees('A',360,200);b.runAtPower('A',50);assert.equal(await done,'interrupted');
 assert.equal(applyHubPython(h,'hub.port.A.motor.pwm(0)').handled,true);
 assert.equal(b._controllers[0].mode,'stop');assert.equal(b._controllers[0].action,'coast');
 b.runAtPower('A',30);b.stopAll();assert.equal(b._controllers[0].mode,'idle');
});

test('regulated speed remains distinct and the arena duty approximation is explicit',()=>{
 const h=new Hub(),b=h.backend;
 applyHubPython(h,'hub.port.A.motor.run_at_speed(40)');assert.equal(b._controllers[0].mode,'speed');
 applyHubPython(h,'motor.run(port.A, 300)');assert.equal(b._controllers[0].mode,'speed');
 b.runAtPower('A',40);b.step(1000);near(h.data.motors[0].degPerSec,.4*b.maxSpeed('A'));
 b.setLoad('A',.5);b.step(1000);near(h.data.motors[0].degPerSec,.2*b.maxSpeed('A'));
});

test('Robot Lab PWM uses fixed duty under encoder load, then resumes regulated speed and Stop',()=>{
 const hub=new SpikeVirtualHub();hub.plug([{port:'A',class:'motor',ids:{lpf2:48}}]);
 const b=hub.hubState.backend;
 b.runAtPower('A',-40);
 for(let t=5;t<=500;t+=5){hub.advanceTo(t);assert.deepEqual(hub.readDrives(),[{port:'A',mode:'pwm',duty:-.4,decay:'brake'}]);
  hub.writeReadings([{port:'A',kind:'encoder',deltaRad:0,radPerSec:0}]);}
 near(hub.dc.get(0).integral,0);
 b.runAtSpeed('A',300);hub.advanceTo(505);assert.notEqual(hub.readDrives()[0].duty,-.4);
 b.runAtPower('A',0);hub.advanceTo(510);assert.deepEqual(hub.readDrives(),[{port:'A',mode:'pwm',duty:0,decay:'coast'}]);
 assert.deepEqual(hub.directCommand('A',{power:25}),{ok:true});assert.equal(b._controllers[0].mode,'speed');hub.advanceTo(515);
 b.runAtPower('A',25);hub.advanceTo(520);near(hub.readDrives()[0].duty,.25);
 b.stopAll();hub.advanceTo(525);near(hub.readDrives()[0].duty,0);
 hub.dispose();
});

test('actual Jolt motor loses speed under fixed power while regulated speed adds duty',async()=>{
 const {loadJolt,createPhysicsCore}=await import('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js');
 const {attachMotor,applyDrive}=await import('../overlay/scratch-gui/src/lib/bw-sim/physics/actuators.js');
 const {SPIKE_MEDIUM_ANGULAR:device}=await import('../overlay/scratch-gui/src/lib/bw-sim/devices/dc-motors.js');
 const motor={port:'A',deviceId:48,maxTorqueNm:device.motor.stallTorqueNm,maxSpeedRadPerSec:device.motor.noLoadRadPerSec};
 const mechanism={version:1,gravity:[0,0,0],bodies:[
  {id:'housing',motion:'static',position:[0,-.2,0],rotation:[0,0,0,1],massKg:0,colliders:[{shape:'box',halfExtents:[.01,.01,.01]}],parts:[]},
  {id:'out',motion:'dynamic',position:[0,0,0],rotation:[0,0,0,1],massKg:.04,colliders:[{shape:'cylinder',radius:.01,halfHeight:.002}],parts:[]}
 ],joints:['A','B'].map(port=>({id:'j'+port,type:'hinge',body1:'housing',body2:'out',point:[0,0,0],axis:[0,1,0],motor:{...motor,port}})),gears:[],diagnostics:[]};
 const core=createPhysicsCore(await loadJolt(),mechanism,{stepHz:200});attachMotor(core,'jA',device);core.setMotor('jB',{mode:'coast'});
 const hub=new SpikeVirtualHub();hub.plug([{port:'A',class:'motor',ids:{lpf2:48},device}]);
 let time=0,angle=core.jointState('jA').angle;
 const step=n=>{for(let i=0;i<n;i++){
  hub.advanceTo(time+=5);applyDrive(core,'jA',hub.readDrives()[0],motor,{device,supplyVolts:7.2});core.step(.005);
  const state=core.jointState('jA');hub.writeReadings([{port:'A',kind:'encoder',deltaRad:state.angle-angle,radPerSec:state.velocity}]);angle=state.angle;
 }return core.jointState('jA').velocity;};
 try{
  hub.hubState.motors.runAtPower('A',50);const unloaded=step(600);near(hub.readDrives()[0].duty,.5);
  core.setMotor('jB',{mode:'torque',torqueNm:-.2*device.motor.stallTorqueNm,dampingNmsPerRad:.02*device.motor.stallTorqueNm/device.motor.noLoadRadPerSec});
  const loaded=step(600);near(hub.readDrives()[0].duty,.5);assert.ok(loaded>0&&loaded<unloaded*.8,`${loaded} vs ${unloaded}`);
  const target=unloaded*180/Math.PI;hub.hubState.motors.runAtSpeed('A',target);const regulated=step(600);
  assert.ok(Math.abs(regulated-unloaded)<unloaded*.05,`${regulated} vs ${unloaded}`);
  assert.ok(hub.readDrives()[0].duty>.6);
 }finally{hub.dispose();core.destroy();}
});

test('shipping power block emits both firmware dialects into the actual virtual hub',async()=>{
 const {loadExtensionClass,probeExtension,stubRuntime}=await import('./helpers/bw-extensions.mjs');
 const {instance,error}=probeExtension(loadExtensionClass('spikeprime'),stubRuntime());assert.equal(error,null);
 for(const protocol of ['spike3','legacy']){
  const h=new Hub(),sent=[];
  instance._inst._peripheral={protocol,sendPythonCommand:async source=>{
   sent.push(source);const result=applyHubPython(h,source);assert.equal(result.handled,true,source);await Promise.all(result.pending);
  }};
  await instance.motorStartPower({PORT:'A+B',POWER:-37.25});
  assert.equal(sent.length,2);
  for(const i of [0,1]){assert.equal(h.backend._controllers[i].mode,'power');near(h.backend._controllers[i].duty,protocol==='spike3'?-.3725:-.37);}
  await instance.motorStartPower({PORT:'A',POWER:0});assert.equal(h.backend._controllers[0].action,'coast');
 }
});

test('power Stop All follows the configured stop action after an earlier coast',()=>{
 const hub=new SpikeVirtualHub();hub.plug([{port:'A',class:'motor',ids:{lpf2:48}}]);
 const b=hub.hubState.backend;let time=0;
 try{
  for(const action of ['brake','coast']){
   b.stop('A','coast');hub.advanceTo(time+=5);
   b.setStopAction('A',action);b.runAtPower('A',40);hub.advanceTo(time+=5);
   b.stopAll();hub.advanceTo(time+=5);
   assert.deepEqual(hub.readDrives(),[{port:'A',mode:'pwm',duty:0,decay:action}]);
  }
 }finally{hub.dispose();}
});
