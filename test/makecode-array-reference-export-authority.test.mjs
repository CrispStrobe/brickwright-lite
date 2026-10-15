import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

function current(source){const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);return creator;}
function checked(source){const creator=current(source),result=projectToArcade(creator.project);assert.deepEqual(result.unsupported,[],result.unsupported.join('\n'));return {creator,result};}
const lengthBlock=creator=>{for(const target of creator.project.targets)for(const block of Object.values(target.blocks))if(block.opcode==='arrays_referenceLength')return {target,block};throw Error('missing length');};

test('current allocated Arrays retain ordinary globals, aliases and allocation-rooted alias cycles',()=>{
    const {creator,result}=checked('let items=[1,2];let alias=items;items=alias;let count=alias.length');assert.match(result.ts,/\.length/);
    const same=structuredClone(creator.project);assert.deepEqual(projectToArcade(same).unsupported,[]);
    const imported=arcadeToPseudocode(result.files);assert.deepEqual(imported.unsupported,[]);const again=new Creator();again.parse(imported.code);assert.deepEqual(projectToArcade(again.project).unsupported,[]);
});

test('actual current primitive literals cannot acquire Array authority from their consumer',()=>{
    for(const raw of [[4,'0'],[10,'20']]){
        const creator=current('let items=[1,2];let count=items.length'),{block}=lengthBlock(creator);block.inputs.ARRAY=[1,raw];
        assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.includes('actual initialized Array producer')));
    }
});

test('all reference receivers including both concat inputs use the same producer boundary',()=>{
    const creator=current('let items=[1,2];let count=items.length'),{target,block}=lengthBlock(creator);
    for(const opcode of ['arrays_referenceTruthy','arrays_referenceItem','arrays_referenceRemove','arrays_referenceRandom','arrays_referenceLength','arrays_referenceSlice','arrays_referenceConcat','arrays_referenceIndexOf','arrays_referenceTake','arrays_mutateReference']){
        const project=structuredClone(creator.project),t=project.targets.find(t=>t.name===target.name),b=Object.values(t.blocks).find(b=>b.opcode==='arrays_referenceLength');b.opcode=opcode;b.inputs.ARRAY=[1,[4,'0']];
        assert.equal(createArrayReferenceExportAuthority(project).validateInput(t,b).ok,false,opcode);
    }
    block.opcode='arrays_referenceConcat';block.inputs.OTHER=[1,[4,'0']];const proof=createArrayReferenceExportAuthority(creator.project);assert.equal(proof.validateInput(target,block,'ARRAY').ok,true);assert.equal(proof.validateInput(target,block,'OTHER').ok,false);
});

test('actual callers and return bodies carry Array producers through ordinary formals',()=>{
    checked('function identity(values:number[]){return values};let items=[1,2];let alias=identity(items);let count=alias.length');
});

test('late incompatible writers and reads before allocation refuse instead of borrowing future facts',()=>{
    for(const source of ['let items=[1,2];let count=items.length;items=0 as any','let items;let count=items.length;items=[1,2]']){
        const creator=current(source);assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
    }
});

test('current input identity, shared reporters, foreign membership and malformed physical cycles refuse',()=>{
    const creator=current('let items=[1,2];let count=items.length'),{target,block}=lengthBlock(creator),proof=createArrayReferenceExportAuthority(creator.project);
    assert.equal(proof.validateInput(target,block).ok,true);block.inputs.ARRAY=[...block.inputs.ARRAY];assert.equal(proof.validateInput(target,block).ok,false);
    assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput({...target},block).ok,false);
    const project=structuredClone(creator.project),t=project.targets.find(t=>t.name===target.name),b=Object.values(t.blocks).find(b=>b.opcode==='arrays_referenceLength');b.inputs.ARRAY=[2,Object.keys(t.blocks).find(id=>t.blocks[id]===b)];
    assert.equal(createArrayReferenceExportAuthority(project).validateInput(t,b).ok,false);
});

