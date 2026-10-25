import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const source='class Direct extends Sprite {}let factory=sprites.create(img`1`,SpriteKind.Player);let alias=factory;alias.vx=100;let speed=factory.vx;let same=alias===factory;';
const build=text=>{
    const imported=arcadeToPseudocode(text);assert.deepEqual(imported.unsupported,[]);
    const creator=new Creator();creator.parse(imported.code);for(const upload of imported.costumes||[])creator.applyCustomSVG(upload.sprite,upload.svg);
    assert.deepEqual(creator.warnings,[]);return {creator,imported};
};
const of=(creator,opcode)=>creator.project.targets.flatMap(target=>Object.values(target.blocks).filter(block=>block.opcode===opcode).map(block=>({target,block})));
const one=(creator,opcode)=>{const rows=of(creator,opcode);assert.equal(rows.length,1,opcode);return rows[0];};
const output=creator=>projectToArcade(creator.project,{costumeSvg:(_target,costume)=>creator.assets.get(costume.assetId)?.data});
const write=creator=>one(creator,'arcade_setObjectField').block;

test('actual SDK Sprite factories retain primitive writers through Code and current export without a declared ordinary receiver',()=>{
    const inputs=[source,source.replace('let factory=sprites.create(img`1`,SpriteKind.Player)','let imageValue=image.create(1,1);let factory=sprites.create(imageValue,SpriteKind.Player)')];
    assert.equal(inputs.length,2);
    for(const text of inputs){
        const {creator,imported}=build(text),current=output(creator);assert.deepEqual(current.unsupported,[]);
        assert.match(current.ts,/alias\.vx\s*=\s*\(0 \+ 100\)/);assert.match(current.ts,/sprites\.create\(/);
        const {creator:code}=build(current.files);
        assert.deepEqual(output(code).unsupported,[]);
        const decompiled=new Creator();decompiled.parse(creator.decompile());for(const upload of imported.costumes||[])decompiled.applyCustomSVG(upload.sprite,upload.svg);
        assert.deepEqual(output(decompiled).unsupported,[]);
    }
});

test('actual canonical SDK subclass allocation retains a declared base constraint without a name-only grant',()=>{
    const text='class Direct extends Sprite {}let factory:Sprite=new Direct(img`1`);factory.vx=100;let speed=factory.vx;';
    const {creator}=build(text);assert.deepEqual(output(creator).unsupported,[]);
    write(creator).inputs.VALUE=[1,[10,'20']];assert.ok(output(creator).unsupported.some(message=>message.includes('field Sprite.vx writer conflicts with declared number')));
    write(creator).inputs.VALUE=[1,[4,'20']];
    write(creator).inputs.FIELD=[1,[10,'width']];assert.ok(output(creator).unsupported.some(message=>message.includes('SDK Sprite field writer requires an actual writable declared property')));
});

test('physical Number20 and text20 current writers preserve distinct source constraints and values',()=>{
    for(const [literal,accepted] of [[[4,'20'],true],[[10,'20'],false]]){
        const {creator}=build(source);write(creator).inputs.VALUE=[1,literal];const before=JSON.stringify(creator.project),current=output(creator);
        assert.equal(JSON.stringify(creator.project),before);assert.match(current.ts,accepted?/alias\.vx = 20/:/alias\.vx = "20"/);
        if(accepted)assert.deepEqual(current.unsupported,[]);
        else assert.ok(current.unsupported.some(message=>message.includes('field Sprite.vx writer conflicts with declared number')));
    }
});

test('SDK Sprite field schema remains actual and does not borrow a same-spelled ordinary field',()=>{
    const {creator:unknown}=build(source);write(unknown).inputs.FIELD=[1,[10,'unknownProperty']];
    assert.ok(output(unknown).unsupported.some(message=>message.includes('SDK Sprite field writer requires an actual writable declared property')));
    const {creator}=build(source);write(creator).inputs.OBJECT=[1,[10,'arcade:0']];
    assert.ok(output(creator).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')));
});

test('new SDK readonly writes refuse before the historical ordinary dynamic-access escape',()=>{
    const {creator}=build(source);write(creator).inputs.FIELD=[1,[10,'width']];const current=output(creator);
    assert.ok(current.unsupported.some(message=>message.includes('SDK Sprite field writer requires an actual writable declared property')));
    // The existing renderer is unchanged; its cast is not authored intent or
    // authority to accept this new SDK constraint.
    assert.match(current.ts,/\(alias as any\)\.width =/);
    for(const change of [factory=>{delete factory.inputs.KIND;},factory=>{factory.inputs.WIDTH=[1,[10,'1']];}]){
        const {creator}=build(source);change(one(creator,'arcade_createSprite').block);write(creator).inputs.FIELD=[1,[10,'width']];
        assert.ok(output(creator).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')));
    }
});

test('all actual factory aliases and producer inputs retain opaque writers and canonical schema refusals',()=>{
    const changes=[
        factory=>{factory.inputs.KIND=[1,[10,'20']];},
        factory=>{factory.inputs.WIDTH=[1,[10,'1']];},
        factory=>{delete factory.inputs.KIND;},
        factory=>{factory.inputs.UNRELATED=[1,[4,'1']];},
        factory=>{factory.fields.UNRELATED=['1',null];},
        factory=>{factory.shadow=true;}
    ];assert.equal(changes.length,6);
    for(const change of changes){const {creator}=build(source);change(one(creator,'arcade_createSprite').block);
        assert.ok(output(creator).unsupported.some(message=>message.includes('Class primitive export:')),String(change));}
    const {creator}=build(source);const factory=one(creator,'arcade_createSprite');factory.block.parent='missing';
    assert.ok(output(creator).unsupported.some(message=>message.includes('ownership is malformed')));
    const mixed=build(source.replace('alias.vx=100','factory=image.create(1,1) as any;alias.vx=100')).creator;
    assert.ok(output(mixed).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')));
    const image=build(source.replace('let factory=sprites.create(img`1`,SpriteKind.Player)','let imageValue=image.create(1,1);let factory=sprites.create(imageValue,SpriteKind.Player)')).creator;
    one(image,'arcade_createImageSprite').block.inputs.IMAGE=[1,[4,'1']];
    assert.ok(output(image).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')));
});

test('SDK inherited primitive fields keep Number constraints without introducing casts',()=>{
    const {creator}=build('class Direct extends Sprite {}let direct=new Direct(img`1`);direct.vx=1;let speed=direct.vx;');
    write(creator).inputs.VALUE=[1,[10,'20']];const current=output(creator);
    assert.ok(current.unsupported.some(message=>message.includes('field Sprite.vx writer conflicts with declared number')));
    assert.match(current.ts,/direct\.vx = "20"/);assert.doesNotMatch(current.ts,/as any\)\.vx/);
});

// Null transitions are source-constraint compatibility only, not actual
// nonnull/native ownership proof. Genuine allocation evidence stays required.
test('nullish-only and mixed ordinary-class receiver facts never acquire an SDK Sprite role',()=>{
    const kinds=['null','undefined'];assert.equal(kinds.length,2);
    for(const kind of kinds){const {creator}=build(source),allocation=one(creator,'arcade_createSprite'),owner=allocation.target.blocks[allocation.block.parent];
        assert.equal(owner.opcode,'data_setvariableto');const id=allocation.block.parent;
        allocation.target.blocks.currentNullish={opcode:'arrays_specialValue',parent:id,next:null,shadow:false,topLevel:false,fields:{},inputs:{KIND:[1,[10,kind]]}};owner.inputs.VALUE=[2,'currentNullish'];
        assert.ok(output(creator).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')),kind);
        write(creator).inputs.FIELD=[1,[10,'width']];assert.ok(output(creator).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')),kind+' readonly');
    }
    const mixed=build(source.replace('let factory=', 'class Pretend{vx:number;constructor(){this.vx=1}}let factory=').replace('alias.vx=100','factory=new Pretend() as any;alias.vx=100')).creator;
    assert.ok(output(mixed).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')));
    const bare=build('class Sprite{vx:number;constructor(){this.vx=1}}let factory=sprites.create(img`1`,SpriteKind.Player);factory=new Sprite() as any;factory.vx=100;let speed=factory.vx;').creator;
    assert.ok(output(bare).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')));
    const counterfeit=build(source.replace('let factory=', 'namespace pretend{export class Sprite{vx:number;constructor(){this.vx=1}}}let factory=').replace('alias.vx=100','factory=new pretend.Sprite() as any;alias.vx=100')).creator;
    assert.ok(output(counterfeit).unsupported.some(message=>message.includes('field writer requires an actual declared receiver')));
});

test('local and returned factory aliases cannot bypass SDK checks after current malformed readonly edits',()=>{
    const sources=[
        'class Direct extends Sprite{}function run(){let factory=sprites.create(img`1`,SpriteKind.Player);factory.vx=100;}run();',
        'class Direct extends Sprite{}function make(){let factory=sprites.create(img`1`,SpriteKind.Player);return factory;}let alias=make();alias.vx=100;let speed=alias.vx;'
    ];assert.equal(sources.length,2);
    for(const text of sources){const {creator}=build(text);assert.deepEqual(output(creator).unsupported,[]);
        one(creator,'arcade_createSprite').block.inputs.WIDTH=[1,[10,'1']];write(creator).inputs.FIELD=[1,[10,'width']];
        const before=JSON.stringify(creator.project),current=output(creator);assert.equal(JSON.stringify(creator.project),before);
        assert.ok(current.unsupported.some(message=>message.includes('field writer requires an actual declared receiver')));
    }
});

test('real SDK factory Number fields survive native Code saved reload current leaf edit and export reimport',async()=>{
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const {default:BW}=await import('../overlay/scratch-vm/src/util/bw-values.js');
    const runs=[],check=(run,speed)=>{
        assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
        const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(variable=>[variable.name,BW.decode(variable.value)]));
        assert.equal(values.speed,speed);assert.equal(values.same,true);
    };
    const execute=async imported=>{const run=await runProgram(imported.code,{frames:20,storage:true,uploads:imported.costumes||[]});runs.push(run);return run;};
    try{
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        const run=await execute(imported);check(run,100);
        const code=await execute({...imported,code:run.creator.decompile()});check(code,100);
        const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        run.vm.stopAll();await run.vm.loadProject(saved);run.vm.greenFlag();await stepFrames(run.vm,20);check(run,100);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);
        fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,20);check(fresh,100);
        write(run.creator).inputs.VALUE=[1,[4,'20']];
        run.vm.stopAll();await run.vm.loadProject(Buffer.from(await(await run.creator.generateSB3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,20);check(run,20);
        const current=output(run.creator);assert.deepEqual(current.unsupported,[]);assert.match(current.ts,/alias\.vx = 20/);
        const again=arcadeToPseudocode(current.files);assert.deepEqual(again.unsupported,[]);check(await execute(again),20);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
