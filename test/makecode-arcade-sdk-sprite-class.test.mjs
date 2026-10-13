import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
const cases={
  "constructor-services": "let created=0;let observed=-1;sprites.onCreated(SpriteKind.Player,function(sprite){created++;observed=sprite.id});\nclass Direct extends Sprite {constructor(img:Image){super(img);this.setKind(SpriteKind.Player)}}\nclass Easy extends sprites.ExtendableSprite {constructor(img:Image){super(img,SpriteKind.Player)}}\nlet direct=new Direct(img`1`);let directId=direct.id;let afterDirect=created;let factory=sprites.create(img`1`,SpriteKind.Player);let factoryId=factory.id;let afterFactory=created;let easy=new Easy(img`1`);let easyId=easy.id;let afterEasy=created;let refs=sprites.allOfKind(SpriteKind.Player);let directSame=refs[0]===direct;let factorySame=refs[1]===factory;let easySame=refs[2]===easy;\nlet directX=direct.x;let factoryX=factory.x;let easyX=easy.x;direct.vx=100;factory.vx=100;easy.vx=100;pause(100);let directMoved=direct.x!==directX;let factoryMoved=factory.x!==factoryX;let easyMoved=easy.x!==easyX;afterEasy+=0;",
  "constructor-virtual": "let trace=\"\";function mark(){trace=trace+\"F\";return 4}\nclass Child extends Sprite {field=mark();constructor(public value:number,img:Image){super(img);trace=trace+\"C\"}setImage(img:Image){trace=trace+\"I\"+this.value+this.field;super.setImage(img)}setKind(kind:number){trace=trace+\"K\";super.setKind(kind)}read(){return this.x+this.value+this.field}}\nlet child=new Child(3,img`1`);let result=child.read();let x=child.x;let width=child.width;let field=child.field;let value=child.value;trace=trace+\"\";result+=0;",
  "created-partial-fields": "let trace=\"\";let same=false;let seen=false;sprites.onCreated(SpriteKind.Player,function(sprite){trace=trace+\"H\";seen=(sprite as Easy).value===3;let refs=sprites.allOfKind(SpriteKind.Player);same=refs[0]===sprite;});\nclass Easy extends sprites.ExtendableSprite {constructor(public value:number,img:Image){super(img,SpriteKind.Player);trace=trace+\"C\"}read(){return this.value}}\nlet easy=new Easy(3,img`1`);let result=easy.read();trace=trace+\"\";result+=0;",
  "scene-constructor-kind-ownership": "let trace=\"\";let callbacks=0;sprites.onCreated(SpriteKind.Player,function(sprite){trace=trace+\"H\";callbacks++;game.pushScene();});\nclass Shift extends sprites.ExtendableSprite {constructor(img:Image){super(img,SpriteKind.Player);trace=trace+\"C\"}read(){return this.x}}\nlet shift=new Shift(img`1`);let emptyNew=sprites.allOfKind(SpriteKind.Player).length;let retained=shift.read();game.popScene();let oldCount=sprites.allOfKind(SpriteKind.Player).length;let oldSame=sprites.allOfKind(SpriteKind.Player)[0]===shift;game.pushScene();shift.setKind(SpriteKind.Food);let newCount=sprites.allOfKind(SpriteKind.Food).length;let newSame=sprites.allOfKind(SpriteKind.Food)[0]===shift;game.popScene();let oldAfter=sprites.allOfKind(SpriteKind.Player).length;let afterSame=sprites.allOfKind(SpriteKind.Player)[0]===shift;let oldKind=shift.kind();trace=trace+\"\";"
};
const expected={
  "constructor-services": {
    "created": 2,
    "observed": 2,
    "directId": 0,
    "afterDirect": 0,
    "factoryId": 1,
    "afterFactory": 1,
    "easyId": 2,
    "afterEasy": 2,
    "directSame": true,
    "factorySame": true,
    "easySame": true,
    "directX": 79.5,
    "factoryX": 79.5,
    "easyX": 79.5,
    "directMoved": false,
    "factoryMoved": true,
    "easyMoved": true
  },
  "constructor-virtual": {
    "trace": "FI34KC",
    "result": 86.5,
    "x": 79.5,
    "width": 1,
    "field": 4,
    "value": 3
  },
  "created-partial-fields": {
    "trace": "HC",
    "same": true,
    "seen": true,
    "result": 3
  },
  "scene-constructor-kind-ownership": {
    "trace": "HC",
    "callbacks": 1,
    "emptyNew": 0,
    "retained": 79.5,
    "oldCount": 1,
    "oldSame": true,
    "newCount": 1,
    "newSame": true,
    "oldAfter": 1,
    "afterSame": true,
    "oldKind": 1001
  }
};
cases['image-alias']='class Picture extends Sprite {}let picture=image.create(2,3);picture.setPixel(1,2,7);let object=new Picture(picture);let sameImage=object.image===picture;picture.setPixel(0,0,4);let pixel=object.image.getPixel(0,0);let width=object.width;let height=object.height;let other=image.create(3,2);object.setImage(other);let changed=object.image===other;let resizedWidth=object.width;let resizedHeight=object.height;pixel+=0;';
expected['image-alias']={sameImage:true,pixel:4,width:2,height:3,changed:true,resizedWidth:3,resizedHeight:2};
cases['yielding-constructor']='let pending:any=null;let seen=false;let bodies=0;sprites.onCreated(SpriteKind.Player,function(sprite){pending=sprite;seen=(sprite as Easy).value===3;});class Easy extends sprites.ExtendableSprite {constructor(public value:number,img:Image){super(img,SpriteKind.Player);pause(40);bodies++;this.value=9}read(){return this.value}}let object=new Easy(3,img`1`);let result=object.read();let same=pending===object;result+=0;';
expected['yielding-constructor']={seen:true,bodies:1,result:9,same:true};
cases['extendable-flag-order']='let trace="";sprites.onCreated(SpriteKind.Player,function(sprite){trace=trace+"H"});class Easy extends sprites.ExtendableSprite {constructor(img:Image){super(img,SpriteKind.Player);trace=trace+"C"}setKind(value:number){trace=trace+(this.hasCustomDimensions===undefined?"U":"D");super.setKind(value)}readDims(){return this.hasCustomDimensions}}let easy=new Easy(img`1`);let dimensions=easy.readDims();trace=trace+"";';
expected['extendable-flag-order']={trace:'UUHC',dimensions:false};
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),BW.decode(v.value)]));
const checked=(actual,expected,label)=>{for(const [name,value]of Object.entries(expected))assert.equal(actual[name]??actual[name+'_'],value,label+' '+name);};
async function execute(imported,runs){
 assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
 const run=await runProgram(imported.code,{frames:0,storage:true,uploads:imported.costumes||[]});runs.push(run);assert.deepEqual(run.creator.warnings,[]);
 run.vm.stopAll();let now=0;run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.greenFlag();
 // Drain source/managed activations at the same time. Then advance actual
 // explicit native physical frames and the core wait clock together.
 await stepFrames(run.vm,150,0);for(let i=0;i<8;i++){now+=20;await stepFrames(run.vm,4,20);}
 assert.deepEqual(run.errors,[]);return run;
}
for(const [name,source]of Object.entries(cases))test('real SDK Sprite '+name+' retains original/native and all authoring routes',async()=>{
 const runs=[];const original=await runPxtArcade(source,{fakeClock:true});checked(original,expected[name],'original');
 try{
  const imported=arcadeToPseudocode(source),run=await execute(imported,runs);checked(values(run),expected[name],'native');
  checked(values(await execute({...imported,code:run.creator.decompile()},runs)),expected[name],'decompile');
  const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/extends (?:Sprite|sprites.ExtendableSprite)/);
  checked(await runPxtArcade(exported.files,{fakeClock:true}),expected[name],'original export');
  checked(values(await execute(arcadeToPseudocode(exported.files),runs)),expected[name],'reimport');
  const reopened=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(reopened);reopened.vm.stopAll();await reopened.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));let now=0;reopened.vm.runtime.bwArcadeProgramClock={now:()=>now};reopened.vm.runtime.updateCurrentMSecs=()=>{reopened.vm.runtime.currentMSecs=now;};reopened.vm.greenFlag();await stepFrames(reopened.vm,150,0);for(let i=0;i<8;i++){now+=20;await stepFrames(reopened.vm,4,20);}assert.deepEqual(reopened.errors,[]);checked(values(reopened),expected[name],'fresh SB3');
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});
test('SDK drawing/update/hitbox and statusbar accessors retain named admission boundaries',()=>{
 for(const source of ['class D extends sprites.ExtendableSprite {constructor(img:Image){super(img)}update(dt:number){}}','class D extends Sprite {constructor(img:Image){super(img)}drawSprite(x:number,y:number){}}','class D extends sprites.ExtendableSprite {constructor(img:Image){super(img)}setDimensions(w:number,h:number){}}'])assert.match(arcadeToPseudocode(source).unsupported.join('\n'),/separate qualification/);
 assert.match(arcadeToPseudocode('class D extends Sprite {constructor(img:Image){super(img)}get value(){return 2}}').unsupported.join('\n'),/accessors/);
});
test('internal SDK descriptor constructors stay inaccessible to selected original source',async()=>{
 for(const source of ['class Real extends Sprite {} let fake=new __bwSDK_BaseSprite(1);','class Real extends Sprite {} let fake=new __bwSDK_ExtendableSprite(img`1`);','class Fake extends __bwSDK_BaseSprite {}']){
  await assert.rejects(()=>runPxtArcade(source,{fakeClock:true}));
  assert.match(arcadeToPseudocode(source).unsupported.join('\n'),/Internal SDK class descriptor names/);
 }
});


