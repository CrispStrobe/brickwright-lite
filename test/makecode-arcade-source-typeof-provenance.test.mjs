import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const BW=require('../overlay/scratch-vm/src/util/bw-values.js');
const createCells=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-scalar-cells.js');
const referenceTypes=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-reference-types.js');
const createTypeOf=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/source-typeof-values.js');

function fixture() {
    const variables={text:{id:'text',type:'',value:0},sprite:{id:'sprite',type:'',value:0}};
    const blocks={
        hat:{id:'hat',opcode:'arcade_whenSourceStarts',topLevel:true,next:'declareText'},
        declareText:{id:'declareText',opcode:'arcade_declareSourceScalar',next:'declareSprite',fields:{TYPE:{value:'String'}},inputs:{VARIABLE:{block:'text'}}},
        declareSprite:{id:'declareSprite',opcode:'arcade_declareSourceReference',next:'assign',fields:{TYPE:{value:'Sprite'}},inputs:{VARIABLE:{block:'sprite'}}},
        text:{id:'text',opcode:'data_variable',fields:{VARIABLE:{id:'text'}}},
        sprite:{id:'sprite',opcode:'data_variable',fields:{VARIABLE:{id:'sprite'}}},
        literal:{id:'literal',opcode:'text',fields:{TEXT:{value:'arcade:1'}}},
        assign:{id:'assign',opcode:'data_setvariableto',next:'type',fields:{VARIABLE:{id:'text'}},inputs:{VALUE:{block:'literal'}}},
        type:{id:'type',opcode:'arcade_sourceTypeOf',inputs:{VALUE:{block:'text'}}}
    };
    const target={id:'stage',isStage:true,isOriginal:true,variables,blocks:{_blocks:blocks,getBlock:id=>blocks[id]},lookupVariableById:id=>variables[id]};
    const runtime={targets:[target]},cells=createCells(runtime,BW,referenceTypes);
    const type=createTypeOf(runtime,BW,{current:()=>true});
    const util={target,thread:{peekStack:()=> 'type'}};
    util.thread.target=target;util.thread.blockContainer=target.blocks;
    runtime.threads=[util.thread];runtime.isActiveThread=thread=>runtime.threads.includes(thread) && !thread.isKilled;
    const start=()=>{cells.initialize();type.snapshotInputs();};
    start();variables.text.value='arcade:1';variables.sprite.value='arcade:1';
    return {target,runtime,variables,blocks,cells,type,util,start};
}
test('actual current source reference bindings distinguish Sprite from matching literal text',()=>{
    const f=fixture();assert.equal(f.cells.referenceTypeOf(f.target,'sprite'),'Sprite');
    assert.equal(f.cells.referenceTypeOf(f.target,'text'),undefined);
    assert.equal(f.cells.typeOf(f.target,'text'),'String');
    f.type.validateInput(f.cells,f.util,'arcade:1');
    f.blocks.type.inputs.VALUE.block='sprite';f.start();
    assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/opaque or Sprite/);
    f.blocks.type.inputs.VALUE.block='literal';f.start();
    f.type.validateInput(f.cells,f.util,'arcade:1');
});
test('direct and computed native Sprite producers never gain String authority',()=>{
    for(const computed of [false,true]){
        const f=fixture();f.blocks.native={id:'native',opcode:'arcade_createSprite',inputs:{}};
        if(computed)f.blocks.assign.inputs.VALUE.block='native';else f.blocks.type.inputs.VALUE.block='native';
        f.start();assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/opaque or Sprite/);
    }
});
test('Stop, metadata edits, stale rebindings and foreign owners cannot reuse typed source authority',()=>{
    const f=fixture();f.cells.invalidate();assert.equal(f.cells.referenceTypeOf(f.target,'sprite'),undefined);
    assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/opaque/);
    f.start();f.blocks.declareSprite.fields.TYPE.value='Image';
    assert.throws(()=>f.cells.referenceTypeOf(f.target,'sprite'),/changed after prelude/);
    assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/metadata changed/);
    f.blocks.declareSprite.fields.TYPE.value='Sprite';f.start();
    f.variables.text={...f.variables.text};assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/opaque/);
    const foreign=fixture();assert.throws(()=>f.type.validateInput(f.cells,foreign.util,'arcade:1'),/active runtime/);
    f.start();f.type.validateInput(f.cells,f.util,'arcade:1');
});
test('changed writer bodies remain refused until a real new source start',()=>{
    const f=fixture();f.blocks.literal.fields.TEXT.value='edited';
    assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/metadata changed/);
    f.start();f.type.validateInput(f.cells,f.util,'edited');
});

test('source ownership reparenting and top-level changes require a new source start',()=>{
    for(const mutate of [f=>{f.blocks.type.parent='other';},f=>{f.blocks.hat.topLevel=false;}]){
        const f=fixture();mutate(f);
        assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/metadata changed/);
    }
});

