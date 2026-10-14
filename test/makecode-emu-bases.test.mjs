/**
 * The micro:bit EMULATOR runs only firmware bases proven free of chip-restricted
 * code; the official bases (Nordic SoftDevice inside) stay the download path.
 *
 * What is asserted, and why each:
 *   - the refusal: every base base-licences.js classifies chip-restricted is
 *     refused by assertEmulatorBase with CHIP_RESTRICTED_BASE and a reason that
 *     NAMES the component; unaudited and unknown bytes are refused too; only
 *     'clean' passes. Deleting the refusal (or making it permissive) reds here;
 *   - the worker half of it: the glue's emulatorBase refuses bytes whose
 *     sha256 is not on the clean list BEFORE pxt links onto them;
 *   - one pin, two consumers: the clean list IS the sync's pinned emulator
 *     bases (MICROBIT_EMU_BASES) — a rebuilt base pinned in one and not the
 *     other would be served and refused, or classified and never served;
 *   - the licence gate the build script runs reds on each forbidden kind (an
 *     nRF5 SDK member, a .softdevice/.mbr/.bootloader/.uicr section, a Nordic
 *     object LOADed, an unattributed byte, a UICR record, a vector table that
 *     cannot boot bare) and passes a clean map — on small maps written here,
 *     shaped like GNU ld's, so it runs with no toolchain;
 *   - with the MakeCode runtime synced: every official micro:bit base served
 *     is classified (and refused); the emulator pins are keyed by the sha the
 *     served pxt asks for;
 *   - with the emulator bases built and served: a program links onto each into
 *     a plain V2 image that boots bare (vector table at 0, SP in RAM, reset in
 *     the image, nothing in UICR), the base intact below the program, zero
 *     network attempts — and the same compile against the OFFICIAL base is
 *     refused by name. BW_REQUIRE_EMU_BASES=1 (the workflow) turns the skip
 *     into a failure.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode/microbit');
const RUNTIME = path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js');
const {PXT_GLUE_JS, assertEmulatorBase, EMULATOR_CLEAN_BASES, MakeCodeError} = await import(RUNTIME);
const {BASE_LICENCES, emulatorBaseVerdict} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/base-licences.js'));
const {MICROBIT_EMU_BASES} = await import(path.join(ROOT, 'scripts/sync-makecode-runtime.mjs'));
const gate = await import(path.join(ROOT, 'scripts/makecode/firmware-licence-gate.mjs'));

const SYNCED = fs.existsSync(path.join(STATIC, 'pxtworker.js'));
const NOT_SYNCED = 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent';
const REQUIRE = process.env.BW_REQUIRE_EMU_BASES === '1';
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

test('the emulator refuses every chip-restricted base by name, and every unproven one', () => {
    const records = Object.entries(BASE_LICENCES);
    const restricted = records.filter(([, l]) => l.classification === 'chip-restricted');
    assert.ok(restricted.length >= 4, 'the official micro:bit bases must be classified chip-restricted');
    for (const [h, l] of restricted) {
        assert.throws(() => assertEmulatorBase(h), e => {
            assert.ok(e instanceof MakeCodeError, `${l.base}: not a MakeCodeError`);
            assert.equal(e.code, 'CHIP_RESTRICTED_BASE', `${l.target} ${l.base}: refused with ${e.code}`);
            assert.ok(e.message.includes(l.component), `${l.base}: the reason does not name ${l.component}`);
            return true;
        }, `${l.target} ${l.base} (${l.source}) is chip-restricted but the emulator accepted it`);
    }
    for (const [h, l] of records.filter(([, r]) => r.classification === 'unaudited')) {
        assert.throws(() => assertEmulatorBase(h), e => e.code === 'UNAUDITED_BASE', `${l.base}: unaudited but accepted`);
    }
    assert.throws(() => assertEmulatorBase('0'.repeat(64)), e => e.code === 'UNKNOWN_BASE', 'unknown bytes were accepted');
    assert.throws(() => assertEmulatorBase(undefined), e => e.code === 'UNKNOWN_BASE', 'no sha256 was accepted');
    const clean = records.filter(([, l]) => l.classification === 'clean');
    assert.ok(clean.length >= 1, 'no clean base: the emulator has nothing to run');
    for (const [h, l] of clean) assert.equal(assertEmulatorBase(h).classification, 'clean', `${l.base}: a clean base was refused`);
    // Every record is one of the three kinds, and a restricted one says what and why.
    for (const [h, l] of records) {
        assert.match(h, /^[0-9a-f]{64}$/, `${l.base}: key is not a sha256`);
        assert.ok(['clean', 'chip-restricted', 'unaudited'].includes(l.classification), `${h}: ${l.classification}`);
        if (l.classification === 'chip-restricted') assert.ok(l.component && l.licence, `${l.base}: names no component or licence`);
    }
});

test('the official micro:bit V2 base is refused as carrying the Nordic SoftDevice', () => {
    const v = emulatorBaseVerdict('648fece987592f8530ec321b91c562c93379d2a59e2e601374629417c8f35ef1');
    assert.equal(v.ok, false);
    assert.equal(v.code, 'CHIP_RESTRICTED_BASE');
    assert.match(v.reason, /S113 SoftDevice/);
    assert.match(v.reason, /Nordic Semiconductor ASA integrated circuit/);
});

test('one pin, two consumers: the clean list is exactly the sync\'s pinned emulator bases', () => {
    const pinned = Object.values(MICROBIT_EMU_BASES).map(p => p.sha256).sort();
    assert.deepEqual([...EMULATOR_CLEAN_BASES].sort(), pinned);
});

/** PXT_GLUE_JS alone (no pxt), for the worker-side refusal. */
function glueOnly () {
    const sb = {crypto: globalThis.crypto, TextEncoder: util.TextEncoder, Promise};
    vm.createContext(sb);
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    return vm.runInContext('bwMakeCode', sb);
}

