import test from 'node:test';import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {sourceReferenceProject} from '../overlay/scratch-gui/src/lib/bw-makecode/source-reference-project.js';
import {sourceScalarProject} from '../overlay/scratch-gui/src/lib/bw-makecode/source-scalar-project.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const source=`DEVICE ARCADE
GLOBAL ref
GLOBAL before
SPRITE Game:
WHEN arcade source starts:
  declare arcade source reference ref as "Image"
  declare arcade source scalar before as Boolean
  set before to (compare value ref op "===" with (undefined value))`;
const build=()=>{const c=new Creator();c.parse(source);assert.deepEqual(c.warnings,[]);return c;};
test('portable interleaved reference/scalar prefix retains separate type maps and exact variable identities',()=>{
 const c=build(),refs=sourceReferenceProject(c.project),scalars=sourceScalarProject(c.project);
 assert.equal(refs.size,1);assert.equal(scalars.size,1);assert.equal([...refs.values()][0].type,'Image');assert.equal([...scalars.values()][0].type,'Boolean');
 const out=projectToArcade(c.project);assert.deepEqual(out.unsupported,[]);assert.match(out.ts,/let ref: Image\n/);assert.match(out.ts,/let before: boolean\n/);assert.doesNotMatch(out.ts,/let ref: any|let ref: Image = null/);
});
test('late, computed, unowned and duplicate reference metadata receive explicit export refusals',()=>{
 for(const mutation of [b=>b.fields.TYPE[0]='Missing',b=>b.inputs.TYPE=[1,[10,'Image']],b=>b.inputs.VARIABLE=[1,[10,'ref']]]){
  const c=build(),b=c.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='arcade_declareSourceReference');mutation(b);
  assert.throws(()=>sourceReferenceProject(c.project));assert.ok(projectToArcade(c.project).unsupported.length);
 }
 const c=build(),t=c.project.targets.find(t=>t.name==='Game'),b=Object.values(t.blocks).find(b=>b.opcode==='arcade_declareSourceReference');
 t.blocks.duplicate={...b,next:b.next,parent:b.id};b.next='duplicate';assert.throws(()=>sourceReferenceProject(c.project),/duplicated/);
});
