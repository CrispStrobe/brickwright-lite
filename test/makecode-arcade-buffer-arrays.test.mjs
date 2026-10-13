import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {loadExtensionClass, VM_SRC} from './helpers/bw-extensions.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
const require = createRequire(import.meta.url);
const {PxtBuffer, NumberFormat, MAX_BUFFER_BYTES, fromHex, fromArray, concatArrays, literal} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const BWValues = require(path.join(VM_SRC,'util/bw-values.js'));
const formats = Object.keys(NumberFormat).filter(name=>!/^\d+$/.test(name));
const fixture = () => {
    const runtime=new EventEmitter(), errors=[];runtime.startHats=()=>[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));
    return {runtime, errors, native:new (loadExtensionClass('arcade'))(runtime)};
};

test('Buffer array algorithms regenerate exactly with checked byte-write adaptation', () => {
    execFileSync(process.execPath,['scripts/generate-arcade-buffer-helpers.mjs','--check'],{stdio:'pipe'});
});

test('number-array construction and all16 decoding formats match executed original MakeCode', async () => {
    const hex='0000803f000000400000404000008040ff';
    const source=`let input = [1,2,3,-1,256,257,-257,1.75]\nlet bytes = Buffer.fromArray(input)\nlet initial = bytes.toHex()\ninput[0] = 7\nbytes[1] = 9\nlet detached = input[1] + ":" + bytes.toHex()\nlet trace = ""\n` + formats.map(name=>`trace += hex\`${hex}\`.toArray(NumberFormat.${name}).join(",") + ";"`).join('\n');
    const original=await runPxtArcade(source);
    const input=[1,2,3,-1,256,257,-257,1.75], bytes=fromArray(input);
    assert.equal(bytes.toHex(),original.initial);
    input[0]=7;bytes.setByte(1,9);
    assert.equal(input[1]+':'+bytes.toHex(),original.detached);
    assert.equal(formats.map(name=>fromHex(hex).toArray(name).join(',')+';').join(''),original.trace);
    for(const name of formats)assert.deepEqual(fromHex(hex).toArray(name),fromHex(hex).toArray(NumberFormat[name]));
    assert.equal(fromArray([]).length,0);
    assert.equal(fromArray([NaN,Infinity,-Infinity,-0]).toHex(),'00000000');
});

test('static Buffer-array concat matches original detached mutable output and bounded allocation', async () => {
    const source=`let left = hex\`0102\`\nlet right = Buffer.fromHex("aabb")\nlet joined = Buffer.concat([left,right,left])\nlet readonly = joined.isReadOnly()\nright[0] = 99\njoined[0] = 88\nlet result = joined.toHex() + ":" + left.toHex() + ":" + right.toHex()\nlet empty = Buffer.concat([]).length`;
    const original=await runPxtArcade(source);
    const left=literal('0102'),right=fromHex('aabb'),joined=concatArrays([left,right,left]);
    assert.equal(joined.isReadOnly(),original.readonly);
    right.setByte(0,99);joined.setByte(0,88);
    assert.equal(joined.toHex()+':'+left.toHex()+':'+right.toHex(),original.result);
    assert.equal(concatArrays([]).length,original.empty);
    assert.notEqual(concatArrays([right]),right);
    assert.throws(()=>concatArrays([new PxtBuffer(MAX_BUFFER_BYTES),new PxtBuffer(1)]),/allocation limit/);
    assert.throws(()=>fromArray(new Array(MAX_BUFFER_BYTES+1)),/allocation limit/);
    assert.throws(()=>concatArrays([{}]),/Buffer array/);
});

test('native number-array and Buffer-array bridge preserves detachment and rejects stale or foreign references', () => {
    const a=fixture(), b=fixture(), source=BWValues.arrayReference(a.runtime,[1,2,255]);
    const buffer=a.native.bufferFromArray({ARRAY:source});
    BWValues.arrayValue(a.runtime,source)[0]=77;
    assert.equal(a.native.bufferToHex({BUFFER:buffer}),'0102ff');
    const decoded=a.native.bufferToArray({BUFFER:buffer,FORMAT:'UInt8LE'});
    BWValues.arrayValue(a.runtime,decoded)[0]=99;
    assert.equal(a.native.bufferToHex({BUFFER:buffer}),'0102ff');
    const inputs=BWValues.arrayReference(a.runtime,[buffer,buffer]);
    const joined=a.native.bufferConcatArray({ARRAY:inputs});
    a.native.bufferSetByte({BUFFER:buffer,OFFSET:0,VALUE:88});
    assert.equal(a.native.bufferToHex({BUFFER:joined}),'0102ff0102ff');
    assert.equal(b.native.bufferFromArray({ARRAY:source}),BWValues.UNDEFINED);
    assert.equal(b.errors.length,1);
    a.runtime.emit('PROJECT_START');
    assert.equal(a.native.bufferFromArray({ARRAY:source}),BWValues.UNDEFINED);
    assert.equal(a.native.bufferConcatArray({ARRAY:inputs}),BWValues.UNDEFINED);
    assert.equal(a.native.bufferToArray({BUFFER:buffer,FORMAT:'UInt8LE'}),BWValues.UNDEFINED);
    assert.equal(a.errors.length,3);
    assert.ok([...a.errors,...b.errors].every(error=>/not available/.test(error)));
});