test('the worker refuses base bytes that are not on the clean list, before linking', async () => {
    const bw = glueOnly();
    const text = ':020000040000FA\n:00000001FF\n';
    await assert.rejects(bw.emulatorBase(text, EMULATOR_CLEAN_BASES), e => e.code === 'BASE_REFUSED' && e.baseSha256 === sha256(text));
    assert.equal(await bw.emulatorBase(text, [sha256(text)]), text, 'bytes on the list were refused');
});

// ---- the licence gate (scripts/makecode/firmware-licence-gate.mjs) ----

const MAP_HEAD = 'Archive member included to satisfy reference by file (symbol)\n\nDiscarded input sections\n\n .text.unused   0x00000000  0x40 libraries/codal-microbit-nrf5sdk/libcodal-microbit-nrf5sdk.a(nrf_sdh.c.obj)\n\nLinker script and memory map\n\n';
const CLEAN_BODY = [
    'LOAD /usr/lib/gcc/arm-none-eabi/13.2.1/thumb/v7e-m+fp/softfp/crti.o',
    'LOAD CMakeFiles/MICROBIT.dir/pxtapp/core/core.cpp.obj',
    '',
    '.text           0x00000000    0x2000',
    ' *(.isr_vector)',
    ' .isr_vector    0x00000000      0x200 libcodal-nrf52.a(gcc_startup_nrf52833.S.obj)',
    ' .text._ZN5codal7NRF52Pin3getEv',
    '                0x00000200      0x100 libcodal-nrf52.a(NRF52Pin.cpp.obj)',
    ' .text          0x00000300      0x400 CMakeFiles/MICROBIT.dir/pxtapp/core/core.cpp.obj',
    ' .text          0x00000700      0x200 /usr/lib/gcc/arm-none-eabi/13.2.1/../../../arm-none-eabi/lib/thumb/v7e-m+fp/softfp/libc_nano.a(libc_a-memcpy.o)',
    ' .text          0x00000900      0x100 libcodal-core.a(CodalFiber.cpp.obj)',
    ' *fill*         0x00000a00       0x10 ',
    '',
    '.bss            0x20000200      0x100',
    ' .bss           0x20000200      0x100 libcodal-microbit-v2.a(MicroBit.cpp.obj)',
    '',
    '.debug_info     0x00000000    0x9999',
    ' .debug_info    0x00000000    0x9999 libcodal-microbit-nrf5sdk.a(nrf_sdh.c.obj)',
    ''
].join('\n');

