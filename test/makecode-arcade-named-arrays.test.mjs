import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {LEGACY_JSON_SOURCE,LEGACY_PARSE_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-array-values.js';
import {runProgram,stepFrames} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const vars=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
const normalized=values=>Object.fromEntries(Object.entries(values).map(([name,value])=>[name.replace(/^Game_/,''),value]));
const output=run=>projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});
const code=`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  hide
  new array "items" = [1,"word",[2,3],null,true]
  set alias to reference to named array ("items")
  set same to reference to named array ("items")
  set identity to compare value (alias) op "===" with (same)
  set row to item (2) of array reference (alias)
  mutate array reference (row) op "push" index (0) value (convert value (4) op "+")
  set nested to item 2 of array "items"
  push "007" to array "items"
  push "hello" to array "items"
  push "null" to array "items"
  push "" to array "items"
  set item 0 of array "items" to "12"
  insert "9" at -1 of array "items"
  remove item -2 of array "items"
  set numberText to item 0 of array "items"
  set wordText to item 1 of array "items"
  set count to length of array "items"
  set last to pop from array "items"
  set content to array "items" as text
  set located to index of "007" in array "items"
  new array "items"
  set oldCount to length of array reference (alias)
  set newCount to length of array "items"
  set replaced to reference to named array ("items")
  set changed to compare value (alias) op "!==" with (replaced)
  delete array "items"
  set deletedCount to length of array "items"
  set oldContent to JSON text of value (alias)
  new array "blank"
  set emptyPop to pop from array "blank"
  set missing to item 0 of array "blank"`;
const names=['identity','nested','numberText','wordText','count','last','content','located','oldCount','newCount','changed','deletedCount','oldContent','emptyPop'];
const expected={identity:true,nested:'[2,3,4]',numberText:'12',wordText:'"word"',count:9,last:'',content:'[12,"word",[2,3,4],null,true,7,"hello",null]',located:5,oldCount:8,newCount:0,changed:true,deletedCount:0,oldContent:'[12,"word",[2,3,4],null,true,7,"hello",null]',emptyPop:''};
test('named arrays retain JSON reads, value parsing, nested aliases and replacement across all conversion paths',async()=>{
    const check=run=>{const actual=vars(run);for(const name of names)assert.equal(actual[name],expected[name],name);assert.deepEqual(actual.missing,{bwUndefined:true});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const run=await runProgram(code,{frames:50,storage:true});check(run);
    const again=await runProgram(run.creator.decompile(),{frames:50,storage:true});check(again);
    const exported=output(run);assert.deepEqual(exported.unsupported,[]);
    const original=normalized(await runPxtArcade(exported.ts));for(const name of names)assert.equal(original[name],expected[name],name+' in PXT');assert.equal(original.missing,undefined);
    const imported=arcadeToPseudocode(exported.ts);assert.deepEqual(imported.unsupported,[]);
    const returned=await runProgram(imported.code,{frames:80,uploads:imported.costumes,storage:true});check(returned);
    const twice=output(returned);assert.deepEqual(twice.unsupported,[]);const originalTwice=normalized(await runPxtArcade(twice.ts));for(const name of names)assert.equal(originalTwice[name],expected[name],name+' in second PXT export');
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,50);check(run);
});

test('JSON text helper preserves standard escaping and non-finite values, and helper recognition validates the whole body',async()=>{
    const source=LEGACY_JSON_SOURCE+'\n'+LEGACY_PARSE_SOURCE+`\nlet escaped=__bwNamedJsonValue("a\\u0000\\f\\n\\\\\\\"😀")
let nonFinite=__bwNamedJsonValue([NaN,Infinity,-Infinity,undefined,-0])
let numeric=__bwNamedParseValue("007")
let blank=__bwNamedParseValue("")
let booleanNumber=__bwNamedParseValue(true)
let parsed=__bwNamedParseValue("[1,2]")
let json=__bwNamedJsonValue(parsed)`;
    const expected=await runPxtArcade(source);assert.equal(expected.escaped,JSON.stringify('a\0\f\n\\"😀'));assert.equal(expected.nonFinite,'[null,null,null,null,0]');
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:50,uploads:imported.costumes,storage:true});assert.deepEqual(run.errors,[]);
    const names=['escaped','nonFinite','numeric','blank','booleanNumber','json'];
    const check=run=>{for(const name of names)assert.equal(vars(run)[name],expected[name],name);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    check(run);
    check(await runProgram(run.creator.decompile(),{frames:50,uploads:imported.costumes,storage:true}));
    const exported=output(run);assert.deepEqual(exported.unsupported,[]);
    const exportedPxt=normalized(await runPxtArcade(exported.ts));for(const name of names)assert.equal(exportedPxt[name],expected[name],name+' in exported PXT');
    const reimported=arcadeToPseudocode(exported.ts);assert.deepEqual(reimported.unsupported,[]);
    check(await runProgram(reimported.code,{frames:50,uploads:reimported.costumes,storage:true}));
    await run.vm.loadProject(Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()));run.vm.greenFlag();await stepFrames(run.vm,50);check(run);
    const modified=arcadeToPseudocode(source.replace('if (value === "") return ""','if (value === "") return "changed"'));
    assert.ok(!modified.code.includes('parse array input'));
});

test('named operations evaluate their arguments once and distinguish includes from indexOf for NaN',async()=>{
    const code=`DEVICE ARCADE
GLOBAL calls
SPRITE Game:
DEFINE next:
  change calls by 1
  arcade return value (calls)
WHEN flag clicked:
  hide
  set calls to 0
  push (arcade call function "next" arguments ("[]")) to array "absent"
  set absentGet to item (arcade call function "next" arguments ("[]")) of array "absent"
  set item (arcade call function "next" arguments ("[]")) of array "absent" to (arcade call function "next" arguments ("[]"))
  new array "numbers" = [1,2,3]
  insert "9" at (arcade call function "next" arguments ("[]")) of array "numbers"
  remove item -1.9 of array "numbers"
  remove item 100 of array "numbers"
  set end to array "numbers" as text
  push (convert value ("NaN") op "+") to array "numbers"
  set found to (0 + 0)
  IF array "numbers" contains (convert value ("NaN") op "+") THEN:
    set found to (0 + 1)
  set nanIndex to index of (convert value ("NaN") op "+") in array "numbers"`;
    const check=run=>{const v=vars(run);assert.equal(v.calls,5);assert.equal(v.absentGet,'');assert.equal(v.end,'[1,2,3]');assert.equal(v.found,1);assert.equal(v.nanIndex,-1);assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);};
    const run=await runProgram(code,{frames:50,storage:true});check(run);
    const exported=output(run);assert.deepEqual(exported.unsupported,[]);const original=normalized(await runPxtArcade(exported.ts));assert.equal(original.calls,5);assert.equal(original.absentGet,'');assert.equal(original.end,'[1,2,3]');assert.equal(original.found,1);assert.equal(original.nanIndex,-1);
    const imported=arcadeToPseudocode(exported.ts);assert.deepEqual(imported.unsupported,[]);check(await runProgram(imported.code,{frames:70,uploads:imported.costumes,storage:true}));
});
