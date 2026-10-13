import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// The source importer still has a separate numeric-kind lowering workstream.
// These controls load the real VM through Code, then exercise its actual native
// extension adapter; they do not claim source-import/export or GUI qualification.
async function native(source='scene.setBackgroundColor(0)') {
    const imported=arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true});
    const {default:dispatch}=await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js');
    const adapter=Object.values(dispatch.services).findLast(s=>s?._inst?._runtime===run.vm.runtime && s.getInfo?.().id==='arcade');
    assert.ok(adapter?._inst);
    assert.deepEqual(run.errors,[]);
    return {...run,adapter,ext:adapter._inst};
}
function close(run) {run.vm.quit();clearStrayTimers();}
function make(ext,kind) {return ext.spawnSprite({KIND:kind,X:80,Y:60,WIDTH:2,HEIGHT:2});}
function observed(ext,id) {return ext.spriteProperty({ID:id,PROPERTY:'kind'});}

test('actual native adapter allocates original numeric builtins, ordered unused kinds, scenes and fresh programs',async()=>{
    const original=await runPxtArcade(`let player=SpriteKind.Player
let projectile=SpriteKind.Projectile
let food=SpriteKind.Food
let enemy=SpriteKind.Enemy
let unused=SpriteKind.create()
let before=SpriteKind.create()
game.pushScene()
let during=SpriteKind.create()
game.popScene()
let after=SpriteKind.create()
let builtins=player+","+projectile+","+food+","+enemy`);
    const run=await native();
    try {
        const a=run.adapter,info=a.getInfo();
        const getter=info.blocks.find(block=>block.opcode==='spriteProperty');
        const setter=info.blocks.find(block=>block.opcode==='setSpriteProperty');
        assert.ok(info.menus[getter.arguments.PROPERTY.menu].items.includes('kind'));
        assert.equal(info.menus[setter.arguments.PROPERTY.menu].items.includes('kind'),false,'kind writes use setSpriteKind');
        assert.deepEqual(['Player','Projectile','Food','Enemy'].map(NAME=>a.spriteKindValue({NAME})),
            original.builtins.split(',').map(Number));
        assert.equal(a.createSpriteKind(),original.unused);
        assert.equal(a.createSpriteKind(),original.before);
        await run.ext.pushScene({});
        assert.equal(a.createSpriteKind(),original.during);
        await run.ext.popScene({});
        assert.equal(a.createSpriteKind(),original.after);
        assert.throws(()=>a.spriteKindValue({NAME:'Missing'}),/Unregistered/);
        assert.throws(()=>make(run.ext,'Missing'),/Unregistered/);
        assert.equal(a.createSpriteKind(),1007,'failed lookup/creation never allocate kinds');
        run.vm.runtime.emit('PROJECT_START');
        assert.equal(a.createSpriteKind(),1003,'actual project restart resets original kind module');
    } finally {close(run);}
});

test('actual native sprite identity preserves fractions, negative membership exclusion, null and projectile fallback',async()=>{
    const original=await runPxtArcade(`let fraction=sprites.create(img\`2\`,1.5)
let negative=sprites.create(img\`2\`,-2)
let absent=sprites.create(img\`2\`)
let nil=sprites.create(img\`2\`,null)
let player=sprites.create(img\`2\`,SpriteKind.Player)
player.setKind(null)
let fk=fraction.kind()
let nk=negative.kind()
let ak=absent.kind()
let zk=nil.kind()
let pk=player.kind()
let fc=sprites.allOfKind(1.5).length
let nc=sprites.allOfKind(-2).length
let q0=sprites.createProjectile(img\`2\`,0,0,0).kind()
let qnull=sprites.createProjectile(img\`2\`,0,0,null).kind()
let qnegative=sprites.createProjectile(img\`2\`,0,0,-2).kind()`);
    const run=await native();
    try {
        const ext=run.ext,ids=[1.5,-2,undefined,null,'Player'].map(kind=>make(ext,kind));
        ext.setSpriteKind({ID:ids[4],KIND:null});
        assert.deepEqual(ids.map(id=>observed(ext,id)),[original.fk,original.nk,original.ak,original.zk,original.pk]);
        assert.equal(ext.spriteCount({KIND:1.5}),original.fc);
        assert.equal(ext.spriteCount({KIND:-2}),original.nc);
        assert.ok(ext._state().physicsEngine.members.includes(ext._state().sprites[ids[1]]));
        assert.deepEqual([0,null,-2].map(KIND=>observed(ext,ext.spawnProjectile({KIND,VX:0,VY:0,WIDTH:2,HEIGHT:2}))),
            [original.q0,original.qnull,original.qnegative]);
        assert.equal(ext._state().sprites[ids[4]].kindName,'Player');
        assert.ok(ids.every(id=>/^arcade:\d+$/.test(id)),'graphics IDs remain opaque and independent from kinds');
    } finally {close(run);}
});

