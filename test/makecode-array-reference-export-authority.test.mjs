import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

function withKindReset(){
    const creator=new Creator();creator.parse(`DEVICE ARCADE
GLOBAL kind
GLOBAL items
GLOBAL count
SPRITE Game:
WHEN arcade source starts:
  hide
  set kind to (undefined value)
  set kind to (arcade create sprite kind)
  set items to (arcade sprite array kind (kind))
  set count to (length of array reference (items))
`);assert.deepEqual(creator.warnings,[]);
    const {target,block:receiver}=lengthBlock(creator),blocks=target.blocks;
    const [writeId,write]=Object.entries(blocks).find(([,b])=>b.opcode==='data_setvariableto'&&blocks[b.inputs.VALUE[1]]?.opcode==='arcade_createSpriteKind');
    const resetId=write.parent,undefinedId=blocks[resetId].inputs.VALUE[1];
    // Stable test handles retain the actual Creator-produced blocks/schema.
    const rename=(from,to)=>{blocks[to]=blocks[from];delete blocks[from];for(const b of Object.values(blocks)){if(b.parent===from)b.parent=to;if(b.next===from)b.next=to;for(const slot of Object.values(b.inputs||{}))for(const key of [1,2])if(slot[key]===from)slot[key]=to;}};
    rename(resetId,'__reset');rename(undefinedId,'__undefined');
    return {creator,target,receiver,write,writeId,blocks};
}
function interposeReset(fixture,operation){
    const {blocks,writeId,write}=fixture;blocks.__interposed={topLevel:false,shadow:false,fields:{},inputs:{},...operation,parent:'__reset',next:writeId};
    blocks.__reset.next='__interposed';write.parent='__interposed';
}
test('KIND reset is excluded only across an actual uninterrupted overwrite before its receiver',()=>{
    const f=withKindReset();assert.deepEqual(projectToArcade(f.creator.project).unsupported,[]);
    // A genuine current numeric edit retains producer authority.
    const producer=f.blocks[f.write.inputs.VALUE[1]];producer.opcode='math_number';producer.shadow=true;producer.fields={NUM:['7',null]};producer.inputs={};
    f.write.inputs.VALUE=[1,f.write.inputs.VALUE[1]];
    assert.deepEqual(projectToArcade(f.creator.project).unsupported,[]);
});
test('KIND reset cannot hide an intervening read, call, registration, yield or control branch',()=>{
    for(const operation of [
        {opcode:'arcade_bindSpriteKind',inputs:{NAME:[1,[10,'early']],KIND:[3,[12,'kind',null],[10,'']]}},
        {opcode:'arcade_callFunction',inputs:{NAME:[1,[10,'unknown']],ARGS:[1,[10,'[]']]}},
        {opcode:'arcade_registerUpdateHandler',inputs:{TOKEN:[1,[10,'handler']]}},
        {opcode:'arcade_pause',inputs:{DURATION:[1,[4,'1']]}},
        {opcode:'control_if',inputs:{CONDITION:[1,[4,'1']]}}
    ]){
        const f=withKindReset();if(operation.opcode==='arcade_bindSpriteKind')operation.inputs.KIND[1][2]=f.write.fields.VARIABLE[1];interposeReset(f,operation);
        assert.equal(createArrayReferenceExportAuthority(f.creator.project).validateInput(f.target,f.receiver).ok,false,operation.opcode);
    }
});
test('KIND reset proof retains malformed topology and every later incompatible writer obligation',()=>{
    for(const edit of [f=>{f.write.parent='foreign';},f=>{f.blocks.__reset.next='__reset';},f=>{
        const tail=Object.entries(f.blocks).find(([,b])=>b.opcode==='data_setvariableto'&&b.fields.VARIABLE[0]==='count');
        f.blocks.__late={opcode:'data_setvariableto',parent:tail[0],next:null,shadow:false,topLevel:false,fields:structuredClone(f.write.fields),inputs:{VALUE:[1,[10,'wrong']]}};tail[1].next='__late';
    }]){const f=withKindReset();edit(f);assert.equal(createArrayReferenceExportAuthority(f.creator.project).validateInput(f.target,f.receiver).ok,false);}
});

