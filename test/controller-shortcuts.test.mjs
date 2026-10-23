import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ControllerPanel} from 'bw-board/controller.js';
import {ControllerExtension} from 'bw-board/controller-extension.js';
import {bindPanelToBoard} from 'bw-board/controller-binding.js';
import {clearControllerPanel,connectControllerBoard,createWidgetButtonInputs,releaseMomentaryButtons,
 serializeControllerPanel} from '../overlay/scratch-gui/src/lib/controller-inputs.js';
class Events {
 listeners=new Map(); hidden=false;
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 send(type,fields={}){const e={key:'a',target:null,preventDefault(){this.defaultPrevented=true;},...fields};for(const fn of [...(this.listeners.get(type)||[])])fn(e);return e;}
}
function fixture(toggle=false){
 const panel=new ControllerPanel();panel.addWidget('key1','button',{key:'a',toggle});panel.bindToPart('key1','switch1');panel.setMode('play');
 const writes=[],binding=bindPanelToBoard(panel,{setControl:(...a)=>writes.push(a)});
 const window=new Events(),document=new Events(),inputs=createWidgetButtonInputs(panel,{window,document});
 return {panel,writes,window,document,inputs,close(){inputs.dispose();binding.dispose();}};
}

test('keyboard press/release uses the actual part binding and reserves only its assigned key',()=>{
 const f=fixture();try{
  assert.equal(f.window.send('keydown',{key:'z'}).defaultPrevented,undefined);
  assert.equal(f.window.send('keydown',{key:'A'}).defaultPrevented,true);
  assert.equal(f.panel.isPressed('key1'),true);assert.deepEqual(f.writes,[['switch1',1]]);
  f.window.send('keyup',{key:'a',ctrlKey:true,target:{closest:()=>true}});
  assert.equal(f.panel.isPressed('key1'),false);assert.deepEqual(f.writes.at(-1),['switch1',0]);
 }finally{f.close();}
});

function runtimeFixture(board = undefined) {
 const panel=new ControllerPanel(),runtime=new EventEmitter(),ext=new ControllerExtension(),writes=[];
 panel.addWidget('key1','button',{});panel.bindToPart('key1','switch1');
 panel.addWidget('trim1','slider',{min:0,max:1,value:.3});panel.bindToPart('trim1','pot1','position');
 panel.setMode('play');ext.setPanel(panel);
 const target=board===undefined?{setControl:(...args)=>writes.push(args)}:board;
 const connection=connectControllerBoard(panel,target,runtime);
 return {panel,runtime,ext,writes,connection};
}

test('program controls and saved tuning drive the circuit without a Widgets view',()=>{
 const f=runtimeFixture();try{
  assert.deepEqual(f.writes,[['switch1',0],['pot1',.3]]);
  f.ext.setWidget({NAME:'key1',VALUE:1});assert.deepEqual(f.writes.at(-1),['switch1',1]);
  f.ext.setWidget({NAME:'trim1',VALUE:.7});assert.deepEqual(f.writes.at(-1),['pot1',.7]);
 }finally{f.connection.dispose();}
});

test('program Stop releases hidden momentary inputs and keeps live tuning',()=>{
 const f=runtimeFixture();try{
  f.ext.setWidget({NAME:'key1',VALUE:1});f.ext.setWidget({NAME:'trim1',VALUE:.7});
  f.runtime.emit('PROJECT_STOP_ALL');assert.deepEqual(f.writes.at(-1),['switch1',0]);
  assert.equal(f.panel.isPressed('key1'),false);assert.equal(f.panel.getValue('trim1'),.7);
 }finally{f.connection.dispose();}
 assert.equal(f.runtime.listenerCount('PROJECT_STOP_ALL'),0);
});

test('runtime edit mode releases the old board and Play resynchronizes tuning',()=>{
 const f=runtimeFixture();try{
  f.ext.setWidget({NAME:'key1',VALUE:1});f.panel.setMode('edit');
  assert.deepEqual(f.writes.at(-1),['switch1',0]);const count=f.writes.length;
  f.ext.setWidget({NAME:'key1',VALUE:1});f.ext.setWidget({NAME:'trim1',VALUE:.7});assert.equal(f.writes.length,count);
  f.panel.setMode('play');assert.deepEqual(f.writes.slice(-2),[['switch1',0],['pot1',.7]]);
 }finally{f.connection.dispose();}
});

test('replacing a runtime board detaches the old target before synchronizing the new one',()=>{
 const f=runtimeFixture(),newWrites=[];f.ext.setWidget({NAME:'key1',VALUE:1});f.connection.dispose();
 assert.deepEqual(f.writes.at(-1),['switch1',0]);const oldCount=f.writes.length;
 const next=connectControllerBoard(f.panel,{setControl:(...args)=>newWrites.push(args)},f.runtime);
 try{f.ext.setWidget({NAME:'key1',VALUE:1});assert.deepEqual(newWrites.at(-1),['switch1',1]);assert.equal(f.writes.length,oldCount);}
 finally{next.dispose();next.dispose();}
 assert.equal(f.runtime.listenerCount('PROJECT_STOP_ALL'),0);
 const count=newWrites.length;f.ext.setWidget({NAME:'key1',VALUE:1});assert.equal(newWrites.length,count);
});

