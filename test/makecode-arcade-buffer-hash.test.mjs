import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {loadExtensionClass,VM_SRC} from './helpers/bw-extensions.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require=createRequire(import.meta.url);
const BWValues=require(path.join(VM_SRC,'util/bw-values.js'));
const {fromHex,literal}=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');

 test('retained FNV-1 and bit folding match original simulator across byte and signed-width boundaries',async()=>{
    execFileSync(process.execPath,['scripts/generate-arcade-buffers.mjs','--check'],{stdio:'pipe'});
    const texts=['','00','ff','01020304','68656c6c6f','0001027f80feff'];
    const widths=[-2147483648,-1,0,1,2,8,16,17,24,31,32,33,2147483647,2147483648,4294967297,1.9,31.9];
    const source='let trace = ""\n'+texts.map((text,i)=>`let bytes${i}=Buffer.fromHex(${JSON.stringify(text)})\nfor(let width of ${JSON.stringify(widths)}) trace += bytes${i}.hash(width)+","`).join('\n');
    const original=await runPxtArcade(source);
    assert.equal(texts.flatMap(text=>widths.map(width=>fromHex(text).hash(width))).join(',')+',',original.trace);
    assert.equal(fromHex('').hash(32),2166136261);
    assert.equal(fromHex('ff').hash(NaN),0);assert.equal(fromHex('ff').hash(Infinity),0);
    for(const text of texts){const bytes=fromHex(text),before=bytes.toHex();bytes.hash(17);assert.equal(bytes.toHex(),before);assert.equal(bytes.hash(32),literal(text).hash(32));}
});

 test('native hash reads shared mutation and explicitly refuses stale or foreign references',()=>{
    const make=()=>{const runtime=createArcadeRuntimeMock(),errors=[];runtime.on('BLOCKS_ERROR',e=>errors.push(e));return {runtime,errors,native:new(loadExtensionClass('arcade'))(runtime)};};
    const a=make(),b=make(),bytes=a.native.bufferFromHex({HEX:'01020304'});
    const original=fromHex('01020304');assert.equal(a.native.bufferHash({BUFFER:bytes,BITS:32}),original.hash(32));
    a.native.bufferSetByte({BUFFER:bytes,OFFSET:0,VALUE:99});original.setByte(0,99);
    assert.equal(a.native.bufferHash({BUFFER:bytes,BITS:17}),original.hash(17));
    const invalid=b.native.bufferHash({BUFFER:bytes,BITS:32});assert.equal(invalid,BWValues.UNDEFINED);
    a.runtime.emit('PROJECT_START');const expired=a.native.bufferHash({BUFFER:bytes,BITS:32});assert.equal(expired,BWValues.UNDEFINED);
    assert.equal(a.errors.length,1);assert.equal(b.errors.length,1);
});

 test('native hash numeric custom returns and dynamic widths survive Code, typed original export and fresh SB3',async()=>{
    try {
        const code=`SPRITE Game:
DEFINE digest:
  arcade return value (arcade byte buffer bytes hash 32 bits)
WHEN flag clicked:
  set bytes to (arcade byte buffer from hex text "68656c6c6f")
  set fullDigest to (arcade call function "digest" arguments ("[]"))
  set bitCount to 17
  set shortDigest to (arcade byte buffer bytes hash (bitCount) bits)
  set alias to bytes
  arcade set byte buffer alias byte at 0 to 72
  set changedDigest to (arcade byte buffer bytes hash 32 bits)
  set changedHex to (arcade byte buffer bytes to hex)
`;
        const bytes=fromHex('68656c6c6f');const expected={fullDigest:bytes.hash(32),shortDigest:bytes.hash(17),changedHex:'48656c6c6f'};bytes.setByte(0,72);expected.changedDigest=bytes.hash(32);
        const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));for(const [name,value]of Object.entries(expected))assert.equal(values[name],value,name);};
        const run=await runProgram(code,{frames:50,storage:true});check(run);
        check(await runProgram(run.creator.decompile(),{frames:50,storage:true}));
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);assert.match(exported.ts,/\.hash\(/);assert.match(exported.ts,/let Game_bytes: Buffer/);assert.match(exported.ts,/function .*digest\s*\(\): number/);
        const original=await runPxtArcade(exported.files);for(const [name,value]of Object.entries(expected))assert.equal(original['Game_'+name],value,name);
        const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());const fresh=await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n',{frames:0,storage:true});await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,50);check(fresh);
    }finally{clearStrayTimers();}
});