test('KIND aliases cannot borrow a Number allocation after their own value read',()=>{
    const f=withKindReset(),aliasId='__earlyKindAlias';
    f.target.variables[aliasId]=['earlyKindAlias',0];
    interposeReset(f,{opcode:'data_setvariableto',fields:{VARIABLE:['earlyKindAlias',aliasId]},inputs:{VALUE:[3,[12,'kind',f.write.fields.VARIABLE[1]],[10,'']]}});
    // Remove the reset so this isolates the alias occurrence prerequisite,
    // rather than the separate uninterrupted-reset observation barrier.
    const parent=f.blocks.__reset.parent;f.blocks[parent].next='__interposed';f.blocks.__interposed.parent=parent;
    delete f.blocks.__reset;delete f.blocks.__undefined;
    const collection=Object.values(f.blocks).find(b=>b.opcode==='arcade_spritesOfKind');collection.inputs.KIND=[3,[12,'earlyKindAlias',aliasId],[10,'']];
    assert.equal(createArrayReferenceExportAuthority(f.creator.project).validateInput(f.target,f.receiver).ok,false);
});

test('KIND reset proof requires its actual fixed menu without hidden effect inputs',()=>{
    for(const edit of [f=>{f.blocks.__undefined.inputs.EXTRA=[1,[4,'1']];},f=>{f.blocks.__undefined.inputs.KIND=[1,[10,'undefined']];},f=>{f.blocks.__undefined.fields.KIND=['null',null];},f=>{f.blocks.__undefined.fields.EXTRA=['undefined',null];}]){
        const f=withKindReset();edit(f);assert.equal(createArrayReferenceExportAuthority(f.creator.project).validateInput(f.target,f.receiver).ok,false);
    }
});

test('global Array recursion retains initialized external callers and real allocation anchors',()=>{
    checked('let items=[1,2];function visit(n:number){let count=items.length;if(n>0){visit(n-1)}};visit(2)');
    checked('let items=[1,2];function first(n:number){let count=items.length;if(n>0){second(n-1)}}function second(n:number){let count=items.length;if(n>0){first(n-1)}}first(2);game.onUpdate(function(){first(1)})');
});
test('global Array recursion cannot bootstrap a rootless or incompatible entry and writer',()=>{
    for(const source of [
        'function visit(){let count=items.length;visit()}let items=[1]',
        'function visit(){let count=items.length;visit()}visit();let items=[1];visit()',
        'let items=[1];function visit(){let count=items.length;visit()}visit();items=0 as any',
        'function visit(items:number[]){let count=items.length;visit(items)}let items=[1];visit(items)'
    ]){const creator=current(source);assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')),source);}
    // Source already refuses an uninitialized local; never lower its partial
    // output to pretend it was a current-project negative.
    const refused=arcadeToPseudocode('function visit(){let items;let count=items.length;visit()}visit()');
    assert.ok(refused.unsupported.some(s=>s.includes('items.length')&&s.includes('not known')));
    const creator=current('function visit(){let items=[1];let count=items.length;visit()}visit()'),{target,block}=lengthBlock(creator),blocks=target.blocks;
    const [localId,local]=Object.entries(blocks).find(([,b])=>b.opcode==='arcade_setLocal'&&b.inputs.NAME?.[1]?.[1]==='items');
    const countId=local.next,count=blocks[countId],entryId=local.parent,nextId=count.next;
    blocks[entryId].next=countId;count.parent=entryId;count.next=localId;local.parent=countId;local.next=nextId;if(nextId)blocks[nextId].parent=localId;
    assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,block).ok,false,'actual local current read occurs before this activation allocation');
});
test('global Array recursion retains dynamic and escaped caller refusal obligations',()=>{
    for(const escaped of [false,true]){
        const creator=current('let items=[1];function visit(){let count=items.length;visit()}visit()'),{target,block}=lengthBlock(creator),blocks=target.blocks;
        const root=Object.values(blocks).find(b=>b.opcode==='arcade_whenSourceStarts');
        // Attach another actual current entry to the source body, preserving
        // the healthy direct call. Its unresolved target cannot be ignored.
        let id=root.next;while(blocks[id].next)id=blocks[id].next;
        if(escaped){
            const proc=Object.values(blocks).find(b=>b.opcode==='procedures_prototype').mutation.proccode;
            blocks.__escape={opcode:'arcade_setLocal',parent:id,next:null,topLevel:false,shadow:false,fields:{},inputs:{NAME:[1,[10,'escaped']],VALUE:[2,'__create']}};
            blocks.__create={opcode:'arcade_createCallable',parent:'__escape',next:null,topLevel:false,shadow:false,fields:{},inputs:{NAME:[1,[10,proc]]}};
            blocks[id].next='__escape';
        }else{
            blocks.__dynamic={opcode:'arcade_callFunction',parent:id,next:null,topLevel:false,shadow:false,fields:{},inputs:{NAME:[2,'__dynamicName'],ARGS:[1,[10,'[]']]}};
            blocks.__dynamicName={opcode:'arcade_getLocal',parent:'__dynamic',next:null,topLevel:false,shadow:false,fields:{},inputs:{NAME:[1,[10,'dynamicName']]}};
            blocks[id].next='__dynamic';
        }
        assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,block).ok,false);
    }
});