test('typing, modifier shortcuts, key repeat, hidden documents and edit mode cannot press keys',()=>{
 const f=fixture();try{
  for(const fields of [{target:{closest:()=>true}},{ctrlKey:true},{metaKey:true},{altKey:true},{repeat:true}])f.window.send('keydown',fields);
  f.document.hidden=true;f.window.send('keydown');f.document.hidden=false;
  f.panel.setMode('edit');f.window.send('keydown');
  assert.deepEqual(f.writes,[]);
 }finally{f.close();}
});

test('pointer and keyboard ownership overlap without releasing a still-held switch',()=>{
 const f=fixture();try{
  f.inputs.press('key1','pointer:4');f.window.send('keydown');f.inputs.release('key1','pointer:4');
  assert.equal(f.panel.isPressed('key1'),true);assert.deepEqual(f.writes,[['switch1',1]]);
  f.window.send('keyup');assert.equal(f.panel.isPressed('key1'),false);
  assert.deepEqual(f.writes,[['switch1',1],['switch1',0]]);
 }finally{f.close();}
});

for(const trigger of ['blur','hidden','edit','dispose'])test(`${trigger} releases the bound momentary switch and subsequent keyup is harmless`,()=>{
 const f=fixture();try{
  f.window.send('keydown');f.inputs.press('key1','pointer:4');
  if(trigger==='blur')f.window.send('blur');
  if(trigger==='hidden'){f.document.hidden=true;f.document.send('visibilitychange');}
  if(trigger==='edit')f.panel.setMode('edit');
  if(trigger==='dispose')f.inputs.dispose();
  assert.equal(f.panel.isPressed('key1'),false);assert.deepEqual(f.writes.at(-1),['switch1',0]);
  const count=f.writes.length;f.window.send('keyup');assert.equal(f.writes.length,count);
 }finally{f.close();}
});

test('toggle shortcuts latch exactly once per press and retain their intended state on blur',()=>{
 const f=fixture(true);try{
  f.window.send('keydown');f.window.send('keydown',{repeat:true});f.window.send('keyup');f.window.send('blur');
  assert.equal(f.panel.isPressed('key1'),true);f.window.send('keydown');assert.equal(f.panel.isPressed('key1'),false);
 }finally{f.close();}
});

test('clearing a faceplate releases a real part before deleting its binding',()=>{
 const f=fixture();try{
  f.window.send('keydown');clearControllerPanel(f.panel);
  assert.equal(f.panel.getWidgetNames().length,0);assert.deepEqual(f.writes.at(-1),['switch1',0]);
  const count=f.writes.length;f.window.send('keyup');assert.equal(f.writes.length,count);
 }finally{f.close();}
});

test('program Stop can release software-held momentary keys without resetting tuning or toggle settings',()=>{
 const f=fixture();try{
  f.panel.addWidget('trim1','slider',{min:0,max:1,value:.3,step:.001});f.panel.setSliderInput('trim1',.7);
  f.panel.setButtonInput('key1',true);releaseMomentaryButtons(f.panel);
  assert.equal(f.panel.isPressed('key1'),false);assert.equal(f.panel.getValue('trim1'),.7);
  assert.deepEqual(f.writes.at(-1),['switch1',0]);
 }finally{f.close();}
});

test('Save/Open retains new tuning and shortcut config while held keys reopen released',()=>{
 const f=fixture();try{
  const knob=f.panel.addWidget('trim1','slider',{min:0,max:1,value:.3,step:.001});
  f.panel.setSliderInput('trim1',.7);f.window.send('keydown');
  const saved=serializeControllerPanel(f.panel),restored=ControllerPanel.fromJSON(saved);
  assert.equal(knob.config.value,.3,'saving does not change the original template');
  assert.equal(restored.getValue('trim1'),.7);assert.equal(restored.isPressed('key1'),false);
  assert.equal(restored.getWidget('key1').config.key,'a');assert.deepEqual(restored.getWidget('key1').binding,f.panel.getWidget('key1').binding);
 }finally{f.close();}
});

test('disposing removes browser listeners and does not turn a later event into input',()=>{
 const f=fixture();f.inputs.dispose();f.window.send('keydown');assert.deepEqual(f.writes,[]);
 for(const set of [...f.window.listeners.values(),...f.document.listeners.values()])assert.equal(set.size,0);
 f.close();
});

test('musical keys work while tuning a range slider, while its own navigation keys remain available',()=>{
 const f=fixture();try{
  const range={closest:selector=>selector==='input[type="range"]'?{}:null};
  f.window.send('keydown',{key:'a',target:range});assert.equal(f.panel.isPressed('key1'),true);f.window.send('keyup',{key:'a',target:range});
  f.panel.getWidget('key1').config.key='ArrowLeft';
  assert.equal(f.window.send('keydown',{key:'ArrowLeft',target:range}).defaultPrevented,undefined);assert.equal(f.panel.isPressed('key1'),false);
 }finally{f.close();}
});