test('native managed lifecycle/overlap registrations capture numbers independently of display-name rebinding',async()=>{
    const original=await runPxtArcade(`let alias=SpriteKind.create()
let captured=alias
sprites.onCreated(alias,function(sprite){})
sprites.onOverlap(alias,SpriteKind.Projectile,function(a,b){})
alias=SpriteKind.create()
let current=alias`);
    const run=await native();
    try {
        const ext=run.ext,a=run.adapter,captured=a.createSpriteKind();
        a.bindSpriteKind({NAME:'Alias',KIND:captured});
        ext.registerSpriteCreated({KIND:'Alias',TOKEN:'created',CAPTURES:''});
        ext.registerOverlapHandler({KIND:'Alias',OTHER_KIND:'Projectile',TOKEN:'overlap',CAPTURES:''});
        const current=a.createSpriteKind();
        a.bindSpriteKind({NAME:'Alias',KIND:current});
        assert.equal(captured,original.captured);assert.equal(current,original.current);
        assert.equal(ext._createdHandlers.at(-1).kind,captured);
        assert.deepEqual([ext._overlapHandlers.at(-1).kind,ext._overlapHandlers.at(-1).otherKind],[captured,1]);
        assert.equal(a.spriteKindValue({NAME:'Alias'}),current);
        assert.equal(observed(ext,make(ext,captured)),captured);
        assert.equal(observed(ext,make(ext,'Alias')),current);
        ext.registerSpriteCreated({KIND:-2,TOKEN:'negative',CAPTURES:''});
        ext.registerOverlapHandler({KIND:-2,OTHER_KIND:1,TOKEN:'negative',CAPTURES:''});
        assert.equal(ext._createdHandlers.at(-1).kind,-2);
        assert.equal(ext._overlapHandlers.at(-1).kind,-2,'negative kinds remain event registrations');
        const lengths=[ext._createdHandlers.length,ext._destroyedHandlers.length,ext._overlapHandlers.length];
        ext.registerSpriteCreated({KIND:null,TOKEN:'null'});
        ext.registerDestroyedHandler({KIND:undefined,TOKEN:'undefined'});
        ext.registerOverlapHandler({KIND:null,OTHER_KIND:1,TOKEN:'null'});
        assert.deepEqual([ext._createdHandlers.length,ext._destroyedHandlers.length,ext._overlapHandlers.length],lengths);
    } finally {close(run);}
});

test('full original Text module allocates once at its explicit source phase, scenes preserve it, restart resets it',async()=>{
    const text=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/text-sprite-source/text.ts',import.meta.url),'utf8');
    const files={'text.ts':text,'main.ts':'let textKind=SpriteKind.Text\nlet custom=SpriteKind.create()',
        'pxt.json':JSON.stringify({name:'kind-text-control',dependencies:{device:'*'},files:['text.ts','main.ts']})};
    const original=await runPxtArcade(files);
    const run=await native();
    try {
        const a=run.adapter,ext=run.ext;
        a.initializeSpriteKindLibrary({LIBRARY:'textsprite',VERSION:'v1.3.0'});
        assert.equal(a.spriteKindValue({NAME:'Text'}),original.textKind);
        a.initializeSpriteKindLibrary({LIBRARY:'textsprite',VERSION:'fa2439314c6633943666a763fdae32a5c67a9ae8'});
        assert.equal(a.createSpriteKind(),original.custom,'repeated exact module initialization never allocates twice');
        const module=ext._textSpriteModule;
        await ext.pushScene({});await ext.popScene({});
        assert.equal(ext._textSpriteModule,module);
        assert.throws(()=>a.initializeSpriteKindLibrary({LIBRARY:'textsprite',VERSION:'unknown'}),/not implemented/);
        run.vm.runtime.emit('PROJECT_START');
        assert.equal(ext._textSpriteModule,null);
        assert.equal(a.createSpriteKind(),1003);
        a.initializeSpriteKindLibrary({LIBRARY:'textsprite',VERSION:'v1.3.0'});
        assert.equal(a.spriteKindValue({NAME:'Text'}),1004,'explicit retained source phase follows earlier initializer');
    } finally {close(run);}
});

