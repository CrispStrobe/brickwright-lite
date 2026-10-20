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
const require = createRequire(import.meta.url);
const BWValues = require(path.join(VM_SRC,'util/bw-values.js'));
const {PxtBuffer, fromBase64, fromHex, literal, MAX_BUFFER_BYTES} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const fixture = () => {
    const runtime = createArcadeRuntimeMock(), errors = [];
    runtime.on('BLOCKS_ERROR', error => errors.push(error));
    return {runtime, errors, native: new (loadExtensionClass('arcade'))(runtime)};
};

test('Base64 generator retains original algorithms and all indexed adaptation boundaries', () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-buffer-helpers.mjs','--check'], {stdio:'pipe'});
});

test('Base64 byte tails, incomplete groups, internal padding and URL-safe input match executed MakeCode', async () => {
    const inputs = ['', 'AA', 'AAA', 'AAAA', 'AQ==', 'AQI=', 'AQID', 'AQ', 'AQI', 'AQIDBA', 'AQIDBA==', 'AAA=AAAA', '-_8=', '1234'];
    const hexes = ['', '00', '0001', '000102', '00010203', 'ffffffff', 'fbff'];
    const source = 'let decoded = ""\nlet encoded = ""\n' +
        inputs.map(text => `decoded += Buffer.fromBase64(${JSON.stringify(text)}).toHex() + ";"`).join('\n') + '\n' +
        hexes.map(hex => `encoded += hex\`${hex}\`.toBase64() + ";"`).join('\n');
    const original = await runPxtArcade(source);
    assert.equal(inputs.map(text => fromBase64(text).toHex()+';').join(''), original.decoded);
    assert.equal(hexes.map(hex => literal(hex).toBase64()+';').join(''), original.encoded);
    // PXT String_.charAt returns "" outside the string, whose alphabet index
    // is zero. A standard Node/browser decoder would silently disagree here.
    assert.equal(fromBase64('AQ').toHex(), '010000');
    const bytes = fromBase64('AQID'); assert.equal(bytes.isReadOnly(), false);
    bytes.setByte(0,9); assert.equal(bytes.toBase64(),'CQID');
    const fixed = literal('010203'); assert.equal(fixed.toBase64(),'AQID');
    assert.equal(fixed.isReadOnly(),true); assert.equal(fixed.toHex(),'010203');
});

test('malformed Base64 fails in both original MakeCode and native bounded construction', async () => {
    for (const input of ['AQIDBA=', 'AA=A', 'AA==AAAA', '!AAA']) {
        assert.throws(() => fromBase64(input), error => String(error).includes('Invalid Base64'), input);
        await assert.rejects(runPxtArcade(`let result = Buffer.fromBase64(${JSON.stringify(input)}).toHex()`), /Invalid Base64/, input);
    }
    assert.throws(() => fromBase64(1234), /Expected Base64 text/);
    assert.throws(() => fromBase64('A'.repeat(MAX_BUFFER_BYTES*4+1)), /allocation limit/);
    // Valid groups can produce only two bytes when their fourth character is
    // padding; a 3/4 upper-bound guard would reject this valid boundary case.
    assert.equal(fromBase64('AAA='.repeat(MAX_BUFFER_BYTES/2)).length, MAX_BUFFER_BYTES);
    assert.throws(() => fromBase64('AAAA'.repeat(Math.ceil((MAX_BUFFER_BYTES+1)/3))), /allocation limit/);
    assert.equal(new PxtBuffer(0).toBase64(),'');
});

test('native Base64 handles aliases and numeric text while refusing foreign, stale and invalid references', () => {
    const a=fixture(), b=fixture(), bytes=a.native.bufferFromBase64({TEXT:'1234'});
    assert.equal(a.native.bufferToBase64({BUFFER:bytes}),'1234');
    const alias=bytes; a.native.bufferSetByte({BUFFER:alias,OFFSET:0,VALUE:9});
    assert.equal(a.native.bufferToHex({BUFFER:bytes}),'096df8');
    assert.equal(b.native.bufferToBase64({BUFFER:bytes}), BWValues.UNDEFINED);
    a.native.bufferFromBase64({TEXT:'!AAA'}); a.native.bufferFromBase64({TEXT:1234});
    a.runtime.emit('PROJECT_START'); a.native.bufferToBase64({BUFFER:bytes});
    assert.equal(a.errors.length,3); assert.equal(b.errors.length,1);
    assert.ok(a.errors.some(error=>error.includes('Invalid Base64')));
    assert.ok(a.errors.some(error=>error.includes('Expected Base64 text')));
    assert.ok([...a.errors,...b.errors].some(error=>error.includes('not available')));
});

test('Base64 native Code and blocks roundtrip through typed export, original execution and a fresh SB3', async () => {
    try {
        const code = `SPRITE Game:
DEFINE encode:
  arcade return value (arcade byte buffer bytes to Base64 text)
WHEN flag clicked:
  set input to "1234"
  set bytes to (arcade byte buffer from Base64 text (input))
  set alias to bytes
  arcade set byte buffer alias byte at 0 to 9
  set encoded to (arcade call function "encode" arguments ("[]"))
  set outputHex to (arcade byte buffer bytes to hex)
  set incomplete to (arcade byte buffer from Base64 text "AQ")
  set incompleteHex to (arcade byte buffer incomplete to hex)
  set fixed to (arcade byte buffer literal hex "fbff")
  set fixedEncoded to (arcade byte buffer fixed to Base64 text)
  set readonly to (arcade byte buffer fixed is read only)
  set empty to (arcade byte buffer from Base64 text "")
  set emptyLength to (arcade byte buffer empty length)
`;
        const expected={encoded:'CW34',outputHex:'096df8',incompleteHex:'010000',fixedEncoded:'+/8=',readonly:true,emptyLength:0};
        const check=run=>{
            assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
            const values=Object.fromEntries(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).map(value=>[value.name.replace(/^Game_/,''),value.value]));
            for(const [name,value] of Object.entries(expected))assert.equal(values[name],value,name);
        };
        const run=await runProgram(code,{frames:50,storage:true});check(run);
        const blocks=run.creator.project.targets.flatMap(target=>Object.values(target.blocks));
        for(const opcode of ['arcade_bufferFromBase64','arcade_bufferToBase64'])assert.ok(blocks.some(block=>block.opcode===opcode),opcode);
        check(await runProgram(run.creator.decompile(),{frames:50,storage:true}));
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));assert.deepEqual(exported.unsupported,[]);
        assert.match(exported.ts,/Buffer\.fromBase64\(/);assert.match(exported.ts,/\.toBase64\(/);assert.match(exported.ts,/: Buffer/);
        const original=await runPxtArcade(exported.files);
        for(const [name,value] of Object.entries(expected))assert.equal(original['Game_'+name],value,name);
        const archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        const fresh=await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n',{frames:0,storage:true});
        await fresh.vm.loadProject(archive);fresh.vm.greenFlag();await stepFrames(fresh.vm,50);check(fresh);
    } finally {clearStrayTimers();}
});