test('cached operation arguments bind the actual sibling reporter and active caller',()=>{
    const f=fixture();
    f.blocks.command={id:'command',opcode:'arcade_setLocal',inputs:{VALUE:{block:'type'}}};
    f.blocks.peer={id:'peer',opcode:'arcade_sourceTypeOf',inputs:{VALUE:{block:'sprite'}}};
    const args={VALUE:'arcade:1'},peerArgs={VALUE:'arcade:1'};
    f.target.blocks._cache={_executeCached:{command:{_ops:[{id:'type',opcode:'arcade_sourceTypeOf',_argValues:args},{id:'peer',opcode:'arcade_sourceTypeOf',_argValues:peerArgs}]}}};
    f.util.thread.peekStack=()=> 'command';f.start();
    f.type.validateInput(f.cells,f.util,args.VALUE,args);
    assert.throws(()=>f.type.validateInput(f.cells,f.util,peerArgs.VALUE,peerArgs),/opaque or Sprite/);
    assert.throws(()=>f.type.validateInput(f.cells,f.util,args.VALUE,{...args}),/opaque or Sprite/);
    f.util.thread.isKilled=true;
    assert.throws(()=>f.type.validateInput(f.cells,f.util,args.VALUE,args),/active runtime/);
    f.util.thread.isKilled=false;f.runtime.threads=[];
    assert.throws(()=>f.type.validateInput(f.cells,f.util,args.VALUE,args),/active runtime/);
    f.runtime.threads=[f.util.thread];f.util.thread.blockContainer={};
    assert.throws(()=>f.type.validateInput(f.cells,f.util,args.VALUE,args),/active runtime/);
    f.util.thread.blockContainer=f.target.blocks;f.cells.invalidate();
    f.blocks.type.inputs.VALUE.block='text';
    assert.throws(()=>f.type.validateInput(f.cells,f.util,args.VALUE,args),/opaque/);
});

test('a stage array cannot hide a Sprite mutation in another original target',()=>{
    const f=fixture();
    const ref=BW.arrayReference(f.runtime,['arcade:1']);
    f.variables.array={id:'array',type:'',value:ref};
    f.blocks.array={id:'array',opcode:'data_variable',fields:{VARIABLE:{id:'array'}}};
    f.blocks.create={id:'create',opcode:'arrays_createReference',inputs:{VALUES:{block:'values'}}};
    f.blocks.values={id:'values',opcode:'arrays_referenceValues',inputs:{VALUE:{block:'literal'},REST:{block:'empty'}}};
    f.blocks.empty={id:'empty',opcode:'text',fields:{TEXT:{value:'[]'}}};
    f.blocks.assignArray={id:'assignArray',opcode:'data_setvariableto',fields:{VARIABLE:{id:'array'}},inputs:{VALUE:{block:'create'}}};
    f.blocks.item={id:'item',opcode:'arrays_referenceItem',inputs:{ARRAY:{block:'array'}}};
    f.blocks.type.inputs.VALUE.block='item';f.start();
    f.type.validateInput(f.cells,f.util,'arcade:1');
    const blocks={
        array:{opcode:'data_variable',fields:{VARIABLE:{id:'array'}}},
        sprite:{opcode:'arcade_createSprite',inputs:{}},
        push:{opcode:'arrays_mutateReference',fields:{OP:{value:'push'}},inputs:{ARRAY:{block:'array'},VALUE:{block:'sprite'}}}
    };
    const other={id:'other',isOriginal:true,blocks:{_blocks:blocks,getBlock:id=>blocks[id]},lookupVariableById:id=>f.variables[id]};
    f.runtime.targets.push(other);f.start();
    assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/opaque or Sprite/);
});

