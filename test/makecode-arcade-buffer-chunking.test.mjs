import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {loadExtensionClass, VM_SRC} from './helpers/bw-extensions.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require=createRequire(import.meta.url);
const {PxtBuffer, MAX_BUFFER_BYTES, MAX_BUFFER_CHUNKS, fromHex, literal, chunkedFromUTF8}=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const BWValues=require(path.join(VM_SRC,'util/bw-values.js'));
const fixture=()=>{
    const runtime=createArcadeRuntimeMock(),errors=[];
    runtime.on('BLOCKS_ERROR',error=>errors.push(error));
    return {runtime,errors,native:new (loadExtensionClass('arcade'))(runtime)};
};
const show=(chunks,source)=>chunks.map(chunk=>`${chunk.toHex()}:${chunk.isReadOnly()}:${chunk===source};`).join('');

test('chunk helpers regenerate from original source with checked division and allocation boundaries',()=>{
    execFileSync(process.execPath,['scripts/generate-arcade-buffer-helpers.mjs','--check'],{stdio:'pipe'});
});

test('byte chunking matches original fractional slices, readonly single-chunk identity and detached copies',async()=>{
    const sizes=[1,2,3,5,6,1.5,0.5];
    const source=`function show(chunks: Buffer[], source: Buffer): string {
let result = ""
for (let chunk of chunks) result += chunk.toHex() + ":" + chunk.isReadOnly() + ":" + (chunk === source) + ";"
return result
}
let fixed = hex\`0102030405\`
let trace = ""
`+sizes.map(size=>`trace += show(fixed.chunked(${size}),fixed) + "|"`).join('\n')+`
let empty = hex\`\`
let emptyTrace = show(empty.chunked(0),empty) + "|" + show(empty.chunked(-1),empty)
let mutable = Buffer.fromHex("0102030405")
let alias = mutable.chunked(20)[0]
alias[0] = 9
let aliasTrace = mutable.toHex() + ":" + (alias === mutable)
let parts = mutable.chunked(2)
parts[0][0] = 7
let copyTrace = mutable.toHex() + ":" + Buffer.concat(parts).toHex()
`;
    const original=await runPxtArcade(source);
    const fixed=literal('0102030405');
    assert.equal(sizes.map(size=>show(fixed.chunked(size),fixed)+'|').join(''),original.trace);
    const empty=literal('');assert.equal(show(empty.chunked(0),empty)+'|'+show(empty.chunked(-1),empty),original.emptyTrace);
    const mutable=fromHex('0102030405'),alias=mutable.chunked(20)[0];alias.setByte(0,9);
    assert.equal(mutable.toHex()+':'+(alias===mutable),original.aliasTrace);
    const parts=mutable.chunked(2);parts[0].setByte(0,7);
    assert.equal(mutable.toHex()+':'+parts.map(part=>part.toHex()).join(''),original.copyTrace);
    assert.equal(fixed.chunked(Infinity)[0],fixed);
    assert.deepEqual(empty.chunked(NaN),[]);
});

test('UTF8 chunk boundaries and surrogate splitting match executed original MakeCode',async()=>{
    const texts=['','ABCDEF','A€🙂B','🙂🙂','\ud800X\udc00','\ufeff\0€'];
    const sizes=[3,4,5,6,7,3.5];
    const source=`let trace = ""\n`+texts.flatMap(text=>sizes.map(size=>`for (let chunk of Buffer.chunkedFromUTF8(${JSON.stringify(text)},${size})) trace += chunk.toHex() + ":" + chunk.isReadOnly() + ";"\ntrace += "|"`)).join('\n');
    const original=await runPxtArcade(source);
    const trace=texts.flatMap(text=>sizes.map(size=>chunkedFromUTF8(text,size).map(chunk=>chunk.toHex()+':'+chunk.isReadOnly()+';').join('')+'|')).join('');
    assert.equal(trace,original.trace);
    assert.deepEqual(chunkedFromUTF8('',3),[]);
    assert.deepEqual(chunkedFromUTF8('',NaN),[]);
    assert.equal(chunkedFromUTF8('ABC',Infinity)[0].toHex(),'414243');
});

test('chunk collections are limited before another output allocation and nonprogressing sizes are refused',()=>{
    for(const size of [0,-1,-Infinity,NaN])assert.throws(()=>fromHex('01').chunked(size),/must make progress/);
    for(const size of [NaN,undefined])assert.throws(()=>chunkedFromUTF8('A',size),/must make progress/);
    assert.throws(()=>chunkedFromUTF8('A',2),error=>String(error).includes('Oops'));
    assert.throws(()=>chunkedFromUTF8(123,3),/Expected UTF8 text/);
    assert.throws(()=>chunkedFromUTF8('A'.repeat(MAX_BUFFER_BYTES+1),3),/input allocation limit/);
    const originalSlice=PxtBuffer.prototype.slice;let copies=0;
    PxtBuffer.prototype.slice=function(...args){copies++;return originalSlice.apply(this,args);};
    try {
        assert.throws(()=>new PxtBuffer(MAX_BUFFER_CHUNKS+1).chunked(1),/chunk collection exceeds allocation limit/);
        assert.equal(copies,MAX_BUFFER_CHUNKS);
    } finally {PxtBuffer.prototype.slice=originalSlice;}
    assert.throws(()=>chunkedFromUTF8('A'.repeat(3*(MAX_BUFFER_CHUNKS+1)),3),/chunk collection exceeds allocation limit/);
});

