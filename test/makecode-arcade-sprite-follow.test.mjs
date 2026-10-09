import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';
import {STATIC} from '../scripts/lib/pxt-node.mjs';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {cameraMap} from './fixtures/arcade-camera.mjs';
const Arcade=loadExtensionClass('arcade');
function actors(){
 const runtime=new EventEmitter(),ext=new Arcade(runtime),image=ext.createImage({WIDTH:2,HEIGHT:2});
 const ids=[0,1,2].map(()=>ext.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'}));
 return {runtime,ext,ids,sprites:ids.map(id=>ext._sprite(id))};
}

test('steering and follow lifecycle match the actual original PXT method at controlled frame times',()=>{
 const target=JSON.parse(fs.readFileSync(`${STATIC}/arcade/target.json`,'utf8'));
 const source=target.bundledpkgs.game['sprite.ts'];
 const method=source.slice(source.indexOf('    follow(target:'),source.indexOf('    setScaleCore',source.indexOf('    follow(target:')));
 const ts=createRequire(new URL('../packages/scratch-gui/package.json',import.meta.url))('typescript');
 const js=ts.transpileModule('class Reference {\n'+method+'\n}',{compilerOptions:{target:ts.ScriptTarget.ES2017}}).outputText;
 let now=0;const callbacks=[];const scene={eventContext:{registerFrameHandler:(priority,fn)=>callbacks.push(fn)}};
 const math=Object.create(Math);math.clamp=(min,max,value)=>Math.min(max,Math.max(min,value));
 const context={game:{currentScene:()=>scene,runtime:()=>now},scene:{FOLLOW_SPRITE_PRIORITY:14},Math:math,
 sprites:{Flag:{Destroyed:2},FollowingSprite:class{constructor(self,target,rate,turnRate){Object.assign(this,{self,target,rate,turnRate});}}}};
 runInNewContext('Array.prototype.removeElement=function(item){const i=this.indexOf(item);if(i>=0)this.splice(i,1)};'+js+'\nthis.Reference=Reference',context);
 const {runtime,ext,ids,sprites}=actors(),original=sprites.map((sprite,index)=>{
  const object=new context.Reference();object.id=index;object.flags=0;
  // Preserve the already qualified Fx8 coordinate/velocity storage boundaries.
  for(const key of ['x','y','vx','vy'])Object.defineProperty(object,key,Object.getOwnPropertyDescriptor(sprite,key));
  Object.assign(object,{width:2,height:2,_fx:sprite._fx,_fy:sprite._fy,_vx:0,_vy:0});return object;
 });
 const [self,goal,other]=sprites,[ref,refGoal,refOther]=original;
 const position=(index,x,y)=>{sprites[index].x=x;original[index].x=x;sprites[index].y=y;original[index].y=y;};
 const follow=(index,speed=100,turn=400)=>{
  original[0].follow(index===null?null:original[index],speed,turn);
  ext.followSprite({ID:ids[0],TARGET:index===null?null:ids[index],SPEED:speed,TURN:turn});
 };
 const check=ms=>{
  now=ms;ext._inst._globalElapsedMs=ms;callbacks.forEach(fn=>fn());ext._moveFollowingSprites();
  for(const key of ['x','y','vx','vy'])assert.equal(self[key],ref[key],`${key} at ${ms}`);
  assert.equal(ext._state().followingSprites.length,scene.followingSprites.length);
 };
 position(0,40,30);position(1,120,90);position(2,10,10);
 follow(1,25);for(const ms of [0,10,30,125,250])check(ms);
 position(1,0,0);for(const ms of [300,350,500])check(ms);
 follow(2,60,100);check(550);follow(0);check(600); // self-follow leaves prior binding intact
 follow(null);assert.equal(self.vx,ref.vx);assert.equal(self.vy,ref.vy);
 self.vx=ref.vx=7;follow(null);check(650);assert.equal(self.vx,7,'no active binding does not clear velocity');
 follow(1,-25,-100);check(700);follow(1,NaN);check(750);
 position(1,41,31);follow(1);check(800);assert.equal(self.x,goal.x);assert.equal(self.y,goal.y);
 position(1,100,100);follow(1);check(850);goal._destroyed=true;refGoal.flags|=2;check(900);assert.equal(self.vx,0);
 runtime.emit('PROJECT_START');assert.equal(ext._state().followingSprites,undefined);
});

const source=`let hero=sprites.create(img\`1\`,SpriteKind.Player)
let enemy=sprites.create(img\`2\`,SpriteKind.Enemy)
hero.setPosition(120,90)
enemy.setPosition(40,30)
let calls=0
function target(){calls++;return hero}
function speed(){calls++;return 25}
enemy.follow(target(),speed(),400)
enemy.unfollow()
let stoppedVx=enemy.vx
let stoppedVy=enemy.vy
enemy.setVelocity(7,8)
enemy.follow(null,0)
let unchangedVx=enemy.vx
let unchangedVy=enemy.vy
let done=calls===2`;
const names=['calls','stoppedVx','stoppedVy','unchangedVx','unchangedVy','done'];
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
test('follow and unfollow stay editable through Code/Blocks/SB3 and executed original MakeCode export',async()=>{
 const expected=await runPxtArcade(source);
 const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const name of names)assert.equal(values(run)[name],expected[name],name);};
 const execute=async imported=>{assert.deepEqual(imported.unsupported,[]);const run=await runProgram(imported.code,{frames:20,uploads:imported.costumes,storage:true});check(run);return run;};
 const imported=arcadeToPseudocode(source),run=await execute(imported);
 assert.match(imported.code,/arcade sprite .* follow/);assert.match(imported.code,/stop following/);
 await execute({...imported,code:run.creator.decompile()});
 const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
 const original=await runPxtArcade(exported.files);for(const name of names)assert.equal(original[name],expected[name],name+' exported');
 await execute(arcadeToPseudocode(exported.files));
 await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,20);check(run);
});

