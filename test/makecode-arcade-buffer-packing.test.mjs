import {createArcadeRuntimeMock} from './helpers/arcade-runtime-mock.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {loadExtensionClass, VM_SRC} from './helpers/bw-extensions.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require=createRequire(import.meta.url);
const {PxtBuffer,fromHex,literal,pack,packedSize,MAX_BUFFER_FORMAT_CHARS,MAX_BUFFER_PACK_STEPS}=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const BWValues=require(path.join(VM_SRC,'util/bw-values.js'));
const fixture=()=>{const runtime=createArcadeRuntimeMock(),errors=[];runtime.on('BLOCKS_ERROR',error=>errors.push(error));return {runtime,errors,native:new(loadExtensionClass('arcade'))(runtime)};};

test('packing helper regeneration checks original parser and bounded repeat/result adaptations',()=>{
    execFileSync(process.execPath,['scripts/generate-arcade-buffer-helpers.mjs','--check'],{stdio:'pipe'});
});

test('packing formats, endian switches, repeated fields and missing/extra numbers match original MakeCode',async()=>{
    const cases=[['<BbHhIiLl',[255,-1,65535,-32768,4294967295,-2147483648,305419896,-12345]],['>BbHhIiLl',[255,-1,65535,-32768,4294967295,-2147483648,305419896,-12345]],['!fd',[1.5,-2.25]],['=fd',[1.5,-2.25]],['<2B2xH',[1,2,4660]],['>H H',[4660,22136]],['>H<H',[4660,22136]],['0B',[]],['3x',[]],['',[]],['<BB',[1]],['<B',[7,8,9]]];
    const original=await runPxtArcade('let trace = ""\n'+cases.map(([format,values],i)=>`let bytes${i} = Buffer.pack(${JSON.stringify(format)},${JSON.stringify(values)})\ntrace += Buffer.packedSize(${JSON.stringify(format)}) + ":" + bytes${i}.toHex() + ":" + bytes${i}.unpack(${JSON.stringify(format)}).join(",") + ";"`).join('\n'));
    const trace=cases.map(([format,values])=>{const bytes=pack(format,values);return packedSize(format)+':'+bytes.toHex()+':'+bytes.unpack(format).join(',')+';';}).join('');
    assert.equal(trace,original.trace);
    assert.equal(pack('B',[7]).isReadOnly(),false);
});

