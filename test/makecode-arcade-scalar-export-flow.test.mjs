import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import BundledCreator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {scalarExportFlow} from '../overlay/scratch-gui/src/lib/bw-makecode/scalar-export-flow.js';
import {sourceScalarProject} from '../overlay/scratch-gui/src/lib/bw-makecode/source-scalar-project.js';
const Creator=process.env.SB3_CREATOR_DIR?(await import(pathToFileURL(path.join(process.env.SB3_CREATOR_DIR,'src/utils/sb3Creator.js')).href)).default:BundledCreator;
const boolean=block=>['arrays_valueCompare','arrays_valueTruthy','operator_equals'].includes(block.opcode);
function analyze(code){const c=new Creator();c.parse(code);assert.deepEqual(c.warnings,[]);const flow=scalarExportFlow(c.project,boolean,sourceScalarProject(c.project));const stage=c.project.targets.find(t=>t.isStage);return {c,flow,id:name=>Object.entries(stage.variables).find(([,v])=>v[0]===name)[0]};}
test('argument and return flow copies scalar values without aliasing an earlier Boolean cell',()=>{
 const {flow,id}=analyze(`DEVICE ARCADE
GLOBAL yes
GLOBAL copied
GLOBAL result
SPRITE Game:
WHEN arcade source starts:
  declare arcade source scalar yes as Boolean
  set yes to (compare value 1 op "<" with 2)
  set copied to yes
  set copied to 7
  set result to (arcade call function "identity %s" arguments (arcade function argument yes rest "[]"))
DEFINE identity (value):
  arcade return value (arcade local value)`);
 assert.equal(flow.type('variable:'+id('yes')),'boolean');
 assert.equal(flow.type('variable:'+id('copied')),'any');
 assert.equal(flow.type('variable:'+id('result')),'boolean');
 assert.equal(flow.type('Game:identity %s:local:value'),'boolean');
});
test('script local owners use actual block IDs and opaque references stay outside scalar overrides',()=>{
 const {flow,c,id}=analyze(`DEVICE ARCADE
GLOBAL mixed
SPRITE Game:
WHEN arcade source starts:
  arcade set local carry to 1
  set mixed to 1
  set mixed to (arcade new image width 1 height 1)
WHEN arcade source starts:
  arcade set local carry to "text"`);
 const t=c.project.targets.find(t=>t.name==='Game'),hats=Object.entries(t.blocks).filter(([,b])=>b.opcode==='arcade_whenSourceStarts');
 assert.equal(flow.type(`Game:script:${hats[0][0]}:local:carry`),'number');
 assert.equal(flow.type(`Game:script:${hats[1][0]}:local:carry`),'string');
 assert.equal(flow.primitive('variable:'+id('mixed')),false);
});

test('stock procedure call arguments flow into the formal, including a supplied Undefined',()=>{
 const types=code=>{const c=new Creator();c.parse(code);assert.deepEqual(c.warnings,[]);return [...(scalarExportFlow(c.project,boolean).types.get('Game:count %s:local:times')||[])].sort();};
 const program=argument=>`DEVICE ARCADE
SPRITE Game:
WHEN arcade source starts:
  CALL: (count ${argument})
  CALL: (count ((0 + (5))))

DEFINE count (times):
  arcade set local times to ((0 + (3)))`;
 assert.deepEqual(types(program('(undefined value)')),['number','undefined']);
 assert.deepEqual(types(program('((0 + (2)))')),['number']);
 assert.deepEqual(types(program('("x")')),['number','string']);
});