test('the licence gate passes a clean map and counts its bytes by component', () => {
    const a = gate.auditMap(MAP_HEAD + CLEAN_BODY);
    assert.deepEqual(a.violations, []);
    assert.equal(a.image['nordic-nrf5sdk'], 0, 'a discarded or debug-only nRF5 SDK section counted as linked');
    assert.equal(a.image['nrfx-mdk'], 0x200);
    assert.equal(a.image['codal-nrf52'], 0x100);
    assert.equal(a.image['pxt-microbit'], 0x400);
    assert.equal(a.image.toolchain, 0x200);
    assert.equal(a.bytes['codal-microbit-v2'], 0x100);
    assert.equal(a.image['codal-microbit-v2'] || 0, 0, '.bss is not image bytes');
});

for (const [what, extra, pattern] of [
    ['an nRF5 SDK member', ' .text          0x00000a10       0x40 libraries/codal-microbit-nrf5sdk/libcodal-microbit-nrf5sdk.a(nrf_sdh.c.obj)', /nordic-nrf5sdk is chip-restricted/],
    ['the SoftDevice section', '.softdevice     0x00001000    0x1a400\n .softdevice    0x00001000    0x1a400 libraries/codal-microbit-v2/lib/softdevice.o', /\.softdevice .*Nordic SoftDevice\/MBR\/bootloader section/],
    ['the MBR section', '.mbr            0x00000000      0xb00\n .mbr           0x00000000      0xb00 libraries/codal-microbit-v2/lib/mbr.o', /\.mbr /],
    ['the bootloader section', '.bootloader     0x00077000     0x63ec\n .bootloader    0x00077000     0x63ec libraries/codal-microbit-v2/lib/bootloader.o', /\.bootloader /],
    ['the UICR record', '.uicr           0x10001014        0x8\n .uicr          0x10001014        0x8 libraries/codal-microbit-v2/lib/uicr.o', /\.uicr /],
    ['a Nordic object LOADed', 'LOAD libraries/codal-microbit-v2/lib/softdevice.o', /softdevice\.o is LOADed/],
    ['an unattributed byte', ' .text          0x00000a10       0x40 libraries/somewhere/libmystery.a(blob.o)', /attributed to no known component/]
]) {
    test(`the licence gate reds on ${what}`, () => {
        const body = CLEAN_BODY.replace('\n.bss ', `\n${extra}\n\n.bss `);
        const a = gate.auditMap(MAP_HEAD + body);
        assert.ok(a.violations.some(v => pattern.test(v)), `no violation matching ${pattern}: ${JSON.stringify(a.violations)}`);
    });
}

/** An Intel HEX of {addr: bytes}. */
function hex (chunks) {
    const out = [];
    for (const [addr, bytes] of chunks) {
        out.push(recordHex(4, 0, Buffer.from([(addr >>> 24) & 0xff, (addr >>> 16) & 0xff])));
        for (let o = 0; o < bytes.length; o += 16) out.push(recordHex(0, (addr + o) & 0xffff, bytes.subarray(o, o + 16)));
    }
    out.push(':00000001FF');
    return out.join('\n') + '\n';
}
function recordHex (type, addr, data) {
    const b = Buffer.concat([Buffer.from([data.length, (addr >> 8) & 0xff, addr & 0xff, type]), data]);
    const sum = (0x100 - (b.reduce((s, x) => s + x, 0) & 0xff)) & 0xff;
    return ':' + Buffer.concat([b, Buffer.from([sum])]).toString('hex').toUpperCase();
}
function vectors (sp, reset, size = 0x400) {
    const b = Buffer.alloc(size, 0x11);
    b.writeUInt32LE(sp, 0);
    b.writeUInt32LE(reset, 4);
    return b;
}