test('canonical Sprite handles never regain an old class in the same loaded JS realm across restart or extension instances',async()=>{
 const source='class Child extends Sprite {constructor(public value:number,img:Image){super(img);this.setKind(SpriteKind.Player)}}let object=new Child(3,img`1`);let publicId=object.id;let same=sprites.allOfKind(SpriteKind.Player)[0]===object;';const runs=[];
 try{
  const imported=arcadeToPseudocode(source),first=await execute(imported,runs);const old=values(first).object;assert.match(old,/^arcade:\d+$/);assert.equal(values(first).publicId,0);assert.equal(values(first).same,true);
  first.vm.stopAll();first.vm.greenFlag();await stepFrames(first.vm,150,0);const next=values(first).object;assert.notEqual(next,old);assert.equal(values(first).publicId,0);assert.equal(values(first).same,true);assert.deepEqual(first.errors,[]);
  const read=first.vm.runtime._primitives.arcade_objectField;assert.equal(read({OBJECT:next,FIELD:'value'},{}),3);const count=first.errors.length;assert.equal(read({OBJECT:old,FIELD:'value'},{}).bwUndefined,true);assert.equal(first.errors.length,count+1);assert.match(first.errors.at(-1),/Unknown or stale class object/);
  const second=await execute(imported,runs);assert.notEqual(values(second).object,old);assert.notEqual(values(second).object,next);assert.equal(values(second).publicId,0);assert.equal(values(second).same,true);assert.deepEqual(second.errors,[]);const read2=second.vm.runtime._primitives.arcade_objectField;assert.equal(read2({OBJECT:next,FIELD:'value'},{}).bwUndefined,true);assert.match(second.errors.at(-1),/Unknown or stale class object/);
 }finally{runs.forEach(run=>run.vm.quit());clearStrayTimers();}
});

test('Stop cancels a real pending SDK subclass constructor and restart publishes a new canonical instance',async()=>{
 const source=cases['yielding-constructor'],imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:0,storage:true,uploads:imported.costumes});let now=0;run.vm.stopAll();run.vm.runtime.bwArcadeProgramClock={now:()=>now};run.vm.runtime.updateCurrentMSecs=()=>{run.vm.runtime.currentMSecs=now;};run.vm.greenFlag();
 try{
  await stepFrames(run.vm,150,0);assert.equal(values(run).seen,true);assert.equal(values(run).bodies,0);const old=values(run).pending;assert.match(old,/^arcade:\d+$/);
  run.vm.stopAll();now=100;await stepFrames(run.vm,12,20);assert.equal(values(run).bodies,0);assert.equal(run.vm.runtime.threads.length,0);
  run.vm.greenFlag();await stepFrames(run.vm,150,0);const next=values(run).pending;assert.notEqual(next,old);assert.equal(values(run).bodies,0);now=140;await stepFrames(run.vm,40,0);assert.equal(values(run).bodies,1);assert.equal(values(run).result,9);assert.equal(values(run).same,true);assert.deepEqual(run.errors,[]);
 }finally{run.vm.quit();clearStrayTimers();}
});
