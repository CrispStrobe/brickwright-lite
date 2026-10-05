import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
function game(){const runtime=new EventEmitter();return {runtime,a:new Arcade(runtime)};}
function actor(a){const image=a.createImage({WIDTH:1,HEIGHT:1});a.drawImage({IMAGE:image,OP:'fillRect',X:0,Y:0,W:1,H:1,COLOR:2});return a.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'});}
const prop=(a,id,name)=>a.spriteProperty({ID:id,PROPERTY:name});
test('scene worlds, info, cameras and popped object references match original PXT',async()=>{
 const expected=await runPxtArcade(`scene.setBackgroundColor(2)
scene.centerCameraAt(200,100)
info.setScore(7)
info.setLife(5)
let outer=sprites.create(img\`2\`,SpriteKind.Player)
outer.setPosition(20,20)
outer.vx=10
let outerId=outer.id
game.pushScene()
let freshCount=sprites.allOfKind(SpriteKind.Player).length
let freshScore=info.score()
let freshLife=info.life()
let freshCamera=scene.cameraProperty(CameraProperty.X)
let freshBackground=scene.backgroundColor()
let inner=sprites.create(img\`2\`,SpriteKind.Player)
inner.setPosition(40,40)
inner.vx=20
let innerId=inner.id
info.setScore(9)
info.setLife(2)
scene.centerCameraAt(300,200)
game.currentScene().physicsEngine.move(.1)
let pausedOuter=outer.x
let movedInner=inner.x
game.popScene()
let restoredCount=sprites.allOfKind(SpriteKind.Player).length
let restoredScore=info.score()
let restoredLife=info.life()
let restoredCamera=scene.cameraProperty(CameraProperty.X)
let restoredBackground=scene.backgroundColor()
game.currentScene().physicsEngine.move(.1)
let movedOuter=outer.x
let pausedInner=inner.x
inner.x=45
let retainedInner=inner.x
game.popScene()
let basePopCount=sprites.allOfKind(SpriteKind.Player).length
let basePopScore=info.score()
let oldReference=outer.x`);
 const {a}=game();a.setBackgroundColor({COLOR:2});a.centerCameraAt({X:200,Y:100});a.setscore({N:7});a.setLife({PLAYER:1,VALUE:5});const outer=actor(a);a.setSpritePosition({ID:outer,X:20,Y:20});a.setSpriteProperty({ID:outer,PROPERTY:'vx',VALUE:10});assert.equal(prop(a,outer,'pxtId'),expected.outerId);
 a.pushScene();assert.equal(a.spriteCount({KIND:'Player'}),expected.freshCount);assert.equal(a.getscore(),expected.freshScore);assert.equal(a.getLife({PLAYER:1}),expected.freshLife);assert.equal(a.cameraProperty({PROPERTY:0}),expected.freshCamera);assert.equal(a.backgroundColor(),expected.freshBackground);
 const inner=actor(a);assert.notEqual(inner,outer,'opaque references globally unique');assert.equal(prop(a,inner,'pxtId'),expected.innerId);a.setSpritePosition({ID:inner,X:40,Y:40});a.setSpriteProperty({ID:inner,PROPERTY:'vx',VALUE:20});a.setscore({N:9});a.setLife({PLAYER:1,VALUE:2});a.centerCameraAt({X:300,Y:200});a._advance(.1);assert.equal(prop(a,outer,'x'),expected.pausedOuter);assert.equal(prop(a,inner,'x'),expected.movedInner);
 a.popScene();assert.equal(a.spriteCount({KIND:'Player'}),expected.restoredCount);assert.equal(a.getscore(),expected.restoredScore);assert.equal(a.getLife({PLAYER:1}),expected.restoredLife);assert.equal(a.cameraProperty({PROPERTY:0}),expected.restoredCamera);assert.equal(a.backgroundColor(),expected.restoredBackground);a._advance(.1);assert.equal(prop(a,outer,'x'),expected.movedOuter);assert.equal(prop(a,inner,'x'),expected.pausedInner);a.setSpriteProperty({ID:inner,PROPERTY:'x',VALUE:45});assert.equal(prop(a,inner,'x'),expected.retainedInner);
 a.popScene();assert.equal(a.spriteCount({KIND:'Player'}),expected.basePopCount);assert.equal(a.getscore(),expected.basePopScore);assert.equal(prop(a,outer,'x'),expected.oldReference);
});
test('scene-local registries/timers restore and resource heaps survive while reset disposes stacks',()=>{
 const {runtime,a}=game();const outer=actor(a),image=a.spriteImage({ID:outer});a.registerUpdateHandler({TOKEN:'outer',CAPTURES:''});a.registerIntervalHandler({INTERVAL:100,TOKEN:'tick',CAPTURES:''});a.registerButtonHandler({BUTTON:'a',EVENT:2049,TOKEN:'first',CAPTURES:''});a.registerButtonHandler({BUTTON:'a',EVENT:2049,TOKEN:'second',CAPTURES:''});a._advance(.033);const elapsed=a._state().elapsedMs;
 const animation=a.createAnimation({ACTION:1,INTERVAL:100});a.addAnimationFrame({ANIMATION:animation,IMAGE:image});a.pushScene();assert.equal(a._state().elapsedMs,undefined);a._advance(.1);a.setLife({PLAYER:2,VALUE:0});a.registerLifeZeroHandler({PLAYER:2,TOKEN:'life',CAPTURES:''});a._advance(.01);assert.equal(a.getLife({PLAYER:2}),0);assert.equal(a._state().players[1].life,null);
 a.popScene();assert.equal(a._state().elapsedMs,elapsed);assert.equal(a.getLife({PLAYER:2}),3);assert.equal(a.animationProperty({ANIMATION:animation,PROPERTY:'action'}),1);assert.equal(a.imageProperty({IMAGE:image,PROPERTY:'width'}),1);a._advance(.033);assert.equal(a._state().elapsedMs,elapsed+33);
 a.pushScene();runtime.emit('PROJECT_START');a.popScene();assert.equal(a.spriteCount({KIND:'Player'}),0);assert.equal(a.getscore(),0);
});
test('scene life/score presence, deferred life-zero replacement and cross-scene destruction match PXT',async()=>{
 const expected=await runPxtArcade(`let lifeBefore=info.hasLife()
let scoreBefore=info.hasScore()
let defaultLife=info.life()
let scoreDefault=info.player2.score()
let scoreAfter=info.player2.hasScore()
info.player2.setScore(7.9)
let roundedScore=info.player2.score()
info.setLife(0)
let zeroWasPresent=info.hasLife()
let lifeEvents=0
info.onLifeZero(function(){lifeEvents+=10})
info.onLifeZero(function(){lifeEvents+=1})
let beforeLifeEvents=lifeEvents
game.currentScene().render()
let afterLifeEvents=lifeEvents
let lifeAfter=info.life()
let lifePresenceAfter=info.hasLife()
game.currentScene().render()
let afterSecondRender=lifeEvents
let outer=sprites.create(img\`2\`,SpriteKind.Player)
outer.setPosition(20,20)
outer.vx=20
game.pushScene()
outer.destroy()
game.popScene()
let retainedDestroyedCount=sprites.allOfKind(SpriteKind.Player).length
game.currentScene().physicsEngine.move(.1)
let destroyedPosition=outer.x`);
 const {a}=game();assert.equal(a.hasLife({PLAYER:1}),expected.lifeBefore);assert.equal(a.hasPlayerScore({PLAYER:1}),expected.scoreBefore);assert.equal(a.getLife({PLAYER:1}),expected.defaultLife);assert.equal(a.getPlayerScore({PLAYER:2}),expected.scoreDefault);assert.equal(a.hasPlayerScore({PLAYER:2}),expected.scoreAfter);a.setPlayerScore({PLAYER:2,VALUE:7.9});assert.equal(a.getPlayerScore({PLAYER:2}),expected.roundedScore);
 a.setLife({PLAYER:1,VALUE:0});assert.equal(a.hasLife({PLAYER:1}),expected.zeroWasPresent);assert.equal(a._state().players[0].life,0,'life-zero processing deferred until frame');a.registerLifeZeroHandler({PLAYER:1,TOKEN:'old',CAPTURES:''});a.registerLifeZeroHandler({PLAYER:1,TOKEN:'new',CAPTURES:''});a._advance(.01);assert.equal(a.getLife({PLAYER:1}),expected.lifeAfter);assert.equal(a.hasLife({PLAYER:1}),expected.lifePresenceAfter);assert.equal(expected.beforeLifeEvents,0);assert.equal(expected.afterLifeEvents,1);assert.equal(expected.afterSecondRender,1);
 const outer=actor(a);a.setSpritePosition({ID:outer,X:20,Y:20});a.setSpriteProperty({ID:outer,PROPERTY:'vx',VALUE:20});a.pushScene();a.destroySprite({ID:outer});a.popScene();assert.equal(a.spriteCount({KIND:'Player'}),expected.retainedDestroyedCount);a._advance(.1);assert.equal(prop(a,outer,'x'),expected.destroyedPosition);
});
test('pending frame callbacks remain associated with their scene across push/pop',async()=>{
 const {runtime,a}=game();
 // A paused frame handler must remain pending on its own scene, while the
 // newly pushed scene gets its own frame. No callback thread is killed.
 a.registerUpdateHandler({TOKEN:'pause',CAPTURES:''});
 runtime.threads=[];
 const target={blocks:{getBlock:id=>id==='hat'?{inputs:{TOKEN:{block:'token'}}}:{fields:{TEXT:{value:'pause'}}}}};
 runtime.allScriptsByOpcodeDo=(opcode,callback)=>{if(opcode==='arcade_whenRegisteredUpdate')callback({blockId:'hat'},target);};
 runtime._pushThread=()=>{const thread={status:0,constructor:{STATUS_DONE:4}};runtime.threads.push(thread);return thread;};
 runtime.sequencer={activeThread:null,stepThread(){}};
 const old=a._state(),pending=a._advance(.01);assert.ok(pending?.then);a.pushScene();const fresh=a._state();a._advance(.02);assert.equal(fresh.elapsedMs,20);a.popScene();assert.equal(a._state(),old);assert.equal(a._advance(.03),pending);assert.equal(old.elapsedMs,10);runtime.threads[0].status=4;runtime.threads=[];a._pumpTerrainWaits();await pending;
 runtime.allScriptsByOpcodeDo=()=>{};a._advance(.01);assert.equal(old.elapsedMs,20);
});
test('overlap callbacks queue independently without blocking physics or starting duplicate pairs',async()=>{
 const {runtime,a}=game();const first=actor(a),second=actor(a),initialX=prop(a,second,'x');a.registerOverlapHandler({KIND:'Player',OTHER_KIND:'Player',TOKEN:'overlap',CAPTURES:''});
 runtime.threads=[];let stepped=0;
 const target={blocks:{getBlock:id=>id==='hat'?{inputs:{TOKEN:{block:'token'}}}:{fields:{TEXT:{value:'overlap'}}}}};
 runtime.allScriptsByOpcodeDo=(opcode,callback)=>{if(opcode==='arcade_whenRegisteredOverlap')callback({blockId:'hat'},target);};
 runtime._pushThread=()=>{const thread={status:0,constructor:{STATUS_DONE:4}};runtime.threads.push(thread);return thread;};runtime.sequencer={activeThread:null,stepThread(){stepped++;}};
 assert.equal(a._advance(.01),undefined);assert.equal(stepped,0,'parallel overlap callback not stepped inline');assert.equal(runtime.threads.length,1);assert.equal(a.whenRegisteredOverlap({TOKEN:'overlap'},{thread:runtime.threads[0]}),true);
 a._advance(.01);assert.equal(runtime.threads.length,1,'same pair is locked while callback waits');a.setSpriteFlag({ID:first,FLAG:'GhostThroughSprites',ON:true});assert.equal(a.whenRegisteredOverlap({TOKEN:'overlap'},{thread:runtime.threads[0]}),false,'flags changed before dispatch suppress callback');
 runtime.threads[0].status=4;runtime.threads=[];a._pumpTerrainWaits();await new Promise(resolve=>setImmediate(resolve));a.setSpriteFlag({ID:first,FLAG:'GhostThroughSprites',ON:false});a._advance(.01);assert.equal(runtime.threads.length,1,'finished pair dispatch can recur');assert.equal(prop(a,second,'x'),initialX);
});
test('forever initial callback is deferred and suspended scenes do not start new iterations',async()=>{
 const {runtime,a}=game();runtime.threads=[];let entered=0;
 const target={blocks:{getBlock:id=>id==='hat'?{inputs:{TOKEN:{block:'token'}}}:{fields:{TEXT:{value:'loop'}}}}};
 runtime.allScriptsByOpcodeDo=(opcode,callback)=>{if(opcode==='arcade_whenRegisteredForever')callback({blockId:'hat'},target);};runtime._pushThread=()=>{const thread={status:0,constructor:{STATUS_DONE:4}};runtime.threads.push(thread);return thread;};runtime.sequencer={activeThread:null,stepThread(thread){entered++;thread.status=4;runtime.threads=runtime.threads.filter(t=>t!==thread);}};
 a.registerForeverHandler({TOKEN:'loop',CAPTURES:''});assert.equal(entered,0);await new Promise(resolve=>setTimeout(resolve,10));assert.equal(entered,1);
 a.pushScene();const suspendedCount=entered;await new Promise(resolve=>setTimeout(resolve,40));assert.equal(entered,suspendedCount);a.popScene();await new Promise(resolve=>setTimeout(resolve,40));assert.ok(entered>suspendedCount);runtime.emit('PROJECT_STOP_ALL');const stoppedCount=entered;await new Promise(resolve=>setTimeout(resolve,30));assert.equal(entered,stoppedCount);
});
test('repeated inline lifecycle registrations preserve distinct captured closures at the same source token',()=>{
 const {runtime,a}=game();runtime.threads=[];const seen=[];
 const target={blocks:{getBlock:id=>id==='hat'?{inputs:{TOKEN:{block:'token'}}}:{fields:{TEXT:{value:'same-site'}}}}};runtime.allScriptsByOpcodeDo=(opcode,callback)=>{if(opcode==='arcade_whenRegisteredScenePush')callback({blockId:'hat'},target);};runtime._pushThread=()=>{const thread={status:0,constructor:{STATUS_DONE:4}};runtime.threads.push(thread);return thread;};runtime.sequencer={activeThread:null,stepThread(thread){seen.push(thread.bwArcadeCaptures.get('value').values.value);thread.status=4;runtime.threads=runtime.threads.filter(t=>t!==thread);}};
 for(const value of [1,2]){const util={thread:{}};a.setLocal({NAME:'value',VALUE:value},util);a.registerScenePushHandler({TOKEN:'same-site',CAPTURES:'value'},util);}a.pushScene();assert.deepEqual(seen,[1,2]);a.popScene();a.pushScene();assert.deepEqual(seen,[1,2,1,2]);
});
test('native button registrations use app keyboard bindings and pane signals do not cross-fire A/B',()=>{
 const {runtime,a}=game(),events=[];let keys=new Set();runtime.ioDevices={keyboard:{getKeyIsDown:key=>keys.has(key)}};runtime.threads=[];
 const target={blocks:{getBlock:id=>id.startsWith('hat-')?{inputs:{TOKEN:{block:'token-'+id.slice(4)}}}:{fields:{TEXT:{value:id.slice(6)}}}}};runtime.allScriptsByOpcodeDo=(opcode,callback)=>{if(opcode==='arcade_whenRegisteredButton')for(const token of ['a','b','start','select'])callback({blockId:'hat-'+token},target);};runtime._pushThread=()=>{const thread={status:0,constructor:{STATUS_DONE:4}};runtime.threads.push(thread);return thread;};runtime.sequencer={activeThread:null,stepThread(thread){events.push(thread.bwArcadeEvent.TOKEN);thread.status=4;runtime.threads=runtime.threads.filter(t=>t!==thread);}};
 for(const button of ['a','b','start','select'])a.registerButtonHandler({BUTTON:button,EVENT:2049,TOKEN:button,CAPTURES:''});
 for(const [button,key] of [['a','space'],['b','z'],['start','enter'],['select','m']]){
  keys=new Set([key]);a._advance(.01);assert.deepEqual(events.splice(0),[button],key+' physical keyboard');keys=new Set();a._advance(.01);
  a._state().buttons[button]=true;keys=new Set([key]);a._advance(.01);assert.deepEqual(events.splice(0),[button],button+' pane signal plus keyboard');a._state().buttons[button]=false;keys=new Set();a._advance(.01);
 }
});