test('the image gate: boots bare, and reds on UICR, on an MBR-style vector table, on a non-Thumb reset', () => {
    assert.deepEqual(gate.hexAudit(hex([[0, vectors(0x20020000, 0x201)]])).violations, []);
    assert.ok(gate.hexAudit(hex([[0, vectors(0x20020000, 0x201)], [0x10001014, Buffer.alloc(8, 1)]])).violations.some(v => /UICR/.test(v)));
    assert.ok(gate.hexAudit(hex([[0, vectors(0x20020000, 0x200)]])).violations.some(v => /Thumb/.test(v)));
    assert.ok(gate.hexAudit(hex([[0, vectors(0x20020000, 0x10001)]])).violations.some(v => /not inside the image/.test(v)));
    assert.ok(gate.hexAudit(hex([[0, vectors(0x00001000, 0x201)]])).violations.some(v => /SP/.test(v)));
});

test('the byte-level gate: a Nordic chunk in the image reds unless it lies inside toolchain code', () => {
    const blob = crypto.randomBytes(1024);
    const image = Buffer.concat([Buffer.alloc(0x300, 0), blob.subarray(256, 512), Buffer.alloc(0x100, 0)]);
    const r = gate.chunksFound(blob, image);
    assert.deepEqual(r.matches, [0x300]);
    const inCodal = gate.classifyMatches('bootloader.o', r.matches, MAP_HEAD + CLEAN_BODY.replace(
        ' .text          0x00000300      0x400 CMakeFiles/MICROBIT.dir/pxtapp/core/core.cpp.obj',
        ' .text          0x00000300      0x400 libcodal-core.a(CodalFiber.cpp.obj)'));
    assert.equal(inCodal.violations.length, 1, 'a Nordic chunk inside CODAL code was not refused');
    const inLibc = gate.classifyMatches('bootloader.o', r.matches, MAP_HEAD + CLEAN_BODY.replace(
        ' .text          0x00000300      0x400 CMakeFiles/MICROBIT.dir/pxtapp/core/core.cpp.obj',
        ' .text          0x00000300      0x400 /usr/lib/arm-none-eabi/lib/libc_nano.a(libc_a-memcpy.o)'));
    assert.deepEqual(inLibc.violations, []);
    assert.equal(inLibc.toolchain.length, 1);
});

// ---- with the runtime synced ----

test('every official micro:bit base the sync serves is classified — and refused', {skip: !SYNCED && NOT_SYNCED}, () => {
    const dir = path.join(STATIC, 'hexcache');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.hex'));
    assert.ok(files.length >= 2, 'pxt-microbit ships its bases in hexcache/');
    for (const f of files) {
        const h = sha256(fs.readFileSync(path.join(dir, f)));
        assert.ok(BASE_LICENCES[h], `${f} (sha256 ${h}) is served but not classified in base-licences.js`);
        assert.equal(emulatorBaseVerdict(h).ok, false, `${f}: an official base is accepted by the emulator`);
    }
});

test('the emulator bases are keyed by the sha the served pxt asks for (V2 variant)', {skip: !SYNCED && NOT_SYNCED}, async () => {
    const {emuRequest} = await import(path.join(ROOT, 'scripts/build-makecode-emu-bases.mjs'));
    for (const [set, pin] of Object.entries(MICROBIT_EMU_BASES)) {
        const {sha, request} = await emuRequest(set, {staticDir: STATIC});
        assert.equal(pin.sha, sha, `${set}: the pinned sha is not what pxt asks for — rebuild the emulator bases for this pxt-microbit`);
        assert.equal(request.config, 'mbcodal2', `${set}: not the V2 (codal) build service`);
    }
});