test('current Array variable authority rejects disagreement between actual IDs and emitted names on both destinations',()=>{
    for(const edit of [
        f=>{f.write.fields.VARIABLE[0]='other';},
        f=>{f.write.inputs.EXTRA=[1,[4,'7']];},
        f=>{f.block.inputs.ARRAY[1][1]='other';},
        f=>{f.target.variables.__shadow=['items',0];},
        f=>{const id=f.write.fields.VARIABLE[1];f.target.blocks.__reader={opcode:'data_variable',parent:f.blockId,next:null,shadow:false,topLevel:false,fields:{VARIABLE:['other',id]},inputs:{}};f.block.inputs.ARRAY=[2,'__reader'];}
    ]){
        const creator=current('let items=[1];let other=[2];let count=items.length;let otherCount=other.length'),{target,block}=lengthBlock(creator),blocks=target.blocks;
        const blockId=Object.keys(blocks).find(id=>blocks[id]===block),write=Object.values(blocks).find(b=>b.opcode==='data_setvariableto'&&b.fields.VARIABLE[0]==='items');
        edit({creator,target,block,blockId,write});const proof=createArrayReferenceExportAuthority(creator.project);
        for(const receiver of Object.values(blocks).filter(b=>b.opcode==='arrays_referenceLength'))assert.equal(proof.validateInput(target,receiver).ok,false,'neither name destination nor ID destination can borrow facts');
    }
});
test('current Array variable authority preserves a genuine declaration and every-reference rename',()=>{
    const creator=current('let items=[1];let alias=items;let count=alias.length'),stage=creator.project.targets.find(t=>t.isStage),[id]=Object.entries(stage.variables).find(([,v])=>v[0]==='items');
    stage.variables[id][0]='renamedItems';
    for(const target of creator.project.targets)for(const block of Object.values(target.blocks)){
        if(block.fields?.VARIABLE?.[1]===id)block.fields.VARIABLE[0]='renamedItems';
        for(const slot of Object.values(block.inputs||{}))for(const value of [slot[1],slot[2]])if(Array.isArray(value)&&value[0]===12&&value[2]===id)value[1]='renamedItems';
    }
    assert.deepEqual(projectToArcade(creator.project).unsupported,[]);
});