test('native scoped Buffer arrays retain single-chunk aliases, readonly flags and copy isolation',()=>{
    const a=fixture(),b=fixture(),bytes=a.native.bufferFromHex({HEX:'0102030405'});
    const singleton=a.native.bufferChunked({BUFFER:bytes,SIZE:20});
    const alias=BWValues.arrayValue(a.runtime,singleton)[0];assert.equal(alias,bytes);
    a.native.bufferSetByte({BUFFER:alias,OFFSET:0,VALUE:9});assert.equal(a.native.bufferToHex({BUFFER:bytes}),'0902030405');
    const split=a.native.bufferChunked({BUFFER:bytes,SIZE:2}),first=BWValues.arrayValue(a.runtime,split)[0];
    a.native.bufferSetByte({BUFFER:first,OFFSET:0,VALUE:7});assert.equal(a.native.bufferToHex({BUFFER:bytes}),'0902030405');
    const fixed=a.native.bufferLiteral({HEX:'0102'}),fixedSingle=a.native.bufferChunked({BUFFER:fixed,SIZE:2});
    assert.equal(BWValues.arrayValue(a.runtime,fixedSingle)[0],fixed);
    assert.equal(a.native.bufferIsReadOnly({BUFFER:fixed}),true);
    const fixedParts=a.native.bufferChunked({BUFFER:fixed,SIZE:1});
    assert.equal(a.native.bufferIsReadOnly({BUFFER:BWValues.arrayValue(a.runtime,fixedParts)[0]}),false);
    const utf=a.native.bufferChunkedFromUTF8({TEXT:'1234',SIZE:3});
    assert.deepEqual(BWValues.arrayValue(a.runtime,utf).map(ref=>a.native.bufferToHex({BUFFER:ref})),['313233','34']);
    assert.equal(b.native.bufferChunked({BUFFER:bytes,SIZE:2}),BWValues.UNDEFINED);
    assert.equal(a.native.bufferChunked({BUFFER:bytes,SIZE:0}),BWValues.UNDEFINED);
    a.runtime.emit('PROJECT_START');
    assert.equal(a.native.bufferChunked({BUFFER:bytes,SIZE:2}),BWValues.UNDEFINED);
    assert.equal(a.native.bufferConcatArray({ARRAY:split}),BWValues.UNDEFINED);
    assert.equal(a.errors.length,3);assert.equal(b.errors.length,1);
});

test('chunking native Code and Buffer[] custom returns survive typed MakeCode export and fresh SB3',async()=>{
    try {
        const code=`SPRITE Game:
DEFINE split:
  arcade return value (arcade byte buffer bytes chunks of at most 2 bytes)
DEFINE splitText:
  arcade return value (arcade UTF8 text (input) byte buffer chunks of at most 3 bytes)
WHEN flag clicked:
  set bytes to (arcade byte buffer from hex text "0102030405")
  set single to (arcade byte buffer bytes chunks of at most 20 bytes)
  set alias to (item 0 of array reference single)
  arcade set byte buffer alias byte at 0 to 9
  set aliasHex to (arcade byte buffer bytes to hex)
  set parts to (arcade call function "split" arguments ("[]"))
  set first to (item 0 of array reference parts)
  arcade set byte buffer first byte at 0 to 7
  set sourceHex to (arcade byte buffer bytes to hex)
  set joined to (arcade concatenate byte buffers in array parts)
  set joinedHex to (arcade byte buffer joined to hex)
  set input to "1234"
  set textParts to (arcade call function "splitText" arguments ("[]"))
  set textFirst to (item 0 of array reference textParts)
  set textFirstHex to (arcade byte buffer textFirst to hex)
  set textJoined to (arcade concatenate byte buffers in array textParts)
  set textJoinedHex to (arcade byte buffer textJoined to hex)
  set unicode to (arcade UTF8 text "A€🙂B" byte buffer chunks of at most 3 bytes)
  set unicodeJoined to (arcade concatenate byte buffers in array unicode)
  set unicodeHex to (arcade byte buffer unicodeJoined to hex)
`;
        const expected={aliasHex:'0902030405',sourceHex:'0902030405',joinedHex:'0702030405',textFirstHex:'313233',textJoinedHex:'31323334',unicodeHex:'41e282acefbfbdefbfbd42'};
        const check=run=>{
            assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
            const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(value=>[value.name.replace(/^Game_/,''),value.value]));
            for(const [name,value] of Object.entries(expected))assert.equal(values[name],value,name);
        };
        const run=await runProgram(code,{frames:60,storage:true});check(run);
        const blocks=run.creator.project.targets.flatMap(target=>Object.values(target.blocks));
        for(const opcode of ['arcade_bufferChunked','arcade_bufferChunkedFromUTF8'])assert.ok(blocks.some(block=>block.opcode===opcode),opcode);
        check(await runProgram(run.creator.decompile(),{frames:60,storage:true}));
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.ts,/Buffer\[\]/);assert.match(exported.ts,/\.chunked\(/);assert.match(exported.ts,/Buffer\.chunkedFromUTF8\(/);
        const original=await runPxtArcade(exported.files);
        for(const [name,value] of Object.entries(expected))assert.equal(original['Game_'+name],value,name);
        const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        const fresh=await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n',{frames:0,storage:true});
        await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,60);check(fresh);
    } finally {clearStrayTimers();}
});
