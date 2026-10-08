import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
function game(){const runtime=new EventEmitter(),a=new Arcade(runtime);return {runtime,a};}
function actor(a,{x=10,y=12,kind='Player',width=1,height=1,pixels=null}={}){
 const image=a.createImage({WIDTH:width,HEIGHT:height});if(pixels){for(const [x,y] of pixels)a.drawImage({IMAGE:image,OP:'fillRect',X:x,Y:y,W:1,H:1,COLOR:2});}else a.drawImage({IMAGE:image,OP:'fillRect',X:0,Y:0,W:width,H:height,COLOR:2});const id=a.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:kind});a.setSpritePosition({ID:id,X:x,Y:y});return id;
}
const get=(a,id,p)=>a.spriteProperty({ID:id,PROPERTY:p});
const set=(a,id,p,v)=>a.setSpriteProperty({ID:id,PROPERTY:p,VALUE:v});
function wallMap(a){a.setTilemap({DATA:JSON.stringify({columns:8,rows:4,tileSize:8,indices:Array(32).fill(0),walls:Array.from({length:32},(_,i)=>i%8===2?1:0),images:[{width:1,height:1,pixels:[0]}]})});}
function scripts(runtime,opcodes,callback){
 runtime.threads=[];const target={blocks:{getBlock:id=>id==='hat'?{inputs:{TOKEN:{block:'token'}}}:{fields:{TEXT:{value:'handler'}}}}};runtime.allScriptsByOpcodeDo=(opcode,run)=>{if(opcodes.includes(opcode))run({blockId:'hat'},target);};runtime._pushThread=()=>{const thread={status:0,constructor:{STATUS_DONE:4}};runtime.threads.push(thread);return thread;};runtime.sequencer={activeThread:null,stepThread(thread){callback(thread);thread.status=4;runtime.threads=runtime.threads.filter(t=>t!==thread);}};
}
const originalMap='tiles.setTilemap(tiles.createTilemap(hex`080004000000000000000000000000000000000000000000000000000000000000000000`,img`0 0 2 0 0 0 0 0\n0 0 2 0 0 0 0 0\n0 0 2 0 0 0 0 0\n0 0 2 0 0 0 0 0`,[img`0`],TileScale.Eight))';
test('round-robin motion snapshots and cross-mover wall mutations match the original complete physics engine',async()=>{
 const expected=await runPxtArcade(`${originalMap}
let first=sprites.create(img\`2\`,SpriteKind.Player)
first.setPosition(12,12)
let peer=sprites.create(img\`2\`,SpriteKind.Enemy)
peer.setPosition(30,12)
let observedPeer=-1
scene.onHitWall(SpriteKind.Player,function(){observedPeer=peer.x;peer.vx=0})
first.vx=100
peer.vx=100
game.currentScene().physicsEngine.move(.1)
let stoppedPeer=peer.x
let firstX=first.x
let firstVelocity=first.vx
let peerVelocity=peer.vx
game.pushScene()
${originalMap}
let reverseFirst=sprites.create(img\`2\`,SpriteKind.Player)
reverseFirst.setPosition(12,12)
let reversePeer=sprites.create(img\`2\`,SpriteKind.Enemy)
reversePeer.setPosition(30,12)
scene.onHitWall(SpriteKind.Player,function(){reversePeer.vx=-100})
reverseFirst.vx=100
reversePeer.vx=100
game.currentScene().physicsEngine.move(.1)
let reversedPeerX=reversePeer.x
let reversedPeerVelocity=reversePeer.vx`);
 assert.equal(expected.observedPeer,32.5,'peer advances one complete round before first reaches wall');
 for(const reverse of [false,true]){const {runtime,a}=game();wallMap(a);const first=actor(a,{x:12}),peer=actor(a,{x:30,kind:'Enemy'});let observed=-1;a.registerWallHandler({KIND:'Player',TOKEN:'handler',CAPTURES:''});scripts(runtime,['arcade_whenRegisteredWall'],()=>{observed=get(a,peer,'x');set(a,peer,'vx',reverse?-100:0);});set(a,first,'vx',100);set(a,peer,'vx',100);a._advance(.1);
  assert.equal(observed,expected.observedPeer);assert.equal(get(a,first,'x'),expected.firstX);assert.equal(get(a,first,'vx'),expected.firstVelocity);assert.equal(get(a,peer,'x'),reverse?expected.reversedPeerX:expected.stoppedPeer);assert.equal(get(a,peer,'vx'),reverse?expected.reversedPeerVelocity:expected.peerVelocity);
 }
});
test('map-free fixed-point stepping caps elapsed time/velocity and handles acceleration and small-frame rounding exactly',async()=>{
 const cases=[{dt:.001,vx:100,ax:0},{dt:.002,vx:100,ax:0},{dt:.005,vx:100,ax:0},{dt:1/30,vx:100,ax:100},{dt:.2,vx:900,ax:0},{dt:.1,vx:-100,ax:100}];
 const source=cases.map((c,i)=>`game.pushScene();let actor${i}=sprites.create(img\`2\`,SpriteKind.Player);actor${i}.setPosition(80,60);actor${i}.vx=${c.vx};actor${i}.ax=${c.ax};game.currentScene().physicsEngine.move(${c.dt});let x${i}=actor${i}.x;let vx${i}=actor${i}.vx`).join('\n');const expected=await runPxtArcade(source);
 for(const [i,c] of cases.entries()){const {a}=game(),id=actor(a,{x:80,y:60});set(a,id,'vx',c.vx);set(a,id,'ax',c.ax);a._advance(c.dt);assert.equal(get(a,id,'x'),expected['x'+i],'x case'+i);assert.equal(get(a,id,'vx'),expected['vx'+i],'vx case'+i);}
});
test('opaque inclusive hitboxes precede pixel tests and RelativeToCamera excludes overlap',async()=>{
 const expected=await runPxtArcade(`let first=sprites.create(img\`2\`,SpriteKind.Player)
let second=sprites.create(img\`2\`,SpriteKind.Enemy)
first.setPosition(10,12)
second.setPosition(10.5,12)
let fractional=first.overlapsWith(second)
second.x=first.x
let coincident=first.overlapsWith(second)
second.setFlag(SpriteFlag.RelativeToCamera,true)
let relative=first.overlapsWith(second)
let diagonal=sprites.create(img\`2 0 0 0
0 0 0 0
0 0 0 0
0 0 0 2\`,SpriteKind.Player)
let anti=sprites.create(img\`0 0 0 2
0 0 0 0
0 0 0 0
2 0 0 0\`,SpriteKind.Enemy)
diagonal.setPosition(30,30)
anti.setPosition(30,30)
let disjoint=diagonal.overlapsWith(anti)
anti.x-=3
let sparseOverlap=diagonal.overlapsWith(anti)`);
 const {a}=game(),first=actor(a),second=actor(a,{x:10.5,kind:'Enemy'});assert.equal(a.spriteOverlaps({A:first,B:second}),expected.fractional);set(a,second,'x',10);assert.equal(a.spriteOverlaps({A:first,B:second}),expected.coincident);a.setSpriteFlag({ID:second,FLAG:'RelativeToCamera',ON:true});assert.equal(a.spriteOverlaps({A:first,B:second}),expected.relative);
 const d=actor(a,{x:30,y:30,width:4,height:4,pixels:[[0,0],[3,3]]}),b=actor(a,{x:30,y:30,kind:'Enemy',width:4,height:4,pixels:[[3,0],[0,3]]});assert.equal(a.spriteOverlaps({A:d,B:b}),expected.disjoint);set(a,b,'x',27);assert.equal(a.spriteOverlaps({A:d,B:b}),expected.sparseOverlap);
});
test('high-speed crossing queues substep overlap even when final positions are separated, and holds pair lock',async()=>{
 const {runtime,a}=game(),first=actor(a,{x:60,y:60,width:2,height:2}),second=actor(a,{x:68,y:60,width:2,height:2,kind:'Enemy'});a.registerOverlapHandler({KIND:'Player',OTHER_KIND:'Enemy',TOKEN:'handler',CAPTURES:''});scripts(runtime,['arcade_whenRegisteredOverlap'],()=>{});set(a,first,'vx',500);a._advance(1/30);
 assert.equal(runtime.threads.length,1,'real collision reached during substeps');assert.equal(runtime.threads[0].bwArcadeEvent.first,first);assert.equal(runtime.threads[0].bwArcadeEvent.second,second);assert.equal(a.spriteOverlaps({A:first,B:second}),false,'moving sprite has left overlap by end of frame');a._advance(.01);assert.equal(runtime.threads.length,1,'running overlap pair cannot enqueue a second fiber');runtime.threads[0].status=4;runtime.threads=[];a._pumpTerrainWaits();await new Promise(resolve=>setImmediate(resolve));set(a,first,'vx',-500);a._advance(.033);assert.equal(runtime.threads.length,1,'completed pair can be detected on reverse crossing');
});
test('spatial bucket pair order, handler order and queued sprite orientation match original PXT',async()=>{
 const expected=await runPxtArcade(`let first=sprites.create(img\`2 2
2 2\`,SpriteKind.Player)
let second=sprites.create(img\`2 2
2 2\`,SpriteKind.Player)
let third=sprites.create(img\`2 2
2 2\`,SpriteKind.Player)
first.setPosition(20,20)
second.setPosition(20,20)
third.setPosition(20,20)
let order=""
function tag(sprite:Sprite){return sprite===first?"A":sprite===second?"B":"C"}
function finish(){if(order.length===18){first.setFlag(SpriteFlag.GhostThroughSprites,true);second.setFlag(SpriteFlag.GhostThroughSprites,true);third.setFlag(SpriteFlag.GhostThroughSprites,true)}}
sprites.onOverlap(SpriteKind.Player,SpriteKind.Player,function(a,b){order+=tag(a)+tag(b)+"1";finish()})
sprites.onOverlap(SpriteKind.Player,SpriteKind.Player,function(a,b){order+=tag(a)+tag(b)+"2";finish()})
game.currentScene().physicsEngine.move(.1)
while(order.length<18){pause(5)}
let orderingDone=order.length===18`,{waitForGlobals:{orderingDone:true}});
 const {runtime,a}=game(),ids=[actor(a,{x:20,y:20,width:2,height:2}),actor(a,{x:20,y:20,width:2,height:2}),actor(a,{x:20,y:20,width:2,height:2})];runtime.threads=[];const target={blocks:{getBlock:id=>id.startsWith('hat')?{inputs:{TOKEN:{block:'token'+id.slice(3)}}}:{fields:{TEXT:{value:id.slice(5)}}}}};runtime.allScriptsByOpcodeDo=(opcode,run)=>{if(opcode==='arcade_whenRegisteredOverlap')for(const token of ['1','2'])run({blockId:'hat'+token},target);};runtime._pushThread=()=>{const thread={status:0,constructor:{STATUS_DONE:4}};runtime.threads.push(thread);return thread;};runtime.sequencer={activeThread:null,stepThread(){throw new Error('overlap fibers must remain asynchronous');}};
 for(const token of ['1','2'])a.registerOverlapHandler({KIND:'Player',OTHER_KIND:'Player',TOKEN:token,CAPTURES:''});a._advance(.1);const tag=id=>'ABC'[ids.indexOf(id)];const actual=runtime.threads.map(t=>tag(t.bwArcadeEvent.first)+tag(t.bwArcadeEvent.second)+t.bwArcadeEvent.TOKEN).join('');assert.equal(actual,expected.order);assert.equal(runtime.threads.length,6);a._advance(.1);assert.equal(runtime.threads.length,6,'overlap locks suppress all six duplicates until callbacks finish');
});
test('retained and cross-scene overlap queries use object geometry independently of active physics membership',async()=>{
 const expected=await runPxtArcade(`let parent=sprites.create(img\`2 2
2 2\`,SpriteKind.Player)
parent.setPosition(20,20)
game.pushScene()
let child=sprites.create(img\`2 2
2 2\`,SpriteKind.Player)
child.setPosition(20,20)
let suspendedParentOverlap=parent.overlapsWith(child)
let suspendedParentReverse=child.overlapsWith(parent)
game.popScene()
let poppedChildOverlap=parent.overlapsWith(child)
child.setFlag(SpriteFlag.GhostThroughWalls,true)
let wallGhostOverlap=parent.overlapsWith(child)
child.setFlag(SpriteFlag.GhostThroughSprites,true)
let spriteGhostOverlap=parent.overlapsWith(child)
child.setFlag(SpriteFlag.GhostThroughSprites,false)
child.setFlag(SpriteFlag.RelativeToCamera,true)
let relativeOverlap=parent.overlapsWith(child)
child.setFlag(SpriteFlag.RelativeToCamera,false)
child.x=40
let separated=parent.overlapsWith(child)
child.x=20
let restoredGeometry=parent.overlapsWith(child)
let selfOverlap=child.overlapsWith(child)
child.destroy()
let destroyedOverlap=parent.overlapsWith(child)`);
 const {runtime,a}=game(),parent=actor(a,{x:20,y:20,width:2,height:2});a.pushScene();const child=actor(a,{x:20,y:20,width:2,height:2});const overlap=()=>a.spriteOverlaps({A:parent,B:child});assert.equal(overlap(),expected.suspendedParentOverlap);assert.equal(a.spriteOverlaps({A:child,B:parent}),expected.suspendedParentReverse);a.popScene();assert.equal(overlap(),expected.poppedChildOverlap);
 a.registerOverlapHandler({KIND:'Player',OTHER_KIND:'Player',TOKEN:'handler',CAPTURES:''});scripts(runtime,['arcade_whenRegisteredOverlap'],()=>{});a._advance(.1);assert.equal(runtime.threads.length,0,'inactive child is excluded from active collision engine');
 a.setSpriteFlag({ID:child,FLAG:'GhostThroughWalls',ON:true});assert.equal(overlap(),expected.wallGhostOverlap);a.setSpriteFlag({ID:child,FLAG:'GhostThroughSprites',ON:true});assert.equal(overlap(),expected.spriteGhostOverlap);a.setSpriteFlag({ID:child,FLAG:'GhostThroughSprites',ON:false});a.setSpriteFlag({ID:child,FLAG:'RelativeToCamera',ON:true});assert.equal(overlap(),expected.relativeOverlap);a.setSpriteFlag({ID:child,FLAG:'RelativeToCamera',ON:false});set(a,child,'x',40);assert.equal(overlap(),expected.separated);set(a,child,'x',20);assert.equal(overlap(),expected.restoredGeometry);assert.equal(a.spriteOverlaps({A:child,B:child}),expected.selfOverlap);a.destroySprite({ID:child});assert.equal(overlap(),expected.destroyedOverlap);
});
test('hidden image aliases and image replacement immediately affect retained overlap queries',async()=>{
 const expected=await runPxtArcade(`let parent=sprites.create(img\`2\`,SpriteKind.Player)
parent.setPosition(20,20)
let shared=parent.image
game.pushScene()
let child=sprites.create(img\`2\`,SpriteKind.Player)
child.setPosition(20,20)
let initiallyOpaque=parent.overlapsWith(child)
shared.fill(0)
let hiddenBlank=parent.overlapsWith(child)
shared.fill(2)
let hiddenRestored=parent.overlapsWith(child)
parent.setImage(img\`0\`)
let hiddenReplacedBlank=parent.overlapsWith(child)
parent.setImage(img\`2\`)
let hiddenReplacedOpaque=parent.overlapsWith(child)
game.popScene()
let afterPopOpaque=parent.overlapsWith(child)`);
 const {a}=game(),parent=actor(a,{x:20,y:20}),shared=a.spriteImage({ID:parent});a.pushScene();const child=actor(a,{x:20,y:20});const overlap=()=>a.spriteOverlaps({A:parent,B:child});assert.equal(overlap(),expected.initiallyOpaque);a.mutateImage({IMAGE:shared,OP:'fill',COLOR:0});assert.equal(overlap(),expected.hiddenBlank,'1px hitbox tolerance must not retain stale opacity');a.mutateImage({IMAGE:shared,OP:'fill',COLOR:2});assert.equal(overlap(),expected.hiddenRestored);
 const blank=a.createImage({WIDTH:1,HEIGHT:1});a.setSpriteImage({ID:parent,IMAGE:blank});assert.equal(overlap(),expected.hiddenReplacedBlank);const opaque=a.createImage({WIDTH:1,HEIGHT:1});a.drawImage({IMAGE:opaque,OP:'fillRect',X:0,Y:0,W:1,H:1,COLOR:2});a.setSpriteImage({ID:parent,IMAGE:opaque});assert.equal(overlap(),expected.hiddenReplacedOpaque);a.popScene();assert.equal(overlap(),expected.afterPopOpaque);
});


