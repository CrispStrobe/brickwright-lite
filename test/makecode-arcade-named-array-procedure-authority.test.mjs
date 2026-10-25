import test from 'node:test';
import assert from 'node:assert/strict';
import {namedArrayItemExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/named-array-item-export-authority.js';
const literal=value=>[1,[typeof value==='number'?4:10,value]];
const target=()=>({isStage:false,name:'Game',variables:{calls:['calls',0]},blocks:{
    definition:{opcode:'procedures_definition',topLevel:true,inputs:{custom_block:[1,'prototype']},next:'return'},
    prototype:{opcode:'procedures_prototype',mutation:{proccode:'next',argumentnames:'[]'}},
    return:{opcode:'arcade_returnValue',inputs:{VALUE:[1,[12,'calls','calls']]}},
    call:{opcode:'arcade_callFunction',inputs:{NAME:literal('next')}},
    push:{opcode:'arrays_push',inputs:{NAME:literal('items'),VALUE:[1,'call']}}
}});
const check=(t,others=[])=>namedArrayItemExportAuthority({targets:[t,...others]},'items',()=>false);
test('named item procedure results require actual complete target-owned scalar producers',()=>{
    const t=target();assert.equal(check(t).ok,true);
    t.blocks.return.inputs.VALUE=literal('word');assert.equal(check(t).ok,true);
    t.blocks.return.inputs.VALUE=literal('{"bwReference":"Sprite","id":"x"}');assert.equal(check(t).ok,false);
    t.blocks.return.inputs.VALUE=[1,'image'];t.blocks.image={opcode:'arcade_createImage'};assert.equal(check(t).ok,false);
});
test('every return, recursive result, empty graph and parameter result stay refused',()=>{
    let t=target();t.blocks.return.next='other';t.blocks.other={opcode:'arcade_returnValue',inputs:{VALUE:[1,'image']}};t.blocks.image={opcode:'arcade_createImage'};assert.equal(check(t).ok,false);
    t=target();t.blocks.return.inputs.VALUE=[1,'call'];assert.equal(check(t).ok,false);
    t=target();delete t.blocks.definition.next;assert.equal(check(t).ok,false);
    t=target();t.blocks.return.inputs.VALUE=[1,'param'];t.blocks.param={opcode:'argument_reporter_string_number',fields:{VALUE:['value']}};assert.equal(check(t).ok,false);
});
test('procedure bindings cannot borrow another target or duplicate definition',()=>{
    let t=target();const foreign=target();delete t.blocks.definition;assert.equal(check(t,[foreign]).ok,false);
    t=target();t.blocks.duplicate={...t.blocks.definition};assert.equal(check(t).ok,false);
    t=target();t.blocks.call.inputs.NAME=literal('missing');assert.equal(check(t).ok,false);
});

import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerNamedArrayItemHelpers,NAMED_ARRAY_GET_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/named-array-item-helpers.js';
import {LEGACY_JSON_SOURCE,LEGACY_PARSE_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-array-values.js';
const reconstruct=fn=>lowerNamedArrayItemHelpers(parseMakeCodeTs(LEGACY_JSON_SOURCE+'\n'+LEGACY_PARSE_SOURCE+'\n'+NAMED_ARRAY_GET_SOURCE+`
function ownedPush(array:any[],value:any):void {if(array)array.push(__bwNamedParseValue(value))}
let calls=0
let items:any[]=null
${fn}
items=[]
ownedPush(items,next())
let value=__bwNamedArrayGet(items,0)
`,{parameterDefaults:true,retainParentheses:true}));
test('source reconstruction proves actual zero-parameter scalar returns and refuses opaque, recursive and duplicate producers',()=>{
    assert.deepEqual(reconstruct('function next():number {calls+=1;return calls}').unsupported,[]);
    for(const body of [
        'function next():any {return sprites.create(img`1`)}',
        'function next():any {if(true)return 1;return sprites.create(img`1`)}',
        'function next():number {return next()}',
        'function next():number {}',
        'function next(value:any):any {return value}',
        'function next():number {return 1}\nfunction next():number {return 2}'
    ])assert.notDeepEqual(reconstruct(body).unsupported,[],body);
});
