import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const Arcade=loadExtensionClass('arcade');
function game(){return new Arcade(new EventEmitter());}
function actor(a){const image=a.createImage({WIDTH:1,HEIGHT:1});a.drawImage({IMAGE:image,OP:'fillRect',X:0,Y:0,W:1,H:1,COLOR:2});const id=a.createImageSprite({IMAGE:image,TEMPLATE:'',KIND:'Player'});a.setSpritePosition({ID:id,X:80,Y:60});return id;}
const get=(a,id,p)=>a.spriteProperty({ID:id,PROPERTY:p});
const set=(a,id,p,v)=>a.setSpriteProperty({ID:id,PROPERTY:p,VALUE:v});
test('friction properties expose fixed-point defaults and clamp before integer conversion without affecting position',()=>{
 const a=game(),id=actor(a);for(const property of ['fx','fy']){assert.equal(get(a,id,property),0);assert.ok(a.getInfo().menus.spriteProperties.items.includes(property));for(const value of [-2,0,.003,.125,8388608,16777216,NaN,Infinity]){set(a,id,property,value);assert.equal(get(a,id,property),(Math.max(0,value)*256|0)/256);}}assert.equal(get(a,id,'x'),80);assert.equal(get(a,id,'y'),60);
});
test('friction slows either sign without overshooting, acceleration takes precedence separately by axis',()=>{
 for(const velocity of [-100,100]){const a=game(),id=actor(a);set(a,id,'vx',velocity);set(a,id,'vy',velocity);set(a,id,'fx',100);set(a,id,'fy',200);a._advance(.1);assert.equal(get(a,id,'vx'),velocity<0?-90:90);assert.equal(get(a,id,'vy'),velocity<0?-80:80);assert.equal(get(a,id,'x'),80+(velocity<0?-9.5:9.5));assert.equal(get(a,id,'y'),60+(velocity<0?-9:9));}
 const a=game(),id=actor(a);set(a,id,'vx',2);set(a,id,'vy',-2);set(a,id,'fx',100);set(a,id,'fy',100);set(a,id,'ax',10);a._advance(.1);assert.equal(get(a,id,'vx'),3);assert.equal(get(a,id,'vy'),0);set(a,id,'ax',0);a._advance(.1);assert.equal(get(a,id,'vx'),0);
});
const setterValues=[-100,-.25,0,.003,.125,100.123,8388607,8388608,16777216];
const cases=[{vx:100,vy:-100,fx:100,fy:200,dt:.1},{vx:-2,vy:2,fx:100,fy:100,dt:.1},{vx:0,vy:0,fx:100,fy:100,dt:.1},{vx:100,vy:-100,fx:100,fy:200,ax:-20,ay:20,dt:.1},{vx:2,vy:-2,fx:100,fy:100,ax:.003,ay:-.003,dt:.1},{vx:100,vy:-100,fx:100.123,fy:200.456,dt:1/30},{vx:100,vy:-100,fx:100,fy:100,dt:.001},{vx:100,vy:-100,fx:100,fy:100,dt:.003},{vx:100,vy:-100,fx:100,fy:100,dt:.2},{vx:900,vy:-900,fx:100,fy:100,dt:.1},{vx:100,vy:-100,fx:8388607,fy:8388608,dt:.1},{vx:8388607,vy:-8388608,fx:0,fy:0,ax:100,ay:-100,dt:.1},{vx:100,vy:-100,fx:8388608,fy:8388608,dt:.001},{vx:8388607,vy:-8388608,fx:8388608,fy:8388607,dt:.001}];
test('original PXT confirms setters, fixed-point friction integration, overflow, small dt and retained scenes',async()=>{
 const source=`let setting=sprites.create(img\`2\`,SpriteKind.Player)\n${setterValues.map((v,i)=>`setting.fx=${v};setting.fy=${v};let fx${i}=setting.fx;let fy${i}=setting.fy`).join('\n')}\n`+cases.map((c,i)=>`game.pushScene();let actor${i}=sprites.create(img\`2\`,SpriteKind.Player);actor${i}.setPosition(80,60);actor${i}.vx=${c.vx};actor${i}.vy=${c.vy};actor${i}.fx=${c.fx};actor${i}.fy=${c.fy};actor${i}.ax=${c.ax||0};actor${i}.ay=${c.ay||0};game.currentScene().physicsEngine.move(${c.dt});let x${i}=actor${i}.x;let y${i}=actor${i}.y;let vx${i}=actor${i}.vx;let vy${i}=actor${i}.vy;game.popScene()`).join('\n')+`\nsetting.fx=100;setting.vx=100;let heldX=setting.x;game.pushScene();setting.fx=50;game.currentScene().physicsEngine.move(.1);let suspendedX=setting.x;let retainedFriction=setting.fx;game.popScene();game.currentScene().physicsEngine.move(.1);let resumedX=setting.x;let resumedVelocity=setting.vx`;
 const expected=await runPxtArcade(source);const a=game(),setting=actor(a);for(const [i,v] of setterValues.entries()){set(a,setting,'fx',v);set(a,setting,'fy',v);assert.equal(get(a,setting,'fx'),expected['fx'+i]);assert.equal(get(a,setting,'fy'),expected['fy'+i]);}
 for(const [i,c] of cases.entries()){a.pushScene();const id=actor(a);for(const p of ['vx','vy','fx','fy','ax','ay'])set(a,id,p,c[p]||0);a._advance(c.dt);for(const [field,p] of [['x','x'],['y','y'],['vx','vx'],['vy','vy']])assert.equal(get(a,id,p),expected[field+i],p+' case'+i);a.popScene();}
 // Original constructor center is79.5; align this independent retained-object
 // check to the original held coordinate before applying an exact frame.
 set(a,setting,'x',expected.heldX);set(a,setting,'fx',100);set(a,setting,'vx',100);a.pushScene();set(a,setting,'fx',50);a._advance(.1);assert.equal(get(a,setting,'x'),expected.suspendedX);assert.equal(get(a,setting,'fx'),expected.retainedFriction);a.popScene();a._advance(.1);assert.equal(get(a,setting,'x'),expected.resumedX);assert.equal(get(a,setting,'vx'),expected.resumedVelocity);
});
