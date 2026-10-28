import test from 'node:test';
import assert from 'node:assert/strict';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const literal=value=>[1,[10,value]];
function project(value,owner='event_whenflagclicked') {
 const blocks={hat:{opcode:owner,topLevel:true,parent:null,next:'throw',inputs:{},fields:{}},throw:{opcode:'arcade_throwValue',parent:'hat',next:null,inputs:{VALUE:[1,'value']},fields:{}},value:{...value,parent:'throw',inputs:value.inputs||{}}};
 return {targets:[{isStage:true,name:'Stage',variables:{},lists:{},broadcasts:{},blocks,costumes:[],sounds:[]}],extensions:['arcade']};
}
test('Throw current export preserves Number/Text distinction and primitive values without a return substitute',()=>{
 for(const [value,expected]of [[{opcode:'math_number',shadow:true,fields:{NUM:['20',null]}},'20'],[{opcode:'text',shadow:true,fields:{TEXT:['20',null]}},'"20"'],[{opcode:'arrays_specialValue',fields:{},inputs:{KIND:literal('undefined')}},'undefined'],[{opcode:'arrays_specialValue',fields:{},inputs:{KIND:literal('null')}},'null']]) {
  const out=projectToArcade(project(value));assert.deepEqual(out.unsupported,[]);assert.match(out.ts,new RegExp('throw '+expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.doesNotMatch(out.ts,/return |console\.log|arcade_throwValue/);
 }
});
test('opaque Throw operands and unknown, terrain or creation owners remain named refusals',()=>{
 const image={opcode:'arcade_createImage',fields:{},inputs:{WIDTH:[1,[4,'1']],HEIGHT:[1,[4,'1']]}};
 assert.ok(projectToArcade(project(image)).unsupported.some(message=>message.includes('Throw export')));
 for(const owner of ['arcade_whenRegisteredCreated','arcade_whenRegisteredWall','arcade_whenRegisteredTile','event_whenbroadcastreceived'])assert.ok(projectToArcade(project({opcode:'math_number',shadow:true,fields:{NUM:['20',null]}},owner)).unsupported.some(message=>message.includes('Throw export')),owner);
});
test('ordinary procedure Throw keeps real call ancestry and refuses a creation-handler caller',()=>{
 // Real Scratch procedure blocks carry shadow/topLevel; the strict ordinary
 // symbol checks (46e09dc0f..30fe39989) require them.
 const p=project({opcode:'math_number',shadow:true,fields:{NUM:['20',null]}}),b=p.targets[0].blocks;
 b.hat.next='call';b.call={opcode:'procedures_call',parent:'hat',next:null,fields:{},inputs:{},mutation:{proccode:'fail',argumentids:'[]'}};
 b.def={opcode:'procedures_definition',parent:null,topLevel:true,shadow:false,next:'throw',fields:{},inputs:{custom_block:[1,'proto']}};b.proto={opcode:'procedures_prototype',parent:'def',next:null,topLevel:false,shadow:true,fields:{},inputs:{},mutation:{proccode:'fail',argumentids:'[]',argumentnames:'[]',argumentdefaults:'[]'}};b.throw.parent='def';
 let out=projectToArcade(p);assert.deepEqual(out.unsupported,[]);assert.match(out.ts,/function fail\s*\(\)\s*\{\s*throw 20/);assert.doesNotMatch(out.ts,/function fail\s*\(\):/);
 b.hat.opcode='arcade_whenRegisteredCreated';out=projectToArcade(p);assert.ok(out.unsupported.some(message=>message.includes('Throw export')));
});
