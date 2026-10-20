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


test('a changed standard variable field cannot regain source reference authority from a stale saved tag',()=>{
 const c=build(),stage=c.project.targets.find(t=>t.isStage);
 const [id,value]=Object.entries(stage.variables).find(([,v])=>v[0]==='ref');
 stage.bwValues={version:1,variables:{[id]:{bwReference:{kind:'image',id:'image:1:1'}}}};
 value[1]='[image reference image:1:1]';
 const valid=projectToArcade(c.project);assert.deepEqual(valid.unsupported,[]);assert.match(valid.ts,/let ref: Image\n/);
 value[1]='[image reference externally edited]';
 const changed=projectToArcade(c.project);
 assert.ok(changed.unsupported.some(reason=>reason.includes('saved resource tag differs')));
 assert.match(changed.ts,/let ref: any = "\[image reference externally edited\]"/);
 assert.doesNotMatch(changed.ts,/let ref: Image\n/);
});


test('stale reference tags preserve edited zero, null and Boolean fields despite typed reference writers',()=>{
 for(const edited of [0,null,false,17,'word']) {
  const c=new Creator();c.parse(source+'\n  set ref to (arcade new image width 1 height 1)');
  const stage=c.project.targets.find(t=>t.isStage);
  const [id,value]=Object.entries(stage.variables).find(([,v])=>v[0]==='ref');
  stage.bwValues={version:1,variables:{[id]:{bwReference:{kind:'image',id:'image:1:1'}}}};
  value[1]=edited;
  const changed=projectToArcade(c.project);
  assert.ok(changed.unsupported.some(reason=>reason.includes('saved resource tag differs')));
  assert.ok(changed.ts.includes('let ref: any = '+JSON.stringify(edited)),String(edited));
  assert.doesNotMatch(changed.ts,/let ref: Image/);
 }
});