test('real local and registered capture origins retain initialization and all-writer facts',()=>{
    checked('function begin(){let items=[1,2];game.onUpdate(function(){let count=items.length})};begin()');
});
test('nested Array results require actual element presence and compatible element writers',()=>{
    checked('let rows=[[1],[2]];let row=rows[0];let count=row.length');
    for(const source of ['let rows=[[1]];let row=rows[9];let count=row.length','let rows=[[1]];rows.push(0 as any);let row=rows[0];let count=row.length']){
        const creator=current(source);assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
    }
});
test('a forged factory chain and an extra effect socket are not actual producer/operation schemas',()=>{
    const creator=current('let items=[1,2];let count=items.length'),{target,block}=lengthBlock(creator);block.inputs.EXTRA=[1,[4,'2']];assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.includes('input schema')));
    const other=current('let items=[1,2];let count=items.length');for(const t of other.project.targets)for(const b of Object.values(t.blocks))if(b.opcode==='arrays_createReference')b.inputs.VALUES=[1,[10,'{}']];assert.ok(projectToArcade(other.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('existing SDK collection factory requires its actual KIND input shape and Number writers',()=>{
    checked('let items=sprites.allOfKind(SpriteKind.Player);let count=items.length');
    checked('let kind=SpriteKind.create();let items=sprites.allOfKind(kind);let count=items.length');
    const creator=current('let items=sprites.allOfKind(SpriteKind.Player);let count=items.length');
    for(const t of creator.project.targets)for(const b of Object.values(t.blocks))if(b.opcode==='arcade_spritesOfKind')b.inputs.KIND=[1,[10,'Player']];
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('same token spelling on an unrelated hat cannot lend callback initialization authority',()=>{
    const creator=current('let items=[1,2];game.onUpdate(function(){let count=items.length})');
    const callback=creator.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='arcade_whenRegisteredUpdate');assert.ok(callback);callback.opcode='event_whenflagclicked';
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('current physical slot tags, inline variable names and extra fallback ownership cannot lend facts',()=>{
    for(const edit of [b=>{b.inputs.ARRAY[0]=99;},b=>{if(Array.isArray(b.inputs.ARRAY[1]))b.inputs.ARRAY[1][1]='foreign';else throw Error('expected inline variable');},b=>{b.inputs.ARRAY=[3,b.inputs.ARRAY[1],'foreign'];}]){
        const creator=current('let items=[1,2];let count=items.length'),{block}=lengthBlock(creator);edit(block);assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
    }
});

test('nested allocation elements cannot borrow a later initialization through an alias',()=>{
    for(const source of ['let inner;let rows=[inner];inner=[1];let row=rows[0];let count=row.length','let inner;let alias=inner;inner=[1];let rows=[alias];let row=rows[0];let count=row.length']){
        const creator=current(source);assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
    }
});

test('an actual dominating named Array creation can issue an ordinary body alias',()=>{
    const creator=new Creator();creator.parse('DEVICE ARCADE\nGLOBAL ref\nGLOBAL count\nSPRITE Game:\nWHEN arcade source starts:\n  new array "owned" = [1,2]\n  set ref to (reference to named array ("owned"))\n  set count to (length of array reference (ref))');
    assert.deepEqual(creator.warnings,[]);assert.deepEqual(projectToArcade(creator.project).unsupported,[]);
});

test('a saved project and current Code retain genuine allocation proof while numeric receiver edits refuse',async()=>{
    const creator=current('let items=[1,2];let alias=items;let count=alias.length');
    const code=creator.decompile(),feedback=new Creator();feedback.parse(code);assert.deepEqual(projectToArcade(feedback.project).unsupported,[]);
    const ZIP=(await import('jszip')).default,zip=await ZIP.loadAsync(await(await creator.generateSB3()).arrayBuffer());
    const saved=JSON.parse(await zip.file('project.json').async('text'));assert.deepEqual(projectToArcade(saved).unsupported,[]);
    const {target,block}=lengthBlock({project:saved});block.inputs.ARRAY=[1,[4,'20']];assert.ok(projectToArcade(saved).unsupported.some(s=>s.startsWith('Array reference ')));
    assert.equal(target.blocks[Object.keys(target.blocks).find(id=>target.blocks[id]===block)],block);
});

test('every actual current caller must supply a real Array and malformed prototypes cannot lend formals',()=>{
    const source='function identity(values:number[]){return values};let items=[1,2];let alias=identity(items);let count=alias.length';
    const creator=current(source);const argument=creator.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='arcade_functionArgument');assert.ok(argument);argument.inputs.VALUE=[1,[4,'20']];
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
    const other=current(source);const prototype=other.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='procedures_prototype');prototype.mutation.argumentids='{}';const {target,block}=lengthBlock(other);assert.equal(createArrayReferenceExportAuthority(other.project).validateInput(target,block).ok,false);
});

test('shrinking writers cannot turn an absent nested element into an Array producer',()=>{
    const creator=current('let rows=[[1]];rows.pop();let row=rows[0];let count=row.length');assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});