function aliasMutationCode({first='[]',second='[]',assignSecond=true,operation='push'}={}){
    const initial=value=>value==='[[]]'?'(new array reference from (array value (new array reference from ("[]")) rest ("[]")))':`(new array reference from (${JSON.stringify(value)}))`;
    const creator=new Creator();creator.parse(`DEVICE ARCADE
GLOBAL first
GLOBAL second
GLOBAL alias
GLOBAL row
GLOBAL count
SPRITE Game:
WHEN arcade source starts:
  hide
  set first to ${initial(first)}
  set second to ${initial(second)}
  set alias to first
  ${assignSecond?'set alias to second':'set alias to first'}
  mutate array reference (alias) op ${JSON.stringify(operation)} index (0) value (new array reference from ("[1]"))
  set row to (item (0) of array reference (first))
  set count to (length of array reference (row))
`);assert.deepEqual(creator.warnings,[]);return creator;
}
test('possible Array aliases cannot lend a push or unshift to every candidate body presence',()=>{
    for(const operation of ['push','unshift']){
        const creator=aliasMutationCode({operation});
        assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')),operation);
    }
});
test('definite same-body aliases retain mutation presence and existing populated unions retain Array facts',()=>{
    for(const operation of ['push','unshift']){
        assert.deepEqual(projectToArcade(aliasMutationCode({assignSecond:false,operation}).project).unsupported,[]);
        assert.deepEqual(projectToArcade(aliasMutationCode({first:'[[]]',second:'[[]]',operation}).project).unsupported,[]);
    }
});

test('mutation before receiver allocation cannot lend later element-presence proof',()=>{
    const creator=aliasMutationCode({assignSecond:false}),{target,block}=lengthBlock(creator),blocks=target.blocks;
    const [mutationId,mutation]=Object.entries(blocks).find(([,b])=>b.opcode==='arrays_mutateReference');
    const [firstId,first]=Object.entries(blocks).find(([,b])=>b.opcode==='data_setvariableto'&&b.fields.VARIABLE[0]==='first');
    const previous=blocks[mutation.parent],next=blocks[mutation.next],prefixId=first.parent;
    previous.next=mutation.next;if(next)next.parent=mutation.parent;
    blocks[prefixId].next=mutationId;mutation.parent=prefixId;mutation.next=firstId;first.parent=mutationId;
    mutation.inputs.ARRAY=[3,[12,'first',first.fields.VARIABLE[1]],[10,'']];
    assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,block).ok,false);
});

