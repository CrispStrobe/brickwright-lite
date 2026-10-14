/**
 * The other MakeCode boards (sync-makecode-runtime TARGETS): Calliope mini, LEGO
 * MINDSTORMS EV3, Circuit Playground Express — each compiled by ITS OWN pxt-core
 * (6.0.23, 9.3.19, 6.2.6: the glue is the same across seven major versions),
 * for the simulator and for real firmware, on programs the real editors wrote.
 *
 *   - Calliope: its npm package ships its firmware bases -> a .hex;
 *   - EV3 and CPX: the bases come from MakeCode's CDN by content sha, pinned by
 *     sha256 in the sync -> a .uf2, which pxt returns BASE64 (decoding it as a
 *     binary string would write a corrupt file: measured);
 *   - the simulator pin names come from each target's own DigitalPin enum —
 *     the Calliope's P1 is id 100 and its P0 is 112, not the micro:bit's order.
 * Zero network attempts throughout. Skips by name without the synced runtime.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode');
const {PXT_GLUE_JS, MAKECODE_BOARDS} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js'));
const {importArtefact, unpackMakeCodeSource} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/index.js'))
    .then(async m => ({...m, ...(await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js')))}));
const fixture = f => new Uint8Array(fs.readFileSync(path.join(ROOT, 'test/fixtures/makecode', f)));

const synced = ['calliopemini', 'ev3', 'adafruit'].every(t => fs.existsSync(path.join(STATIC, t, 'pxtworker.js')));
const skip = synced ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compilers absent';

const sandboxes = new Map();
function pxtFor (target) {
    if (sandboxes.has(target)) return sandboxes.get(target);
    const dir = path.join(STATIC, target);
    const quiet = () => {};
    const sb = {setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(dir, 'target.json'), 'utf8'))};
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(dir, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    sandboxes.set(target, sb);
    return sb;
}
const compile = async (target, files, native) => JSON.parse(JSON.stringify(await pxtFor(target).bwMakeCode.compile(files, {
    native,
    getBaseHex: async sha => {
        const p = path.join(STATIC, target, 'hexcache', `${sha}.hex`);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    }
})));

/** A UF2 file's facts: 512-byte blocks, both magics on every block. */
function uf2Facts (bytes) {
    assert.equal(bytes.length % 512, 0, `${bytes.length} bytes is not whole UF2 blocks`);
    const blocks = bytes.length / 512;
    for (let i = 0; i < blocks; i++) {
        const o = i * 512;
        assert.equal(bytes.readUInt32LE(o), 0x0A324655, `block ${i}: first magic`);
        assert.equal(bytes.readUInt32LE(o + 4), 0x9E5D5157, `block ${i}: second magic`);
        assert.equal(bytes.readUInt32LE(o + 508), 0x0AB16F30, `block ${i}: final magic`);
    }
    return {blocks};
}

test('the importer finds each board\'s project in files the real editors wrote', async () => {
    for (const [f, target] of [['calliope-images.hex', 'calliopemini'], ['ev3-button-events.uf2', 'ev3'], ['ev3-line-follower.uf2', 'ev3']]) {
        const r = await importArtefact(fixture(f), {name: f});
        assert.equal(r.project.target, target, f);
        assert.ok(r.files['main.ts'] && r.files['pxt.json'], `${f}: no project`);
        assert.ok(MAKECODE_BOARDS[target], `${target} is a board the runtime carries`);
    }
});

test('the Code tab\'s board lists agree with the runtime\'s', () => {
    const src = fs.readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8');
    const runnable = JSON.parse(/const MAKECODE_RUNNABLE = (\[[^\]]*\]);/.exec(src)[1].replace(/'/g, '"'));
    assert.deepEqual([...runnable].sort(), Object.keys(MAKECODE_BOARDS).sort());
    const firmware = /const MAKECODE_FIRMWARE = \{([^}]*)\};/.exec(src)[1];
    for (const [id, b] of Object.entries(MAKECODE_BOARDS)) {
        if (b.firmware) assert.match(firmware, new RegExp(`${id}: '${b.firmware}'`), `${id} firmware`);
        else assert.doesNotMatch(firmware, new RegExp(`${id}:`), `${id} must not offer firmware`);
    }
});

test('Calliope mini: a real project compiles for the simulator and to a .hex, offline', {skip}, async () => {
    for (const f of ['calliope-images.hex', 'calliope-radio.hex']) {
        const {files} = await unpackMakeCodeSource(fixture(f));
        const sim = await compile('calliopemini', files, false);
        assert.equal(sim.success, true, `${f}: ${JSON.stringify(sim.diagnostics.slice(0, 2))}`);
        const fw = await compile('calliopemini', files, true);
        assert.equal(fw.success, true, `${f} native`);
        assert.match(fw.outfiles['binary.hex'], /^:/, `${f}: not Intel HEX`);
        assert.ok(fw.outfiles['binary.hex'].length > 400000, `${f}: not firmware-sized`);
        assert.deepEqual([...sim.netAttempts, ...fw.netAttempts], []);
    }
});

test('EV3: real programs compile for the simulator and to a brick .uf2, offline', {skip}, async () => {
    for (const f of ['ev3-button-events.uf2', 'ev3-line-follower.uf2']) {
        const r = await importArtefact(fixture(f), {name: f});
        const sim = await compile('ev3', r.files, false);
        assert.equal(sim.success, true, `${f}: ${JSON.stringify(sim.diagnostics.slice(0, 2))}`);
        const fw = await compile('ev3', r.files, true);
        assert.equal(fw.success, true, `${f} native`);
        const bytes = Buffer.from(fw.outfiles['binary.uf2'], 'base64');
        assert.ok(uf2Facts(bytes).blocks > 100, `${f}: too few blocks`);
        assert.deepEqual([...sim.netAttempts, ...fw.netAttempts], []);
    }
});

test('Circuit Playground Express: a program compiles for the simulator and to a .uf2, offline', {skip}, async () => {
    const files = {'pxt.json': JSON.stringify({name: 'cpx', dependencies: {'circuit-playground': '*'}, files: ['main.ts']}),
        'main.ts': 'forever(function () {\n    light.setAll(0xff0000)\n    pause(200)\n    light.clear()\n    pause(200)\n})\n'};
    const sim = await compile('adafruit', files, false);
    assert.equal(sim.success, true, JSON.stringify(sim.diagnostics.slice(0, 2)));
    const fw = await compile('adafruit', files, true);
    assert.equal(fw.success, true);
    uf2Facts(Buffer.from(fw.outfiles['binary.uf2'], 'base64'));
    assert.deepEqual([...sim.netAttempts, ...fw.netAttempts], []);
});

test('simulator pins are named by each target\'s own DigitalPin enum', {skip}, () => {
    const names = t => JSON.parse(fs.readFileSync(path.join(STATIC, t, 'sim/config.json'), 'utf8')).pinNames;
    assert.equal(names('microbit')['100'], 'p0');
    assert.equal(names('microbit')['101'], 'p1');
    assert.equal(names('calliopemini')['100'], 'p1', 'the Calliope\'s P1 is id 100');
    assert.equal(names('calliopemini')['112'], 'p0');
    assert.equal(names('calliopemini')['103'], 'c4');
    assert.deepEqual(names('ev3'), {}, 'the EV3 has no edge pins to bridge');
});