let sandbox = null;
function pxt () {
    if (sandbox) return sandbox;
    const quiet = () => {};
    const sb = {
        setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer, atob, crypto: globalThis.crypto,
        console: {log: quiet, debug: quiet, info: quiet, warn: quiet, error: quiet},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(STATIC, 'target.json'), 'utf8'))
    };
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(STATIC, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    sandbox = sb;
    return sb;
}

const PROGRAM = 'serial.writeLine("boot")\nbasic.showString("HI")\nlet n = 0\nbasic.forever(function () {\n    n += 1\n    serial.writeLine("tick " + n)\n    basic.showNumber(n)\n})\n';

for (const [set, pin] of Object.entries(MICROBIT_EMU_BASES)) {
    const file = path.join(STATIC, 'hexcache-emu', `${pin.sha}.hex`);
    const served = SYNCED && fs.existsSync(file);
    const why = (!SYNCED && NOT_SYNCED) || (!served && !REQUIRE &&
        'emulator base not built — npm run build:makecode-emu-bases, then npm run sync:makecode');
    test(`a program links onto the ${set} emulator base: a bare-booting V2 image; the official base is refused`, {skip: why}, async () => {
        assert.ok(served, `${set}: not served at ${file}`);
        const baseText = fs.readFileSync(file, 'utf8');
        assert.equal(sha256(baseText), pin.sha256, `${set}: the served base is not the pinned build`);
        const sb = pxt();
        const deps = set === 'v2-radio' ? {core: '*', radio: '*'} : {core: '*', radio: '*', microphone: '*'};
        // targetVersions matters: a pxt.json without it reads as a pre-3.0.18
        // project, and pxt-microbit's upgrade patch ({missingPackage: {'.*':
        // 'microphone'}}) adds the microphone package to any non-empty program —
        // measured: {core, radio} then asks for the 354b97da base, not 137d8c97.
        const files = {'pxt.json': JSON.stringify({name: 'emu', dependencies: deps, files: ['main.ts'], targetVersions: {target: '9.1.1'}}), 'main.ts': PROGRAM};
        const before = sb.bwMakeCode.netAttempts.length;
        const asked = [];
        const compile = dir => sb.bwMakeCode.compile(files, {
            native: true, appVariant: 'mbcodal',
            getBaseHex: async sha => {
                asked.push(sha);
                const p = path.join(STATIC, dir, `${sha}.hex`);
                return fs.existsSync(p) ? sb.bwMakeCode.emulatorBase(fs.readFileSync(p, 'utf8'), EMULATOR_CLEAN_BASES) : null;
            }
        });
        const r = JSON.parse(JSON.stringify(await compile('hexcache-emu')));
        assert.equal(r.success, true, JSON.stringify(r.diagnostics.slice(0, 3)));
        assert.deepEqual(asked, [pin.sha], 'the V2-only compile asked for a different base (or for the V1 one too)');
        assert.equal(sb.bwMakeCode.netAttempts.length, before, 'a network attempt');
        const out = r.outfiles['binary.hex'];
        assert.ok(out, `no binary.hex in ${Object.keys(r.outfiles)}`);
        const img = gate.hexAudit(out);
        assert.deepEqual(img.violations, [], 'the linked image does not boot bare');
        const base = gate.hexToFlat(baseText);
        const prog = gate.hexToFlat(out);
        let patched = 0;
        for (let a = 0; a < base.length; a++) if (prog[a] !== base[a]) patched++;
        assert.ok(patched <= 64, `${patched} base bytes changed — more than pxt's patch`);
        assert.ok(prog.length - base.length > 1000, `only ${prog.length - base.length} bytes beyond the base: the program is not linked in`);
        // The official base for the SAME request, served where the emulator looks: refused by name.
        if (fs.existsSync(path.join(STATIC, 'hexcache', `${pin.sha}.hex`))) {
            await assert.rejects(compile('hexcache'), e => {
                assert.equal(e.code, 'BASE_REFUSED');
                assert.throws(() => assertEmulatorBase(e.baseSha256), x => x.code === 'CHIP_RESTRICTED_BASE' && /SoftDevice/.test(x.message));
                return true;
            });
        }
    });
}