test('repeated fresh factory evaluations cannot borrow one return-site body identity',()=>{
    const creator=current('function make():number[][]{return []};let first=make();let second=make();let alias=first;alias=second;alias.push([1]);let row=first[0];let count=row.length');
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('once-evaluated fresh factory aliases retain mutation-derived presence',()=>{
    checked('function make():number[][]{return []};let first=make();let alias=first;alias.push([1]);let row=first[0];let count=row.length');
});

test('a loop callsite does not establish a once-evaluated factory body',()=>{
    const creator=current('function make():number[][]{return []};let count=0;for(let i=0;i<2;i++){let items=make();items.push([1]);let row=items[0];count=row.length}');
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('repeated shared-global returns preserve their genuine single allocation alias',()=>{
    checked('let shared:number[][]=[];function obtain():number[][]{return shared};let first=obtain();let second=obtain();second.push([1]);let row=first[0];let count=row.length');
});

test('formal identity returns preserve the actual once-allocated argument body',()=>{
    const source='function identity(values:number[][]):number[][]{return values};let first:number[][]=[];let alias=identity(first);alias.push([1]);let row=first[0];let count=row.length';
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const creator=new Creator();creator.parse(imported.code);assert.deepEqual(creator.warnings,[]);
    const report=process.env.BW_ARRAY_FORMAL_CURRENT_REPORT;
    if(report)fs.writeFileSync(report,JSON.stringify({source,imported,creatorWarnings:creator.warnings,project:creator.project},null,2)+'\n',{flag:'wx'});
    const result=projectToArcade(creator.project);
    if(report)fs.writeFileSync(report+'.export.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    assert.deepEqual(result.unsupported,[],result.unsupported.join('\n'));
});

test('repeated initially populated factory bodies keep constructor presence independently of mutation credit',()=>{
    const creator=new Creator();creator.parse(`DEVICE ARCADE
GLOBAL first
GLOBAL second
GLOBAL row
GLOBAL count
SPRITE Game:
WHEN arcade source starts:
  hide
  set first to (arcade call function "make" arguments ("[]"))
  set second to (arcade call function "make" arguments ("[]"))
  set row to (item (0) of array reference (first))
  set count to (length of array reference (row))
DEFINE make:
  arcade return value (new array reference from (array value (new array reference from ("[1]")) rest ("[]")))
`);assert.deepEqual(creator.warnings,[]);assert.deepEqual(projectToArcade(creator.project).unsupported,[]);
});

function occurrenceHeaderProject(){
    const creator=new Creator();creator.parse(`DEVICE ARCADE
GLOBAL counter
SPRITE Game:
WHEN arcade source starts:
  hide
  REPEAT (arcade call function "ticks" arguments ("[]")):
    hide
DEFINE ticks:
  arcade set local items to (new array reference from ("[]"))
  mutate array reference (arcade local items) op "push" index (0) value (new array reference from ("[1]"))
  arcade set local row to (item (0) of array reference (arcade local items))
  arcade return value (length of array reference (arcade local row))
`);assert.deepEqual(creator.warnings,[]);return creator;
}

test('repeat and for-each header reporter evaluations never issue once-allocation authority',()=>{
    for(const opcode of ['control_repeat','control_for_each']){
        const creator=occurrenceHeaderProject(),{target,block}=lengthBlock(creator);
        const header=Object.values(target.blocks).find(node=>node.opcode==='control_repeat');assert.ok(header);
        if(opcode==='control_for_each'){
            header.opcode=opcode;header.inputs.VALUE=header.inputs.TIMES;delete header.inputs.TIMES;
            const [id,row]=creator.project.targets.flatMap(t=>Object.entries(t.variables||{})).find(([,row])=>row[0]==='counter');header.fields.VARIABLE=[row[0],id];
        }
        assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,block).ok,false,opcode);
    }
});

test('unknown headers and forged extra if sockets cannot lend once-allocation authority',()=>{
    for(const opcode of ['arcade_unqualifiedHeader','control_if']){
        const creator=occurrenceHeaderProject(),{target,block}=lengthBlock(creator);
        const header=Object.values(target.blocks).find(node=>node.opcode==='control_repeat');header.opcode=opcode;
        if(opcode==='control_if'){header.inputs.EXTRA=header.inputs.TIMES;delete header.inputs.TIMES;header.inputs.CONDITION=[1,[4,'1']];}
        assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,block).ok,false,opcode);
    }
});

test('the exact ordinary if condition remains an at-most-once evaluation context',()=>{
    const creator=occurrenceHeaderProject(),{target,block}=lengthBlock(creator);
    const header=Object.values(target.blocks).find(node=>node.opcode==='control_repeat');header.opcode='control_if';header.inputs.CONDITION=header.inputs.TIMES;delete header.inputs.TIMES;
    assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,block).ok,true);
});

function managedOccurrenceDeclaration(creator,options={}){
    const {initializer='',fields=[],methods=[],opaque=false,foreign=false}=options;
    const constructor=Object.hasOwn(options,'constructor')?options.constructor:'';
    const target=creator.project.targets.find(t=>foreign?t.isStage:!t.isStage);
    const text=value=>[1,[10,typeof value==='string'?value:JSON.stringify(value)]];
    target.blocks.__managedOccurrence={opcode:'arcade_declareClass',next:null,parent:null,inputs:{NAME:text('Holder'),FIELDS:text(opaque?'not-json':fields),INITIALIZER:text(initializer),CONSTRUCTOR:text(constructor),PARAMETERS:text([]),METHODS:text(methods)},fields:{},shadow:false,topLevel:true,x:0,y:0};
}