test('missing floating inputs retain original Chromium bytes and host NaN semantics',async()=>{
    // Typed-array conversion of undefined has engine-specific NaN payloads.
    // Run the actual retained facade in Chromium, matching the app and oracle;
    // do not replace the original algorithm with a particular host's bit pattern.
    const formats=['<BBf','>BBf','<BBd','>BBd'];
    const original=await runPxtArcade('let trace = ""\n'+formats.map((format,i)=>`let bytes${i}=Buffer.pack(${JSON.stringify(format)},[1])\ntrace += bytes${i}.toHex()+";"`).join('\n'));
    const sources=Object.fromEntries(['buffer','buffer-pxt','buffer-helpers-pxt','buffer-hash-pxt'].map(name=>[name,fs.readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/'+name+'.js',import.meta.url),'utf8')]));
    const browser=await chromium.launch();
    try {
        const page=await browser.newPage();
        const trace=await page.evaluate(({sources,formats})=>{
            const cache={};
            function load(name){
                name=name.replace(/^\.\//,'');
                if(!cache[name]){
                    const module={exports:{}};cache[name]=module;
                    new Function('module','exports','require',sources[name])(module,module.exports,load);
                }
                return cache[name].exports;
            }
            const {pack}=load('buffer');
            return formats.map(format=>pack(format,[1]).toHex()+';').join('');
        },{sources,formats});
        assert.equal(trace,original.trace);
    } finally {await browser.close();}
    for(const format of formats){
        const bytes=pack(format,[1]),decoded=bytes.unpack(format);
        assert.equal(bytes.length,packedSize(format));
        assert.equal(decoded[0],1);assert.equal(decoded[1],0);assert.ok(Number.isNaN(decoded[2]));
    }
});

test('packAt offsets, padding and readonly writes match original and unpack arrays detach',async()=>{
    const original=await runPxtArcade(`let mutable = Buffer.fromHex("aaaaaaaaaaaa")
mutable.packAt(1,">BxH",[7,4660])
let result = mutable.toHex()
let read = mutable.unpack(">BxH",1).join(",")
let fixed = hex\`aaaaaaaaaaaa\`
fixed.packAt(1,">BxH",[7,4660])
let fixedResult = fixed.toHex()
let negative = mutable.unpack("2B",-1).join(",")
let beyond = mutable.unpack("2B",99).join(",")
`);
    const mutable=fromHex('aaaaaaaaaaaa');mutable.packAt(1,'>BxH',[7,4660]);
    assert.equal(mutable.toHex(),original.result);assert.equal(mutable.unpack('>BxH',1).join(','),original.read);
    const fixed=literal('aaaaaaaaaaaa');fixed.packAt(1,'>BxH',[7,4660]);assert.equal(fixed.toHex(),original.fixedResult);
    assert.equal(mutable.unpack('2B',-1).join(','),original.negative);assert.equal(mutable.unpack('2B',99).join(','),original.beyond);
    const decoded=mutable.unpack('B');decoded[0]=0;assert.equal(mutable.getByte(0),170);
});

test('invalid format errors and work/size limits are explicit before unsafe loops or allocation',async()=>{
    assert.throws(()=>packedSize('@B'),/Unsupported format character: @/);
    await assert.rejects(runPxtArcade('let size = Buffer.packedSize("@B")'),/PANIC! Code 108/);
    assert.throws(()=>packedSize('2'),/Unsupported format character:/);
    assert.throws(()=>packedSize('9'.repeat(400)+'B'),/repeat exceeds work limit/);
    assert.throws(()=>packedSize('524288B524289B'),/packing exceeds work limit/);
    assert.throws(()=>packedSize('x'.repeat(MAX_BUFFER_FORMAT_CHARS+1)),/format exceeds input limit/);
    assert.throws(()=>pack('1048577x',[]),/allocation limit/);
    assert.equal(packedSize('1048577x'),1048577);
    assert.throws(()=>pack('B',new Array(MAX_BUFFER_PACK_STEPS+1)),/allocation limit/);
    assert.throws(()=>packedSize(123),/Expected buffer packing format text/);
});

test('native scoped packing arrays preserve detachments and reject expired or foreign references',()=>{
    const a=fixture(),b=fixture(),numbers=BWValues.arrayReference(a.runtime,[1,2,4660]);
    const bytes=a.native.bufferPack({ARRAY:numbers,FORMAT:'<2BH'});assert.equal(a.native.bufferToHex({BUFFER:bytes}),'01023412');
    BWValues.arrayValue(a.runtime,numbers)[0]=9;assert.equal(a.native.bufferToHex({BUFFER:bytes}),'01023412');
    const decoded=a.native.bufferUnpack({BUFFER:bytes,FORMAT:'<2BH',OFFSET:0});
    assert.deepEqual(BWValues.arrayValue(a.runtime,decoded),[1,2,4660]);
    BWValues.arrayValue(a.runtime,decoded)[0]=8;assert.equal(a.native.bufferToHex({BUFFER:bytes}),'01023412');
    a.native.bufferPackAt({BUFFER:bytes,ARRAY:numbers,FORMAT:'B',OFFSET:1});assert.equal(a.native.bufferToHex({BUFFER:bytes}),'01093412');
    assert.equal(b.native.bufferPack({ARRAY:numbers,FORMAT:'B'}),BWValues.UNDEFINED);
    assert.equal(a.native.bufferUnpack({BUFFER:bytes,FORMAT:'@B',OFFSET:0}),BWValues.UNDEFINED);
    a.runtime.emit('PROJECT_START');assert.equal(a.native.bufferPack({ARRAY:numbers,FORMAT:'B'}),BWValues.UNDEFINED);
    assert.equal(a.native.bufferUnpack({BUFFER:bytes,FORMAT:'B',OFFSET:0}),BWValues.UNDEFINED);
    assert.equal(a.errors.length,3);assert.equal(b.errors.length,1);
});

test('packing authoring and numeric custom returns survive Code/Blocks, original export and fresh SB3',async()=>{
    try {
        const code=`SPRITE Game:
DEFINE decode:
  arcade return value (arcade unpack byte buffer bytes format "<2BH" at 0)
DEFINE width:
  arcade return value (arcade byte buffer packed format ">BxH" size)
WHEN flag clicked:
  set numbers to (new array reference from "[1,2,4660]")
  set format to "<2BH"
  set bytes to (arcade pack number array numbers as byte buffer format (format))
  set packedHex to (arcade byte buffer bytes to hex)
  set decoded to (arcade call function "decode" arguments ("[]"))
  set first to (item 0 of array reference decoded)
  set last to (item 2 of array reference decoded)
  set packedWidth to (arcade call function "width" arguments ("[]"))
  set writable to (arcade byte buffer bytes is read only)
  set destination to (arcade byte buffer from hex text "aaaaaaaaaaaa")
  set replacement to (new array reference from "[7,4660]")
  arcade pack number array replacement into byte buffer destination at 1 format ">BxH"
  set writtenHex to (arcade byte buffer destination to hex)
`;
        const expected={packedHex:'01023412',first:1,last:4660,packedWidth:4,writable:false,writtenHex:'aa07aa1234aa'};
        const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));for(const [name,value]of Object.entries(expected))assert.equal(values[name],value,name);};
        const run=await runProgram(code,{frames:50,storage:true});check(run);
        for(const opcode of ['arcade_bufferPackedSize','arcade_bufferPack','arcade_bufferUnpack','arcade_bufferPackAt'])assert.ok(run.creator.project.targets.some(t=>Object.values(t.blocks).some(b=>b.opcode===opcode)),opcode);
        check(await runProgram(run.creator.decompile(),{frames:50,storage:true}));
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.ts,/number\[\]/);assert.match(exported.ts,/Buffer\.packedSize\(/);assert.match(exported.ts,/Buffer\.pack\(/);assert.match(exported.ts,/\.packAt\(/);assert.match(exported.ts,/\.unpack\(/);
        const original=await runPxtArcade(exported.files);for(const [name,value]of Object.entries(expected))assert.equal(original['Game_'+name],value,name);
        const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        const fresh=await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n',{frames:0,storage:true});await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,50);check(fresh);
    } finally {clearStrayTimers();}
});