test('rebinding a historical array alias cannot erase a Sprite write',()=>{
    for(const foreign of [false,true]){
        const f=fixture();
        f.variables.array={id:'array',type:'',value:BW.arrayReference(f.runtime,['arcade:1'])};
        f.variables.alias={id:'alias',type:'',value:BW.arrayReference(f.runtime,[])};
        Object.assign(f.blocks,{
            array:{id:'array',opcode:'data_variable',fields:{VARIABLE:{id:'array'}}},
            create:{id:'create',opcode:'arrays_createReference',inputs:{VALUES:{block:'values'}}},
            values:{id:'values',opcode:'arrays_referenceValues',inputs:{VALUE:{block:'literal'},REST:{block:'empty'}}},
            empty:{id:'empty',opcode:'text',fields:{TEXT:{value:'[]'}}},
            assignArray:{id:'assignArray',opcode:'data_setvariableto',fields:{VARIABLE:{id:'array'}},inputs:{VALUE:{block:'create'}}},
            item:{id:'item',opcode:'arrays_referenceItem',inputs:{ARRAY:{block:'array'}}}
        });
        f.blocks.type.inputs.VALUE.block='item';
        const history={
            alias:{opcode:'data_variable',fields:{VARIABLE:{id:'alias'}}},
            shared:{opcode:'data_variable',fields:{VARIABLE:{id:'array'}}},
            bind:{opcode:'data_setvariableto',fields:{VARIABLE:{id:'alias'}},inputs:{VALUE:{block:'shared'}}},
            nativeSprite:{opcode:'arcade_createSprite',inputs:{}},
            push:{opcode:'arrays_mutateReference',fields:{OP:{value:'push'}},inputs:{ARRAY:{block:'alias'},VALUE:{block:'nativeSprite'}}}
        };
        if(foreign)f.runtime.targets.push({id:'other',isOriginal:true,blocks:{_blocks:history,getBlock:id=>history[id]},lookupVariableById:id=>f.variables[id]});
        else Object.assign(f.blocks,history);
        f.start();assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/opaque or Sprite/);
    }
});

test('foreign writer edits and target changes invalidate the complete source provenance snapshot',()=>{
    for(const mutate of [
        (f,other)=>{delete other.blocks._blocks.push;},
        (f,other)=>{other.blocks._blocks.push.inputs.VALUE.block='safe';},
        (f,other)=>{f.runtime.targets.splice(f.runtime.targets.indexOf(other),1);},
        f=>{f.runtime.targets.push({id:'new',isOriginal:true,blocks:{_blocks:{}}});}
    ]){
        const f=fixture();
        const nodes={push:{id:'push',opcode:'arrays_mutateReference',inputs:{VALUE:{block:'unsafe'}}},unsafe:{id:'unsafe',opcode:'arcade_createSprite'}};
        const other={id:'other',isOriginal:true,blocks:{_blocks:nodes,getBlock:id=>nodes[id]}};
        f.runtime.targets.push(other);f.start();mutate(f,other);
        assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/metadata changed/);
    }
});

test('invalidating the input service clears literal authority until a real new source start',()=>{
    const f=fixture();f.blocks.type.inputs.VALUE.block='literal';f.start();
    f.type.validateInput(f.cells,f.util,'arcade:1');f.type.invalidateInputs();
    assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/metadata changed/);
    f.start();f.type.validateInput(f.cells,f.util,'arcade:1');
});

test('owned numeric shadows retain Number while matching text and stale literal metadata do not',()=>{
    const f=fixture();f.blocks.number={id:'number',opcode:'math_number',fields:{NUM:{value:'17'}}};
    f.blocks.type.inputs.VALUE.block='number';f.start();
    assert.equal(f.type.validateInput(f.cells,f.util,'17'),'number');
    assert.throws(()=>f.type.validateInput(f.cells,f.util,'18'),/opaque/);
    f.blocks.literal.fields.TEXT.value='17';f.blocks.type.inputs.VALUE.block='literal';f.start();
    assert.equal(f.type.validateInput(f.cells,f.util,'17'),undefined);
    f.blocks.type.inputs.VALUE.block='number';
    assert.throws(()=>f.type.validateInput(f.cells,f.util,'17'),/metadata changed/);
});

test('array insertions prove each staged primitive or Array alternative and reject an opaque alternative',()=>{
    for(const unsafe of [false,true]){
        const f=fixture();
        Object.assign(f.blocks,{
            empty:{id:'empty',opcode:'text',fields:{TEXT:{value:'[]'}}},
            create:{id:'create',opcode:'arrays_createReference',inputs:{VALUES:{block:'empty'}}},
            localName:{id:'localName',opcode:'text',fields:{TEXT:{value:'element'}}},
            initial:{id:'initial',opcode:'arcade_setLocal',next:'later',inputs:{NAME:{block:'localName'},VALUE:{block:'literal'}}},
            later:{id:'later',opcode:'arcade_setLocal',next:'push',inputs:{NAME:{block:'localName'},VALUE:{block:unsafe?'native':'create'}}},
            local:{id:'local',opcode:'arcade_getLocal',inputs:{NAME:{block:'localName'}}},
            native:{id:'native',opcode:'arcade_createSprite'},
            push:{id:'push',opcode:'arrays_mutateReference',next:'type',fields:{OP:{value:'push'}},inputs:{ARRAY:{block:'create'},VALUE:{block:'local'}}},
            item:{id:'item',opcode:'arrays_referenceItem',inputs:{ARRAY:{block:'create'}}}
        });
        f.blocks.assign.next='initial';f.blocks.type.inputs.VALUE.block='item';f.start();
        if(unsafe)assert.throws(()=>f.type.validateInput(f.cells,f.util,'arcade:1'),/opaque/);
        else f.type.validateInput(f.cells,f.util,'arcade:1');
    }
});
