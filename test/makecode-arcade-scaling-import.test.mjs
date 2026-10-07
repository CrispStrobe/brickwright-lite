import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SCALING_CONTROLLER_SOURCE} from './fixtures/arcade-scaling-controller.mjs';
import {SCALING_VALUES_SOURCE} from './fixtures/arcade-scaling.mjs';

test('sprite scaling selects native properties and anchored operations with single evaluated compound operands',()=>{
 const result=arcadeToPseudocode(SCALING_VALUES_SOURCE);
 assert.deepEqual(result.unsupported,[]);
 assert.match(result.code,/arcade set sx of/);assert.match(result.code,/arcade property scale of/);
 assert.match(result.code,/arcade set scale of .*anchor \(3\)/);
 assert.match(result.code,/arcade change scale of .*anchor \(12\)/);
 assert.match(result.code,/arcade scale core of .*x \(undefined value\)/);
 assert.equal((result.code.match(/arcade call function "owner"/g)||[]).length,1);
 assert.equal((result.code.match(/arcade call function "amount"/g)||[]).length,1);
});
test('invalid scaling calls and undeclared or shadowed anchors retain named diagnostics',()=>{
 for(const expression of ['actor.setScale()','actor.changeScale(1,0,3)','actor.setScaleCore(1,2,0,false,3)','actor.setScale(2,ScaleAnchor.Missing)','let ScaleAnchor=1;actor.setScale(2,ScaleAnchor.Top)']){
  const result=arcadeToPseudocode('let actor=sprites.create(img`5`,SpriteKind.Player);'+expression);
  assert.ok(result.unsupported.some(note=>/scale|Scale|anchor|Anchor/.test(note)),expression);
 }
});
// Rotation was a named gap until task F4; it is now a sprite property (see
// makecode-arcade-rotation.test.mjs for its behaviour against the original).
test('rotation imports as a sprite property, no longer a named gap',()=>{
 const result=arcadeToPseudocode('let actor=sprites.create(img`5`,SpriteKind.Player);actor.rotation=1');
 assert.deepEqual(result.unsupported,[]);
 assert.match(result.code,/arcade set rotation of actor to /);
});

test('actual authored controller scene imports all scaling commands',()=>{
 assert.deepEqual(arcadeToPseudocode(SCALING_CONTROLLER_SOURCE).unsupported,[]);
});
