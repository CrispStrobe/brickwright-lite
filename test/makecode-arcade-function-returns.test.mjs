import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import BWValues from '../overlay/scratch-vm/src/util/bw-values.js';
import {compile} from '../scripts/lib/pxt-node.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
async function execute(source,frames=120){const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[],JSON.stringify(imported));const run=await runProgram(imported.code,{frames,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);run.imported=imported;return run;}
async function roundtrip(source,verify,frames=120){
    const run=await execute(source,frames);verify(run);
    const code=await runProgram(run.creator.decompile(),{frames,uploads:run.imported.costumes,storage:true});assert.deepEqual(code.errors,[]);assert.deepEqual(code.creator.warnings,[]);verify(code);
    const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
    const built=await compile('arcade',exported.files);assert.equal(built.success,true,JSON.stringify({ts:exported.ts,diagnostics:built.diagnostics}));verify(await execute(exported.ts,frames));
    const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,frames);verify(run);return {run,exported};
}

test('scalar results, nesting, strings and early returns leave only their own invocation',async()=>{
    const source=`let touched=0
function add(x:number,y:number){return x+y}
function pick(n:number){for(let i=0;i<4;i++){if(i==n){return i+10}}return -1}
function identity(text:string){return text}
function stopEarly(){touched+=1;for(let i=0;i<4;i++){return}touched+=100}
function wrapper(){stopEarly();return add(2,3)}
let answer=add(wrapper(),pick(2))
let missing=pick(10)
let text=identity("hello, [world]!")
stopEarly()
let after=4`;
    await roundtrip(source,run=>{const v=vars(run);assert.equal(v.answer,17);assert.equal(v.missing,-1);assert.equal(v.text,'hello, [world]!');assert.equal(v.touched,2);assert.equal(Number(v.after),4);});
});

test('recursive and mutual-recursive value calls keep independent native frames',async()=>{
    const source=`function fib(n:number){if(n<2){return n}return fib(n-1)+fib(n-2)}
function even(n:number){if(n==0){return 1}return odd(n-1)}
function odd(n:number){if(n==0){return 0}return even(n-1)}
let result=fib(8)
let parity=even(12)`;
    await roundtrip(source,run=>{const v=vars(run);assert.equal(v.result,21);assert.equal(Number(v.parity),1);},400);
});

test('returned images preserve identity and clone independence across forwarded calls',async()=>{
    const source=`function paint(color:number){let picture=image.create(3,2);picture.fill(color);return picture}
function forward(color:number){return paint(color)}
function identity(surface:Image){return surface}
function copyImage(surface:Image){surface=surface.clone();return surface}
let picture=forward(7)
let alias=identity(picture)
let copy=copyImage(picture)
let hero=sprites.create(picture,SpriteKind.Player)
let friend=sprites.create(alias,SpriteKind.Enemy)
let other=sprites.create(copy,SpriteKind.Food)
alias.setPixel(0,0,2)`;
    const {exported}=await roundtrip(source,run=>{
        const sprites=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(sprites.length,3);
        assert.equal(sprites[0].image,sprites[1].image);assert.notEqual(sprites[0].image,sprites[2].image);
        assert.deepEqual([...sprites[0].image.pixels],[2,7,7,7,7,7]);assert.deepEqual([...sprites[2].image.pixels],[7,7,7,7,7,7]);
    });
    assert.match(exported.ts,/\): Image/);assert.match(exported.ts,/surface: Image/);
});

test('yielding functions resume with their own parameters and stop cancels pending results',async()=>{
    const run=await execute(`function delayed(value:number){pause(200);return value+1}
let result=delayed(6)`,30);assert.equal(vars(run).result,7);
    run.vm.greenFlag();await stepFrames(run.vm,2);run.vm.stopAll();await stepFrames(run.vm,40);
    assert.equal(run.vm.runtime.threads.length,0);
    run.vm.greenFlag();await stepFrames(run.vm,30);assert.equal(vars(run).result,7);
});

test('a returned function invocation keeps captured cells for later creation handlers',async()=>{
    const source=`function install(color:number){let count=0;sprites.onCreated(SpriteKind.Player,function(sprite){sprite.image.fill(color);count+=1;sprite.x=count+30});return 9}
let result=install(7)
let hero=sprites.create(img\`1\`,SpriteKind.Player)
let other=sprites.create(img\`1\`,SpriteKind.Player)`;
    await roundtrip(source,run=>{
        assert.equal(Number(vars(run).result),9);const s=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);
        assert.deepEqual(s.map(s=>s.x),[31,32]);assert.deepEqual(s.map(s=>[...s.image.pixels]),[[7],[7]]);
    });
});

