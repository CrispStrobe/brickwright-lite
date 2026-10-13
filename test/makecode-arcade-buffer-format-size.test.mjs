import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require = createRequire(import.meta.url);
const {NumberFormat, sizeOfNumberFormat} = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js');
const formats = Object.keys(NumberFormat).filter(key => !/^\d+$/.test(key));
const sizes = [1,1,2,2,4,1,1,2,2,4,4,4,4,8,4,8];

test('extracted original format-size function matches all formats and invalid numeric values', async () => {
    execFileSync(process.execPath, ['scripts/generate-arcade-buffer-helpers.mjs', '--check'], {stdio:'pipe'});
    const expected = [0,0,...sizes,0];
    const original = await runPxtArcade(`let observed = ""
for (let i = -1; i <= 17; i++) { observed = observed + Buffer.sizeOfNumberFormat(i) + "," }`, {waitForGlobals:{observed:expected.join(',') + ','}});
    assert.equal(original.observed, expected.join(',') + ',');
    for (let i = -1; i <= 17; i++) assert.equal(sizeOfNumberFormat(i), expected[i+1], String(i));
    const runtime = new EventEmitter(), errors = []; runtime.startHats = () => [];
    runtime.on('BLOCKS_ERROR', e => errors.push(e));
    const native = new (loadExtensionClass('arcade'))(runtime);
    formats.forEach((name,i) => {
        assert.equal(sizeOfNumberFormat(name), sizes[i], name);
        assert.equal(native.bufferFormatSize({FORMAT:name}), sizes[i], name);
    });
    assert.equal(native.bufferFormatSize({FORMAT:99}), 0);
    assert.equal(native.bufferFormatSize({FORMAT:2.5}), 0);
    assert.deepEqual(errors, []);
});

test('format-size native authoring retains numeric values through Code, export and fresh SB3', async () => {
    try {
        const source = `SPRITE Game:
DEFINE width:
  arcade return value (arcade byte buffer number format Float64BE size)
WHEN flag clicked:
  set customSize to (arcade call function "width" arguments ("[]"))
` + formats.map((name,i) =>
            `  set size${i} to (arcade byte buffer number format ${name} size)`).join('\n') + `
  set format to 14
  set dynamicSize to (arcade byte buffer number format (format) size)
  set format to 99
  set invalidSize to (arcade byte buffer number format (format) size)
  set literalInvalidSize to (arcade byte buffer number format 99 size)
`;
        const expected = Object.fromEntries(sizes.map((size,i) => ['size'+i,size]));
        Object.assign(expected, {dynamicSize:8, invalidSize:0, literalInvalidSize:0, customSize:8});
        const check = run => {
            assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
            const values = Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
                .map(v => [v.name.replace(/^Game_/,''),v.value]));
            for (const [name,value] of Object.entries(expected)) assert.equal(values[name], value, name);
        };
        const run = await runProgram(source, {frames:40, storage:true}); check(run);
        check(await runProgram(run.creator.decompile(), {frames:40, storage:true}));
        const exported = projectToArcade(JSON.parse(run.vm.toJSON())); assert.deepEqual(exported.unsupported, []);
        for (const name of formats) assert.ok(exported.ts.includes(`Buffer.sizeOfNumberFormat(NumberFormat.${name})`), name);
        const original = await runPxtArcade(exported.files);
        for (const [name,value] of Object.entries(expected)) assert.equal(original['Game_'+name], value, name);
        const archive = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        const fresh = await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n', {frames:0,storage:true});
        await fresh.vm.loadProject(archive); fresh.vm.greenFlag(); await stepFrames(fresh.vm,40); check(fresh);
    } finally {clearStrayTimers();}
});