test('queued overlap queries retain cadence-dependent frame-end geometry in original PXT and native physics',async t=>{
 const cases=[{ms:4,frames:4},{ms:8,frames:2},{ms:16,frames:1},{ms:33,frames:1},{ms:50,frames:1},{ms:100,frames:1}];
 const source=cases.map(({ms,frames},i)=>`game.pushScene()
let mover${i}=sprites.create(img\`2 2
2 2\`,SpriteKind.Player)
let target${i}=sprites.create(img\`2 2
2 2\`,SpriteKind.Enemy)
mover${i}.setPosition(60,60)
target${i}.setPosition(68,60)
let seen${i}=false
let touch${i}=false
sprites.onOverlap(SpriteKind.Player,SpriteKind.Enemy,function(first,second){
 if(!seen${i}){touch${i}=first.overlapsWith(second);seen${i}=true;first.vx=0}
})
mover${i}.vx=500
for(let frame${i}=0;frame${i}<${frames};frame${i}++){game.currentScene().physicsEngine.move(${ms/1000})}
mover${i}.vx=0
pause(20)
let x${i}=mover${i}.x
let finalTouch${i}=mover${i}.overlapsWith(target${i})
game.popScene()`).join('\n');
 const expected=await runPxtArcade(source);
 const observations=[];
 for(const [i,{ms,frames}] of cases.entries()){
  const {runtime,a}=game(),first=actor(a,{x:60,y:60,width:2,height:2}),second=actor(a,{x:68,y:60,width:2,height:2,kind:'Enemy'});
  a.registerOverlapHandler({KIND:'Player',OTHER_KIND:'Enemy',TOKEN:'handler',CAPTURES:''});
  let seen=false,touch=false;
  scripts(runtime,['arcade_whenRegisteredOverlap'],()=>{seen=true;touch=a.spriteOverlaps({A:first,B:second});set(a,first,'vx',0);});
  set(a,first,'vx',500);
  for(let frame=0;frame<frames;frame++)a._advance(ms/1000);
  assert.equal(runtime.threads.length,Number(expected['seen'+i]),'pending callback count at '+ms+'ms cadence');
  if(runtime.threads.length)runtime.sequencer.stepThread(runtime.threads[0]);
  const x=get(a,first,'x'),finalTouch=a.spriteOverlaps({A:first,B:second});
  assert.equal(seen,expected['seen'+i],'event seen at '+ms+'ms');
  assert.equal(touch,expected['touch'+i],'callback query at '+ms+'ms');
  assert.equal(x,expected['x'+i],'frame-end x at '+ms+'ms');
  assert.equal(finalTouch,expected['finalTouch'+i],'final query at '+ms+'ms');
  observations.push({ms,frames,x,seen,touch});
 }
 t.diagnostic(JSON.stringify({overlapCadences:observations}));
 assert.ok(observations.some(o=>o.touch),'a shorter frame can finish in contact');
 assert.ok(observations.some(o=>!o.touch),'a longer frame can finish after crossing');
});