test('simultaneous yielding calls retain arguments and cancelling a caller cancels its child',async()=>{
    const run=await runProgram(`DEVICE ARCADE
GLOBAL left
GLOBAL right
GLOBAL finished
SPRITE Game:
WHEN flag clicked:
  set left to arcade call function "delayed %s" arguments (arcade function argument (7) rest ("[]"))
WHEN flag clicked:
  set right to arcade call function "delayed %s" arguments (arcade function argument (21) rest ("[]"))
DEFINE delayed (value):
  wait 0.2 seconds
  change finished by 1
  arcade return value (value + 1)
`,{frames:30});
    assert.deepEqual(run.errors,[]);assert.equal(vars(run).left,8);assert.equal(vars(run).right,22);assert.equal(vars(run).finished,2);
    run.vm.greenFlag();await stepFrames(run.vm,2);
    const callers=run.vm.runtime.threads.filter(t=>t.status===t.constructor.STATUS_PROMISE_WAIT);
    assert.equal(callers.length,2);for(const t of callers)run.vm.runtime.sequencer.retireThread(t);
    const before=vars(run).finished;await stepFrames(run.vm,30);assert.equal(vars(run).finished,before);
});

test('numeric argument encoding retains nonfinite values instead of silently converting to null',async()=>{
    const run=await execute('function identity(value:number){return value}\nlet infinite=identity(1/0)\nlet negative=identity(-1/0)\nlet nan=identity(0/0)');
    assert.equal(vars(run).infinite,Infinity);assert.equal(vars(run).negative,-Infinity);assert.ok(Number.isNaN(vars(run).nan));
});

// This was an import gap until MakeCode's undefined became a value (E0's
// `undefined value`, E3a's BWValues): such calls now import and return it.
test('value calls that can return undefined import and return MakeCode undefined',async()=>{
    for(const source of ['function maybe(n:number){if(n>0){return 1}}\nlet answer=maybe(0)\nlet one=maybe(1)',
        'function none(){return}\nlet answer=none()\nlet one=1']){
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:20,storage:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        assert.equal(BWValues.decode(vars(run).answer),undefined,source);assert.equal(Number(vars(run).one),1,source);
    }
});

test('parameter writes update the invocation binding, including renamed parameters',async()=>{
    await roundtrip(`function bump(x:number){x+=3;x++;return x}
function descend(n:number){if(n<=0){return 0}n-=1;return descend(n)+1}
let first=bump(2)
let second=bump(8)
let count=descend(8)`,run=>{const v=vars(run);assert.equal(v.first,6);assert.equal(v.second,12);assert.equal(v.count,8);},200);
});

test('yielding value calls feed command arguments directly without shared temporary variables',async()=>{
    const source=`let result=0
function delay(n:number){pause(100);return n}
function take(first:number,second:number){result=first*100+second}
take(delay(3),delay(4))`;
    const imported=arcadeToPseudocode(source);assert.doesNotMatch(imported.code,/set _mc\d+ to/);
    await roundtrip(source,run=>assert.equal(vars(run).result,304),60);
});

test('Sprite results preserve identity through local aliases, parameters and forwarding',async()=>{
    const source=`function makeHero(color:number){let art=image.create(4,3);art.fill(color);let created=sprites.create(art,SpriteKind.Player);created.x=30;return created}
function forward(color:number){return makeHero(color)}
function identity(sprite:Sprite){return sprite}
function move(sprite:Sprite){sprite.x+=5;return sprite}
let hero=forward(7)
let alias=identity(hero)
let moved=move(alias)
let friend=makeHero(2)
hero.y=40
friend.y=70
alias.setImage(hero.image.clone())
let observed=alias.x
let nestedX=identity(hero).x
identity(friend).y=75`;
    const {exported}=await roundtrip(source,run=>{
        const v=vars(run);assert.equal(v.hero,v.alias);assert.equal(v.hero,v.moved);assert.notEqual(v.hero,v.friend);assert.equal(Number(v.observed),35);assert.equal(Number(v.nestedX),35);
        const s=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(s.length,2);
        assert.equal(s[0].x,35);assert.equal(s[0].y,40);assert.equal(s[1].x,30);assert.equal(s[1].y,75);
        assert.deepEqual([...s[0].image.pixels],Array(12).fill(7));assert.deepEqual([...s[1].image.pixels],Array(12).fill(2));
    });
    assert.match(exported.ts,/\): Sprite/);assert.match(exported.ts,/sprite: Sprite/);assert.match(exported.ts,/let hero: Sprite = null/);
});

test('direct sprite and projectile returns remain native expressions through MakeCode',async()=>{
    const source=`function create(){return sprites.create(img\`77\`,SpriteKind.Player)}
function projectile(){return sprites.createProjectileFromSide(img\`22\`,0,0)}
let hero=create()
let friend=create()
let shot=projectile()
hero.setPosition(30,40)
friend.setPosition(60,70)
shot.setPosition(90,80)
let width=hero.width`;
    await roundtrip(source,run=>{
        const s=Object.values(run.vm.runtime.bwArcadeDeviceState.sprites);assert.equal(s.length,3);
        assert.equal(s[0].x,30);assert.equal(s[1].x,60);assert.equal(s[2].x,90);assert.equal(s[2].kind,'Projectile');
        assert.equal(Number(vars(run).width),2);
    });
});