test('constructor initializer methods accessors and Sprite updates are implicit procedure entries',()=>{
    const method=name=>({name,procedure:'make',parameters:[],returnType:'number[][]'});
    for(const role of [{initializer:'make'},{constructor:'make'},{methods:[method('obtain')]},{methods:[method('update')]},{fields:[{name:'value',type:'number[][]',readonly:true,getter:'make'}]},{fields:[{name:'value',type:'number[][]',readonly:false,setter:{procedure:'make',parameters:[{name:'value',type:'number[][]',optional:false}]}}]}]){
        const creator=current('function make():number[][]{return []};let first=make();first.push([1]);let row=first[0];let count=row.length');
        managedOccurrenceDeclaration(creator,role);const {target,block}=lengthBlock(creator);
        assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,block).ok,false,JSON.stringify(role));
    }
});

test('opaque or cross-target managed entry declarations cannot hide additional invocations',()=>{
    for(const role of [{opaque:true},{methods:[{name:'update',procedure:'make',parameters:[],returnType:'number[][]'}],foreign:true}]){
        const creator=current('function make():number[][]{return []};let first=make();first.push([1]);let row=first[0];let count=row.length');
        managedOccurrenceDeclaration(creator,role);const {target,block}=lengthBlock(creator);
        assert.equal(createArrayReferenceExportAuthority(creator.project).validateInput(target,block).ok,false);
    }
});