test('bad arity and non-sprite targets retain named refusals',()=>{
 const setup='let actor=sprites.create(img`1`,SpriteKind.Player);';
 for(const code of ['actor.follow()','actor.follow(12)','actor.follow(null,1,2,3)','actor.unfollow(1)'])assert.ok(arcadeToPseudocode(setup+code).unsupported.length,code);
});

test('following owns its scene and steers after controller input before physics',()=>{
 const {ext,ids,sprites}=actors(),[self,goal]=sprites;
 self.x=40;self.y=30;goal.x=120;goal.y=30;
 ext.followSprite({ID:ids[0],TARGET:ids[1],SPEED:25,TURN:400});
 ext.controlSpriteByController({CONTROLLER:1,ID:ids[0],VX:100,VY:0});
 ext._state().buttons.left=true;ext._advance(.01);
 assert.equal(self.vx,-98,'controller sets -100 before following adds 2');
 assert.ok(self.x<40,'physics uses the newly steered velocity');
 const parent=ext._state();ext.pushScene();ext._advance(.1);
 assert.equal(ext._state().followingSprites,undefined);assert.equal(parent.followingSprites.length,1);
 ext.unfollowSprite({ID:ids[0]});assert.equal(parent.followingSprites.length,1,'child cancellation does not change parent binding');
 ext.popScene();assert.equal(ext._state(),parent);
 ext.followSprite({ID:ids[0],TARGET:ids[1],SPEED:25,TURN:400});
 ext._inst._globalElapsedMs+=100;ext._moveFollowingSprites();
 assert.equal(parent.followingSprites.length,1);
 ext.unfollowSprite({ID:ids[0]});assert.equal(self.vx,0);assert.equal(self.vy,0);
});

test('near-target snapping uses original collision-aware x/y setters rather than teleporting through walls',async()=>{
 const original=await runPxtArcade(`${cameraMap()}
 tiles.setWallAt(tiles.getTileLocation(2,1),true)
 let goal=sprites.create(image.create(2,2),SpriteKind.Enemy)
 goal.image.fill(2)
 goal.setFlag(SpriteFlag.GhostThroughWalls,true)
 goal.setPosition(16,12)
 let follower=sprites.create(image.create(2,2),SpriteKind.Player)
 follower.image.fill(2)
 follower.setPosition(14.5,12)
 follower.follow(goal,100)
 pause(80)
 let snapX=follower.x
 let snapY=follower.y
 let snapVX=follower.vx`);
 const {ext,ids,sprites}=actors();const [self,goal]=sprites;
 self.image.pixels.fill(2);goal.image.pixels.fill(2);
 ext.setTilemap({DATA:JSON.stringify({columns:4,rows:4,tileSize:8,indices:Array(16).fill(0),walls:Array.from({length:16},(_,i)=>i===6?1:0),images:[{width:1,height:1,pixels:[0]}]})});
 ext.setSpriteFlag({ID:ids[1],FLAG:'GhostThroughWalls',ON:true});
 ext.setSpritePosition({ID:ids[1],X:16,Y:12});ext.setSpritePosition({ID:ids[0],X:14.5,Y:12});
 ext.followSprite({ID:ids[0],TARGET:ids[1],SPEED:100,TURN:400});ext._advance(.03);
 assert.equal(self.x,original.snapX);assert.equal(self.y,original.snapY);assert.equal(self.vx,original.snapVX);
 assert.equal(self.x,15,'solid follower remains outside the wall containing its ghost target');
});