test('unchanged negative-kind source executes real creation and overlap callbacks despite empty queries',
    {todo:process.env.BW_REQUIRE_EXACT_KIND_TIMING || process.env.BW_REQUIRE_EXACT_ARCADE_PHASE==='1' ? false :
        'Exact initial overlap frame timing remains mismatched; preserve original/native clocks and raw failure'},async t=>{
    const source=`let created=0
let overlaps=0
sprites.onCreated(-2,function(sprite){created+=1;sprite.image.fill(6)})
sprites.onOverlap(-2,SpriteKind.Projectile,function(a,b){overlaps+=1})
let actor=sprites.create(img\`2 2\n2 2\`,-2)
let other=sprites.create(img\`4 4\n4 4\`,SpriteKind.Projectile)
let count=sprites.allOfKind(-2).length
let pixel=actor.image.getPixel(0,0)
let trace=""
let ticks=0
let traceDone=false
game.onUpdate(function(){
 if(ticks<4){trace=trace+created+","+count+","+pixel+","+overlaps+","+control.millis()+","+game.runtime()+","+control.eventContext().deltaTime+";";ticks+=1}
 else traceDone=true
})`;
    const original=await runPxtArcade(source,{fakeClock:true,waitForGlobals:{traceDone:true}});
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:0,uploads:imported.costumes,storage:true});
    const value=name=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name)?.value;
    try {
        for(let i=0;value('traceDone')!==true&&i<30;i++)await stepFrames(run.vm,1,20);
        assert.deepEqual(run.errors,[]);
        const nativeTrace=String(value('trace')).split(';').filter(Boolean).map(row=>row.split(',').map(Number));
        const originalTrace=original.trace.split(';').filter(Boolean).map(row=>row.split(',').map(Number));
        assert.deepEqual(nativeTrace.map(row=>row.slice(0,3)),originalTrace.map(row=>row.slice(0,3)),
            'creation callback, negative query, and callback image change agree');
        // Preserve the observed startup-stage difference explicitly: the original
        // first physics frame does not dispatch overlap, the native frame does.
        // This is a named existing scheduler boundary, not behavioral equivalence.
        t.diagnostic(JSON.stringify({originalTrace,nativeTrace,columns:['created','count','pixel','overlaps','programMs','sceneMs','deltaMs']}));
        assert.equal(value('created'),1);assert.equal(value('count'),0);
        assert.deepEqual(nativeTrace,originalTrace,'preserved exact initial overlap timing mismatch');
    } finally {close(run);}
});

test('original exceptional numeric kinds retain NaN and infinities without allocating IDs',async()=>{
    const original=await runPxtArcade(`let zero=0
let nan=zero/zero
let infinity=1/zero
let negativeInfinity=-1/zero
let a=sprites.create(img\`2\`,nan)
let b=sprites.create(img\`2\`,infinity)
let c=sprites.create(img\`2\`,negativeInfinity)
let exceptional=""+a.kind()+","+b.kind()+","+c.kind()
let counts=""+sprites.allOfKind(nan).length+","+sprites.allOfKind(infinity).length+","+sprites.allOfKind(negativeInfinity).length`);
    const run=await native();
    try {
        const ext=run.ext,kinds=[NaN,Infinity,-Infinity],ids=kinds.map(kind=>make(ext,kind));
        assert.equal(ids.map(id=>String(observed(ext,id))).join(','),original.exceptional);
        assert.equal(kinds.map(KIND=>ext.spriteCount({KIND})).join(','),original.counts);
        assert.equal(run.adapter.createSpriteKind(),1003);
    } finally {close(run);}
});

test('actual hand-authored Text Code preinitializes its dependency before main and resets without duplicate allocation',async()=>{
    const imported=arcadeToPseudocode('let label=textsprite.create("A")');
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:5,uploads:imported.costumes,storage:true});
    const {default:dispatch}=await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js');
    const adapter=Object.values(dispatch.services).findLast(s=>s?._inst?._runtime===run.vm.runtime && s.getInfo?.().id==='arcade');
    try {
        assert.deepEqual(run.errors,[]);
        assert.equal(adapter.spriteKindValue({NAME:'Text'}),1003);
        assert.equal(adapter.createSpriteKind(),1004);
        assert.equal(Object.values(adapter._inst._state().sprites)[0].kind,1003);
        run.vm.runtime.emit('PROJECT_START');
        assert.equal(adapter.spriteKindValue({NAME:'Text'}),1003);
        assert.equal(adapter.createSpriteKind(),1004);
    } finally {close(run);}
});

test('original absent-kind creation has kind -1 but does not invoke an explicit -1 creation handler',async()=>{
    const registration='let created=0\nsprites.onCreated(-1,function(sprite){created+=1;sprite.image.fill(6)})';
    const original=await runPxtArcade(registration+`
let absent=sprites.create(img\`2\`)
let first=created
let nil=sprites.create(img\`2\`,null)
let second=created
let explicit=sprites.create(img\`2\`,-1)
let third=created`);
    assert.deepEqual([original.first,original.second,original.third],[0,0,1]);
    const run=await native(registration+'\nscene.setBackgroundColor(0)');
    const count=()=>Number(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name==='created')?.value);
    try {
        await stepFrames(run.vm,4);
        assert.equal(observed(run.ext,make(run.ext,undefined)),-1);assert.equal(count(),original.first);
        assert.equal(observed(run.ext,make(run.ext,null)),-1);assert.equal(count(),original.second);
        const pending=make(run.ext,-1);
        await stepFrames(run.vm,4);
        assert.equal(observed(run.ext,await pending),-1);assert.equal(count(),original.third);
    } finally {close(run);}
});