test('pending formal facts cannot invent a dominating mutation that is absent',()=>{
    const creator=current('function identity(values:number[][]):number[][]{return values};let first:number[][]=[];let alias=identity(first);let row=first[0];let count=row.length');
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('explicit opaque formal arguments cannot remain pending or authorize a receiver',()=>{
    const creator=current('function identity(values:number[][]):number[][]{return values};let first:number[][]=[];let alias=identity(first);alias.push([1]);let row=first[0];let count=row.length');
    const target=creator.project.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_callFunction'));
    const call=Object.values(target.blocks).find(b=>b.opcode==='arcade_callFunction'),argument=target.blocks[call.inputs.ARGS[1]];assert.equal(argument.opcode,'arcade_functionArgument');
    const old=argument.inputs.VALUE[1];if(typeof old==='string'){assert.equal(Object.keys(target.blocks[old].inputs||{}).length,0);delete target.blocks[old];}
    argument.inputs.VALUE=[1,[10,'opaque']];
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('a resolved different empty Array is not an unresolved formal receiver',()=>{
    const creator=current('function identity(values:number[][]):number[][]{return values};let first:number[][]=[];let other:number[][]=[];let alias=identity(other);alias.push([1]);let row=first[0];let count=row.length');
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

test('late incompatible formal aliases cannot gain presence from pending dataflow',()=>{
    const creator=current('function identity(values:number[][]):number[][]{return values};let first:number[][]=[];let alias=identity(first);alias.push([1]);let row=first[0];let count=row.length;alias=0 as any');
    assert.ok(projectToArcade(creator.project).unsupported.some(s=>s.startsWith('Array reference ')));
});

// Full source -> actual Creator -> exported files -> source -> actual Creator
// controls. These statements retain source/copy aliases and real nested writes;
// the expected negatives are Array presence/type refusals, not parse failures.
const sliceCases = {
    "literal-positive": "let rows=[[5],[6]];let copied=rows.slice(0,1);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "negative-end-positive": "let rows=[[5],[6]];let copied=rows.slice(0,-1);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "empty-window": "let rows=[[5],[6]];let copied=rows.slice(0,0);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "out-of-bounds": "let rows=[[5],[6]];let copied=rows.slice(9,10);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "negative-start-hump": "let rows=[[5],[6],[7],[8]];let copied=rows.slice(-2,2);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "no-credit-from-later-push": "let rows:number[][]=[];let copied=rows.slice(0,1);rows.push([7]);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "result-shrink-before": "let rows=[[5],[6]];let copied=rows.slice(0,1);copied.pop();let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "result-shrink-after": "let rows=[[5],[6]];let copied=rows.slice(0,1);let alias=copied;let selected:number[]=null;selected=alias[0];copied.pop();selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "source-alias-slot-writer": "let rows=[[5],[6]];let poisoned:any[]=rows;poisoned[0]=7;let copied=rows.slice(0,1);let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "copy-alias-slot-writer": "let rows=[[5],[6]];let copied=rows.slice(0,1);let alias=copied;let poisoned:any[]=alias;poisoned[0]=7;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];",
    "future-source-writer-union": "let rows:any[]=[[5],[6]];let copied=rows.slice(0,1);rows=[7];let alias=copied;let selected:number[]=null;selected=alias[0];selected[0]=9;let observed=selected[0];",
    "selected-reset-after-acquisition": "let rows=[[5],[6]];let copied=rows.slice(0,1);let alias=copied;let selected:number[]=null;selected=alias[0];selected=null;selected[0]=9;let observed=rows[0][0];let same=selected===rows[0];"
};
function sliceJourney(name) {
    const row={name};
    try {
        row.imported=arcadeToPseudocode(sliceCases[name]);
        row.creator=new Creator();row.creator.parse(row.imported.code);
        row.exported=projectToArcade(row.creator.project);
        row.reimported=arcadeToPseudocode(row.exported.files);
        row.second=new Creator();row.second.parse(row.reimported.code);
    } catch(error) {row.exception=error;row.threw=true;}
    return row;
}
function sliceResult(row,accept) {
    assert.equal(row.threw,undefined,row.name+': '+row.exception?.message);
    assert.deepEqual(row.imported.unsupported,[],row.name+' import');
    assert.deepEqual(row.creator.warnings,[],row.name+' Creator');
    const blocks=row.creator.project.targets.flatMap(t=>Object.values(t.blocks));
    assert.ok(blocks.some(b=>b.opcode==='arrays_referenceSlice'),row.name+' actual slice');
    if(accept) assert.deepEqual(row.exported.unsupported,[],row.name+' export');
    else assert.ok(row.exported.unsupported.some(s=>/^Array reference /.test(s)),row.name+' actual Array refusal');
    assert.deepEqual(row.reimported.unsupported,[],row.name+' exported-file import');
    assert.deepEqual(row.second.warnings,[],row.name+' exported-file Creator');
    // A negative export can be partial; clean reimport is not acceptance of
    // the refused nested operation. Only the positive branch requires export[].
}
test('bounded nested slices retain actual presence through aliases and overwritten reset',()=>{
    const rows=['literal-positive','negative-end-positive'].map(sliceJourney);
    for(const row of rows)sliceResult(row,true);
});
test('empty OOB negative-start windows and later source pushes grant no slice presence',()=>{
    const rows=['empty-window','out-of-bounds','negative-start-hump','no-credit-from-later-push'].map(sliceJourney);
    for(const row of rows)sliceResult(row,false);
});
test('slice-result shrinking is ordered at the actual nested acquisition',()=>{
    const rows=['result-shrink-before','result-shrink-after'].map(sliceJourney);
    sliceResult(rows[0],false);sliceResult(rows[1],true);
});
test('slice source and copy alias writers future unions and selected reset retain refusals',()=>{
    const rows=['source-alias-slot-writer','copy-alias-slot-writer','future-source-writer-union','selected-reset-after-acquisition'].map(sliceJourney);
    for(const row of rows)sliceResult(row,false);
});
test('slice minimum is acquired after source shrinks and only closed integer bounds count',()=>{
    checked('let rows=[[1],[2],[3]];rows.pop();let copied=rows.slice(1,2);let row=copied[0];row[0]=9');
    for(const source of [
        'let rows=[[1]];rows.pop();let copied=rows.slice(0,1);let row=copied[0];row[0]=9',
        'let rows=[[1],[2]];let copied=rows.slice(0,0.5);let row=copied[0];row[0]=9',
        'let rows=[[1],[2]];let start=0;let copied=rows.slice(start,1);let row=copied[0];row[0]=9',
        'let rows=[[1],2 as any];let copied=rows.slice(0,1);let row=copied[0];row[0]=9'
    ]) {const c=current(source);assert.ok(projectToArcade(c.project).unsupported.some(s=>/^Array reference /.test(s)),source);}
});