test('invalid decode formats and oversized arrays are refused before unsafe loops or copies', () => {
    for(const format of [0,-1,17,99,2.5,'not-a-format'])assert.throws(()=>fromHex('0102').toArray(format),/number format/);
    const f=fixture(),buffer=f.native.bufferFromHex({HEX:'0102'});
    assert.equal(f.native.bufferToArray({BUFFER:buffer,FORMAT:0}),BWValues.UNDEFINED);
    const source=new Array(MAX_BUFFER_BYTES+1);source.map=()=>{throw new Error('copy started before bounds check');};
    const ref=BWValues.arrayReference(f.runtime,source);
    assert.equal(f.native.bufferFromArray({ARRAY:ref}),BWValues.UNDEFINED);
    assert.equal(f.native.bufferConcatArray({ARRAY:ref}),BWValues.UNDEFINED);
    assert.equal(f.native.bufferFromArray({ARRAY:'[1,2]'}),BWValues.UNDEFINED);
    assert.equal(f.errors.length,4);
    assert.ok(f.errors.every(error=>!error.includes('copy started')));
});

const CODE=`SPRITE Game:
DEFINE decode:
  arcade return value (arcade byte buffer bytes to number array format UInt16BE)
WHEN flag clicked:
  set source to (new array reference from "[1,2,3,255]")
  set bytes to (arcade byte buffer from number array source)
  mutate array reference source op "set" index 0 value (convert value (7) op "+")
  arcade set byte buffer bytes byte at 0 to 9
  set decoded to (arcade call function "decode" arguments ("[]"))
  set first to (item 0 of array reference decoded)
  set second to (item 1 of array reference decoded)
  mutate array reference decoded op "set" index 0 value (convert value (77) op "+")
  set editedFirst to (item 0 of array reference decoded)
  set sourceFirst to (item 0 of array reference source)
  set fixed to (arcade byte buffer literal hex "abcd")
  set buffers to (new array reference from (array value fixed rest (array value bytes rest (array value fixed rest "[]"))))
  set joined to (arcade concatenate byte buffers in array buffers)
  set joinedReadonly to (arcade byte buffer joined is read only)
  arcade set byte buffer bytes byte at 0 to 88
  set joinedHex to (arcade byte buffer joined to hex)
  set inputHex to (arcade byte buffer bytes to hex)
  set empty to (arcade concatenate byte buffers in array (new array reference from "[]"))
  set emptyLength to (arcade byte buffer empty length)
`;

test('array bridge survives numeric function returns, Code/Blocks, typed original export and fresh SB3', async () => {
    try {
        const expected={first:2306,second:1023,editedFirst:77,sourceFirst:7,joinedReadonly:false,joinedHex:'abcd090203ffabcd',inputHex:'580203ff',emptyLength:0};
        const check=run=>{
            assert.deepEqual(run.creator.warnings,[]);assert.deepEqual(run.errors,[]);
            const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
            for(const [name,value]of Object.entries(expected))assert.equal(values[name],value,name);
        };
        const run=await runProgram(CODE,{frames:60,storage:true});check(run);
        const blocks=run.creator.project.targets.flatMap(target=>Object.values(target.blocks));
        assert.equal(blocks.filter(block=>block.opcode==='arrays_mutateReference').length,2);
        for(const opcode of ['arcade_bufferFromArray','arcade_bufferToArray','arcade_bufferConcatArray'])
            assert.ok(blocks.some(block=>block.opcode===opcode),opcode);
        check(await runProgram(run.creator.decompile(),{frames:60,storage:true}));
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.ts,/number\[\]/);assert.match(exported.ts,/Buffer\[\]/);
        assert.match(exported.ts,/Buffer\.fromArray\(/);assert.match(exported.ts,/Buffer\.concat\(/);
        assert.match(exported.ts,/\.toArray\(NumberFormat\.UInt16BE\)/);
        const original=await runPxtArcade(exported.files);
        for(const [name,value]of Object.entries(expected))assert.equal(original['Game_'+name],value,name);
        const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        const fresh=await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n',{frames:0,storage:true});
        await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,60);check(fresh);
    } finally {clearStrayTimers();}
});
